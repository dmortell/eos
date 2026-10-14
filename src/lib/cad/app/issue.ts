// ISSUING a package (Phase 4.6), the app part. Each issued (sheet, revision) is FROZEN once in
// `projects/{pid}/cadIssued` — written once, never edited, and outside the entity store so opening a project doesn't
// load it. The package PDF is drawn from the frozen lists, uploaded to the project's file storage (UploadThing or
// Firebase Storage, Settings › Files; + `files/{id}`, so it lists in Uploads) and recorded on the Issue. Reprinting an issue draws the same frozen lists again.
import { coverPages, type CoverRow } from '../views/transmittalPage'
import type { Id } from '../domain/types'
import { doc, getDoc, runTransaction } from 'firebase/firestore'
import type { CadProject } from './project.svelte'
import { storeFile } from './projectFiles'
import { fileSnapshot, type FileSnapshot } from './pdf.svelte'
import type { Issue, Sheet } from '../domain/drawing'
import type { Underlay } from '../domain/types'
import type { Prim } from '../views/display'
import { sheetDisplayList, paperSize } from '../views/sheet'
import { freeze, sheetPrint, planIssue, issuedRevision, withCodes, revCodeProblem, underlayRef, parseUnderlayRef, floorplansIn, tagDraftClouds, PICTURE_REF, issueNumbers, nextIssueNumber, issueTag, type IssuePlanRow } from '../domain/issue'
import { pagesToPdf, browserImageLoader, browserTextRaster, type ImageLoader, type PdfPage } from '../render/pdf'
import { download, fileSafe } from '../render/download'
import { bomFile, cableScheduleFile, XLSX_TYPE, type XlsxFile } from '../render/exports'
import { outletScheduleFile } from '../render/outletSchedule'
import { cableSchedule } from '../domain/cableSchedule'
import { cableSettings } from '../domain/routing'
import { newId } from '../domain/ids'
import { splitChunks } from '../persist/chunks'
import { storeBackup } from './backups'

const key = (sheetId: string, rev: string) => `${sheetId}~${encodeURIComponent(rev)}`
const col = (p: CadProject) => `projects/${p.pid}/cadIssued`

/** The floorplans these sheets show, rendered (frozen lists and PDFs must not miss one still rendering). */
export async function placeUnderlays(project: CadProject, sheets: Sheet[]): Promise<void> {
	const levels = new Set(sheets.flatMap((s) => s.viewports.map((v) => v.view.levelId)))
	const us = project.index.ofType('underlay').filter((e) => levels.has(e.levelId))
	await Promise.all(us.map((u) => project.pdf.placed(u)))
}

/** The frozen cover pages of an issue are kept like a sheet's, under this id (rev = the page number). */
const coverId = (issueId: string) => `cover-${issueId}`

/** What the sheet shows now, frozen (floorplans as file references). Call placeUnderlays first. */
export function frozenNow(project: CadProject, sheet: Sheet): Prim[] {
	return freeze(sheetDisplayList(project.index, sheet, {
		underlay: (u) => { const pl = project.pdf.placement(u); return pl && { ...pl, url: underlayRef(u.fileId, u.page ?? 1) } },
		blocks: project.blockOf, ...project.sheetBase, cords: project.settings?.cordRoute, gray: !!project.settings?.grayFloorplans,
		fieldDate: sheet.revisions?.at(-1)?.date,   // {DATE} reads the last issue date, so an issued sheet isn’t "changed" by the clock (Q21)
	}))
}

/** The listed sheets as the store has them now (same order); a sheet deleted meanwhile is an error, not a silent skip. */
export function freshSheets(project: CadProject, listed: Sheet[]): Sheet[] {
	return listed.map((s) => {
		const cur = project.store.get(s.id)
		if (cur?.type !== 'sheet') throw new Error(`${s.number || s.title} no longer exists — close the Issue panel and select the sheets again`)
		return cur
	})
}

/** Which of these sheets would get a new revision. */
export async function previewIssue(project: CadProject, sheets: Sheet[], first: string): Promise<IssuePlanRow[]> {
	await placeUnderlays(project, sheets)
	return planIssue(sheets, (s) => printNow(project, frozenNow(project, s)), first)
}
/** A frozen list's print, with its floorplans' masks / hidden layers / markups as set now (W3). Call placeUnderlays first. */
export const printNow = (project: CadProject, prims: Prim[]): string => sheetPrint(prims, project.pdf.lookOfRef)

