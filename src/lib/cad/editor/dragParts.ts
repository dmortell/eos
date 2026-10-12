// Parts of the Select tool's drags (split out of selectTool.ts): a sheet viewport's WINDOW dragged (move / pan its view /
// resize from a corner) and a run's NODES dragged (joining what they land on).
import type { Id, Pt } from '../domain/types'
import type { Shape } from '../domain/shapes'
import type { Entity, Sheet } from '../domain/drawing'
import type { ViewSpace } from '../views/space'
import type { Snap } from './snap'
import { primBounds, unionBounds, type Prim } from '../views/display'
import { moveNodes, moveNodesBy, joinDropped, type Grip } from './grips'
import { branchFrom, canJoin, joinShapes, repointRefs } from '../domain/pathEdit'
import { joinAcross } from './pathSel'

type Viewport = Sheet['viewports'][number]

/** A viewport after a drag of `d` paper mm: 'move' its window, 'pan' its view (the centre), or 'resize' from `corner`
 *  (0 TL, 1 TR, 2 BR, 3 BL; the opposite corner fixed; at least 10 mm; `square` = Shift, the longer side wins) — the
 *  view staying where it is on the paper. */
export function dragViewport(v: Viewport, mode: 'move' | 'pan' | 'resize', d: Pt, corner = 0, square = false): Viewport {
	const r = v.rect
	if (mode === 'pan') return { ...v, centre: { x: v.centre.x - d.x * v.scale, y: v.centre.y - d.y * v.scale } }
	if (mode === 'move') return { ...v, rect: { ...r, x: r.x + d.x, y: r.y + d.y } }
	const left = corner === 0 || corner === 3, top = corner === 0 || corner === 1
	let x0 = left ? Math.min(r.x + d.x, r.x + r.w - 10) : r.x, x1 = left ? r.x + r.w : Math.max(r.x + r.w + d.x, r.x + 10)
	let y0 = top ? Math.min(r.y + d.y, r.y + r.h - 10) : r.y, y1 = top ? r.y + r.h : Math.max(r.y + r.h + d.y, r.y + 10)
	if (square) {
		const s = Math.max(x1 - x0, y1 - y0)
		if (left) x0 = x1 - s; else x1 = x0 + s
		if (top) y0 = y1 - s; else y1 = y0 + s
	}
	const cx = v.centre.x + ((x0 + x1) / 2 - (r.x + r.w / 2)) * v.scale, cy = v.centre.y + ((y0 + y1) / 2 - (r.y + r.h / 2)) * v.scale
	return { ...v, rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, centre: { x: cx, y: cy } }
}

/** The paper lines a viewport's edges snap to (backlog "Viewport handling" part 5), from the sheet's prims: the paper's
 *  edge, the margin, the title block's outline, and the OTHER viewports' frames. */
export function viewportSnapLines(prims: Prim[], vpId: Id): { xs: number[]; ys: number[] } {
	const xs: number[] = [], ys: number[] = []
	const add = (b: { x0: number; y0: number; x1: number; y1: number } | undefined) => { if (b) { xs.push(b.x0, b.x1); ys.push(b.y0, b.y1) } }
	const tb: Prim[] = []
	for (const p of prims) {
		if (p.k !== 'line') { if (p.k === 'text' && p.cls.startsWith('tb')) tb.push(p); continue }
		const c = p.cls.split(' ')[0]
		if (c === 'paper' || c === 'paper-margin' || (c === 'viewport' && p.sub !== vpId)) add(primBounds(p))
		else if (c.startsWith('tb')) tb.push(p)
	}
	add(unionBounds(tb.map(primBounds)))
	return { xs, ys }
}

/** A viewport drag `d` (paper mm) adjusted so the moving edges land on a snap line within `tol`, else on the 5 mm
 *  grid. 'move' snaps whichever edge is nearer a line; 'resize' the corner's two edges. */
export function snapViewportDrag(v: Viewport, mode: 'move' | 'resize', d: Pt, lines: { xs: number[]; ys: number[] }, tol: number, corner = 0): Pt {
	const r = v.rect, GRID = 5
	const axis = (edges: number[], ls: number[], dv: number) => {
		let best: number | null = null
		for (const e of edges) for (const l of ls) { const a = l - (e + dv); if (Math.abs(a) <= tol && (best === null || Math.abs(a) < Math.abs(best))) best = a }
		return best !== null ? dv + best : Math.round((edges[0] + dv) / GRID) * GRID - edges[0]
	}
	if (mode === 'move') return { x: axis([r.x, r.x + r.w], lines.xs, d.x), y: axis([r.y, r.y + r.h], lines.ys, d.y) }
	const left = corner === 0 || corner === 3, top = corner === 0 || corner === 1
	return { x: axis([left ? r.x : r.x + r.w], lines.xs, d.x), y: axis([top ? r.y : r.y + r.h], lines.ys, d.y) }
}

