import { SurfaceEditor, dist } from '../../edit/surface.svelte'
import type { Point } from '$lib/ui/print/types'
import type { OutletConfig, OutletLevel, CableType, MountType, OutletUsage, TrunkConfig, TrunkShape, TrunkNode, TrunkSegment, RackPlacement, OutletsData } from './types'

export type OutletTool = 'select' | 'outlet' | 'trunk'

const SNAP_DEG = 15, MERGE_PX = 12, DRAG_PX = 3

export type TrunkMenu =
	| { x: number; y: number; kind: 'node'; trunk: TrunkConfig; nodeId: string; canDisconnect: boolean }
	| { x: number; y: number; kind: 'segment'; trunk: TrunkConfig; segId: string }

/**
 * Editor for an outlets viewport — outlets, rack placements, and trunks. The trunk editing is
 * ported from the sample (15° snapping, node merge/join, ctrl-branch, insert/disconnect,
 * context menu); outlets/racks are simple move-and-edit.
 */
export class OutletsEditor extends SurfaceEditor {
	outlets = $state<OutletConfig[]>([])
	trunks = $state<TrunkConfig[]>([])
	rackPlacements = $state<RackPlacement[]>([])
	tool = $state<OutletTool>('select')

	// trunk sub-selection (node + segments within the selected trunk)
	tnode = $state<string | null>(null)
	tsegs = $state<string[]>([])
	// draw mode + transient indicators
	draw = $state<{ trunkId: string; lastNodeId: string } | null>(null)
	preview = $state<Point | null>(null)
	snap = $state<{ trunkId: string; nodeId: string; pos: Point } | null>(null)
	menu = $state<TrunkMenu | null>(null)

	defaults = $state<{ level: OutletLevel; portCount: number; cableType: CableType; mountType: MountType; usage: OutletUsage }>(
		{ level: 'low', portCount: 2, cableType: 'cat6a', mountType: 'box', usage: 'network' },
	)

	seed(d: OutletsData | null) {
		this.outlets = (d?.outlets ?? []).map(o => ({ ...o }))
		this.trunks = (d?.trunks ?? []).map(t => ({ ...t, nodes: t.nodes.map(n => ({ ...n })), segments: t.segments.map(s => ({ ...s })) }))
		this.rackPlacements = (d?.rackPlacements ?? []).map(r => ({ ...r }))
	}
	snapshot() {
		return { outlets: $state.snapshot(this.outlets), trunks: $state.snapshot(this.trunks), rackPlacements: $state.snapshot(this.rackPlacements) }
	}

	selOutlet = $derived(this.sel?.kind === 'outlet' ? this.outlets.find(o => o.id === this.sel!.id) ?? null : null)
	selTrunk = $derived(this.sel?.kind === 'trunk' ? this.trunks.find(t => t.id === this.sel!.id) ?? null : null)

	clearSel() { super.clearSel(); this.tnode = null; this.tsegs = []; this.menu = null }

	// ── helpers ──
	nodeById = (t: TrunkConfig, id: string) => t.nodes.find(n => n.id === id)
	nodePos = (t: TrunkConfig, id: string) => this.nodeById(t, id)?.position
	setPos(t: TrunkConfig, id: string, p: Point) { const n = this.nodeById(t, id); if (n) n.position = p }
	segsOf = (t: TrunkConfig, id: string) => t.segments.filter(s => s.nodes.includes(id))
	segKey = (s: TrunkSegment) => [...s.nodes].sort().join('|')

