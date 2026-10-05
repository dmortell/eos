// The VIEWPORT tool (backlog "Viewport tool (draw a box)", Dave 2026-10-06): on a sheet, two clicks or a press-drag
// draw a viewport's window (whole paper mm, Alt = free; at least 20 × 20 mm). It shows the view open in the other pane
// (else the last plan / elevation / rack view looked at, else this level's plan), centred on its content at the
// largest standard scale that fits the box. One undo step; the viewport is selected and the tool goes back to Select.
import type { Tool, ToolCtx, PointerIn } from './tools'
import type { Pt } from '../domain/types'
import type { Sheet, Viewport } from '../domain/drawing'
import type { Prim } from '../views/display'
import { newId } from '../domain/ids'
import { boxViewport } from '../views/sheet'
import { box, snapPt } from './tools'

/** The smallest window side, paper mm. */
export const MIN_VP_MM = 20

export class ViewportTool implements Tool {
	readonly id = 'viewport'
	readonly cursor = 'crosshair'
	#a: Pt | null = null
	#b: Pt | null = null
	#press: Pt | null = null

	/** `view` = what the new viewport shows (null = this level's plan); `done` = back to Select. */
	constructor(private view: () => Viewport['view'] | null, private done: () => void) {}

	#pt(e: PointerIn): Pt { return snapPt(e.p, e.alt, 1) }
	down(e: PointerIn, c: ToolCtx): void {
		if (c.space.spec.kind !== 'sheet') return
		const p = this.#pt(e)
		if (!this.#a) { this.#a = p; this.#b = p; this.#press = e.p; return }
		this.#b = p
		this.#commit(c)
	}
	move(e: PointerIn): void { this.hover(e) }
	hover(e: PointerIn): void { if (this.#a) this.#b = this.#pt(e) }
	/** Press-drag-release draws it in one go; a click (no drag) waits for the second click. */
	up(e: PointerIn, c: ToolCtx): void {
		if (this.#a && this.#press && Math.hypot(e.p.x - this.#press.x, e.p.y - this.#press.y) > c.tol() * 2) {
			this.#b = this.#pt(e)
			this.#commit(c)
		}
		this.#press = null
	}
	cancel(): void { this.#a = this.#b = this.#press = null }
	key(e: KeyboardEvent): boolean { if (e.key === 'Escape' && this.#a) { this.cancel(); return true } return false }

	#commit(c: ToolCtx): void {
		const a = this.#a, b = this.#b, spec = c.space.spec
		this.cancel()
		if (!a || !b || spec.kind !== 'sheet') return
		const r = box(a, b), w = r.x1 - r.x0, h = r.y1 - r.y0
		if (w < MIN_VP_MM || h < MIN_VP_MM) { c.say?.(`A viewport needs at least ${MIN_VP_MM} × ${MIN_VP_MM} mm — draw it bigger`); return }
		const sheet = c.store.get(spec.sheetId) as Sheet | undefined
		if (sheet?.type !== 'sheet') return
		const view = this.view() ?? { levelId: c.levelId, spec: { kind: 'plan' as const } }
		const vp = boxViewport(c.index, view, { x: r.x0, y: r.y0, w, h }, newId())
		c.store.transact('Add viewport', (tx) => tx.put({ ...sheet, viewports: [...sheet.viewports, vp] }))
		c.select([sheet.id])
		c.selectViewport?.(vp.id)
		c.say?.(`Viewport at 1:${vp.scale} — change its view, level and scale in Properties`)
		this.done()
	}

	/** The window as it will be, with its size. */
	preview(c: ToolCtx): Prim[] {
		const a = this.#a, b = this.#b
		if (!a || !b) return []
		const r = box(a, b), w = r.x1 - r.x0, h = r.y1 - r.y0, small = w < MIN_VP_MM || h < MIN_VP_MM
		const px = c.tol() / 6
		return [
			{ k: 'line', pts: [{ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y0 }, { x: r.x1, y: r.y1 }, { x: r.x0, y: r.y1 }], closed: true, cls: 'draft' },
			{ k: 'text', at: { x: r.x0, y: r.y0 - 3 * px }, text: `${w} × ${h} mm${small ? ` (min ${MIN_VP_MM})` : ''}`, size: 11 * px, cls: 'draft-label' },
		]
	}
}
