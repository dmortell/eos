import { toast } from 'svelte-sonner'
import { SurfaceEditor } from '../../edit/surface.svelte'
import { BASIS, type Clip, type Conduit, type Dir, type Model, type Obj, type Prism, type Wall } from './types'
import { moveAlong, roundObj, project, xyCenter, DEFAULT_YAW, DEFAULT_PITCH } from './projection'
import { newId } from './graph'
import { polyToGraph } from './migrate'

type P3 = { x: number; y: number; z: number }

const MIN = 1 // model mm

// Resize one axis of a prism box by dragging its near (far=false) or far edge to
// `cursor` (a model coord along that axis); the opposite edge stays put.
const BOX_DIM: Record<'x' | 'y' | 'z', 'w' | 'd' | 'h'> = { x: 'w', y: 'd', z: 'h' }
function resizeBoxAxis(o: Prism, axis: 'x' | 'y' | 'z', far: boolean, cursor: number, min: number) {
	const dim = BOX_DIM[axis]
	let lo = o[axis], hi = o[axis] + o[dim]
	if (far) hi = Math.max(cursor, lo + min)
	else lo = Math.min(cursor, hi - min)
	o[axis] = lo
	o[dim] = hi - lo
}

/**
 * In-viewport geometry editor for a `model3d` source. Operates directly on the
 * shared model's objects (mutations persist via the host's `onChange` →
 * ModelStore.save). Editing happens in the projected (ortho) plane; the render
 * draws drawing-plane (u, v-up) as SVG (x = u, y = -v), so cursor world-mm maps
 * back to model-axis coords through the view BASIS. Iso is display-only.
 */
export class Model3dEditor extends SurfaceEditor {
	model: Model | null = null
	direction: Dir = 'plan'
	// Per-viewport layer visibility/lock (mirrors the host viewport's overrides).
	layerOverrides: Record<string, { hidden?: boolean; locked?: boolean }> = {}

	protected selKind = 'obj'
	get objects(): Obj[] { return this.model?.objects ?? [] }
	// ── identity: selection is keyed by object id, not array index, so it survives reorder ──
	private oid(i: number): string { return this.objects[i]?.id ?? '' }
	byId(id: string): Obj | undefined { return this.objects.find((o) => o.id === id) }
	private idxOf(id: string): number { return this.objects.findIndex((o) => o.id === id) }
	get selObjId(): string | null { return this.sel?.kind === 'obj' ? this.sel.id : null }
	get selIndex(): number | null { const id = this.selObjId; if (id === null) return null; const i = this.idxOf(id); return i < 0 ? null : i }
	isObj(i: number) { return this.selObjId !== null && this.selObjId === this.oid(i) }
	selectObj(i: number) { this.select('obj', this.oid(i)); this.usel = null; this.multi = []; this.ssel = null }

	// Path node selection (for Delete / highlight), by object index + node id.
	vsel = $state<{ index: number; nodeId: string } | null>(null)
	isVertex(i: number, nodeId: string) { return this.vsel?.index === i && this.vsel?.nodeId === nodeId }

	// Segment selection (for the segment list / per-segment properties + highlight).
	ssel = $state<{ index: number; segId: string } | null>(null)
	isSegment(i: number, segId: string) { return this.ssel?.index === i && this.ssel?.segId === segId }
	selectSegment(index: number, segId: string) { this.selectObj(index); this.ssel = { index, segId } }
	deleteSegment(index: number, segId: string) {
		const o = this.objects[index]
		if (!o || (o.type !== 'wall' && o.type !== 'conduit') || this.locked(o)) return
		o.segments = o.segments.filter((s) => s.id !== segId)
		const used = new Set(o.segments.flatMap((s) => [s.a, s.b]))
		o.nodes = o.nodes.filter((n) => used.has(n.id)) // drop orphaned nodes
		if (this.ssel?.segId === segId) this.ssel = null
		this.notify()
	}

	// Underlay selection (drag/resize its placement rect).
	usel = $state<string | null>(null)
	isUnderlay(id: string) { return this.usel === id }
	private underlay(id: string) { return this.model?.underlays?.find((u) => u.id === id) ?? null }
	selectUnderlay(id: string) { this.usel = id; super.clearSel(); this.vsel = null }

