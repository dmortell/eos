// Paper notes (Phase 4.5): TEXT (click, type), LEADER (click the tip, then more points, Enter / right-click → its
// text) and revision CLOUD (click round the area, Enter / right-click closes it) on a sheet's paper — shapes owned by
// the sheet, in paper mm — or, drawn inside a viewport, tied to it in its view mm (Dave: notes must follow a
// viewport's rescale / pan / move). Backspace drops the last point; Esc cancels.
import type { Tool, ToolCtx, PointerIn } from './tools'
import type { Prim } from '../views/display'
import type { Pt } from '../domain/types'
import type { Shape } from '../domain/shapes'
import { newId } from '../domain/ids'
import { pickPrim } from './pick'
import type { Sheet, Viewport } from '../domain/drawing'
import { fromPaper, toPaper, viewportAt, viewportContent } from '../views/sheet'
import { snapAt, snapToPrims } from './snap'
import type { ProjectIndex } from '../domain/project'
import { cloudPts } from '../views/plan'
import { PLOT_SCALE } from '../views/display'

/** A note tied to a viewport put back on the paper where it showed (domain/sheetEdit.ts). */
export { untie } from '../domain/sheetEdit'

/** A note's grips (Dave: notes need grips when selected): the text's anchor (index -1), or each leader / cloud point,
 *  where they show — on the paper through the viewport a note is tied to. */
export function noteGrips(s: Shape, vp?: Viewport): { at: Pt; index: number }[] {
	const t = vp ? toPaper(vp) : (p: Pt) => p, g = s.geom
	if (g.kind === 'text') return [{ at: t(g.at), index: -1 }]
	// (a leader's / cloud's points are the Select tool's shape grips: editor/shapeGrips.ts)
	return []
}
/** The note with one grip moved to `to` (where it shows; back into the viewport's view mm when tied). */
export function moveNotePoint(s: Shape, index: number, to: Pt, vp?: Viewport): Shape {
	const p = vp ? fromPaper(vp)(to) : to, g = s.geom
	if (g.kind === 'text' && index < 0) return { ...s, geom: { ...g, at: p } }
	if ((g.kind === 'leader' || g.kind === 'cloud') && index >= 0) return { ...s, geom: { ...g, pts: g.pts.map((q, i) => (i === index ? p : q)) } }
	return s
}
/** The viewport a sheet note is tied to, if any. */
export const tiedViewport = (s: Shape, get: (id: string) => unknown): Viewport | undefined =>
	s.vpId ? (get(s.sheetId!) as Sheet | undefined)?.viewports.find((v) => v.id === s.vpId) : undefined

export type NoteKind = 'text' | 'leader' | 'cloud'

/** Where a note (or a dimension) drawn here lives (backlog "Notes on plans and diagrams"): a sheet's paper — or, drawn
 *  inside a viewport (the first point decides), tied to it in its view mm; the level's plan (current layer); or an
 *  elevation / section's own plane (points in (u, z), like the Shape tool). Null = not in this view. */
export function placeNote(c: ToolCtx, pts: Pt[]): { owner: Record<string, unknown>; pts: Pt[] } | null {
	const spec = c.space.spec, layer = c.layerId ? { layerId: c.layerId } : {}
	if (spec.kind === 'sheet') {
		const sheet = c.store.get(spec.sheetId) as Sheet | undefined
		const vp = sheet && pts.length ? viewportAt(sheet, pts[0]) : undefined
		if (!vp) return { owner: { sheetId: spec.sheetId }, pts }
		const f = fromPaper(vp)
		return { owner: { sheetId: spec.sheetId, vpId: vp.id }, pts: pts.map(f) }
	}
	if (spec.kind === 'plan') return { owner: { levelId: c.levelId, ...layer }, pts }
	if ((spec.kind === 'elevation' || spec.kind === 'section') && c.space.frame)
		return { owner: { levelId: c.levelId, plane: { kind: 'vertical', frame: c.space.frame, depth: Math.round(c.work.depth) }, ...layer }, pts: pts.map((p) => ({ x: p.x, y: -p.y })) }
	return null
}
/** An object snap of what a viewport shows, for a paper point over it (Q44): the point is looked up in the viewport's
 *  view (a plan: the level's outlets, racks, shape centres, run nodes; else the view's drawn vertices) and comes back
 *  on the paper. Null = no viewport there, or nothing within `tolPaper` paper mm. */
export function snapThroughViewport(ix: ProjectIndex, sheet: Sheet, p: Pt, tolPaper: number): Pt | null {
	const vp = viewportAt(sheet, p)
	if (!vp) return null
	const q = fromPaper(vp)(p), tol = tolPaper * vp.scale, spec = vp.view.spec
	const sn = spec.kind === 'plan' ? snapAt(ix, vp.view.levelId, q, tol, { noGrid: true }) : snapToPrims(viewportContent(ix, vp), q, tol, { noGrid: true })
	return sn.kind === 'grid' ? null : toPaper(vp)(sn.p)
}
/** A point for a note: paper snaps to what a viewport shows there, else 0.5 mm; a drawing to its object snaps / grid. */
export const notePoint = (e: PointerIn, c: ToolCtx): Pt => (c.space.spec.kind === 'sheet' ? (c.sheetSnap?.(e.p, e.alt) ?? snap(e.p)) : c.snap(e.p, e.alt).p)
const snap = (p: Pt): Pt => ({ x: Math.round(p.x * 2) / 2, y: Math.round(p.y * 2) / 2 })   // 0.5 mm on paper

