// The MEASURE tool (backlog W32: "a Measure (distance) tool for checking scale"): click two points (they snap; Shift =
// 15° steps) and read the distance — on screen beside the line and in the status line, with its X / Y (or along / up)
// parts. Nothing is drawn into the model; the next click starts a new measurement, Esc clears it. Plans, elevations and
// sections (model mm).
import type { Pt } from '../domain/types'
import type { Prim } from '../views/display'
import type { Tool, ToolCtx, PointerIn } from './tools'
import { snapMark, TOL_PX } from './tools'
import type { Snap } from './snap'
import { angleStep } from './constrain'

const fmt = (mm: number) => Math.round(mm).toLocaleString('en-US').replace(/,/g, ' ')

/** The distance between two view points in model mm, with its across / down (plan: X / Y; elevation: along / up). */
export function measure(a: Pt, b: Pt, c: Pick<ToolCtx, 'space' | 'work'>): { len: number; dx: number; dy: number; text: string } {
	const p = c.space.toWorld(a, c.work), q = c.space.toWorld(b, c.work)
	const len = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z)
	const plan = c.space.spec.kind === 'plan', dx = b.x - a.x, dy = b.y - a.y
	return { len, dx, dy, text: `${fmt(len)} mm · ${plan ? 'X' : 'along'} ${fmt(Math.abs(dx))} · ${plan ? 'Y' : 'up'} ${fmt(Math.abs(dy))}` }
}

export class MeasureTool implements Tool {
	readonly id = 'measure'
	readonly cursor = 'crosshair'
	#a: Pt | null = null
	#b: Pt | null = null
	#hover: Snap | null = null

	#pick(e: PointerIn, c: ToolCtx): Snap {
		const from = e.shift && this.#a && !this.#b ? this.#a : null
		return from ? { p: angleStep(from, e.p), kind: 'grid' } : c.snap(e.p, e.alt)
	}
	down(e: PointerIn, c: ToolCtx): void { this.#click(this.#pick(e, c).p, c) }
	typed(p: Pt, c: ToolCtx): void { this.#click(p, c) }
	#click(p: Pt, c: ToolCtx): void {
		if (!this.#a || this.#b) { this.#a = p; this.#b = null; c.say?.('Click the second point (Shift: 15°) · Esc clears'); return }
		this.#b = p
		c.say?.(`Distance ${measure(this.#a, p, c).text} · click to measure again`)
	}
	lastPoint(): Pt | null { return this.#b ? null : this.#a }
	move(e: PointerIn, c: ToolCtx): void { this.hover(e, c) }
	hover(e: PointerIn, c: ToolCtx): void { this.#hover = this.#pick(e, c) }
	up(): void {}
	cancel(): void { this.#a = null; this.#b = null; this.#hover = null }
	key(e: KeyboardEvent): boolean {
		if (e.key === 'Escape' && this.#a) { this.cancel(); return true }
		return false
	}

	/** The line measured (or being measured, to the cursor) with its length beside it; the snap marker. */
	preview(c: ToolCtx): Prim[] {
		const a = this.#a, b = this.#b ?? this.#hover?.p, out: Prim[] = []
		if (a && b) {
			const m = measure(a, b, c), k = c.tol() / TOL_PX   // 1 screen px
			out.push({ k: 'line', pts: [a, b], cls: 'draft' })
			out.push({ k: 'text', at: { x: (a.x + b.x) / 2 + 6 * k, y: (a.y + b.y) / 2 - 6 * k }, text: `${fmt(m.len)} mm`, size: 12 * k, cls: 'draft-label' })
		}
		const h = this.#hover
		if (h && h.kind !== 'grid') out.push(snapMark(h, c.tol()))
		return out
	}
}
