// The Opening tool (Phase 6.1): click a wall on the plan → a hole of the tool bar's width (W), bottom (Z) and height
// (H), with the chosen swing, centred on the click and kept inside that wall segment. The wall is selected so its
// openings can be edited in Properties.
import type { Tool, ToolCtx, PointerIn } from './tools'
import type { Prim } from '../views/display'
import type { Pt } from '../domain/types'
import type { Opening, Shape } from '../domain/shapes'
import { placeOpening, makeOpening, planOpenings } from '../domain/openings'

export class OpeningTool implements Tool {
	readonly id = 'opening'
	readonly cursor = 'crosshair'
	#hover: Pt | null = null
	constructor(private swing: () => Opening['swing']) {}

	#target(p: Pt, c: ToolCtx): { wall: Shape; segId: string; at: number } | null {
		let best: { wall: Shape; segId: string; at: number } | null = null
		for (const s of c.index.shapes) {
			if (s.levelId !== c.levelId || s.role?.kind !== 'wall') continue
			const at = placeOpening(s, p, c.opts.w, c.tol())
			if (at) { best = { wall: s, ...at }; break }
		}
		return best
	}

	down(e: PointerIn, c: ToolCtx): void {
		const t = this.#target(e.p, c)
		if (!t) { c.say?.(`Click on a wall (the opening is ${c.opts.w} mm wide)`); return }
		if (t.wall.role?.kind !== 'wall') return
		const o = makeOpening(t.segId, Math.round(t.at), { width: c.opts.w, z: c.opts.z, h: c.opts.h, swing: this.swing() })
		const role = t.wall.role
		c.store.transact('Add opening', (tx) => tx.put({ ...t.wall, role: { ...role, openings: [...role.openings, o] } }))
		c.select([t.wall.id])
	}
	move(e: PointerIn): void { this.#hover = e.p }
	hover(e: PointerIn): void { this.#hover = e.p }
	up(): void {}
	cancel(): void { this.#hover = null }

	/** Where the opening would go: its jambs and swing, drawn as a draft. */
	preview(c: ToolCtx): Prim[] {
		if (!this.#hover) return []
		const t = this.#target(this.#hover, c)
		if (!t || t.wall.role?.kind !== 'wall' || t.wall.geom.kind !== 'path') return []
		const sg = t.wall.geom.segs.find((x) => x.id === t.segId)
		const w = (sg?.section ?? t.wall.section)?.w ?? 100
		const o = makeOpening(t.segId, t.at, { width: c.opts.w, z: c.opts.z, h: c.opts.h, swing: this.swing() })
		const ghost = { ...t.wall, role: { kind: 'wall' as const, openings: [o] } }
		const p = planOpenings(ghost, t.segId, w)
		return [...p.jambs.map(([a, b]): Prim => ({ k: 'line', pts: [a, b], cls: 'draft' })), ...p.swings.map((pts): Prim => ({ k: 'line', pts, cls: 'draft' }))]
	}
}
