// Grip definitions + grip-pick for the Pages tool (review.md §R1, step 4). Extracted from
// Viewport.svelte so the grip geometry is testable and shared. Grip-pick takes a Mapper (built ONCE per
// press) and reuses m.toClient per corner, so an N-grip object costs one layout read, not N (the P1 fix).
// The entity/model grip builders (gripsFor/modelGrips/…) move here in later slices; this first slice is
// the self-contained section-marker grips.
import type { Pt } from './geometry'
import type { Clip, Obj } from '../3dview/types'
import type { Mapper } from './mapper'
import type { ViewCtx } from './view'
import { sectionCorners, prismRect, prismTilted, graphNodeDraw, rotatePt, type GN } from './hit'
import { ELEV_BASIS, elevUInv } from './geometry'
import { doorGeom } from '../3dview/projection'

/** Resize a section clip by dragging a corner to p, holding `anchor` (the opposite corner, captured at
 *  grip-down) fixed — x/y only, z stays the section's cut band. Returns the new clip. */
export function resizeSectionClip(c: Clip, p: Pt, anchor: Pt): Clip {
	return { ...c, x0: Math.round(Math.min(p[0], anchor[0])), x1: Math.round(Math.max(p[0], anchor[0])), y0: Math.round(Math.min(p[1], anchor[1])), y1: Math.round(Math.max(p[1], anchor[1])) }
}

/** Which corner grip of the selected section a press grabs (14px screen tolerance), with a resize apply
 *  about the fixed opposite corner. One getBoundingClientRect for the whole 4-corner pass (P1). null =
 *  no grip under the cursor. */
export function pickSectionGrip(m: Mapper, sel: { id: string; clip: Clip }, clientX: number, clientY: number): { id: string; apply: (p: Pt) => Clip } | null {
	const cs = sectionCorners(sel.clip), c0 = { ...sel.clip }
	for (let gi = 0; gi < 4; gi++) {
		const sp = m.toClient(cs[gi][0], cs[gi][1])
		if (Math.hypot(sp.x - clientX, sp.y - clientY) < 14) return { id: sel.id, apply: (p: Pt) => resizeSectionClip(c0, p, cs[(gi + 2) % 4]) }
	}
	return null
}

// ── model-object grips (prism resize/rotate/tilt/swing + wall/conduit node handles) ──
// The grip `apply` closures MUTATE the store object in place — that is the existing contract with the
// snapModels undo step (the caller opens/closes the history step around the drag).

/** A model-object grip. `apply(p, origin)` mutates the store object; `node`/`obj` ride wall/conduit node
 *  grips so an Alt-press can branch a new segment. */
export type MGrip = { x: number; y: number; apply: (p: Pt, origin?: Pt) => void; node?: GN; obj?: Obj }

/** The prism's 4 corner grips in drawing coords, order tl,tr,br,bl (matches prismRect's face/footprint;
 *  in a rotated plan view they follow the rotation). */
export function prismCorners(ctx: ViewCtx, o: Obj): Pt[] {
	const r = prismRect(ctx, o); if (!r) return []
	let cs: Pt[] = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]]
	if (ctx.isPlan && o.type === 'prism' && o.rot) { const c: Pt = [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2]; cs = cs.map((p) => rotatePt(p, c, o.rot!)) }
	return cs
}

/** Resize a prism by dragging corner `gi` to p, holding `anchor` (opposite corner, captured at grip-down)
 *  fixed. Plan edits footprint x/y/w/d; elevation edits the on-axis size (via elevUInv) + z/h. `rnd`
 *  grid-snaps. Mutates `o`. */
export function applyPrismGrip(ctx: ViewCtx, o: Extract<Obj, { type: 'prism' }>, gi: number, p: Pt, anchor: Pt, rnd: (v: number) => number) {
	void gi
	if (ctx.isElev) {
		const ax = ELEV_BASIS[ctx.elevDir].axis
		const c1 = elevUInv(ctx.elevDir, p[0], ctx.cx, ctx.cy), c2 = elevUInv(ctx.elevDir, anchor[0], ctx.cx, ctx.cy)
		const lo = rnd(Math.min(c1, c2)), size = Math.max(1, rnd(Math.abs(c1 - c2)))
		if (ax === 0) { o.x = lo; o.w = size } else { o.y = lo; o.d = size }
		const baseY = Math.max(p[1], anchor[1]), topY = Math.min(p[1], anchor[1])
		o.z = Math.max(0, rnd(ctx.ground - baseY)); o.h = Math.max(1, rnd(baseY - topY))
	} else {
		o.x = rnd(Math.min(p[0], anchor[0])); o.w = Math.max(1, rnd(Math.abs(p[0] - anchor[0])))
		o.y = rnd(Math.min(p[1], anchor[1])); o.d = Math.max(1, rnd(Math.abs(p[1] - anchor[1])))
	}
}