	startUnderlayMove = (e: MouseEvent, id: string) => {
		if (e.button !== 0) return // right/middle bubble up so the canvas pans
		e.stopPropagation()
		if (this.bgLocked) return // Background layer locked
		const u = this.underlay(id); if (!u?.rect) return
		this.selectUnderlay(id)
		const w0 = this.toWorld(e); if (!w0) return
		const r0 = { ...u.rect }
		this.startDrag((ev) => { const w = this.toWorld(ev); if (!w || !u.rect) return; u.rect.x = r0.x + (w.x - w0.x); u.rect.y = r0.y + (w.y - w0.y) }, () => this.notify())
	}
	startUnderlayResize = (e: MouseEvent, id: string, corner: string) => {
		if (e.button !== 0) return // right/middle bubble up so the canvas pans
		e.stopPropagation()
		if (this.bgLocked) return // Background layer locked
		const u = this.underlay(id); if (!u?.rect) return
		this.selectUnderlay(id)
		const r0 = { ...u.rect }, MINU = 10
		const left = corner.includes('w'), top = corner.includes('n')
		this.startDrag((ev) => {
			const w = this.toWorld(ev); if (!w || !u.rect) return
			let x = r0.x, y = r0.y, ww = r0.w, hh = r0.h
			if (left) { x = Math.min(w.x, r0.x + r0.w - MINU); ww = r0.x + r0.w - x } else ww = Math.max(MINU, w.x - r0.x)
			if (top) { y = Math.min(w.y, r0.y + r0.h - MINU); hh = r0.y + r0.h - y } else hh = Math.max(MINU, w.y - r0.y)
			u.rect = { x, y, w: ww, h: hh }
		}, () => this.notify())
	}
	resetUnderlay = (id: string) => { const u = this.underlay(id); if (u) { u.rect = undefined; this.notify() } }

	// Cursor → model-axis coords for the current view. u = world.x, v = -world.y.
	private at(e: MouseEvent) {
		const w = this.toWorld(e)
		if (!w) return null
		const b = BASIS[this.direction]
		const u = w.x, v = -w.y
		return { u, v, ch: u * b.hs, cv: v * b.vs } // ch/cv = model coord along b.h / b.v
	}

	private locked(o: Obj) {
		if (this.layerOverrides[o.layer ?? '']?.locked) return true // per-viewport lock
		const l = this.model?.layers?.find((x) => x.id === o.layer)
		return !!l?.locked
	}
	// Locked-layer guard for interactions: returns true (blocked) and toasts why, so
	// a click on a locked object explains itself instead of silently doing nothing.
	private blockedByLock(o: Obj): boolean {
		if (!this.locked(o)) return false
		this.lockedToast(o.layer)
		return true
	}
	// Is a layer locked (per-viewport override or model default)?
	layerLocked(id: string | undefined): boolean {
		if (!id) return false
		if (this.layerOverrides[id]?.locked) return true
		return !!this.model?.layers?.find((l) => l.id === id)?.locked
	}
	private lockedToast(id: string | undefined) {
		const name = this.model?.layers?.find((l) => l.id === id)?.name ?? id ?? 'layer'
		toast.warning(`Layer “${name}” is locked — unlock it in the Layers window to edit`)
	}

	// Ctrl/⌘-click toggles an object in/out of the selection set. A 1-item result
	// becomes a normal single selection (handles + property editor).
	toggleMulti(i: number) {
		const id = this.oid(i); if (!id) return
		this.vsel = null; this.usel = null; this.ssel = null
		this.applyToggle(this.multi, this.selObjId, id, (sel, multi) => { this.sel = sel; this.multi = multi })
	}
	duplicateSelectionInPlace() { if (this.multi.length) this.duplicateMulti() }

	// ── object move (drag in the projected plane) — uses the shared gesture drivers ──
	startObjMove = (e: MouseEvent, index: number) => {
		if (e.button !== 0) return // right/middle bubble up so the canvas pans
		e.stopPropagation()
		if (!this.objects[index]) return
		if (this.blockedByLock(this.objects[index])) return

		if (e.ctrlKey || e.metaKey) {
			// Ctrl-drag duplicates (single or whole multi) + drags the clones; ctrl-click toggles.
			this.driveCtrlDrag(e, {
				duplicate: () => { if (this.inMulti(index)) this.duplicateMulti(); else { this.selectObj(this.duplicateOne(index)); this.vsel = null } },
				snapshot: () => this.beginGroupTranslate(),
				apply: (dx, dy) => this.applyGroupTranslate(dx, dy),
				toggle: () => this.toggleMulti(index),
			})
			return
		}
		if (this.inMulti(index)) { this.beginGroupDrag(e); return } // marquee group (this + annotation peer)
		this.selectObj(index); this.vsel = null
		this.beginItemDrag(e) // single: snapshot + shift-constrained translate
	}

