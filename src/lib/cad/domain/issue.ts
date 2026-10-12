// ISSUING (Phase 4.6), the pure part: the next revision code, a sheet's display list FROZEN (compact, floorplans as
// file references) and its fingerprint, and the plan of a package — which sheets get a new revision (changed since
// their last issue) and which go at the revision they were last issued at. The app part (Firestore, upload, PDF) is
// app/issue.ts.
import type { Prim } from '../views/display'
import type { Issue, Sheet, SheetChange } from './drawing'

/** The revision after `code`: none → `first`; a trailing number counts up keeping its width (P01 → P02, 9 → 10);
 *  letters count A → B … Z → AA. */
export function nextRev(code: string | undefined, first = 'A'): string {
	if (!code) return first
	const num = /^(.*?)(\d+)$/.exec(code)
	if (num) return num[1] + String(Number(num[2]) + 1).padStart(num[2].length, '0')
	const letters = /^(.*?)([A-Z]+)$/i.exec(code)
	if (!letters) return code + '1'
	const cs = [...letters[2]]
	let i = cs.length - 1
	for (; i >= 0; i--) {
		const z = cs[i] === 'Z' ? 'A' : cs[i] === 'z' ? 'a' : null
		if (!z) { cs[i] = String.fromCharCode(cs[i].charCodeAt(0) + 1); break }
		cs[i] = z
	}
	return letters[1] + (i < 0 ? (cs[0] === 'a' ? 'a' : 'A') : '') + cs.join('')
}

/** A floorplan in a frozen list: its file and page, not the rendered picture (that is a local blob). */
export const UNDERLAY_REF = 'underlay:'
/** An image shape's picture (backlog "Markup kinds" part 4): its file and page, resolved when shown or printed — the
 *  display list (and a frozen issue) keeps the reference, never a blob url. */
export const PICTURE_REF = 'picture:'
export const pictureRef = (fileId: string, page = 1) => `${PICTURE_REF}${fileId}#${page}`
export function parsePictureRef(url: string): { fileId: string; page: number } | null {
	if (!url.startsWith(PICTURE_REF)) return null
	const [fileId, page] = url.slice(PICTURE_REF.length).split('#')
	return fileId ? { fileId, page: Number(page) || 1 } : null
}
export const underlayRef = (fileId: string, page = 1) => `${UNDERLAY_REF}${fileId}#${page}`
export function parseUnderlayRef(url: string): { fileId: string; page: number } | null {
	if (!url.startsWith(UNDERLAY_REF)) return null
	const s = url.slice(UNDERLAY_REF.length), i = s.lastIndexOf('#')
	return { fileId: s.slice(0, i), page: Number(s.slice(i + 1)) || 1 }
}

const r2 = (v: number) => Math.round(v * 100) / 100
const rp = (p: { x: number; y: number }) => ({ x: r2(p.x), y: r2(p.y) })
/** A display list as it is kept with an issue: coordinates to 0.01 mm, and only what printing needs (no pick ids). */
export function freeze(prims: Prim[]): Prim[] {
	return prims.map((p): Prim => {
		const clip = p.clip ? { x0: r2(p.clip.x0), y0: r2(p.clip.y0), x1: r2(p.clip.x1), y1: r2(p.clip.y1) } : undefined
		// the style a print needs: own / layer colour, lineweight, line type (views/layers.ts puts them on the prim)
		const base = { cls: (p as { cls?: string }).cls, ...(clip ? { clip } : {}), ...(p.color ? { color: p.color } : {}), ...(p.weight ? { weight: p.weight } : {}), ...(p.dash ? { dash: p.dash } : {}) }
		switch (p.k) {
			case 'line': return { k: 'line', pts: p.pts.map(rp), ...(p.closed ? { closed: true } : {}), ...(p.holes ? { holes: p.holes.map((h) => h.map(rp)) } : {}), ...(p.fill ? { fill: true } : {}), ...(p.w ? { w: r2(p.w) } : {}), ...base } as Prim
			case 'circle': return { k: 'circle', c: rp(p.c), r: r2(p.r), ...(p.fill ? { fill: true } : {}), ...base } as Prim
			case 'text': return { k: 'text', at: rp(p.at), text: p.text, size: r2(p.size), ...(p.anchor ? { anchor: p.anchor } : {}), ...(p.rot ? { rot: p.rot } : {}), ...(p.minPx != null ? { minPx: p.minPx } : {}), ...(p.maxPx != null ? { maxPx: p.maxPx } : {}), ...base } as Prim
			case 'image': return { k: 'image', url: p.url, x: r2(p.x), y: r2(p.y), w: r2(p.w), h: r2(p.h), ...(p.opacity != null ? { opacity: p.opacity } : {}), ...(p.fit ? { fit: p.fit } : {}), ...(p.gray ? { gray: true } : {}), ...(clip ? { clip } : {}) } as Prim
		}
	})
}

