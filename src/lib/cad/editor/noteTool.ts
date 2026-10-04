// Paper notes (Phase 4.5): TEXT (click, type), LEADER (click the tip, then more points, Enter / right-click → its
// text) and revision CLOUD (click round the area, Enter / right-click closes it) on a sheet's paper — shapes owned by
// the sheet, in paper mm — or, drawn inside a viewport, tied to it in its view mm (Dave: notes must follow a
// viewport's rescale / pan / move). Backspace drops the last point; Esc cancels.
import type { Tool, ToolCtx, PointerIn } from './tools'
import type { Prim } from '../views/display'
import type { Pt } from '../domain/types'
import type { Shape } from '../domain/shapes'
import { newId } from '../domain/ids'
import type { Sheet, Viewport } from '../domain/drawing'
import { fromPaper, toPaper, viewportAt } from '../views/sheet'
import { dimLine } from '../views/plan'

/** A note tied to a viewport (one being deleted) put back on the paper where it showed. */
export function untie(s: Shape, vp: Viewport): Shape {
	const t = toPaper(vp), g = s.geom, k = 1 / vp.scale   // view mm → paper mm
	const geom = g.kind === 'text' ? { ...g, at: t(g.at) } : g.kind === 'leader' || g.kind === 'cloud' || g.kind === 'polygon' ? { ...g, pts: g.pts.map(t) }
		: g.kind === 'rect' ? { ...g, centre: t(g.centre), size: { x: g.size.x * k, y: g.size.y * k } }
		: g.kind === 'ellipse' ? { ...g, centre: t(g.centre), rx: g.rx * k, ry: g.ry * k }
		: g.kind === 'circle' ? { ...g, centre: t(g.centre), r: g.r * k }
		// a dimension keeps the real length it measured in the view (on paper it would measure paper mm)
		: g.kind === 'dimension' ? { ...g, a: t(g.a), b: t(g.b), offset: g.offset * k, text: g.text ?? `${Math.round(dimLine(g).len)}` } : g
	const { vpId: _drop, ...rest } = s as Shape & { vpId?: string }
	return { ...rest, geom } as Shape
}

/** A note's grips (Dave: notes need grips when selected): the text's anchor (index -1), or each leader / cloud point,
 *  where they show — on the paper through the viewport a note is tied to. */
export function noteGrips(s: Shape, vp?: Viewport): { at: Pt; index: number }[] {
	const t = vp ? toPaper(vp) : (p: Pt) => p, g = s.geom
	if (g.kind === 'text') return [{ at: t(g.at), index: -1 }]
	if (g.kind === 'leader' || g.kind === 'cloud') return g.pts.map((p, index) => ({ at: t(p), index }))
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
/** A point for a note: paper snaps to 0.5 mm; a drawing to its object snaps / grid. */
export const notePoint = (e: PointerIn, c: ToolCtx): Pt => (c.space.spec.kind === 'sheet' ? snap(e.p) : c.snap(e.p, e.alt).p)
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
		if (this.id === 'text') { this.#textAt = p; return }
		this.#pts.push(p)
	}
	move(e: PointerIn, c: ToolCtx): void { this.#hover = this.#pt(e, c) }
	hover(e: PointerIn, c: ToolCtx): void { this.#hover = this.#pt(e, c) }
	/** Text asks on RELEASE: asked on press, the rest of the click takes the focus back from the prompt. */
	up(_e: PointerIn, c: ToolCtx): void {
		const p = this.#textAt
		this.#textAt = null
		if (!p) return
		c.askText?.('Text', '', (t) => {
			const at = this.#where(c, [p])
			if (!t.trim() || !at) return
			const s = { type: 'shape', id: newId(), ...at.owner, geom: { kind: 'text', at: at.pts[0], text: t.trim(), sizeMm: 2.5 } } as Shape
			c.store.transact('Text', (tx) => tx.put(s))
			c.select([s.id])
		})
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
			c.askText?.('Leader text (optional)', '', (t) => {
				const s: Shape = { type: 'shape', id: newId(), ...at.owner, geom: { kind: 'leader', pts: at.pts, ...(t.trim() ? { text: t.trim() } : {}) } } as Shape
				c.store.transact('Leader', (tx) => tx.put(s))
				c.select([s.id])
			})
		} else if (pts.length) c.say?.(this.id === 'cloud' ? 'A cloud needs at least 3 points' : 'A leader needs a tip and at least one more point')
	}

	key(e: KeyboardEvent, c: ToolCtx): boolean {
		if (e.key === 'Enter' && this.#pts.length) { this.finish(c); return true }
		if (e.key === 'Backspace' && this.#pts.length) { this.#pts.pop(); return true }
		// Esc (and a right-click) ends it like a run: kept when there are enough points, else dropped
		if (e.key === 'Escape' && this.#pts.length) { if (this.#pts.length >= (this.id === 'cloud' ? 3 : 2)) this.finish(c); else this.cancel(); return true }
		return false
	}

	/** The points so far and a rubber band to the cursor (a cloud shows its closing edge). */
	preview(): Prim[] {
		if (!this.#pts.length || !this.#hover) return []
		const pts = [...this.#pts, this.#hover]
		return [{ k: 'line', pts, closed: this.id === 'cloud' && pts.length > 2, cls: 'draft' }]
	}
	lastPoint(): Pt | null { return this.#pts.at(-1) ?? null }
	typed(p: Pt, c: ToolCtx): void { const e = { p, shift: false, ctrl: false, alt: false } as PointerIn; this.down(e, c); this.up(e, c) }
}