	// ── prism corner / wall vertex+height resize ──
	startResize = (e: MouseEvent, index: number, handle: string) => {
		if (e.button !== 0) return // right/middle bubble up so the canvas pans
		e.stopPropagation()
		const o = this.objects[index]
		if (!o || this.locked(o)) return
		this.selectObj(index)
		const b = BASIS[this.direction]
		this.startDrag((ev) => {
			const c = this.at(ev); if (!c) return
			if (o.type === 'prism') {
				resizeBoxAxis(o, b.h, handle.includes('h1'), c.ch, MIN)
				resizeBoxAxis(o, b.v, handle.includes('v1'), c.cv, MIN)
			} else if (o.type === 'wall' && handle === 'p0') {
				o.h = Math.max(MIN, c.cv - (o.nodes[0]?.z ?? 0)) // elevation: drag the top edge
			}
			roundObj(o)
		}, () => this.notify())
	}

	// Rotate a cuboid about z (plan view): drag the handle around the footprint
	// centre. Snaps to 15° (hold Shift for free rotation).
	startRotatePrism = (e: MouseEvent, index: number) => {
		if (e.button !== 0) return
		e.stopPropagation()
		const o = this.objects[index]
		if (o?.type !== 'prism' || this.locked(o)) return
		this.selectObj(index)
		const cx = o.x + o.w / 2, cy = o.y + o.d / 2
		const ang = (p: { ch: number; cv: number }) => (Math.atan2(p.cv - cy, p.ch - cx) * 180) / Math.PI
		const s = this.at(e); if (!s) return
		const start = ang(s), rot0 = o.rot ?? 0
		this.startDrag((ev) => {
			const c = this.at(ev); if (!c) return
			let r = rot0 + (ang(c) - start)
			if (!ev.shiftKey) r = Math.round(r / 15) * 15
			o.rot = ((Math.round(r) % 360) + 360) % 360
		}, () => this.notify())
	}

