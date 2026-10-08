// ISSUING a package (Phase 4.6), the app part. Each issued (sheet, revision) is FROZEN once in
// `projects/{pid}/cadIssued` — written once, never edited, and outside the entity store so opening a project doesn't
// load it. The package PDF is drawn from the frozen lists, uploaded to the project's file storage (UploadThing or
// Firebase Storage, Settings › Files; + `files/{id}`, so it lists in Uploads) and recorded on the Issue. Reprinting an issue draws the same frozen lists again.
import { coverPages, type CoverRow } from '../views/transmittalPage'
import type { Id } from '../domain/types'
import { doc, getDoc, writeBatch } from 'firebase/firestore'
import type { CadProject } from './project.svelte'
import { storeFile } from './projectFiles'
import type { Issue, Sheet } from '../domain/drawing'
import type { Underlay } from '../domain/types'
import type { Prim } from '../views/display'
import { sheetDisplayList, paperSize } from '../views/sheet'
import { freeze, fingerprint, planIssue, withRevision, withCodes, revCodeProblem, underlayRef, parseUnderlayRef, issueNumbers, nextIssueNumber, issueTag, type IssuePlanRow } from '../domain/issue'
import { pagesToPdf, browserImageLoader, browserTextRaster, type ImageLoader, type PdfPage } from '../render/pdf'
import { download, fileSafe } from '../render/download'
import { newId } from '../domain/ids'
import { splitChunks } from '../persist/chunks'
import { storeBackup } from './backups'

const key = (sheetId: string, rev: string) => `${sheetId}~${encodeURIComponent(rev)}`
const col = (p: CadProject) => `projects/${p.pid}/cadIssued`

/** The floorplans these sheets show, rendered (frozen lists and PDFs must not miss one still rendering). */
export async function placeUnderlays(project: CadProject, sheets: Sheet[]): Promise<void> {
	const levels = new Set(sheets.flatMap((s) => s.viewports.map((v) => v.view.levelId)))
	const us = [...project.index.byId.values()].filter((e): e is Underlay => e.type === 'underlay' && levels.has(e.levelId))
	await Promise.all(us.map((u) => project.pdf.placed(u)))
}

/** The frozen cover pages of an issue are kept like a sheet's, under this id (rev = the page number). */
const coverId = (issueId: string) => `cover-${issueId}`

/** What the sheet shows now, frozen (floorplans as file references). Call placeUnderlays first. */
export function frozenNow(project: CadProject, sheet: Sheet): Prim[] {
	return freeze(sheetDisplayList(project.index, sheet, {
		underlay: (u) => { const pl = project.pdf.placement(u); return pl && { ...pl, url: underlayRef(u.fileId, u.page ?? 1) } },
		blocks: project.blockOf, projectName: project.name, template: project.settings?.titleBlock, cords: project.settings?.cordRoute, gray: !!project.settings?.grayFloorplans,
	}))
}

/** Which of these sheets would get a new revision. */
export async function previewIssue(project: CadProject, sheets: Sheet[], first: string): Promise<IssuePlanRow[]> {
	await placeUnderlays(project, sheets)
	return planIssue(sheets, (s) => fingerprint(frozenNow(project, s)), first)
}

async function saveFrozen(project: CadProject, sheet: Sheet, rev: string, issueId: string, prims: Prim[]): Promise<void> {
	const chunks = splitChunks(JSON.stringify(prims)), k = key(sheet.id, rev)
	const b = writeBatch(project.db)
	b.set(doc(project.db, col(project), k), { sheetId: sheet.id, rev, issueId, ...paperSize(sheet), parts: chunks.length, at: Date.now() })
	chunks.forEach((json, i) => b.set(doc(project.db, col(project), `${k}~p${i}`), { json }))
	await b.commit()
}
async function loadFrozen(project: CadProject, sheetId: string, rev: string): Promise<PdfPage> {
	const k = key(sheetId, rev), head = (await getDoc(doc(project.db, col(project), k))).data()
	if (!head) throw new Error(`no frozen copy of ${sheetId} rev ${rev}`)
	const parts = await Promise.all(Array.from({ length: head.parts as number }, (_, i) => getDoc(doc(project.db, col(project), `${k}~p${i}`))))
	return { w: head.w, h: head.h, prims: JSON.parse(parts.map((p) => p.data()?.json ?? '').join('')) }
}

