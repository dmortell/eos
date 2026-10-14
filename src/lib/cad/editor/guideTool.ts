// The GUIDE tool (Dave 2026-10-14 todo): a click places a vertical guide, a horizontal one or both (a cross) through
// the point (snapped; or a typed point); pressing on a guide drags it (snaps too); Delete / Backspace removes the guide
// under the cursor. Guides are this view's, on this screen (domain/guides.ts); the tool reads and writes them through
// `ToolCtx.guides`.
import type { Tool, ToolCtx, PointerIn } from './tools'
import type { Prim } from '../views/display'
import type { Pt } from '../domain/types'
import { addGuides, guideAt, type Guide } from '../domain/guides'
import { newId } from '../domain/ids'

export class GuideTool implements Tool {
	readonly id = 'guide'
	readonly cursor = 'crosshair'
	#drag: Guide | null = null
	#hover: Pt | null = null

	down(e: PointerIn, c: ToolCtx): void {
		const g = c.guides
		if (!g) return
		const hit = guideAt(g.list(), e.p, c.tol())
		if (hit) { this.#drag = hit; c.say?.('Drag the guide where it goes — Delete removes it'); return }
		this.typed(c.snap(e.p, e.alt).p, c)
	}
	/** A typed point: guides through it. */
	typed(p: Pt, c: ToolCtx): void {
		const g = c.guides
		if (!g) return
		const axis = g.axis(), before = g.list().length, next = addGuides(g.list(), p, axis, newId)
		g.set(next)
		const n = next.length - before
		c.say?.(n ? `${axis === 'both' ? 'Guides' : axis === 'v' ? 'Vertical guide' : 'Horizontal guide'} at ${axis === 'h' ? '' : `x ${Math.round(p.x)}`}${axis === 'both' ? ', ' : ''}${axis === 'v' ? '' : `y ${Math.round(p.y)}`} — points snap onto it; drag one to move it, Delete removes the one under the cursor` : 'There is a guide there already')
	}
	move(e: PointerIn, c: ToolCtx): void {
		this.#hover = e.p
		const d = this.#drag, g = c.guides
		if (!d || !g) return
		const p = c.snap(e.p, e.alt, undefined).p, at = Math.round((d.axis === 'v' ? p.x : p.y) * 100) / 100
		const moved = { ...d, at }
		g.set(g.list().map((x) => (x.id === d.id ? moved : x)))
		this.#drag = moved
	}
	hover(e: PointerIn): void { this.#hover = e.p }
	up(): void { this.#drag = null }
	cancel(): void { this.#drag = null }
	key(e: KeyboardEvent, c: ToolCtx): boolean {
		if (e.key !== 'Delete' && e.key !== 'Backspace') return false
		const g = c.guides, p = this.#hover
		const hit = g && p ? guideAt(g.list(), p, c.tol() * 2) : undefined
		if (!g || !hit) { c.say?.('Point at a guide, then Delete removes it'); return true }
		g.set(g.list().filter((x) => x.id !== hit.id))
		c.say?.('Guide removed')
		return true
	}
	/** The guide under the cursor, thicker (what a drag or Delete takes). */
	preview(c: ToolCtx): Prim[] {
		const g = c.guides, p = this.#hover
		const hit = this.#drag ?? (g && p ? guideAt(g.list(), p, c.tol()) : undefined)
		if (!hit) return []
		const L = 1e6
		return [{ k: 'line', pts: hit.axis === 'v' ? [{ x: hit.at, y: -L }, { x: hit.at, y: L }] : [{ x: -L, y: hit.at }, { x: L, y: hit.at }], cls: 'guide guide-hot' }]
	}
}