	// ── shared path editing for conduits (3D path) and walls (2D pts, plan only) ──
	// Walls reuse the same insert/extend/delete logic as conduits — a wall is just
	// a flat swept polyline (see merge-analysis.md: wall/conduit/trunk unification).
	private pathEditable(o: Obj | undefined): o is Conduit | Wall {
		return !!o && !this.locked(o) && (o.type === 'conduit' || (o.type === 'wall' && this.direction === 'plan'))
	}
	private node(o: Conduit | Wall, id: string) { return o.nodes.find((n) => n.id === id) }
	// Snap a projected point (h,v model-axis coords) to the nearest OTHER wall/conduit
	// node within a screen-distance threshold. `skip` excludes the node being dragged.
	private snapToNode(h: number, v: number, skip?: { o: Conduit | Wall; id: string }) {
		const b = BASIS[this.direction], thr = 12 / (this.screenScale() || 1)
		let best: { h: number; v: number } | null = null, bestD = thr
		for (const obj of this.objects) {
			if (obj.type !== 'wall' && obj.type !== 'conduit') continue
			for (const nd of obj.nodes) {
				if (skip && obj === skip.o && nd.id === skip.id) continue
				const d = Math.hypot((nd as any)[b.h] - h, (nd as any)[b.v] - v)
				if (d < bestD) { bestD = d; best = { h: (nd as any)[b.h], v: (nd as any)[b.v] } }
			}
		}
		return best
	}
	// Constrain a point so the segment from `(oh,ov)` to it is on a 15° multiple, keeping length.
	private snap15(oh: number, ov: number, h: number, v: number) {
		const dh = h - oh, dv = v - ov, len = Math.hypot(dh, dv); if (len < 1) return { h, v }
		const step = Math.PI / 12, ang = Math.round(Math.atan2(dv, dh) / step) * step
		return { h: oh + len * Math.cos(ang), v: ov + len * Math.sin(ang) }
	}
	private dragNode(o: Conduit | Wall, id: string, onEnd?: () => void) {
		const b = BASIS[this.direction], n = this.node(o, id); if (!n) return
		// A neighbour for the 15° angle constraint (Shift), if any.
		const nbrSeg = o.segments.find((s) => s.a === id || s.b === id)
		const nbr = nbrSeg ? this.node(o, nbrSeg.a === id ? nbrSeg.b : nbrSeg.a) : null
		this.startDrag((ev) => {
			const c = this.at(ev); if (!c) return
			let h = c.ch, v = c.cv
			if (ev.shiftKey && nbr) ({ h, v } = this.snap15((nbr as any)[b.h], (nbr as any)[b.v], h, v)) // Shift = 15° angle
			else { const s = this.snapToNode(h, v, { o, id }); if (s) ({ h, v } = s) }            // else snap to other nodes
			n[b.h] = Math.round(h); n[b.v] = Math.round(v)
		}, () => { this.joinOnDrop(o, id); onEnd?.(); this.notify() })
	}
	private dedupeSegs(o: Conduit | Wall) {
		o.segments = o.segments.filter((s) => s.a !== s.b) // drop collapsed self-loops
		const seen = new Set<string>()
		o.segments = o.segments.filter((s) => { const k = [s.a, s.b].sort().join('|'); if (seen.has(k)) return false; seen.add(k); return true })
	}
	// Join on drop: if a dragged node lands on another node (within a screen snap),
	// merge them. Same object → form a junction. Another SAME-TYPE object → merge the
	// two objects into one continuous graph (carrying the other's profile per segment).
	private joinOnDrop(o: Conduit | Wall, id: string) {
		const b = BASIS[this.direction], n = this.node(o, id); if (!n) return
		const thr = 12 / (this.screenScale() || 1)
		const near = (nd: any) => Math.hypot(nd[b.h] - (n as any)[b.h], nd[b.v] - (n as any)[b.v]) <= thr
		// 1. same-object junction
		const t = o.nodes.find((x) => x.id !== id && near(x))
		if (t) {
			for (const s of o.segments) { if (s.a === id) s.a = t.id; if (s.b === id) s.b = t.id }
			o.nodes = o.nodes.filter((x) => x.id !== id); this.dedupeSegs(o)
			if (this.vsel?.nodeId === id) this.vsel = { index: this.vsel.index, nodeId: t.id }
			return
		}
		// 2. cross-object merge (same type): absorb `obj` into `o`
		for (const obj of this.objects as (Conduit | Wall)[]) {
			if (obj === o || obj.type !== o.type) continue
			const tn = obj.nodes.find(near); if (!tn) continue
			// keep the other object's appearance by baking its default profile onto its segments
			const segs = obj.segments.map((s) => o.type === 'wall'
				? { ...s, thickness: (s as any).thickness ?? (obj as any).thickness, h: (s as any).h ?? (obj as any).h }
				: { ...s, w: (s as any).w ?? (obj as any).w, h: (s as any).h ?? (obj as any).h, edges: (s as any).edges ?? (obj as any).edges })
			const remap = (nid: string) => (nid === tn.id ? id : nid) // its merged node → our dragged node
			o.nodes.push(...obj.nodes.filter((x) => x.id !== tn.id))
			o.segments.push(...segs.map((s) => ({ ...s, a: remap(s.a), b: remap(s.b) })) as any)
			this.dedupeSegs(o)
			this.model!.objects = this.objects.filter((x) => x !== obj) // remove the absorbed object
			return
		}
	}
	// Disconnect a junction node (degree ≥ 2): give every incident segment past the
	// first its own copy of the node, offset so they're separately draggable. Splits
	// a tee/cross back into independent ends. Touch-friendly (a handle tap).
	disconnectNode = (index: number, nodeId: string) => {
		const o = this.objects[index]
		if (!o || (o.type !== 'wall' && o.type !== 'conduit') || this.locked(o)) return
		const orig = this.node(o, nodeId); if (!orig) return
		const inc = o.segments.filter((s) => s.a === nodeId || s.b === nodeId)
		if (inc.length < 2) return
		inc.slice(1).forEach((s, k) => {
			const copy = { id: newId('n'), x: orig.x + (k + 1) * 150, y: orig.y + (k + 1) * 150, z: orig.z }
			o.nodes.push(copy)
			if (s.a === nodeId) s.a = copy.id; else s.b = copy.id
		})
		this.notify()
	}
	startVertex = (e: MouseEvent, index: number, nodeId: string) => {
		if (e.button !== 0) return // right/middle bubble up so the canvas pans
		e.stopPropagation()
		const o = this.objects[index]
		if (!this.pathEditable(o)) return
		this.selectObj(index); this.vsel = { index, nodeId }
		this.dragNode(o, nodeId)
	}
	// Insert: split segment `segId` at its midpoint into two segments (carry profile).
	startInsert = (e: MouseEvent, index: number, segId: string) => {
		if (e.button !== 0) return // right/middle bubble up so the canvas pans
		e.stopPropagation()
		const o = this.objects[index]
		if (!this.pathEditable(o)) return
		const seg = o.segments.find((s) => s.id === segId); if (!seg) return
		const a = this.node(o, seg.a), b2 = this.node(o, seg.b); if (!a || !b2) return
		const mid = { id: newId('n'), x: Math.round((a.x + b2.x) / 2), y: Math.round((a.y + b2.y) / 2), z: Math.round((a.z + b2.z) / 2) }
		o.nodes.push(mid)
		o.segments.push({ ...seg, id: newId('s'), a: mid.id, b: seg.b })
		seg.b = mid.id
		this.selectObj(index); this.vsel = { index, nodeId: mid.id }
		this.dragNode(o, mid.id)
	}
	// Extend: pull a new node + segment off endpoint `nodeId`.
	startExtend = (e: MouseEvent, index: number, nodeId: string) => {
		if (e.button !== 0) return // right/middle bubble up so the canvas pans
		e.stopPropagation()
		const o = this.objects[index]
		if (!this.pathEditable(o)) return
		const from = this.node(o, nodeId); if (!from) return
		const nn = { id: newId('n'), x: from.x, y: from.y, z: from.z }
		const segId = newId('s')
		o.nodes.push(nn)
		o.segments.push({ id: segId, a: nodeId, b: nn.id })
		this.selectObj(index); this.vsel = { index, nodeId: nn.id }
		// Discard the new node+segment if released without moving (zero-length).
		this.dragNode(o, nn.id, () => {
			const a = this.node(o, nodeId), b = this.node(o, nn.id)
			if (a && b && a.x === b.x && a.y === b.y && a.z === b.z) {
				o.segments = o.segments.filter((s) => s.id !== segId)
				o.nodes = o.nodes.filter((n) => n.id !== nn.id)
				this.vsel = null; this.selectObj(index)
			}
		})
	}

