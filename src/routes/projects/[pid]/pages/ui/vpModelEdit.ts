// MODEL-OBJECT edits a Viewport's pointer machine applies (moved out of vpInteraction.svelte.ts): committing a
// drawn conduit run (F6 attach to connection points + F3 join into compatible conduits), the body move of
// selected objects (with rack devices snapping to U, attached conduit ends following), a model grip drag (F5
// joined nodes riding along), and a node dropped on another node (F3 merge). Plain functions of the view — the
// class keeps the drag bookkeeping (undo step open / close, the trailing click) and calls these.
import type { Pt } from './geometry'
import { frameStep, dotT } from './geometry'
import { ctxFrame, type ViewCtx } from './view'
import type { GN } from './hit'
import type { MGrip } from './grips'
import type { VpView } from './vpView.svelte'
import type { Obj } from '../3dview/types'
import { newId } from '../ids'
import { splitNode } from './modelEdit'
import { zToU, uToZ } from '../store/racksImport'
import { joinNewConduit, joinGraph, mergeNodes, compatible } from '../3dview/graphJoin'
import { connPoints, attachNode, followConnections } from '../3dview/connect'

/** A model grip drag; `branch` undoes a Ctrl-branch that never moved; F5: other objects' nodes riding along. */
/** `split`: an Alt-drag on a node joining 2+ segments of ONE run — on the first move the node splits (ui/modelEdit
 *  splitNode) and the drag carries the copy (the selected segment's end, else the one along the drag). */
export type MGripDrag = { grip: MGrip; origin: Pt; branch?: () => void; peers?: GN[]; split?: { segId?: string } }
type Conduit = Extract<Obj, { type: 'conduit' }>
const TOL_PX = 8

/** A new conduit run into the model, ONE undo step: in plan its nodes on a connection point attach (F6); touching
 *  compatible conduits it joins them (F3), else it is added. Returns the object it ended up in. */
export function commitConduit(v: VpView, o: Conduit): Obj | null {
	const mdl = v.mdl; if (!mdl) return null
	if (v.isPlan) { const cp = v.connTargets(o.id).filter((p) => { const t = p.conn.obj ? mdl.objects.find((x) => x.id === p.conn.obj) : null; return !(t?.type === 'conduit' && compatible(t, o)) }), tol = v.tolMm(TOL_PX);   // a compatible run's end JOINS instead (below)
		 for (const n of o.nodes) attachNode(n, cp, tol) }
	const ed = v.editor.edit; ed.begin()
	const into = joinNewConduit(mdl.objects, o, v.tolMm(TOL_PX), newId)
	if (into === o) mdl.objects.push(o)
	ed.mark(); ed.end()
	return into
}

// ── 3D objects on the editing engine (ItemEditor, editing-merge-plan.md phase 3): translate a COPY, snap the delta,
// write the copies back into the live model, re-attach after the move ──
type P3 = { x: number; y: number; z: number }
/** A plain copy of `o` moved by the view's (dx, dy): in plan x / y; in elevation the horizontal steps along the view
 *  frame's t (frameStep: the on-axis coord × its sign for the four dirs; du·t in plan for an OBLIQUE frame — the depth
 *  along n is kept, elevation-section-plan.md phase 5) and the vertical changes z (≥ 0). A box moves its origin, a
 *  wall / conduit all its nodes. (Pure in the view's ctx: `translateInView`.) */
export function translateObj(v: VpView, o: Obj, dx: number, dy: number): Obj {
	return translateInView(v.ctx, o, dx, dy)
}
/** `translateObj` on a ViewCtx (unit-testable without a VpView). */
export function translateInView(ctx: ViewCtx, o: Obj, dx: number, dy: number): Obj {
	const c = structuredClone(o) as Obj
	const step = ctx.isElev ? frameStep(ctxFrame(ctx), dx) : null
	const shift = (t: P3) => {
		if (step) { if (step[0]) t.x += step[0]; if (step[1]) t.y += step[1]; t.z = Math.max(0, t.z - dy) }
		else { t.x += dx; t.y += dy }
	}
	if (c.type === 'prism') shift(c); else for (const n of c.nodes as GN[]) shift(n)
	return c
}
/** The move delta grid-snapped (SNAP on) so the object's reference point — a box's origin, a run's first node —
 *  lands on the grid; the group stays rigid. */
export function objSnapDelta(v: VpView, o: Obj, dx: number, dy: number): [number, number] {
	return v.snap ? objSnapDeltaIn(v.ctx, o, dx, dy, v.rndSnap) : [dx, dy]
}
/** `objSnapDelta` on a ViewCtx + a grid rounder. In an elevation the horizontal grid runs ALONG the frame: the reference
 *  point's origin-free x·t lands on a multiple (an oblique frame too — the move then steps along t, `translateInView`). */