	snapAngle(anchor: Point, p: Point): Point {
		const dx = p.x - anchor.x, dy = p.y - anchor.y
		const d = Math.hypot(dx, dy), step = (SNAP_DEG * Math.PI) / 180
		const a = Math.round(Math.atan2(dy, dx) / step) * step
		return { x: anchor.x + d * Math.cos(a), y: anchor.y + d * Math.sin(a) }
	}
	/** Position a dragged junction so every connected segment lands on a 15° interval (LSQ). */
	snapNodeAngles(anchors: Point[], C: Point): Point {
		if (anchors.length === 0) return C
		if (anchors.length === 1) return this.snapAngle(anchors[0], C)
		const step = (SNAP_DEG * Math.PI) / 180, eps = 1e-3
		let m00 = eps, m01 = 0, m11 = eps, r0 = eps * C.x, r1 = eps * C.y, near = Infinity
		for (const A of anchors) {
			near = Math.min(near, dist(A, C))
			const a = Math.round(Math.atan2(C.y - A.y, C.x - A.x) / step) * step
			const nx = -Math.sin(a), ny = Math.cos(a)
			const b = nx * A.x + ny * A.y
			m00 += nx * nx; m01 += nx * ny; m11 += ny * ny; r0 += b * nx; r1 += b * ny
		}
		const det = m00 * m11 - m01 * m01
		if (Math.abs(det) > 1e-6) {
			const P = { x: (m11 * r0 - m01 * r1) / det, y: (m00 * r1 - m01 * r0) / det }
			if (dist(P, C) <= 4 * near) return P
		}
		let best = C, bd = Infinity
		for (const A of anchors) { const cand = this.snapAngle(A, C), d = dist(cand, C); if (d < bd) { bd = d; best = cand } }
		return best
	}
	projectOntoSeg(p: Point, a: Point, b: Point): Point {
		const ax = b.x - a.x, ay = b.y - a.y
		const t = Math.max(0, Math.min(1, ((p.x - a.x) * ax + (p.y - a.y) * ay) / (ax * ax + ay * ay || 1)))
		return { x: a.x + ax * t, y: a.y + ay * t }
	}
	nearestNode(p: Point, lim: number, ex?: { tid: string; nid: string }) {
		let best: { trunk: TrunkConfig; node: TrunkNode } | null = null, bd = lim
		for (const t of this.trunks) for (const n of t.nodes) {
			if (ex && t.id === ex.tid && n.id === ex.nid) continue
			const d = dist(n.position, p)
			if (d < bd) { bd = d; best = { trunk: t, node: n } }
		}
		return best
	}

	// ── outlets ──
	addOutlet(p: Point) {
		const d = this.defaults
		const o: OutletConfig = { id: this.uid('O'), position: p, level: d.level, portCount: d.portCount, cableType: d.cableType, mountType: d.mountType, usage: d.usage }
		this.outlets.push(o); this.select('outlet', o.id); this.notify()
	}
	dragOutlet(o: OutletConfig, e0: MouseEvent) {
		this.select('outlet', o.id)
		const w0 = this.toWorld(e0); if (!w0) return
		const p0 = { ...o.position }
		this.startDrag(e => { const w = this.toWorld(e); if (w) o.position = { x: p0.x + (w.x - w0.x), y: p0.y + (w.y - w0.y) } }, () => this.notify())
	}
	setOutlet(patch: Partial<OutletConfig>) {
		const o = this.selOutlet; if (!o) return
		Object.assign(o, patch)
		this.defaults = { level: o.level, portCount: o.portCount, cableType: o.cableType, mountType: o.mountType, usage: o.usage }
		this.notify()
	}

	// ── trunk selection ── (selects the whole trunk = all its segments)
	selectTrunk(tid: string) {
		this.select('trunk', tid); this.tnode = null; this.menu = null
		const t = this.trunks.find(x => x.id === tid)
		this.tsegs = t ? t.segments.map(s => s.id) : []
	}
	selectNode(tid: string, nid: string) { this.select('trunk', tid); this.tnode = nid; this.tsegs = [] }
	selectSeg(tid: string, sid: string) { this.select('trunk', tid); this.tnode = null; this.tsegs = [sid] }