	// ── delete: multi-selection, then a selected path vertex, then the object ──
	// A selected path node deletes just that node (not the whole object) when it's safe to;
	// otherwise the base removes the selected objects (single or multi). Override so the
	// SelectionCoordinator can call deleteSelection() uniformly across editors.
	deleteSelection() {
		if (!this.multi.length && this.vsel) {
			const o = this.objects[this.vsel.index]
			if ((o?.type === 'conduit' || o?.type === 'wall') && o.nodes.length > 2 && deleteNode(o, this.vsel.nodeId)) { this.vsel = null; this.notify(); return }
		}
		super.deleteSelection()
	}
	deleteSel = () => this.deleteSelection()

	// ── duplicate / copy / paste (ctrl-drag, Ctrl+D/C/V, or panel buttons for touch) ──
	clipboard: Obj[] = []
	private dragIds(): string[] { return this.multi.length ? this.multi : this.selObjId ? [this.selObjId] : [] }
	private selIdxs() { return this.dragIds().map((id) => this.idxOf(id)).filter((i) => i >= 0) }

	// ── multi-select common-property editing ──
	get multiObjs(): Obj[] { return this.multi.map((id) => this.byId(id)).filter(Boolean) as Obj[] }
	// A value shared by all selected objects, else undefined (mixed → blank input).
	common<T>(read: (o: Obj) => T | undefined): T | undefined {
		const os = this.multiObjs; if (!os.length) return undefined
		const v = read(os[0]); return os.every((o) => read(o) === v) ? v : undefined
	}
	setMultiLayer(layer: string | undefined) { for (const o of this.multiObjs) if (!this.locked(o)) o.layer = layer; this.notify() }
	setMultiHeight(h: number) { for (const o of this.multiObjs) if (!this.locked(o) && 'h' in o) (o as any).h = h; this.notify() }
	setMultiBaseZ(z: number) {
		for (const o of this.multiObjs) { if (this.locked(o)) continue; if (o.type === 'prism') o.z = z; else o.nodes.forEach((n) => (n.z = z)) }
		this.notify()
	}
	// Clone an object with a FRESH id (clones must never share an id with the source).
	private cloneObj(o: Obj): Obj { const c = structuredClone($state.snapshot(o)) as Obj; c.id = newId('o'); return c }
	// Clone in place for a ctrl-drag (caller then drags the clones).
	private duplicateOne(index: number): number {
		this.objects.push(this.cloneObj(this.objects[index]))
		return this.objects.length - 1
	}
	private duplicateMulti() { this.duplicateSelectionInPlace() } // base: cloneItems(multi) → select clones
	// Add clones offset by `d` mm and select them (for Duplicate / Paste).
	private addClones(src: Obj[], d: number) {
		const clones = src.map((o) => { const c = this.cloneObj(o); offsetObj(c, d); return c })
		const base = this.objects.length
		this.objects.push(...clones)
		this.clearSel()
		if (clones.length === 1) this.selectObj(base)
		else this.multi = clones.map((c) => c.id!)
		this.notify()
	}
	// ── object creation (place-tool; tap-to-place, plan view only for now) ──
	// `placing.pts` accumulates clicked points for a wall/conduit path; `cursor`
	// is the live point for the rubber-band preview. Prisms place on first click.
	placing = $state<{ kind: 'prism' | 'wall' | 'conduit'; pts: P3[]; cursor: P3 | null } | null>(null)
	activeLayer = $state<string | undefined>(undefined) // layer for new objects (else first non-background)
	private layerForNew() { return this.activeLayer ?? this.model?.layers?.find((l) => l.id !== 'background')?.id ?? this.model?.layers?.[0]?.id }
	get bgLocked() { return !!this.layerOverrides['background']?.locked }
	get bgHidden() { return !!this.layerOverrides['background']?.hidden }
	// Cursor → model point. The two in-plane axes (b.h, b.v) come from the cursor;
	// the depth axis (the third) defaults to the model's centre along it, so an item
	// placed in an elevation sits mid-depth rather than on a hidden plane at 0.
	private modelPt(e: MouseEvent): P3 | null {
		const c = this.at(e); if (!c) return null
		const b = BASIS[this.direction]
		const p: P3 = { x: 0, y: 0, z: 0 }
		;(p as any)[b.h] = Math.round(c.ch); (p as any)[b.v] = Math.round(c.cv)
		const depth = (['x', 'y', 'z'] as const).find((a) => a !== b.h && a !== b.v)
		if (depth && depth !== 'z') { const ctr = xyCenter(this.objects); (p as any)[depth] = Math.round(depth === 'x' ? ctr.cx : ctr.cy) || 0 }
		return p
	}

