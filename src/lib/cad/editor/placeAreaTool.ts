// The PLACE AREA tool (backlog 6): put an area plan (33F 3307) where it is on its floor's whole-floor plan. On the
// whole-floor plan, with the area shown greyed (its floorplans too, faint) where it is now — not yet placed: on top of
// the whole floor's own 0, 0 — click a point on the area (a column, a grid corner), then the same point on the
// whole-floor floorplan; then a second pair. The two pairs give the turn and the shift (domain/areaPlace.ts
// solvePlace); the plans are both in mm, so nothing is scaled — a second pair a different distance apart says so.
// One undo step. Armed from Project › Floors › Plans & floorplans (an area plan's "Place on the whole floor…").
import type { Id, Pt } from '../domain/types'
import type { Prim } from '../views/display'
import type { Tool, ToolCtx, PointerIn } from './tools'
import { snapMark, TOL_PX } from './tools'
import type { Snap } from './snap'
import { fromMain, solvePlace } from '../domain/areaPlace'

const STEPS = [
	'Click a point on the grey area plan (a column, a grid corner)',
	'Click the same point on the whole-floor floorplan',
	'Click a second point on the grey area plan, well away from the first',
	'Click that point on the whole-floor floorplan',
]

export class PlaceAreaTool implements Tool {
	readonly id = 'placearea'
	readonly cursor = 'crosshair'
	#pts: Pt[] = []
	#hover: Snap | null = null

	constructor(private target: () => Id | null, private done: (placed: boolean) => void) {}

	/** What to say before the first click (and after each). */
	static step(i: number, area: string): string { return `Place ${area} (${i + 1} of 4): ${STEPS[i]} · Esc stops` }

	down(e: PointerIn, c: ToolCtx): void { this.#click(c.snap(e.p, e.alt).p, c) }
	typed(p: Pt, c: ToolCtx): void { this.#click(p, c) }
	#click(p: Pt, c: ToolCtx): void {
		const a = c.index.getOf('level', this.target() ?? undefined)
		if (!a?.area) { c.say?.('Pick an area plan to place first (Project › Floors › Plans & floorplans)'); this.done(false); return }
		this.#pts.push(p)
		if (this.#pts.length < 4) { c.say?.(PlaceAreaTool.step(this.#pts.length, a.name)); return }
		// the area clicks are on the area as shown now: back into its own coordinates
		const now = a.place ?? { x: 0, y: 0, rot: 0 }, [p1, q1, p2, q2] = this.#pts
		const s = solvePlace(fromMain(now, p1), fromMain(now, p2), q1, q2)
		this.#pts = []
		if (!s) { c.say?.(`The two points of a pair were the same — start again: ${STEPS[0]}`); return }
		c.store.transact(`Place ${a.name} on the whole floor`, (tx) => tx.put({ ...a, place: s.place }))
		const off = Math.abs(s.scale - 1)
		c.say?.(`${a.name} placed (turned ${Math.round(s.place.rot * 10) / 10}°) — runs drawn on the whole floor from its run ends now join it · Undo puts it back${off > 0.01 ? ` · NOTE: the second pair was ${Math.round(off * 1000) / 10}% ${s.scale > 1 ? 'further apart' : 'closer'} on the whole floor — check the two floorplans' Scale` : ''}`)
		this.done(true)
	}
	lastPoint(): Pt | null { return this.#pts.at(-1) ?? null }
	move(e: PointerIn, c: ToolCtx): void { this.hover(e, c) }
	hover(e: PointerIn, c: ToolCtx): void { this.#hover = c.snap(e.p, e.alt) }
	up(): void {}
	cancel(): void { this.#pts = []; this.#hover = null }
	key(e: KeyboardEvent): boolean {
		if (e.key === 'Escape') { this.cancel(); this.done(false); return true }
		return false
	}

	/** Each pair joined by a line (area point → whole-floor point), numbered; the one being clicked to the cursor. */
	preview(c: ToolCtx): Prim[] {
		const k = c.tol() / TOL_PX, out: Prim[] = [], pts = [...this.#pts], h = this.#hover?.p
		if (h && pts.length % 2 === 1) pts.push(h)
		for (let i = 0; i + 1 < pts.length; i += 2) out.push({ k: 'line', pts: [pts[i], pts[i + 1]], cls: 'draft' })
		this.#pts.forEach((p, i) => {
			out.push({ k: 'circle', c: p, r: 4 * k, cls: 'draft' })
			out.push({ k: 'text', at: { x: p.x + 6 * k, y: p.y - 6 * k }, text: `${i % 2 ? 'floor' : 'area'} ${(i >> 1) + 1}`, size: 11 * k, cls: 'draft-label' })
		})
		if (this.#hover && this.#hover.kind !== 'grid') out.push(snapMark(this.#hover, c.tol()))
		return out
	}
}
