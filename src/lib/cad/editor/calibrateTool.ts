// The CALIBRATE tool (backlog "Calibrate an image in place", G289 — as the Pages / Uploads tools do it, on the
// drawing): a floorplan underlay's ORIGIN (one click: that point becomes plan 0, 0), SCALE (two clicks a known
// distance apart, then the real distance) or CROP (two corners). Armed from Project settings › Plans & floorplans for
// one floorplan. It writes the page's calibration in its file (`files/{id}.pages[n]`, Uploads' units: page points, mm
// per point), via `write`; the plan redraws from the file. Pure maths below, tested in calibrateTool.test.ts.
import type { Tool, ToolCtx, PointerIn } from './tools'
import type { Prim } from '../views/display'
import type { Pt, Underlay } from '../domain/types'
import type { PageCalibUsed } from '../app/pdf.svelte'

export type CalibMode = 'origin' | 'scale' | 'crop'
export interface CalibTarget { underlay: Underlay; mode: CalibMode }

/** A plan point (mm) → the page point (PDF points) under it, for an underlay placed with calibration `cal` (its zone
 *  offset `u.origin` moves it on the plan). */
export function toPage(p: Pt, u: Pick<Underlay, 'origin'>, cal: Pick<PageCalibUsed, 'origin' | 'sf'>): Pt {
	return { x: (p.x - (u.origin?.x ?? 0)) / cal.sf + cal.origin.x, y: (p.y - (u.origin?.y ?? 0)) / cal.sf + cal.origin.y }
}
/** Uploads' dimension-line record for a scale: the two page points, the real distance (mm) and mm per point (3 dp).
 *  (Uploads measures its line along x or y only; here the straight distance between the clicks.) */
export function scaleRecord(a: Pt, b: Pt, mm: number): { x1: number; y1: number; x2: number; y2: number; offset: number; units: 'mm'; distance: number; scale: number } | null {
	const d = Math.hypot(b.x - a.x, b.y - a.y)
	if (!(d > 0) || !(mm > 0)) return null
	const r = (v: number) => Math.round(v * 10) / 10
	return { x1: r(a.x), y1: r(a.y), x2: r(b.x), y2: r(b.y), offset: 30, units: 'mm', distance: mm, scale: Math.round((mm / d) * 1000) / 1000 }
}
/** mm on paper per PDF point (1/72 in). */
export const PT_MM = 25.4 / 72
/** ISO paper sizes by their long side (mm), for "1:100 at A1" when the PDF page is another size. */
export const PAPER_MM: Record<string, number> = { A0: 1189, A1: 841, A2: 594, A3: 420, A4: 297 }
/** The ISO size a page (points) is, within 3 % on its long side; undefined for anything else. */
export function paperOf(page: { w: number; h: number }): string | undefined {
	const long = Math.max(page.w, page.h) * PT_MM
	return Object.keys(PAPER_MM).find((k) => Math.abs(PAPER_MM[k] - long) <= PAPER_MM[k] * 0.03)
}
/** "100", "1:100", "100 A1", "1:100 @ A1", "1/100 at a1" → the scale and the paper it's for (W5). */
export function parsePaperScale(t: string): { n: number; paper?: string } | null {
	const m = /^\s*(?:1\s*[:/]\s*)?(\d+(?:\.\d+)?)\s*(?:(?:@|at|on)?\s*(A[0-4]))?\s*$/i.exec(t)
	const n = m ? Number(m[1]) : NaN
	return n > 0 ? { n, ...(m![2] ? { paper: m![2].toUpperCase() } : {}) } : null
}
/** The drawing's 1:N read back from mm per point (to 1 dp: a hand-measured scale isn't a round number). */
export const ratioOf = (sf: number): number => Math.round((sf / PT_MM) * 10) / 10
/** Uploads' scale record for a page drawn at 1:N (W5 "Paper-scale calibration"): mm per point straight from the paper
 *  (on another `paper` size than the PDF page: × that paper ÷ the page, long sides). The dimension line Uploads draws
 *  is a horizontal one across most of the page, a round number of metres long. */