	startPlacing(kind: 'prism' | 'wall' | 'conduit') {
		if (this.direction === 'iso') return // can't place into the non-editable iso
		if (this.layerLocked(this.layerForNew())) { this.lockedToast(this.layerForNew()); return } // can't add to a locked layer
		this.clearSel()
		this.placing = { kind, pts: [], cursor: null }
	}

	// ── section tool: drag a rectangle on a plan → a clipped elevation viewport ──
	// `sectionMode` arms it; `sectionBox` is the live preview (model x,y). On
	// release the host's `onSection` callback spawns the elevation (it owns the
	// viewport list); z comes from the model so the cut spans the full height.
	sectionMode = $state(false)
	sectionBox = $state<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
	onSection: ((box: { x0: number; y0: number; x1: number; y1: number }) => void) | null = null
	startSectionMode() { if (this.direction === 'plan') { this.clearSel(); this.placing = null; this.sectionMode = true } }
	cancelSection = () => { this.sectionMode = false; this.sectionBox = null }

	// ── editable section markers on the plan (other viewports' clip boxes) ──
	// The host (plan viewport) supplies the sections + applies edits, since the
	// clip lives on *another* viewport's source.
	sectionsProvider: (() => { id: string; clip: Clip; label?: string }[]) | null = null
	onSectionChange: ((id: string, clip: Clip) => void) | null = null
	onSectionDelete: ((id: string) => void) | null = null
	get sections() { return this.direction === 'plan' ? (this.sectionsProvider?.() ?? []) : [] }
	startSectionMove = (e: MouseEvent, id: string) => {
		if (e.button !== 0) return
		e.stopPropagation()
		const s = this.sections.find((x) => x.id === id); if (!s) return
		const c0 = { ...s.clip }, w0 = this.modelPt(e); if (!w0) return
		this.startDrag((ev) => {
			const w = this.modelPt(ev); if (!w) return
			const dx = w.x - w0.x, dy = w.y - w0.y
			this.onSectionChange?.(id, { ...c0, x0: Math.round(c0.x0 + dx), x1: Math.round(c0.x1 + dx), y0: Math.round(c0.y0 + dy), y1: Math.round(c0.y1 + dy) })
		})
	}
	startSectionResize = (e: MouseEvent, id: string, xk: 'x0' | 'x1', yk: 'y0' | 'y1') => {
		if (e.button !== 0) return
		e.stopPropagation()
		const s = this.sections.find((x) => x.id === id); if (!s) return
		const c0 = { ...s.clip }
		this.startDrag((ev) => {
			const w = this.modelPt(ev); if (!w) return
			this.onSectionChange?.(id, { ...c0, [xk]: Math.round(w.x), [yk]: Math.round(w.y) })
		})
	}
	deleteSectionMarker = (id: string) => this.onSectionDelete?.(id)
	startSectionDraw = (e: MouseEvent) => {
		if (e.button !== 0 || this.direction !== 'plan') return
		e.stopPropagation()
		const p = this.modelPt(e); if (!p) return
		this.sectionBox = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }
		this.startDrag(
			(ev) => { const c = this.modelPt(ev); if (c && this.sectionBox) { this.sectionBox.x1 = c.x; this.sectionBox.y1 = c.y } },
			() => {
				const b = this.sectionBox
				this.sectionBox = null; this.sectionMode = false
				if (b && Math.abs(b.x1 - b.x0) > 50 && Math.abs(b.y1 - b.y0) > 50) this.onSection?.(b)
			},
		)
	}
	cancelPlacing = () => { this.placing = null }
	placeMove = (e: MouseEvent) => {
		if (!this.placing) return
		const p = this.modelPt(e); if (!p) return
		// Shift while drawing a wall/conduit: constrain the new segment to 15°.
		const last = this.placing.pts[this.placing.pts.length - 1]
		if (e.shiftKey && last && this.placing.kind !== 'prism') {
			const b = BASIS[this.direction], s = this.snap15((last as any)[b.h], (last as any)[b.v], (p as any)[b.h], (p as any)[b.v])
			;(p as any)[b.h] = Math.round(s.h); (p as any)[b.v] = Math.round(s.v)
		}
		this.placing.cursor = p
	}
	placeClick = (e: MouseEvent) => {
		if (e.button !== 0 || !this.placing || !this.model) return
		e.stopPropagation()
		const p = this.placing.cursor ?? this.modelPt(e); if (!p) return // honour the 15°-constrained preview point
		if (this.placing.kind === 'prism') {
			// Drag out the box: press = first corner, drag to size, release to create. The
			// two in-plane axes (b.h/b.v) take their size from the drag; the depth axis a default.
			this.placing.pts = [p]; this.placing.cursor = p
			this.startDrag(
				(ev) => { const c = this.modelPt(ev); if (c && this.placing) this.placing.cursor = c },
				() => {
					const s = this.placing?.pts[0], c = this.placing?.cursor ?? s
					if (s && c && this.model) {
						const b = BASIS[this.direction]
						const lo = (a: 'x' | 'y' | 'z') => Math.min((s as any)[a], (c as any)[a])
						const sz = (a: 'x' | 'y' | 'z') => Math.max(50, Math.abs((c as any)[a] - (s as any)[a]))
						const depth = (['x', 'y', 'z'] as const).find((a) => a !== b.h && a !== b.v)!
						const dim: any = { x: 'w', y: 'd', z: 'h' }
						const o: any = { type: 'prism', id: newId('o'), layer: this.layerForNew(), x: 0, y: 0, z: 0, w: 600, d: 600, h: 750, edges: 4 }
						for (const a of [b.h, b.v] as const) { o[a] = lo(a); o[dim[a]] = sz(a) }
						o[depth] = Math.round((s as any)[depth] - (depth === 'z' ? 0 : (o[dim[depth]] / 2))) // centre the default depth on the cursor (floor for z)
						this.objects.push(o)
						this.placing = null; this.selectObj(this.objects.length - 1); this.notify()
					} else { this.placing = null }
				},
			)
		} else {
			this.placing.pts.push(p) // wall/conduit: collect path points
		}
	}
	finishPlacing = () => {
		const pl = this.placing
		if (!pl || !this.model) { this.placing = null; return }
		if ((pl.kind === 'wall' || pl.kind === 'conduit') && pl.pts.length >= 2) {
			const g = polyToGraph(pl.pts)
			this.objects.push(pl.kind === 'wall'
				? { type: 'wall', id: newId('o'), layer: this.layerForNew(), h: 2800, thickness: 100, ...g }
				: { type: 'conduit', id: newId('o'), layer: this.layerForNew(), w: 80, h: 80, edges: 16, ...g })
			this.placing = null
			this.selectObj(this.objects.length - 1)
			this.notify()
		} else { this.placing = null }
	}

	duplicateSel = () => this.duplicateSelection(200) // Ctrl+D / panel: offset copy of the selection
	copySel = () => { this.clipboard = this.selIdxs().map((i) => structuredClone($state.snapshot(this.objects[i])) as Obj) }
	cutSel = () => { if (this.selIdxs().length) { this.copySel(); this.deleteSel() } }
	paste = () => { if (this.clipboard.length) this.addClones(this.clipboard, 200) }

	// ── marquee multi-select + group move (overrides SurfaceEditor hooks) ──
	multi = $state<string[]>([]) // selected object IDs
	inMulti(i: number) { return this.multi.includes(this.oid(i)) }
	hasMultiSel() { return this.multi.length > 0 }
	clearMulti() { this.multi = [] }
	protected currentMulti() { return this.multi }
	protected setMulti(ids: string[]) { this.multi = ids }
	protected clearAux() { this.vsel = null; this.usel = null; this.ssel = null }
	// Item primitives (by id) — the base's generic deleteSelection/duplicate* run over these.
	removeItems(ids: string[]) { const del = new Set(ids); if (this.model) this.model.objects = this.objects.filter((o) => del.has(o.id ?? '') ? this.locked(o) : true) }
	cloneItems(ids: string[], d = 0): string[] {
		const clones = ids.map((id) => this.byId(id)).filter(Boolean).map((o) => { const c = this.cloneObj(o as Obj); if (d) offsetObj(c, d); return c })
		this.objects.push(...clones); return clones.map((c) => c.id!)
	}
	/** Drop selection referencing objects that no longer exist (e.g. after an undo). */
	pruneSelection() { this.multi = this.multi.filter((id) => this.byId(id)); if (this.selObjId && !this.byId(this.selObjId)) super.clearSel() }

	marqueeCollect(r: { x: number; y: number; w: number; h: number }): void {
		super.clearSel(); this.vsel = null; this.usel = null // a marquee (or empty click) drops the single selection
		const piv = xyCenter(this.objects)
		const hit: number[] = []
		this.objects.forEach((o, i) => { if (!this.locked(o) && marqueeHits(o, this.direction, piv, r)) hit.push(i) }) // locked layers aren't selectable
		// Exactly one → single-select it (full handles + property editor); else multi (by id).
		if (hit.length === 1) this.selectObj(hit[0]); else this.multi = hit.map((i) => this.oid(i))
	}
	// Drag set keyed by id, so single + group drags share one snapshot/translate path.
	private groupSnap: Map<string, Obj> | null = null
	beginGroupTranslate(): void {
		this.groupSnap = new Map()
		for (const id of this.dragIds()) { const o = this.byId(id); if (o) this.groupSnap.set(id, structuredClone($state.snapshot(o)) as Obj) }
	}
	applyGroupTranslate(dwx: number, dwy: number): void {
		if (!this.groupSnap) return
		const b = BASIS[this.direction]
		const dch = Math.round(dwx * b.hs), dcv = Math.round(-dwy * b.vs)
		for (const id of this.dragIds()) {
			const o = this.byId(id), snap = this.groupSnap.get(id)
			if (!o || !snap || this.locked(o)) continue
			restorePos(o, snap)
			moveAlong(o, b.h, dch); moveAlong(o, b.v, dcv)
		}
	}

	clearSel() { super.clearSel(); this.vsel = null; this.usel = null; this.multi = []; this.ssel = null }
}