/** A short fingerprint of a frozen list (FNV-1a, 32 bit, + its length): equal lists → equal prints. */
export function fingerprint(frozen: Prim[]): string {
	const s = JSON.stringify(frozen)
	let h = 0x811c9dc5
	for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
	return `${(h >>> 0).toString(16).padStart(8, '0')}-${s.length.toString(36)}`
}

export type IssuePlanRow = { sheet: Sheet; changed: boolean; from?: string; rev: string }
/** What issuing these sheets does: a sheet never issued, or whose fingerprint `now` differs from its last issue's,
 *  gets the next revision; the rest go as last issued. */
export function planIssue(sheets: Sheet[], now: (s: Sheet) => string, first = 'A'): IssuePlanRow[] {
	return sheets.map((sheet) => {
		const last = sheet.revisions?.at(-1)
		const changed = !last || last.hash !== now(sheet)
		return { sheet, changed, from: last?.code, rev: changed ? nextRev(last?.code, first) : last!.code }
	})
}

/** The plan with the revision codes typed in the Issue panel (D7: per sheet, or "Set all to…") on the sheets that get
 *  a new one; a blank code keeps the suggested one. */
export function withCodes(plan: IssuePlanRow[], codes: Record<string, string> = {}): IssuePlanRow[] {
	return plan.map((r) => (r.changed && codes[r.sheet.id]?.trim() ? { ...r, rev: codes[r.sheet.id].trim() } : r))
}
/** Why a typed revision code can't be used on this sheet (blank, or it already has that revision — the frozen copy and
 *  the title block would clash), else null. */
export function revCodeProblem(s: Sheet, code: string): string | null {
	if (!code.trim()) return `${s.number || s.title}: no revision code`
	if (s.revisions?.some((r) => r.code === code.trim())) return `${s.number || s.title} already has revision ${code.trim()}`
	return null
}

/** The sheet with its new revision (what it shows once issued: the title block's rev / date read from it). */
export const withRevision = (s: Sheet, rev: Required<Sheet>['revisions'][number]): Sheet => ({ ...s, revisions: [...(s.revisions ?? []), rev] })
/** A sheet's change notes since its last issue as one line — what a new revision's "what changed" defaults to. */
export const changesText = (s: Sheet): string => (s.changes ?? []).map((c) => c.text.trim()).filter(Boolean).join('; ')
/** Change notes one per line, for a tip: "2026-10-09 Moved rack A3 (asked: client)". */
export const changeLines = (cs: SheetChange[] = []): string => cs.map((c) => `${c.date} ${c.text}${c.asked ? ` (asked: ${c.asked})` : ''}`).join('\n')
/** Issued at a new revision: its change notes go onto the revision (and its "what changed" defaults to them). */
export function issuedRevision(s: Sheet, rev: Required<Sheet>['revisions'][number]): Sheet {
	const changes = (s.changes ?? []).filter((c) => c.text.trim()), desc = rev.desc ?? (changesText(s) || undefined)
	return { ...withRevision(s, { ...rev, ...(desc ? { desc } : {}), ...(changes.length ? { changes } : {}) }), changes: undefined }
}

/** Each issue's number (backlog "Numbers on issues"): its own, else its place in date order (issues from before
 *  numbers), so the list reads 1, 2, 3 … either way. */
export function issueNumbers(issues: Issue[]): Map<string, number> {
	const out = new Map<string, number>()
	const ordered = [...issues].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
	ordered.forEach((i, n) => out.set(i.id, i.number ?? n + 1))
	return out
}
/** The number the next issue gets: one past the highest. */
export const nextIssueNumber = (issues: Issue[]): number => Math.max(0, ...issueNumbers(issues).values()) + 1
/** How an issue's number reads in names: "Issue 03". */
export const issueTag = (n: number): string => `Issue ${String(n).padStart(2, '0')}`