export class NoteTool implements Tool {
	readonly cursor = 'crosshair'
	#pts: Pt[] = []
	#hover: Pt | null = null
	constructor(readonly id: NoteKind) {}

	#where = (c: ToolCtx, pts: Pt[]) => placeNote(c, pts)
	#pt = (e: PointerIn, c: ToolCtx) => notePoint(e, c)

	down(e: PointerIn, c: ToolCtx): void {
		const p = this.#pt(e, c)
		if (!this.#where(c, [p])) { c.say?.('Notes go on plans, elevations, sections and sheets'); return }
		if (this.id === 'text') {
			// on an existing text (or a leader's words): edit that one in place instead of starting another
			const id = pickPrim(c.prims(), e.p, c.tol())?.src, g = id ? (c.store.get(id) as Shape | undefined)?.geom : undefined
			if (id && c.editText && (g?.kind === 'text' || g?.kind === 'leader')) { c.select([id]); c.editText(id); return }
			this.#textAt = p
			return
		}
		const last = this.#pts.at(-1)
		if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1e-6) this.#pts.push(p)   // a double-click's second press: not a 0-length edge
	}
	move(e: PointerIn, c: ToolCtx): void { this.#hover = this.#pt(e, c) }
	hover(e: PointerIn, c: ToolCtx): void { this.#hover = this.#pt(e, c) }
	/** A new text goes on the drawing at once with the words "Text", its box open on it to type over (Dave 2026-10-05: no
	 *  prompt in the tool bar). On RELEASE: opened on press, the rest of the click would take the focus from the box. */
	up(e: PointerIn, c: ToolCtx): void {
		// a leader pressed at its tip and DRAGGED to where its words go: a two-point callout, made on release
		if (this.id === 'leader' && this.#pts.length === 1) {
			const q = this.#pt(e, c), tip = this.#pts[0]
			if (Math.hypot(q.x - tip.x, q.y - tip.y) > c.tol()) { this.#pts.push(q); this.finish(c); return }
		}
		const p = this.#textAt
		this.#textAt = null
		const at = p && this.#where(c, [p])
		if (!at) return
		const make = (t: string) => {
			const s = { type: 'shape', id: newId(), ...at.owner, geom: { kind: 'text', at: at.pts[0], text: t, sizeMm: 2.5 } } as Shape
			c.store.transact('Text', (tx) => tx.put(s))
			c.select([s.id])
			return s.id
		}
		if (c.editText) c.editText(make('Text'))
		else c.askText?.('Text', '', (t) => { if (t.trim()) make(t.trim()) })   // no drawing to type on (tests, a headless context)
	}
	#textAt: Pt | null = null
	cancel(): void { this.#pts = []; this.#hover = null }

	finish(c: ToolCtx): void {
		const pts = this.#pts
		this.#pts = []
		const at = this.#where(c, pts)   // on a sheet the first point (a leader's tip) decides the viewport
		if (!at) return
		if (this.id === 'cloud' && pts.length >= 3) {
			const s: Shape = { type: 'shape', id: newId(), ...at.owner, geom: { kind: 'cloud', pts: at.pts } } as Shape
			c.store.transact('Revision cloud', (tx) => tx.put(s))
			c.select([s.id])
		} else if (this.id === 'leader' && pts.length >= 2) {
			const make = (t: string) => {
				const s: Shape = { type: 'shape', id: newId(), ...at.owner, geom: { kind: 'leader', pts: at.pts, ...(t ? { text: t } : {}) } } as Shape
				c.store.transact('Leader', (tx) => tx.put(s))
				c.select([s.id])
				return s.id
			}
			// its words are typed on the drawing at its end (Dave 2026-10-05: no tool-bar prompt); none is fine
			if (c.editText) c.editText(make(''))
			else c.askText?.('Leader text (optional)', '', (t) => make(t.trim()))
		} else if (pts.length) c.say?.(this.id === 'cloud' ? 'A cloud needs at least 3 points' : 'A leader needs a tip and at least one more point')
	}

	key(e: KeyboardEvent, c: ToolCtx): boolean {
		if (e.key === 'Enter' && this.#pts.length) { this.finish(c); return true }
		if (e.key === 'Backspace' && this.#pts.length) { this.#pts.pop(); return true }
		// Esc (and a right-click) ends it like a run: kept when there are enough points, else dropped
		if (e.key === 'Escape' && this.#pts.length) { if (this.#pts.length >= (this.id === 'cloud' ? 3 : 2)) this.finish(c); else this.cancel(); return true }
		return false
	}

	/** The points so far and a rubber band to the cursor. A cloud shows its scallops as it will be drawn (Dave
	 *  2026-10-09), its closing edge too; with two points, the one scalloped edge. */
	preview(c: ToolCtx): Prim[] {
		if (!this.#pts.length || !this.#hover) return []
		const pts = [...this.#pts, this.#hover]
		if (this.id !== 'cloud' || Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) < 1e-6) return [{ k: 'line', pts, cls: 'draft' }]
		// its bumps a printed 6 mm (views/plan.ts): paper mm on a sheet, else drawn at the plot scale
		const arc = 6 * (c.space.spec.kind === 'sheet' ? 1 : PLOT_SCALE), all = cloudPts(pts, arc)
		return [{ k: 'line', pts: pts.length > 2 ? all : [...all.slice(0, all.length / 2), pts[1]], closed: pts.length > 2, cls: 'draft' }]
	}
	lastPoint(): Pt | null { return this.#pts.at(-1) ?? null }
	typed(p: Pt, c: ToolCtx): void { const e = { p, shift: false, ctrl: false, alt: false } as PointerIn; this.down(e, c); this.up(e, c) }
}