/** Images in frozen lists: a floorplan reference is rendered from its file again. */
const frozenImages = (project: CadProject): ImageLoader => async (url, kind, gray) => {
	const ref = parseUnderlayRef(url)
	if (!ref) return browserImageLoader(url, kind, gray)
	const pl = await project.pdf.placed(ref)
	return pl ? browserImageLoader(pl.url, kind, gray) : null
}

export type IssueForm = {
	name: string; purpose: string; date: string; to?: string; note?: string; first: string; packageId?: Id
	/** Typed revision codes per sheet (D7), what changed per sheet, who issued it (initials) — sheets-organising slice 7. */
	codes?: Record<Id, string>; descs?: Record<Id, string>; by?: string
	/** The package's sheets from its last issue that aren't in this one. */
	withdrawn?: Issue['withdrawn']
	/** A cover page / transmittal first in the PDF (slice 8), with who gets it. */
	cover?: boolean; recipients?: { name: string; org?: string }[]
	/** Back up the whole project with it (ADR 0008 §7) — off unless ticked: a full copy each time. */
	backup?: boolean
}
export type IssueResult = { issue: Issue; unsupported: string[]; rasterised: string[] }

/** Issue these sheets as one package: bump the changed ones (frozen at the new revision), take the rest as last
 *  issued, draw the package PDF from the frozen lists, upload it, then record it all (one undo step for the sheets
 *  and the issue; the frozen copies and the file stay). Throws — before anything is recorded — if the upload fails. */
export async function issuePackage(project: CadProject, sheets: Sheet[], f: IssueForm): Promise<IssueResult> {
	const plan = withCodes(await previewIssue(project, sheets, f.first), f.codes)
	// a typed code must be new for its sheet — checked before anything is written
	for (const r of plan) { const why = r.changed ? revCodeProblem(r.sheet, r.rev) : null; if (why) throw new Error(why) }
	const issueId = newId(), number = nextIssueNumber(project.store.ofType('issue'))
	// the backup first: if it fails, nothing has been written yet
	const backup = f.backup ? await storeBackup(project, `${issueTag(number)}: ${f.name}`, 'all', { issueId }) : null
	const bumped: Sheet[] = [], pages: PdfPage[] = []
	for (const row of plan) {
		if (!row.changed) { pages.push(await loadFrozen(project, row.sheet.id, row.rev)); continue }
		// frozen as it shows once issued (the title block reads the new rev / date)
		const desc = f.descs?.[row.sheet.id]?.trim(), extra = { ...(desc ? { desc } : {}), ...(f.by?.trim() ? { by: f.by.trim() } : {}) }
		const next = withRevision(row.sheet, { code: row.rev, date: f.date, note: f.purpose, ...extra, issueId })
		const prims = frozenNow(project, next)
		const done = withRevision(row.sheet, { code: row.rev, date: f.date, note: f.purpose, ...extra, issueId, hash: fingerprint(prims) })
		await saveFrozen(project, row.sheet, row.rev, issueId, prims)
		bumped.push(done)
		pages.push({ ...paperSize(row.sheet), prims })
	}
	// the cover page(s) first (Dave D5: the first sheet's size, the project title block), frozen with the issue
	let coverN = 0
	if (f.cover && plan.length) {
		const rows: CoverRow[] = [
			...plan.map((r) => ({ number: r.sheet.number, title: r.sheet.title, rev: r.rev, size: r.sheet.paper.size, status: (r.changed ? 'New revision' : 'As last issued') as CoverRow['status'] })),
			...(f.withdrawn ?? []).map((w) => ({ number: w.number, title: w.title, rev: w.rev, size: '', status: 'Withdrawn' as const })),
		]
		const cover = coverPages(project.index, plan[0].sheet, { project: project.name, tag: issueTag(number), name: f.name, purpose: f.purpose, date: f.date, recipients: f.recipients, note: f.note, rows },
			{ blocks: project.blockOf, projectName: project.name, template: project.settings?.titleBlock })
		for (const [i, c] of cover.entries()) {
			const prims = freeze(c.prims)
			await saveFrozen(project, { ...plan[0].sheet, id: coverId(issueId) }, String(i + 1), issueId, prims)
			pages.splice(i, 0, { w: c.w, h: c.h, prims })
		}
		coverN = cover.length
	}
	const { pdf, unsupported, rasterised } = await pagesToPdf(pages, frozenImages(project), { rasterText: browserTextRaster })
	const name = `${fileSafe(`${project.name} ${issueTag(number)} ${f.name} ${f.date}`)}.pdf`
	const file = await uploadPdf(project, new File([pdf.output('blob')], name, { type: 'application/pdf' }))
	const issue: Issue = {
		type: 'issue', id: issueId, number, name: f.name, purpose: f.purpose, date: f.date,
		...(f.to ? { to: f.to } : {}), ...(f.note ? { note: f.note } : {}), ...(f.packageId ? { packageId: f.packageId } : {}), ...(f.withdrawn?.length ? { withdrawn: f.withdrawn } : {}), ...(coverN ? { cover: coverN } : {}), ...(backup ? { backupId: backup.id } : {}),
		sheets: plan.map((r) => ({ sheetId: r.sheet.id, number: r.sheet.number, title: r.sheet.title, rev: r.rev, size: `${r.sheet.paper.size}`, changed: r.changed })),
		file,
	}
	project.store.transact(`Issue ${f.name}`, (tx) => { for (const s of bumped) tx.put(s); tx.put(issue) })
	return { issue, unsupported, rasterised }
}