/** Why a frozen copy of (sheet, rev) can't be written: another issue already froze it (issued revisions are final —
 *  Review 2 Q61). A copy left by an issue that was never recorded (its upload failed) doesn't count: it is replaced. */
function frozenTaken(project: CadProject, head: { issueId?: string } | undefined, sheet: { number?: string; title?: string }, rev: string): string | null {
	if (!head) return null
	const by = head.issueId ? project.store.get(head.issueId) : undefined
	return by?.type === 'issue' ? `${sheet.number || sheet.title}: revision ${rev} was already issued (${by.name}) — use another revision code` : null
}

/** Before anything is written: is a frozen copy of this (sheet, rev) already taken by a recorded issue? */
async function frozenConflict(project: CadProject, sheet: Sheet, rev: string): Promise<string | null> {
	return frozenTaken(project, (await getDoc(doc(project.db, col(project), key(sheet.id, rev)))).data(), sheet, rev)
}

export async function saveFrozen(project: CadProject, sheet: Sheet, rev: string, issueId: string, prims: Prim[]): Promise<void> {
	const chunks = splitChunks(JSON.stringify(prims)), k = key(sheet.id, rev)
	// its floorplan files' settings as they are now: a reprint draws them like this, whatever is masked / hidden later
	const ids = [...new Set(prims.flatMap((p) => (p.k === 'image' ? [parseUnderlayRef(p.url)?.fileId] : []).filter((x): x is string => !!x)))]
	const files: Record<string, FileSnapshot> = {}
	for (const id of ids) { const fd = (await getDoc(doc(project.db, 'files', id))).data(); if (fd?.url) files[id] = fileSnapshot(fd) }
	// checked and written in one transaction: two people issuing the same revision can't both win
	await runTransaction(project.db, async (tx) => {
		const headRef = doc(project.db, col(project), k)
		const why = frozenTaken(project, (await tx.get(headRef)).data(), sheet, rev)
		if (why) throw new Error(why)
		tx.set(headRef, { sheetId: sheet.id, rev, issueId, ...paperSize(sheet), parts: chunks.length, at: Date.now(), ...(ids.length ? { files: JSON.stringify(files) } : {}) })
		chunks.forEach((json, i) => tx.set(doc(project.db, col(project), `${k}~p${i}`), { json }))
	})
}
async function loadFrozen(project: CadProject, sheetId: string, rev: string): Promise<PdfPage> {
	const k = key(sheetId, rev), head = (await getDoc(doc(project.db, col(project), k))).data()
	if (!head) throw new Error(`no frozen copy of ${sheetId} rev ${rev}`)
	const parts = await Promise.all(Array.from({ length: head.parts as number }, (_, i) => getDoc(doc(project.db, col(project), `${k}~p${i}`))))
	const prims = JSON.parse(parts.map((p) => p.data()?.json ?? '').join('')) as Prim[]
	// with its floorplans' settings as issued (copies frozen before 2026-10-12 have none: the file as it is now)
	const files = head.files ? (JSON.parse(head.files as string) as Record<string, FileSnapshot>) : {}
	return { w: head.w, h: head.h, prims: prims.map((p) => {
		const ref = p.k === 'image' ? parseUnderlayRef(p.url) : null
		return ref && files[ref.fileId] ? { ...p, url: asWasRef(ref.fileId, ref.page, files[ref.fileId]) } : p
	}) }
}
/** An image url standing for "this floorplan page, drawn with these settings" (resolved by frozenImages). */
const AS_WAS = 'aswas:'
const asWasRef = (fileId: string, page: number, fd: FileSnapshot) => `${AS_WAS}${encodeURIComponent(JSON.stringify({ fileId, page, fd }))}`

/** Images in a sheet's PDF: an image shape's `picture:` reference is loaded from its file first. */
export const pictureLoader = (project: CadProject): ImageLoader => async (url, kind, gray) => {
	if (!url.startsWith(PICTURE_REF)) return browserImageLoader(url, kind, gray)
	const real = await project.pdf.pictureReady(url)
	return real ? browserImageLoader(real, kind, gray) : null
}