// Precise marquee hit-test: an object is selected when one of its *projected
// outline shapes* actually touches the rect (a vertex inside, an edge crossing,
// or the rect sitting inside a closed shape) — not merely a bbox overlap, so a
// small box on a conduit segment no longer catches a huge wall whose bbox spans
// the whole room.
type V2 = { x: number; y: number }
function marqueeHits(o: Obj, dir: Dir, piv: { cx: number; cy: number }, r: { x: number; y: number; w: number; h: number }) {
	const shapes = project(o, dir, DEFAULT_YAW, DEFAULT_PITCH, piv.cx, piv.cy)
	for (const s of shapes as { pts: { u: number; v: number }[]; closed: boolean }[]) {
		const pts = s.pts.map((p) => ({ x: p.u, y: -p.v }))
		if (rectHitsPoly(pts, s.closed, r)) return true
	}
	return false
}
function rectHitsPoly(pts: V2[], closed: boolean, r: { x: number; y: number; w: number; h: number }) {
	const x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h
	for (const p of pts) if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) return true // a vertex inside
	const rc: V2[] = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
	const n = pts.length, lim = closed ? n : n - 1
	for (let i = 0; i < lim; i++) { const a = pts[i], b = pts[(i + 1) % n]; for (let k = 0; k < 4; k++) if (segInt(a, b, rc[k], rc[(k + 1) % 4])) return true }
	return closed && pointInPoly(rc[0], pts) // rect sits inside a closed shape
}
function cross(o: V2, a: V2, b: V2) { return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x) }
function segInt(a: V2, b: V2, c: V2, d: V2) {
	const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d)
	return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}