/** The transmittal's rows: the package's sheets in sheet-number order. */
export function transmittalRows(issue: Issue): Issue['sheets'] {
	const cmp = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
	return [...issue.sheets].sort((a, b) => cmp.compare(a.number, b.number))
}

/** The usual purposes of an issue (the Issue panel's and the Issues list's suggestions; any text is allowed). */
export const ISSUE_PURPOSES = ['For information', 'For comment', 'For approval', 'For tender', 'For construction', 'As built']

/** A sheet's ISSUE STATE (sheets-organising §1, slice 5) — derived, never stored: never issued; issued and unchanged
 *  (its print now = its last revision's fingerprint); changed since (the next issue gives it a new revision);
 *  superseded (archived after being issued). `now` = its fingerprint now (undefined: not worked out yet → 'unknown'). */
export type IssueState = 'not-issued' | 'issued' | 'changed' | 'superseded' | 'unknown'
export function issueState(s: Pick<Sheet, 'status' | 'revisions'>, now?: string): IssueState {
	const last = s.revisions?.at(-1)
	if (!last) return 'not-issued'
	if (s.status === 'archived') return 'superseded'
	if (now === undefined || !last.hash) return 'unknown'
	return last.hash === now ? 'issued' : 'changed'
}
export const ISSUE_STATE_TEXT: Record<IssueState, string> = { 'not-issued': 'Not issued', issued: 'Issued', changed: 'Changed since', superseded: 'Superseded', unknown: '…' }

/** Every issue that included this sheet (sheets-organising slice 9: "Issued in"), newest first, at which revision and
 *  whether it was new in that issue. */
export function issuesOfSheet(issues: Issue[], sheetId: string): { issue: Issue; number: number; rev: string; changed: boolean }[] {
	const nums = issueNumbers(issues)
	return issues.flatMap((i) => { const s = i.sheets.find((x) => x.sheetId === sheetId); return s ? [{ issue: i, number: nums.get(i.id) ?? 0, rev: s.rev, changed: s.changed }] : [] })
		.sort((a, b) => b.number - a.number || b.issue.date.localeCompare(a.issue.date))
}

/** The ISSUE REGISTER for the PM (backlog "Issue register for the PM"): every sheet that went out, a column per issue
 *  (in issue order) with the revision it went at — `new` when it got that revision there, 'withdrawn' when the
 *  package dropped it — or, `latest`, one column: each sheet's last issue. Sheets by number. */
export type RegisterCell = { rev: string; new: boolean } | 'withdrawn' | null
export function issueRegister(issues: Issue[], latest = false): { columns: { id: string; head: string; date: string }[]; rows: { number: string; title: string; cells: RegisterCell[] }[] } {
	const nums = issueNumbers(issues)
	const ordered = [...issues].sort((a, b) => (nums.get(a.id) ?? 0) - (nums.get(b.id) ?? 0))
	const sheets = new Map<string, { number: string; title: string }>()
	for (const i of ordered) for (const s of i.sheets) sheets.set(s.sheetId, { number: s.number, title: s.title })   // the latest number / title
	const cellOf = (i: Issue, id: string): RegisterCell => {
		const s = i.sheets.find((x) => x.sheetId === id)
		return s ? { rev: s.rev, new: s.changed } : i.withdrawn?.some((w) => w.sheetId === id) ? 'withdrawn' : null
	}
	const cmp = new Intl.Collator(undefined, { numeric: true })
	const ids = [...sheets.keys()].sort((a, b) => cmp.compare(sheets.get(a)!.number, sheets.get(b)!.number))
	if (latest) {
		return { columns: [{ id: 'latest', head: 'Latest', date: '' }], rows: ids.map((id) => {
			const last = [...ordered].reverse().find((i) => i.sheets.some((s) => s.sheetId === id))!
			const s = last.sheets.find((x) => x.sheetId === id)!
			return { ...sheets.get(id)!, cells: [{ rev: `${s.rev} · ${issueTag(nums.get(last.id) ?? 0)} · ${last.date}`, new: false }] }
		}) }
	}
	return {
		columns: ordered.map((i) => ({ id: i.id, head: `${issueTag(nums.get(i.id) ?? 0)} ${i.name}`, date: i.date })),
		rows: ids.map((id) => ({ ...sheets.get(id)!, cells: ordered.map((i) => cellOf(i, id)) })),
	}
}