export function paperScaleRecord(n: number, page: { w: number; h: number }, paper?: string): ReturnType<typeof scaleRecord> & { paper: string } | null {
	const long = Math.max(page.w, page.h) * PT_MM
	if (!(n > 0) || !(long > 0) || (paper && !PAPER_MM[paper])) return null
	const sf = n * PT_MM * (paper ? PAPER_MM[paper] / long : 1)
	const distance = Math.max(1000, Math.round((page.w * 0.8 * sf) / 1000) * 1000)
	const r = (v: number) => Math.round(v * 10) / 10, x1 = r(page.w * 0.1), y = r(page.h / 2)
	return { x1, y1: y, x2: r(x1 + distance / sf), y2: y, offset: 30, units: 'mm', distance, scale: Math.round(sf * 1000) / 1000, paper: `1:${n}${paper ? ` at ${paper}` : ''}` }
}
/** Uploads' crop record (page points, whole) from two corners. */
export function cropRecord(a: Pt, b: Pt): { x: number; y: number; width: number; height: number } {
	const x = Math.round(Math.min(a.x, b.x)), y = Math.round(Math.min(a.y, b.y))
	return { x, y, width: Math.round(Math.max(a.x, b.x)) - x, height: Math.round(Math.max(a.y, b.y)) - y }
}

export class CalibrateTool implements Tool {
	readonly id = 'calibrate'
	readonly cursor = 'crosshair'
	#first: Pt | null = null
	#hover: Pt | null = null

	/** `target` = the floorplan and what's being set; `calib` = its page's calibration as placed (undefined = not drawn
	 *  yet); `write` stores one field (origin / scale / crop) and says so; `done` = back to Select — `ok` = it was set
	 *  (false: Esc stopped it; "Set up each floor" stops its pass then, W6). */
	constructor(private target: () => CalibTarget | null, private calib: (u: Underlay) => PageCalibUsed | undefined,
		private write: (u: Underlay, field: CalibMode, value: unknown, what: string) => void, private done: (ok: boolean) => void) {}

	down(e: PointerIn, c: ToolCtx): void {
		const t = this.target(), cal = t && this.calib(t.underlay)
		if (!t || !cal) { c.say?.(t ? 'The floorplan is still loading — try again in a moment' : 'Pick the floorplan in Project › Floors… › Plans & floorplans first'); return }
		const p = e.p   // the floorplan's own points: no snapping to the drawing
		if (t.mode === 'origin') {
			const q = toPage(p, t.underlay, cal)
			this.write(t.underlay, 'origin', { x: Math.round(q.x), y: Math.round(q.y) }, 'Origin set: that point is now 0, 0')
			this.done(true)
			return
		}
		if (!this.#first) { this.#first = p; c.say?.(t.mode === 'scale' ? 'Click the other end of a known distance' : 'Click the opposite corner of the part to keep'); return }
		const a = this.#first
		this.#first = null
		if (t.mode === 'crop') {
			const r = cropRecord(toPage(a, t.underlay, cal), toPage(p, t.underlay, cal))
			if (r.width < 1 || r.height < 1) { c.say?.('Too small — drag over the part of the floorplan to keep'); return }
			this.write(t.underlay, 'crop', r, 'Cropped: only that part of the floorplan shows')
			this.done(true)
			return
		}
		// scale: the distance as it measures now, then the real one
		const measured = Math.round(Math.hypot(p.x - a.x, p.y - a.y))
		const qa = toPage(a, t.underlay, cal), qb = toPage(p, t.underlay, cal)
		c.ask(`Real distance between the two points (mm) — it measures ${measured} mm now`, measured, (mm) => {
			const r = scaleRecord(qa, qb, mm)
			if (!r) { c.say?.('Type a distance over 0 mm'); return }
			this.write(t.underlay, 'scale', r, `Scaled: ${measured} mm → ${mm} mm (× ${(mm / Math.max(1, measured)).toFixed(3)})`)
			this.done(true)
		})
	}
	move(e: PointerIn): void { this.#hover = e.p }
	hover(e: PointerIn): void { this.#hover = e.p }
	up(): void {}
	cancel(): void { this.#first = null; this.#hover = null }
	key(e: KeyboardEvent): boolean {
		if (e.key !== 'Escape') return false
		if (this.#first) { this.#first = null; return true }
		this.done(false)
		return true
	}
	/** The line being measured, or the crop box being drawn. */
	preview(): Prim[] {
		const a = this.#first, b = this.#hover, t = this.target()
		if (!a || !b || !t) return []
		if (t.mode === 'scale') return [{ k: 'line', pts: [a, b], cls: 'draft' }]
		return [{ k: 'line', pts: [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }], closed: true, cls: 'draft' }]
	}
}