function pointInPoly(pt: V2, pts: V2[]) {
	let inside = false
	for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
		const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y
		if ((yi > pt.y) !== (yj > pt.y) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) inside = !inside
	}
	return inside
}

// Offset an object by `d` mm in x and y (for duplicate/paste so copies are visible).
function offsetObj(o: Obj, d: number) { moveAlong(o, 'x', d); moveAlong(o, 'y', d) }

// Reset an object's position to a snapshot (before applying a group translate).
function restorePos(o: Obj, s: any) {
	if (o.type === 'prism') { o.x = s.x; o.y = s.y; o.z = s.z }
	else o.nodes.forEach((n, k) => { n.x = s.nodes[k].x; n.y = s.nodes[k].y; n.z = s.nodes[k].z })
}

// Delete a path node, rejoining its two neighbours (degree-2) so the run stays
// connected; otherwise just drop its incident segments. Returns false if absent.
function deleteNode(o: Conduit | Wall, nodeId: string): boolean {
	if (!o.nodes.some((n) => n.id === nodeId)) return false
	const inc = o.segments.filter((s) => s.a === nodeId || s.b === nodeId)
	o.segments = o.segments.filter((s) => !inc.includes(s))
	if (inc.length === 2) {
		const ends = inc.map((s) => (s.a === nodeId ? s.b : s.a))
		if (ends[0] !== ends[1]) o.segments.push({ ...inc[0], id: newId('s'), a: ends[0], b: ends[1] } as typeof o.segments[number])
	}
	o.nodes = o.nodes.filter((n) => n.id !== nodeId)
	return true
}