	// ── trunks: create / draw ──
	newTrunk(p: Point): TrunkConfig {
		return {
			id: this.uid('T'), shape: 'rect', location: 'floor', spec: { catalog: 'tray', widthMm: 50, heightMm: 50 },
			nodes: [{ id: this.uid('n'), position: p, z: 0 }], segments: [], isPrimary: false, visible: true, color: '#0369a1',
		}
	}
	startDraw() { this.tool = 'trunk'; this.draw = null; this.preview = null; this.clearSel() }
	drawClick(p: Point, shift = false) {
		if (!this.draw) { const t = this.newTrunk(p); this.trunks.push(t); this.draw = { trunkId: t.id, lastNodeId: t.nodes[0].id }; this.select('trunk', t.id); return }
		const t = this.trunks.find(x => x.id === this.draw!.trunkId); if (!t) return
		const last = this.nodePos(t, this.draw.lastNodeId)
		let pos = shift && last ? this.snapAngle(last, p) : p
		// snap the new point onto an existing node to connect routes
		const hit = this.nearestNode(pos, MERGE_PX / this.screenScale())
		if (hit) pos = { ...hit.node.position }
		const nn: TrunkNode = { id: this.uid('n'), position: pos, z: 0 }
		t.nodes.push(nn); t.segments.push({ id: this.uid('s'), nodes: [this.draw.lastNodeId, nn.id] }); this.draw.lastNodeId = nn.id
		this.notify()
	}
	finishDraw() {
		if (this.draw) { const t = this.trunks.find(x => x.id === this.draw!.trunkId); if (t && !t.segments.length) this.trunks = this.trunks.filter(x => x.id !== t.id) }
		this.draw = null; this.preview = null; this.tool = 'select'; this.notify()
	}

