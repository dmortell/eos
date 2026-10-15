// The DIMENSION tool (backlog "Markup kinds" part 3, User 2026-10-05): click the two points to measure (they snap to
// what's drawn), then a third click sets where the dimension line sits. Measures along the two points, or only
// horizontally / vertically (the tool bar). On a plan, an elevation / section (its plane) or a sheet / viewport —
// wherever notes go (noteTool.ts placeNote). The length is written in mm below a metre, else m.
import type { Tool, ToolCtx, PointerIn } from './tools'
import type { Pt } from '../domain/types'
import type { Shape } from '../domain/shapes'
import type { Prim } from '../views/display'
import { placeNote, notePoint } from './noteTool'
import { dimensionPrims, dimOffset } from '../views/plan'
import { newId } from '../domain/ids'
import { PLOT_SCALE } from '../views/display'
import { axisLock } from './constrain'

export type DimMode = 'aligned' | 'horizontal' | 'vertical'

export class DimTool implements Tool {
	readonly id = 'dimension'
	readonly cursor = 'crosshair'
	#pts: Pt[] = []
	#hover: Pt | null = null

	constructor(private mode: () => DimMode) {}

	down(e: PointerIn, c: ToolCtx): void {
		const p = this.#point(e, c)
		if (!placeNote(c, [p])) { c.say?.('Dimensions go on plans, elevations, sections and sheets'); return }
		this.#pts.push(p)
		if (this.#pts.length === 1) c.say?.('Click the second point (Shift: straight across or up from the first)')
		else if (this.#pts.length === 2) c.say?.('Click where the dimension line goes')
		else this.#commit(c)
	}
	/** The point clicked (snapped); the SECOND one with Shift held keeps it level or plumb with the first (User's todo:
	 *  as lines and runs do, `constrain.ts`). */
	#point(e: PointerIn, c: ToolCtx): Pt {
		const p = notePoint(e, c), a = this.#pts[0]
		if (!e.shift || this.#pts.length !== 1 || !a) return p
		const d = axisLock({ x: p.x - a.x, y: p.y - a.y })
		return { x: a.x + d.x, y: a.y + d.y }
	}
	move(e: PointerIn, c: ToolCtx): void { this.#hover = this.#point(e, c) }
	hover(e: PointerIn, c: ToolCtx): void { this.#hover = this.#point(e, c) }
	up(): void {}
	cancel(): void { this.#pts = []; this.#hover = null }
	key(e: KeyboardEvent): boolean {
		if (e.key === 'Escape' && this.#pts.length) { this.cancel(); return true }
		if (e.key === 'Backspace' && this.#pts.length) { this.#pts.pop(); return true }
		return false
	}
	lastPoint(): Pt | null { return this.#pts.at(-1) ?? null }
	typed(p: Pt, c: ToolCtx): void { this.down({ p, shift: false, ctrl: false, alt: true }, c) }

	#commit(c: ToolCtx): void {
		const at = placeNote(c, this.#pts), mode = this.mode()
		this.cancel()
		if (!at) return
		const [a, b, p] = at.pts
		if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) { c.say?.('The two points are the same'); return }
		const s = { type: 'shape', id: newId(), ...at.owner, geom: { kind: 'dimension', a, b, mode, offset: Math.round(dimOffset({ a, b, mode }, p) * 10) / 10 } } as Shape
		c.store.transact('Dimension', (tx) => tx.put(s))
		c.select([s.id])
	}

	/** The rubber band to the second point, then the dimension as it will be (in the view). */
	preview(c: ToolCtx): Prim[] {
		const [a, b] = this.#pts, h = this.#hover
		if (!a || !h) return []
		if (!b) return [{ k: 'line', pts: [a, h], cls: 'draft' }]
		const mode = this.mode(), k = c.space.spec.kind === 'sheet' ? 1 : PLOT_SCALE
		return dimensionPrims({ kind: 'dimension', a, b, mode, offset: dimOffset({ a, b, mode }, h) }, k, '').map((q) => ({ ...q, cls: q.k === 'text' ? 'dim-text' : 'draft' }))
	}
}
