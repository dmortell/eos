// Paper notes (Phase 4.5): TEXT (click, type), LEADER (click the tip, then more points, Enter / right-click → its
// text) and revision CLOUD (click round the area, Enter / right-click closes it) on a sheet's paper — shapes owned by
// the sheet, in paper mm — or, drawn inside a viewport, tied to it in its view mm (Dave: notes must follow a
// viewport's rescale / pan / move). Backspace drops the last point; Esc cancels.
import type { Tool, ToolCtx, PointerIn } from './tools'
import type { Prim } from '../views/display'
import type { Pt } from '../domain/types'
import type { Shape } from '../domain/shapes'
import { makeText } from '../domain/make'
import { newId } from '../domain/ids'
import type { Sheet, Viewport } from '../domain/drawing'
import { fromPaper, toPaper, viewportAt } from '../views/sheet'

/** A note tied to a viewport (one being deleted) put back on the paper where it showed. */
export function untie(s: Shape, vp: Viewport): Shape {
	const t = toPaper(vp), g = s.geom
	const geom = g.kind === 'text' ? { ...g, at: t(g.at) } : g.kind === 'leader' || g.kind === 'cloud' ? { ...g, pts: g.pts.map(t) } : g
	const { vpId: _drop, ...rest } = s as Shape & { vpId?: string }
	return { ...rest, geom } as Shape
}

export type NoteKind = 'text' | 'leader' | 'cloud'
const snap = (p: Pt): Pt => ({ x: Math.round(p.x * 2) / 2, y: Math.round(p.y * 2) / 2 })   // 0.5 mm on paper

export class NoteTool implements Tool {
	readonly cursor = 'crosshair'
	#pts: Pt[] = []
	#hover: Pt | null = null
	constructor(readonly id: NoteKind) {}

	#sheetId(c: ToolCtx): string | null { return c.space.spec.kind === 'sheet' ? c.space.spec.sheetId : null }

	/** The note's owner and its points: drawn inside a viewport (the first point decides), tied to it in its view mm. */
	#place(c: ToolCtx, sheetId: string, pts: Pt[]): { owner: { sheetId: string; vpId?: string }; pts: Pt[] } {
		const sheet = c.store.get(sheetId) as Sheet | undefined
		const vp = sheet && viewportAt(sheet, pts[0])
		if (!vp) return { owner: { sheetId }, pts }
		const f = fromPaper(vp)
		return { owner: { sheetId, vpId: vp.id }, pts: pts.map(f) }
	}

	down(e: PointerIn, c: ToolCtx): void {
		const sheetId = this.#sheetId(c)
		if (!sheetId) return
		const p = snap(e.p)
		if (this.id === 'text') { this.#textAt = p; return }
		this.#pts.push(p)
	}
	move(e: PointerIn): void { this.#hover = snap(e.p) }
	hover(e: PointerIn): void { this.#hover = snap(e.p) }
	/** Text asks on RELEASE: asked on press, the rest of the click takes the focus back from the prompt. */
	up(_e: PointerIn, c: ToolCtx): void {
		const p = this.#textAt, sheetId = this.#sheetId(c)
		this.#textAt = null
		if (!p || !sheetId) return
		c.askText?.('Text', '', (t) => {
			if (!t.trim()) return
			const at = this.#place(c, sheetId, [p])
			const s = makeText(at.owner, at.pts[0], t.trim(), 2.5)
			c.store.transact('Text', (tx) => tx.put(s))
			c.select([s.id])
		})
	}
	#textAt: Pt | null = null
	cancel(): void { this.#pts = []; this.#hover = null }

	finish(c: ToolCtx): void {
		const sheetId = this.#sheetId(c), pts = this.#pts
		this.#pts = []
		if (!sheetId) return
		if (this.id === 'cloud' && pts.length >= 3) {
			const at = this.#place(c, sheetId, pts)
			const s: Shape = { type: 'shape', id: newId(), ...at.owner, geom: { kind: 'cloud', pts: at.pts } } as Shape
			c.store.transact('Revision cloud', (tx) => tx.put(s))
			c.select([s.id])
		} else if (this.id === 'leader' && pts.length >= 2) {
			const at = this.#place(c, sheetId, pts)   // the tip decides
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