export function objSnapDeltaIn(ctx: ViewCtx, o: Obj, dx: number, dy: number, rnd: (v: number) => number): [number, number] {
	const r: P3 | undefined = o.type === 'prism' ? o : (o.nodes as GN[])[0]
	if (!r) return [dx, dy]
	const h = ctx.isElev ? dotT(ctxFrame(ctx), r.x, r.y) : r.x, vv = ctx.isElev ? -r.z : r.y   // the drawn horizontal (origin-free x·t)
	return [rnd(h + dx) - h, rnd(vv + dy) - vv]
}
/** Write moved copies back into the live objects (in place — grips and pickers hold them): a rack DEVICE only slides
 *  up / down its rack, whole U (G4); attached conduit ends follow (F6). */
export function applyObjMoves(v: VpView, moved: Obj[]) {
	const mdl = v.mdl; if (!mdl) return
	for (const m of moved) {
		const o = mdl.objects.find((x) => x.id === m.id); if (!o) continue
		if (o.type === 'prism' && m.type === 'prism') {
			const rk = o.device && mdl.objects.find((x) => x.id === o.device!.rackId)
			if (o.device && rk?.type === 'prism') {
				const u = zToU(rk.z, m.z, (rk.rack?.u ?? 42) - o.device.hU + 1)
				o.z = uToZ(rk.z, u)
				if (o.device.u !== u) o.device = { ...o.device, u }
			} else { o.x = m.x; o.y = m.y; o.z = m.z }
		} else if ((o.type === 'wall' || o.type === 'conduit') && m.type === o.type)
			for (const g of m.nodes as GN[]) { const n = (o.nodes as GN[]).find((x) => x.id === g.id); if (n) { n.x = g.x; n.y = g.y; n.z = g.z } }
	}
	followConnections(mdl, new Set(moved.map((m) => m.id!)))
}
/** After a body move: a conduit moved bodily keeps only the attachments its nodes still sit on (F6). */
export function endObjMove(v: VpView, ids: string[]) {
	const mdl = v.mdl; if (!mdl || !v.isPlan || !ids.length) return
	const cp = connPoints(mdl), tol = v.tolMm(TOL_PX)
	for (const id of ids) { const o = mdl.objects.find((x) => x.id === id); if (o?.type === 'conduit') { const cpo = cp.filter((p) => p.conn.obj !== o.id); for (const n of o.nodes) if (n.conn) attachNode(n, cpo, tol) } }
}

/** A model grip drag step: the grip applies; F5 riders take the dragged node's position; a resized / rotated box
 *  brings its attached conduit ends (F6). */
export function moveModelGrip(v: VpView, s: MGripDrag, p: Pt) {
	if (s.split) {   // the first move of an Alt-drag inside one run: split the node, then drag the copy
		const g = s.grip, o = g.obj, dir: [number, number] = [p[0] - s.origin[0], p[1] - s.origin[1]]
		if (Math.hypot(...dir) < 1e-6) return
		const segId = s.split.segId; s.split = undefined
		if (g.node && o && (o.type === 'wall' || o.type === 'conduit')) {
			const node = (o.nodes as GN[]).find((x) => x.id === g.node!.id)
			const nn = node && splitNode(o, node, newId, { segId, dir, at: (n) => v.graphNodeDraw(n) as [number, number] })
			if (nn) s.grip = { ...g, node: nn, apply: (q: Pt, org?: Pt) => v.graphNodeApply(nn, q, org) }
		}
	}
	s.grip.apply(p, s.origin)
	const go = s.grip.obj, n = s.grip.node && go && (go.type === 'wall' || go.type === 'conduit') ? (go.nodes as GN[]).find((x) => x.id === s.grip.node!.id) : undefined
	if (n && s.peers?.length) for (const q of s.peers) { q.x = n.x; q.y = n.y; q.z = n.z }
	const o = go ?? v.mSelObj
	if (o?.id && v.mdl) followConnections(v.mdl, new Set([o.id]))   // a box resized, a wall / conduit node dragged: what's attached to it follows
}

/** F3: a conduit node dropped onto another node merges them — in the same conduit (closing a loop / removing a
 *  kink), or into a compatible conduit (the two become one object); else F6: dropped on a connection point it
 *  attaches, off one it detaches. Runs inside the grip's undo step. */
export function dropNodeJoin(v: VpView, g: MGrip) {
	const o = g.obj, mdl = v.mdl
	if (!mdl || !g.node || o?.type !== 'conduit') return
	const n = o.nodes.find((x) => x.id === g.node!.id); if (!n) return
	const tol = v.tolMm(TOL_PX), near = (m: { x: number; y: number; z: number }) => Math.hypot(m.x - n.x, m.y - n.y, m.z - n.z) <= tol
	const same = o.nodes.find((m) => m.id !== n.id && near(m))
	if (same) { mergeNodes(o, same.id, n.id); v.selectObj(o.id!); return }
	const other = mdl.objects.find((c) => c !== o && compatible(c, o) && c.type === 'conduit' && c.nodes.some(near))
	if (other && joinGraph(other as Conduit, o, tol, newId)) { mdl.objects.splice(mdl.objects.indexOf(o), 1); v.selectObj(other.id!); return }
	if (v.isPlan) attachNode(n, v.connTargets(o.id), tol)   // not onto a hidden / locked item's point
}