/** Images in frozen lists: a floorplan reference is rendered from its file again (a picture loaded from its file). */
const frozenImages = (project: CadProject): ImageLoader => async (url, kind, gray) => {
	if (url.startsWith(PICTURE_REF)) return pictureLoader(project)(url, kind, gray)
	if (url.startsWith(AS_WAS)) {
		const { fileId, page, fd } = JSON.parse(decodeURIComponent(url.slice(AS_WAS.length))) as { fileId: string; page: number; fd: FileSnapshot }
		const img = await project.pdf.imageAsWas(fileId, page, fd)
		return img ? browserImageLoader(img, kind, gray) : null
	}
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
	/** Excel files issued with the PDF (W21): uploaded beside it, listed on the transmittal and the issue. */
	attach?: Attachment[]
	/** Back up the whole project with it (ADR 0008 §7) — off unless ticked: a full copy each time. */
	backup?: boolean
}
export type IssueResult = { issue: Issue; unsupported: string[]; rasterised: string[] }

/** Issue these sheets as one package: bump the changed ones (frozen at the new revision), take the rest as last
 *  issued, draw the package PDF from the frozen lists, upload it, then record it all (one undo step for the sheets
 *  and the issue; the frozen copies and the file stay). Throws — before anything is recorded — if the upload fails. */
