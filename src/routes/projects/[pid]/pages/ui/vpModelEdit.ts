// MODEL-OBJECT edits a Viewport's pointer machine applies (moved out of vpInteraction.svelte.ts): committing a
// drawn conduit run (F6 attach to connection points + F3 join into compatible conduits), the body move of
// selected objects (with rack devices snapping to U, attached conduit ends following), a model grip drag (F5
// joined nodes riding along), and a node dropped on another node (F3 merge). Plain functions of the view — the
// class keeps the drag bookkeeping (undo step open / close, the trailing click) and calls these.
import type { Pt } from './geometry'
import { ELEV_BASIS } from './geometry'
import type { GN } from './hit'
import type { MGrip } from './grips'
import type { VpView } from './vpView.svelte'
import type { Obj } from '../3dview/types'
import { newId } from '../ids'
import { zToU, uToZ } from '../store/racksImport'
import { joinNewConduit, joinGraph, mergeNodes, compatible } from '../3dview/graphJoin'
import { connPoints, attachNode, followConnections } from '../3dview/connect'

/** A model body move: the press point + each object's start position (a box) or node positions (a graph). */
export type MDrag = { start: Pt; items: { id: string; o0?: { x: number; y: number; z: number }; n0?: GN[] }[] }
/** A model grip drag; `branch` undoes a Ctrl-branch that never moved; F5: other objects' nodes riding along. */
export type MGripDrag = { grip: MGrip; origin: Pt; branch?: () => void; peers?: GN[] }
type Conduit = Extract<Obj, { type: 'conduit' }>
const TOL_PX = 8

/** A new conduit run into the model, ONE undo step: in plan its nodes on a connection point attach (F6); touching
 *  compatible conduits it joins them (F3), else it is added. Returns the object it ended up in. */
export function commitConduit(v: VpView, o: Conduit): Obj | null {
	const mdl = v.mdl; if (!mdl) return null
	if (v.isPlan) { const cp = connPoints(mdl), tol = v.tolMm(TOL_PX); for (const n of o.nodes) attachNode(n, cp, tol) }
	const ed = v.editor.edit; ed.begin()
	const into = joinNewConduit(mdl.objects, o, v.tolMm(TOL_PX), newId)
	if (into === o) mdl.objects.push(o)
	ed.mark(); ed.end()
	return into
}

/** The body move, absolute from the press: a box moves (a rack device only up / down its rack, whole U); a wall /
 *  conduit translates all its nodes. In elevation the horizontal drag maps to the view's on-axis coord (× the
 *  ELEV_BASIS sign) and the vertical one changes z (≥ 0). Attached conduit ends follow moved boxes (F6). */
export function moveModelItems(v: VpView, s: MDrag, p: Pt) {
	const mdl = v.mdl; if (!mdl) return
	const dx = p[0] - s.start[0], dy = p[1] - s.start[1], rnd = v.rndSnap
	const elev = v.isElev ? ELEV_BASIS[v.elevDir] : null
	const shift = (t: { x: number; y: number; z: number }, f: { x: number; y: number; z: number }) => {
		if (elev) { if (elev.axis === 0) t.x = rnd(f.x + elev.sign * dx); else t.y = rnd(f.y + elev.sign * dx); t.z = Math.max(0, rnd(f.z - dy)) }
		else { t.x = rnd(f.x + dx); t.y = rnd(f.y + dy) }
	}
	for (const it of s.items) {
		const o = mdl.objects.find((x) => x.id === it.id); if (!o) continue
		if (o.type === 'prism' && it.o0) {
			shift(o, it.o0)
			// G4: a rack DEVICE slides only up / down its rack, snapping to whole U
			const rk = o.device && mdl.objects.find((x) => x.id === o.device!.rackId)
			if (o.device && rk?.type === 'prism') {
				const u = zToU(rk.z, o.z, (rk.rack?.u ?? 42) - o.device.hU + 1)
				o.x = it.o0.x; o.y = it.o0.y; o.z = uToZ(rk.z, u)
				if (o.device.u !== u) o.device = { ...o.device, u }
			}
		}
		else if ((o.type === 'wall' || o.type === 'conduit') && it.n0) for (const g of it.n0) { const n = (o.nodes as GN[]).find((x) => x.id === g.id); if (n) shift(n, g) }
	}
	followConnections(mdl, new Set(s.items.map((it) => it.id)))
}
/** After a body move: a conduit moved bodily keeps only the attachments its nodes still sit on (F6). */
export function endModelMove(v: VpView, s: MDrag) {
	const mdl = v.mdl; if (!mdl || !v.isPlan) return
	const cp = connPoints(mdl), tol = v.tolMm(TOL_PX)
	for (const it of s.items) { const o = mdl.objects.find((x) => x.id === it.id); if (o?.type === 'conduit') for (const n of o.nodes) if (n.conn) attachNode(n, cp, tol) }
}

/** A model grip drag step: the grip applies; F5 riders take the dragged node's position; a resized / rotated box
 *  brings its attached conduit ends (F6). */
export function moveModelGrip(v: VpView, s: MGripDrag, p: Pt) {
	s.grip.apply(p, s.origin)
	const go = s.grip.obj, n = s.grip.node && go && (go.type === 'wall' || go.type === 'conduit') ? (go.nodes as GN[]).find((x) => x.id === s.grip.node!.id) : undefined
	if (n && s.peers?.length) for (const q of s.peers) { q.x = n.x; q.y = n.y; q.z = n.z }
	const o = go ?? v.mSelObj
	if (o?.type === 'prism' && o.id && v.mdl) followConnections(v.mdl, new Set([o.id]))
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
	if (v.isPlan) attachNode(n, connPoints(mdl), tol)
}