	// ── trunks: drag node (ctrl=branch, shift=15° snap, drop-on-node=merge/join) ──
	onNodeDown(e: MouseEvent, t: TrunkConfig, node: TrunkNode) {
		if (e.button !== 0) return
		e.preventDefault(); e.stopPropagation(); this.menu = null
		let dragId = node.id
		if (e.ctrlKey || e.metaKey) {
			const nn: TrunkNode = { id: this.uid('n'), position: { ...node.position }, z: node.z }
			t.nodes.push(nn); t.segments.push({ id: this.uid('s'), nodes: [node.id, nn.id] }); dragId = nn.id
		}
		this.selectNode(t.id, dragId)
		this.startDrag(ev => {
			const w = this.toWorld(ev); if (!w) return
			let p = w
			const segs = this.segsOf(t, dragId)
			if (ev.shiftKey && segs.length) {
				const anchors = segs.map(s => this.nodePos(t, s.nodes[0] === dragId ? s.nodes[1] : s.nodes[0])).filter((a): a is Point => !!a)
				if (anchors.length) p = this.snapNodeAngles(anchors, w)
			}
			this.setPos(t, dragId, p)
			const hit = this.nearestNode(p, MERGE_PX / this.screenScale(), { tid: t.id, nid: dragId })
			this.snap = hit ? { trunkId: hit.trunk.id, nodeId: hit.node.id, pos: hit.node.position } : null
		}, () => {
			const s = this.snap
			if (s) { if (s.trunkId === t.id) this.mergeNodes(t, dragId, s.nodeId); else { const to = this.trunks.find(x => x.id === s.trunkId); if (to) this.joinTrunks(t, dragId, to, s.nodeId) } }
			this.snap = null; this.notify()
		})
	}
	// ── trunks: drag a segment (move both ends; ortho with shift; shift/ctrl click = multi-select) ──
	onSegDown(e: MouseEvent, t: TrunkConfig, seg: TrunkSegment) {
		if (e.button !== 0) return
		e.preventDefault(); e.stopPropagation(); this.menu = null
		if (e.shiftKey || e.ctrlKey || e.metaKey) {
			const cur = this.sel?.kind === 'trunk' && this.sel.id === t.id ? this.tsegs : []
			this.select('trunk', t.id); this.tnode = null
			this.tsegs = cur.includes(seg.id) ? cur.filter(x => x !== seg.id) : [...cur, seg.id]
			return
		}
		this.selectSeg(t.id, seg.id)
		const a = this.nodePos(t, seg.nodes[0]), b = this.nodePos(t, seg.nodes[1]), w0 = this.toWorld(e)
		if (!a || !b || !w0) return
		const a0 = { ...a }, b0 = { ...b }
		this.startDrag(ev => {
			const w = this.toWorld(ev); if (!w) return
			let dx = w.x - w0.x, dy = w.y - w0.y
			if (ev.shiftKey) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0 }
			this.setPos(t, seg.nodes[0], { x: a0.x + dx, y: a0.y + dy })
			this.setPos(t, seg.nodes[1], { x: b0.x + dx, y: b0.y + dy })
		}, () => this.notify())
	}

	// ── trunks: graph edits ──
	insertNodeAt(t: TrunkConfig, seg: TrunkSegment, w: Point) {
		const a = this.nodePos(t, seg.nodes[0]), b = this.nodePos(t, seg.nodes[1]); if (!a || !b) return
		const nn: TrunkNode = { id: this.uid('n'), position: this.projectOntoSeg(w, a, b), z: 0 }
		t.nodes.push(nn)
		const i = t.segments.indexOf(seg)
		t.segments.splice(i, 1, { id: this.uid('s'), nodes: [seg.nodes[0], nn.id] }, { id: this.uid('s'), nodes: [nn.id, seg.nodes[1]] })
		this.selectNode(t.id, nn.id); this.notify()
	}
	insertNode(e: MouseEvent, t: TrunkConfig, seg: TrunkSegment) { e.preventDefault(); e.stopPropagation(); const w = this.toWorld(e); if (w) this.insertNodeAt(t, seg, w) }
	pruneOrphans(t: TrunkConfig) { const used = new Set(t.segments.flatMap(s => s.nodes)); t.nodes = t.nodes.filter(n => used.has(n.id)) }
	deleteNode(t: TrunkConfig, nodeId: string) {
		const nb = this.segsOf(t, nodeId).map(s => (s.nodes[0] === nodeId ? s.nodes[1] : s.nodes[0]))
		t.segments = t.segments.filter(s => !s.nodes.includes(nodeId))
		t.nodes = t.nodes.filter(n => n.id !== nodeId)
		if (nb.length === 2 && nb[0] !== nb[1]) {
			const k = [nb[0], nb[1]].sort().join('|')
			if (!t.segments.some(s => this.segKey(s) === k)) t.segments.push({ id: this.uid('s'), nodes: [nb[0], nb[1]] })
		}
		this.pruneOrphans(t)
		if (!t.segments.length) this.trunks = this.trunks.filter(x => x.id !== t.id)
		this.clearSel(); this.notify()
	}
	deleteSegment(t: TrunkConfig, segId: string) {
		t.segments = t.segments.filter(s => s.id !== segId); this.pruneOrphans(t)
		if (!t.segments.length) this.trunks = this.trunks.filter(x => x.id !== t.id)
		this.clearSel(); this.notify()
	}
	disconnectNode(t: TrunkConfig, nodeId: string) {
		const segs = this.segsOf(t, nodeId), orig = this.nodeById(t, nodeId)
		if (segs.length < 2 || !orig) return
		for (const seg of segs.slice(1)) {
			const copy: TrunkNode = { id: this.uid('n'), position: { ...orig.position }, z: orig.z }
			t.nodes.push(copy); seg.nodes = seg.nodes.map(id => (id === nodeId ? copy.id : id)) as [string, string]
		}
		this.menu = null; this.notify()
	}
	dedupeSegments(t: TrunkConfig) {
		const keys = new Set<string>()
		t.segments = t.segments.filter(s => { if (s.nodes[0] === s.nodes[1]) return false; const k = this.segKey(s); if (keys.has(k)) return false; keys.add(k); return true })
	}
	mergeNodes(t: TrunkConfig, fromId: string, toId: string) {
		for (const s of t.segments) if (s.nodes.includes(fromId)) s.nodes = s.nodes.map(id => (id === fromId ? toId : id)) as [string, string]
		this.dedupeSegments(t); t.nodes = t.nodes.filter(n => n.id !== fromId); this.selectNode(t.id, toId)
	}
	joinTrunks(from: TrunkConfig, fromNodeId: string, to: TrunkConfig, toNodeId: string) {
		const remap = new Map(from.nodes.map(n => [n.id, this.uid('n')]))
		to.nodes.push(...from.nodes.map(n => ({ ...n, id: remap.get(n.id)! })))
		to.segments.push(...from.segments.map(s => ({ id: this.uid('s'), nodes: [remap.get(s.nodes[0])!, remap.get(s.nodes[1])!] as [string, string] })))
		this.trunks = this.trunks.filter(t => t.id !== from.id)
		this.mergeNodes(to, remap.get(fromNodeId)!, toNodeId)
	}
	setTrunk(patch: Partial<TrunkConfig>) { const t = this.selTrunk; if (!t) return; Object.assign(t, patch); this.notify() }
	/** Switch shape AND rebuild the matching spec, preserving size (rect width↔pipe diameter). */
	setTrunkShape(shape: TrunkShape) {
		const t = this.selTrunk; if (!t || t.shape === shape) return
		const w = this.selTrunkWidth || 50
		const h = this.selTrunkHeight || w
		t.spec = shape === 'pipe'
			? { catalog: 'custom', innerDiameterMm: Math.max(0, w - 4), outerDiameterMm: w }
			: { catalog: 'custom', widthMm: w, heightMm: h }
		t.shape = shape
		this.notify()
	}
	selTrunkWidth = $derived(((this.selTrunk?.spec as any)?.widthMm ?? (this.selTrunk?.spec as any)?.outerDiameterMm ?? 0) as number)
	selTrunkHeight = $derived(((this.selTrunk?.spec as any)?.heightMm ?? (this.selTrunk?.spec as any)?.outerDiameterMm ?? 0) as number)
	setTrunkWidth(w: number) {
		const t = this.selTrunk; if (!t) return
		if (t.shape === 'pipe') { (t.spec as any).outerDiameterMm = w; (t.spec as any).innerDiameterMm = Math.max(0, w - 4) }
		else (t.spec as any).widthMm = w
		this.notify()
	}
	setTrunkHeight(h: number) { const t = this.selTrunk; if (!t || t.shape === 'pipe') return; (t.spec as any).heightMm = h; this.notify() }

	// ── context menu ──
	onNodeContext(e: MouseEvent, t: TrunkConfig, node: TrunkNode) {
		e.preventDefault(); e.stopPropagation(); this.selectNode(t.id, node.id)
		this.menu = { x: e.clientX, y: e.clientY, kind: 'node', trunk: t, nodeId: node.id, canDisconnect: this.segsOf(t, node.id).length >= 2 }
	}
	onSegContext(e: MouseEvent, t: TrunkConfig, seg: TrunkSegment) {
		e.preventDefault(); e.stopPropagation(); this.selectSeg(t.id, seg.id)
		this.menu = { x: e.clientX, y: e.clientY, kind: 'segment', trunk: t, segId: seg.id }
	}

	// ── nudge / duplicate the selection (keyboard) ──
	nudge(dx: number, dy: number) {
		if (this.selOutlet) { this.selOutlet.position = { x: this.selOutlet.position.x + dx, y: this.selOutlet.position.y + dy }; this.notify() }
		else if (this.selTrunk) { for (const n of this.selTrunk.nodes) n.position = { x: n.position.x + dx, y: n.position.y + dy }; this.notify() }
	}
	duplicateSel() {
		const o = this.selOutlet
		if (o) { const c: OutletConfig = { ...o, id: this.uid('O'), position: { x: o.position.x + 300, y: o.position.y + 300 } }; this.outlets.push(c); this.select('outlet', c.id); this.notify() }
	}

	// ── racks (move only) ──
	dragRack(rp: RackPlacement, e0: MouseEvent) {
		this.select('rack', rp.rackId)
		const w0 = this.toWorld(e0); if (!w0) return
		const p0 = { ...rp.position }
		this.startDrag(e => { const w = this.toWorld(e); if (w) rp.position = { x: p0.x + (w.x - w0.x), y: p0.y + (w.y - w0.y) } }, () => this.notify())
	}

	deleteSel() {
		const s = this.sel; if (!s) return
		if (s.kind === 'outlet') { this.outlets = this.outlets.filter(o => o.id !== s.id); this.clearSel(); this.notify(); return }
		if (s.kind === 'trunk') {
			const t = this.trunks.find(x => x.id === s.id); if (!t) return
			if (this.tnode) this.deleteNode(t, this.tnode)
			else if (this.tsegs.length) { for (const sid of [...this.tsegs]) this.deleteSegment(t, sid) }
			else { this.trunks = this.trunks.filter(x => x.id !== t.id); this.clearSel(); this.notify() }
		}
	}
}