/** What a node drag writes, inside its gesture: a BRANCH grown from the node, or the nodes moved — on a plan ONTO the
 *  snapped point (attaching to what it lands on), elsewhere by the drag; other runs whose nodes sat there move along
 *  (`followers`), and one of the same kind becomes part of this run; dropped on another node of the path they JOIN,
 *  or on a node of another run of the same kind the two runs become one (cables that chose it follow). */
export function dragNodesInto(tx: { get(id: Id): Entity | undefined; put(e: Entity): void; del(id: Id): void }, o: {
	shape: Id; grip: Grip; branch: Id | undefined | null; sn: Snap; home: boolean; followers: Map<Id, Id[]>; space: ViewSpace
	shapes: Shape[]; /** every entity at the gesture's start (read lazily: only a join needs them) */ all: () => Entity[]
}): { joined: number; absorbed: number } {
	const { shape, grip, branch, sn, home, followers: fol, space } = o
	const s = tx.get(shape) as Shape
	if (branch && s.geom.kind === 'path') {
		const from = s.geom.nodes.find((n) => n.id === grip.nodeIds[grip.nodeIds.length - 1])!
		const w = space.spec.kind === 'plan' ? { x: sn.p.x, y: sn.p.y, z: from.z } : (() => { const d = space.deltaToWorld({ x: sn.p.x - grip.at.x, y: sn.p.y - grip.at.y }); return { x: from.x + d.x, y: from.y + d.y, z: from.z + (d.z ?? 0) } })()
		tx.put(branchFrom(s, from.id, { ...w, ...(from.levelId ? { levelId: from.levelId } : {}), ...(sn.attach && space.spec.kind === 'plan' ? { attach: sn.attach } : {}) }, branch))
		return { joined: 0, absorbed: 0 }
	}
	const plan = space.spec.kind === 'plan', d = space.deltaToWorld({ x: sn.p.x - grip.at.x, y: sn.p.y - grip.at.y })
	// a run of the same kind whose node sits on this one is already connected here: it becomes part of this run
	// (Dave: two trunks touching at a point move as one); other runs' nodes there just move along
	const absorbed: Id[] = []
	let base = s
	for (const [fid, ids] of fol) {
		const f = tx.get(fid) as Shape | undefined
		if (!f || !canJoin(base, f) || base.geom.kind !== 'path') continue
		const mine = base.geom.nodes.filter((n) => grip.nodeIds.includes(n.id)), theirs = f.geom.kind === 'path' ? f.geom.nodes.filter((n) => ids.includes(n.id)) : []
		const m = joinShapes(base, f, theirs.map((n): [Id, Id] => [n.id, [...mine].sort((a, b) => Math.abs(a.z - n.z) - Math.abs(b.z - n.z))[0].id]))
		if (m) { base = m; absorbed.push(fid); tx.del(fid) }
	}
	const moved = plan ? moveNodes(base, grip.nodeIds, sn.p, sn.attach ?? (home ? undefined : null)) : moveNodesBy(base, grip.nodeIds, d)
	for (const [fid, ids] of fol) {
		if (absorbed.includes(fid)) continue
		const f = tx.get(fid) as Shape | undefined
		if (f) tx.put(plan ? moveNodes(f, ids, sn.p) : moveNodesBy(f, ids, d))
	}
	// dropped on another node of the path (snapped onto it): JOIN them — shows while dragging, undone by dragging on
	const j = joinDropped(moved, grip.nodeIds, space)
	// …or on a node of ANOTHER run of the same kind: the two runs become one (cables choosing that run follow)
	const across = j.joined ? null : joinAcross(j.shape, grip.nodeIds, o.shapes.filter((x) => x.id !== shape && !fol.has(x.id)), space)
	if (across) { tx.del(across.absorbed); absorbed.push(across.absorbed) }
	tx.put(across?.shape ?? j.shape)
	// what named a joined-in run (a cable that chose it — a backbone's riser —, a node or leader attached to it, a
	// penetration, a fill section) now names this one
	if (absorbed.length) {
		const now = () => o.all().flatMap((e) => tx.get(e.id) ?? [])
		for (const id of absorbed) for (const e of repointRefs(now(), id, () => shape)) tx.put(e)
	}
	return { joined: j.joined, absorbed: absorbed.length }
}