/** Grips of the selected model object. prism = 4 resize corners (dropped when tilted) + a rotate handle
 *  (plan) / tilt handle (elevation) / door-swing handle; wall/conduit = one node handle each (drag =
 *  reshape via `opts.applyNode`, i.e. the caller's graphNodeApply). `opts.rnd` grid-snaps prism edits. */
export function modelGrips(ctx: ViewCtx, o: Obj, opts: { rnd: (v: number) => number; applyNode: (n: GN, p: Pt, origin?: Pt) => void }): MGrip[] {
	if (o.type === 'prism') {
		const cs = prismTilted(o) ? [] : prismCorners(ctx, o)   // a tilted prism drops its axis-aligned corners (B10)
		const grips: MGrip[] = cs.map((c, gi) => ({ x: c[0], y: c[1], apply: (p: Pt) => applyPrismGrip(ctx, o, gi, p, cs[(gi + 2) % 4], opts.rnd) }))
		if (ctx.isPlan && o.open !== 'door') {   // rotate handle above the top-centre, following the rotation
			const cx = o.x + o.w / 2, cy = o.y + o.d / 2, off = o.d / 2 + Math.max(o.w, o.d) * 0.35
			const hp = o.rot ? rotatePt([cx, cy - off], [cx, cy], o.rot) : [cx, cy - off] as Pt
			grips.push({ x: hp[0], y: hp[1], apply: (p: Pt) => { o.rot = Math.round(((Math.atan2(p[1] - cy, p[0] - cx) * 180) / Math.PI + 90 + 360) % 360) } })
		}
		if (ctx.isElev && !o.open) {   // elevation rotate handle → in-plane tilt (front/rear → rotY, left/right → rotX)
			const r = prismRect(ctx, o)!
			const C: Pt = [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2]
			const off = (r.y1 - r.y0) / 2 + Math.max(r.x1 - r.x0, r.y1 - r.y0) * 0.35
			const ax = ELEV_BASIS[ctx.elevDir].axis, cur = ax === 0 ? (o.rotY ?? 0) : (o.rotX ?? 0)
			const hp = cur ? rotatePt([C[0], C[1] - off], C, cur) : [C[0], C[1] - off] as Pt
			grips.push({ x: hp[0], y: hp[1], apply: (p: Pt) => {
				let a = Math.round(((Math.atan2(p[1] - C[1], p[0] - C[0]) * 180) / Math.PI + 90 + 360) % 360)
				if (a > 180) a -= 360   // keep in −180..180 for a natural tilt range
				if (ax === 0) o.rotY = a || undefined; else o.rotX = a || undefined
			} })
		}
		if (ctx.isPlan && o.open === 'door') {   // door SWING handle at the leaf tip — drag to set the swing angle
			const g = doorGeom(o), a = (o.swing ?? 90) * Math.PI / 180
			const tx = g.hx + g.L * (Math.cos(a) * g.ux + Math.sin(a) * g.vx), ty = g.hy + g.L * (Math.cos(a) * g.uy + Math.sin(a) * g.vy)
			grips.push({ x: tx, y: ty, apply: (p: Pt) => {
				const ang = Math.atan2((p[0] - g.hx) * g.vx + (p[1] - g.hy) * g.vy, (p[0] - g.hx) * g.ux + (p[1] - g.hy) * g.uy) * 180 / Math.PI
				o.swing = Math.round(Math.max(0, Math.min(180, ang)))
			} })
		}
		return grips
	}
	if (o.type === 'wall' || o.type === 'conduit') {
		return (o.nodes as GN[]).map((n) => { const d = graphNodeDraw(ctx, n); return { x: d[0], y: d[1], node: n, obj: o, apply: (p: Pt, origin?: Pt) => opts.applyNode(n, p, origin) } })
	}
	return []
}

/** Which grip of the selected object a press grabs (14px screen tol). One layout read for the whole pass
 *  (P1): the caller builds the grip list + mapper once. null = no grip. */
export function pickModelGrip(m: Mapper, grips: MGrip[], clientX: number, clientY: number): MGrip | null {
	for (const g of grips) { const sp = m.toClient(g.x, g.y); if (Math.hypot(sp.x - clientX, sp.y - clientY) < 14) return g }
	return null
}