export async function issuePackage(project: CadProject, listed: Sheet[], f: IssueForm): Promise<IssueResult> {
	// the sheets as they are NOW, not as they were when the Issue panel opened (edits and other people's issues since)
	const sheets = freshSheets(project, listed)
	const plan = withCodes(await previewIssue(project, sheets, f.first), f.codes)
	// a typed code must be new for its sheet — checked before anything is written
	for (const r of plan) { const why = r.changed ? revCodeProblem(r.sheet, r.rev) : null; if (why) throw new Error(why) }
	// …and no recorded issue may already hold a frozen copy of it (saveFrozen checks again, in its transaction)
	for (const r of plan) { const why = r.changed ? await frozenConflict(project, r.sheet, r.rev) : null; if (why) throw new Error(why) }
	const issueId = newId(), number = nextIssueNumber(project.store.ofType('issue'))
	// the backup first: if it fails, nothing has been written yet
	const backup = f.backup ? await storeBackup(project, `${issueTag(number)}: ${f.name}`, 'all', { issueId }) : null
	// what each bumped sheet gets: its new revision — put on the sheet as it is when the issue is recorded, seconds of
	// saving / drawing / uploading later (a copy taken now would overwrite edits made meanwhile)
	const bumped: { id: string; rev: Parameters<typeof issuedRevision>[1] }[] = [], pages: PdfPage[] = []
	for (const row of plan) {
		if (!row.changed) { pages.push(await loadFrozen(project, row.sheet.id, row.rev)); continue }
		// frozen as it shows once issued (the title block reads the new rev / date); its change notes go onto the revision
		const desc = f.descs?.[row.sheet.id]?.trim(), extra = { ...(desc ? { desc } : {}), ...(f.by?.trim() ? { by: f.by.trim() } : {}) }
		// its clouds still on a draft code (W20: tagged before this code was chosen) take this one — before it is frozen,
		// so the print's delta tags read it and the next issue hides them
		const retag = tagDraftClouds(project.store.ofType('shape'), row.sheet, row.rev)
		if (retag.length) project.store.transact(`Revision clouds on ${row.sheet.number}: ${row.rev}`, (tx) => { for (const s of retag) tx.put(s) })
		const next = issuedRevision(row.sheet, { code: row.rev, date: f.date, note: f.purpose, ...extra, issueId })
		const prims = frozenNow(project, next)
		await saveFrozen(project, row.sheet, row.rev, issueId, prims)
		bumped.push({ id: row.sheet.id, rev: { code: row.rev, date: f.date, note: f.purpose, ...extra, issueId, hash: printNow(project, prims) } })
		pages.push({ ...paperSize(row.sheet), prims })
	}
	// the floorplan files the sheets went out on (W4: which revision), on the transmittal and the issue record
	const floorplans = floorplansIn(pages.map((p) => p.prims))
	// the cover page(s) first (Dave D5: the first sheet's size, the project title block), frozen with the issue
	let coverN = 0
	if (f.cover && plan.length) {
		const rows: CoverRow[] = [
			...plan.map((r) => ({ number: r.sheet.number, title: r.sheet.title, rev: r.rev, size: r.sheet.paper.size, status: (r.changed ? 'New revision' : 'As last issued') as CoverRow['status'] })),
			...(f.withdrawn ?? []).map((w) => ({ number: w.number, title: w.title, rev: w.rev, size: '', status: 'Withdrawn' as const })),
		]
		const cover = coverPages(project.index, plan[0].sheet, { project: project.name, tag: issueTag(number), name: f.name, purpose: f.purpose, date: f.date, recipients: f.recipients, note: f.note, rows, floorplans, attachments: (f.attach ?? []).map((a) => ATTACHMENT_NAME[a]) },
			{ blocks: project.blockOf, ...project.sheetBase })
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
	// the schedules that go with it (W21), as they are now; named after the issue
	const attachments: NonNullable<Issue['attachments']> = []
	for (const a of f.attach ?? []) {
		const x = await attachmentFile(project, a), base = `${fileSafe(`${project.name} ${issueTag(number)} ${ATTACHMENT_NAME[a]}`)}.xlsx`
		const r = await storeFile(project.db, project.pid, new File([x.data], base, { type: XLSX_TYPE }), { storage: project.settings?.fileStorage, route: 'floorplanUploader', id: `issue-${newId()}` })
		attachments.push({ id: r.id, url: r.url, name: base, kind: a })
	}
	const issue: Issue = {
		type: 'issue', id: issueId, number, name: f.name, purpose: f.purpose, date: f.date,
		...(f.to ? { to: f.to } : {}), ...(f.note ? { note: f.note } : {}), ...(f.packageId ? { packageId: f.packageId } : {}), ...(f.withdrawn?.length ? { withdrawn: f.withdrawn } : {}), ...(coverN ? { cover: coverN } : {}), ...(backup ? { backupId: backup.id } : {}), ...(floorplans.length ? { floorplans } : {}), ...(attachments.length ? { attachments } : {}),
		sheets: plan.map((r) => ({ sheetId: r.sheet.id, number: r.sheet.number, title: r.sheet.title, rev: r.rev, size: `${r.sheet.paper.size}`, changed: r.changed })),
		file,
	}
	// someone issued the same revision while this ran (the PDF is already uploaded; the frozen copies are theirs or ours)
	for (const b of bumped) { const cur = project.store.get(b.id); if (cur?.type === 'sheet' && cur.revisions?.some((r) => r.code === b.rev.code)) throw new Error(`${cur.number || cur.title} got revision ${b.rev.code} meanwhile (another issue) — nothing was recorded; issue again`) }
	project.store.transact(`Issue ${f.name}`, (tx) => {
		for (const b of bumped) { const cur = tx.get(b.id); if (cur?.type === 'sheet') tx.put(issuedRevision(cur, b.rev)) }
		tx.put(issue)
	})
	return { issue, unsupported, rasterised }
}

/** What can be issued with the PDFs (W21) and what it's called on the transmittal / in the file name. */
export type Attachment = NonNullable<Issue['attachments']>[number]['kind']
export const ATTACHMENT_NAME: Record<Attachment, string> = { bom: 'Bill of materials', cables: 'Cable schedule', outlets: 'Outlet schedule' }
/** One attachment's workbook, made as File › Export makes it (the BOM: materials + the rack BOM, every room). */
async function attachmentFile(project: CadProject, a: Attachment): Promise<XlsxFile> {
	if (a === 'outlets') return outletScheduleFile(project.index, project.name)
	if (a === 'cables') return cableScheduleFile(cableSchedule(project.index, project.routes, cableSettings(project.index), project.estimates), project.name)
	const { PANDUIT_SEED } = await import('$lib/catalog/panduitSeed')
	return bomFile(project.index, project.name, PANDUIT_SEED, project.routes, { materials: true, rack: 'consolidated' }, project.estimates)
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