async function uploadPdf(project: CadProject, file: File): Promise<Issue['file']> {
	const r = await storeFile(project.db, project.pid, file, { storage: project.settings?.fileStorage, route: 'floorplanUploader', id: `issue-${newId()}` })
	return { id: r.id, url: r.url, name: file.name }
}

/** The package again, exactly as issued (the frozen lists), downloaded. */
export async function reprintIssue(project: CadProject, issue: Issue): Promise<{ unsupported: string[]; rasterised: string[] }> {
	const cover = Array.from({ length: issue.cover ?? 0 }, (_, i) => loadFrozen(project, coverId(issue.id), String(i + 1)))
	const pages = await Promise.all([...cover, ...issue.sheets.map((s) => loadFrozen(project, s.sheetId, s.rev))])
	const { pdf, unsupported, rasterised } = await pagesToPdf(pages, frozenImages(project), { rasterText: browserTextRaster })
	const n = issueNumbers(project.store.ofType('issue')).get(issue.id)
	download(pdf.output('blob'), `${fileSafe(`${project.name} ${n ? `${issueTag(n)} ` : ''}${issue.name} ${issue.date}`)} (reprint).pdf`, 'application/pdf')
	return { unsupported, rasterised }
}

/** ONE sheet as it was issued at revision `rev` (backlog "Show old issued versions"), downloaded as a PDF. */
export async function printRevision(project: CadProject, sheet: Sheet, rev: string): Promise<{ unsupported: string[]; rasterised: string[] }> {
	const page = await loadFrozen(project, sheet.id, rev)
	const { pdf, unsupported, rasterised } = await pagesToPdf([page], frozenImages(project), { rasterText: browserTextRaster })
	download(pdf.output('blob'), `${fileSafe(`${project.name} ${sheet.number} rev ${rev}`)} (as issued).pdf`, 'application/pdf')
	return { unsupported, rasterised }
}

/** Today as YYYY-MM-DD (local). */
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
