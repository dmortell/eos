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
	 *  yet); `write` stores one field (origin / scale / crop) and says so; `done` = back to Select. */
	constructor(private target: () => CalibTarget | null, private calib: (u: Underlay) => PageCalibUsed | undefined,
		private write: (u: Underlay, field: CalibMode, value: unknown, what: string) => void, private done: () => void) {}

	down(e: PointerIn, c: ToolCtx): void {
		const t = this.target(), cal = t && this.calib(t.underlay)
		if (!t || !cal) { c.say?.(t ? 'The floorplan is still loading — try again in a moment' : 'Pick the floorplan in Project › Floors… › Plans & floorplans first'); return }
		const p = e.p   // the floorplan's own points: no snapping to the drawing
		if (t.mode === 'origin') {
			const q = toPage(p, t.underlay, cal)
			this.write(t.underlay, 'origin', { x: Math.round(q.x), y: Math.round(q.y) }, 'Origin set: that point is now 0, 0')
			this.done()
			return
		}
		if (!this.#first) { this.#first = p; c.say?.(t.mode === 'scale' ? 'Click the other end of a known distance' : 'Click the opposite corner of the part to keep'); return }
		const a = this.#first
		this.#first = null
		if (t.mode === 'crop') {
			const r = cropRecord(toPage(a, t.underlay, cal), toPage(p, t.underlay, cal))
			if (r.width < 1 || r.height < 1) { c.say?.('Too small — drag over the part of the floorplan to keep'); return }
			this.write(t.underlay, 'crop', r, 'Cropped: only that part of the floorplan shows')
			this.done()
			return
		}
		// scale: the distance as it measures now, then the real one
		const measured = Math.round(Math.hypot(p.x - a.x, p.y - a.y))
		const qa = toPage(a, t.underlay, cal), qb = toPage(p, t.underlay, cal)
		c.ask(`Real distance between the two points (mm) — it measures ${measured} mm now`, measured, (mm) => {
			const r = scaleRecord(qa, qb, mm)
			if (!r) { c.say?.('Type a distance over 0 mm'); return }
			this.write(t.underlay, 'scale', r, `Scaled: ${measured} mm → ${mm} mm (× ${(mm / Math.max(1, measured)).toFixed(3)})`)
			this.done()
		})
	}
	move(e: PointerIn): void { this.#hover = e.p }
	hover(e: PointerIn): void { this.#hover = e.p }
	up(): void {}
	cancel(): void { this.#first = null; this.#hover = null }
	key(e: KeyboardEvent): boolean {
		if (e.key !== 'Escape') return false
		if (this.#first) { this.#first = null; return true }
		this.done()
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
