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

	get objects(): Obj[] { return this.model?.objects ?? [] }
	get selIndex(): number | null { return this.sel?.kind === 'obj' ? +this.sel.id : null }
	isObj(i: number) { return this.sel?.kind === 'obj' && +this.sel.id === i }
	selectObj(i: number) { this.select('obj', String(i)); this.usel = null; this.multi = []; this.ssel = null }

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
		const name = this.model?.layers?.find((l) => l.id === o.layer)?.name ?? o.layer ?? 'layer'
		toast.warning(`Layer “${name}” is locked — unlock it in the Layers window to edit`)
		return true
	}

	// ── object move (drag in the projected plane, whole-mm steps) ──
	startObjMove = (e: MouseEvent, index: number) => {
		if (e.button !== 0) return // right/middle bubble up so the canvas pans
		e.stopPropagation()
		if (!this.objects[index]) return
		if (this.blockedByLock(this.objects[index])) return
		const dup = e.ctrlKey || e.metaKey // ctrl/⌘-drag duplicates the selection
		if (this.inMulti(index)) {
			if (dup) this.duplicateMulti()
			this.beginGroupDrag(e); return // drag the (possibly cloned) marquee group
		}
		if (dup) index = this.duplicateOne(index) // drag the CLONE, leaving the original
		const o = this.objects[index] // re-fetch after a possible duplicate
		this.selectObj(index); this.vsel = null
		const b = BASIS[this.direction]
		const s = this.at(e); if (!s) return
		let ah = 0, av = 0
		this.startDrag((ev) => {
			const c = this.at(ev); if (!c) return
			const dh = Math.round(c.ch - s.ch), dv = Math.round(c.cv - s.cv)
			moveAlong(o, b.h, dh - ah); moveAlong(o, b.v, dv - av)
			ah = dh; av = dv
		}, () => this.notify())
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

	// ── shared path editing for conduits (3D path) and walls (2D pts, plan only) ──
	// Walls reuse the same insert/extend/delete logic as conduits — a wall is just
	// a flat swept polyline (see merge-analysis.md: wall/conduit/trunk unification).
	private pathEditable(o: Obj | undefined): o is Conduit | Wall {
		return !!o && !this.locked(o) && (o.type === 'conduit' || (o.type === 'wall' && this.direction === 'plan'))
	}
	private node(o: Conduit | Wall, id: string) { return o.nodes.find((n) => n.id === id) }
	private dragNode(o: Conduit | Wall, id: string, onEnd?: () => void) {
		const b = BASIS[this.direction], n = this.node(o, id); if (!n) return
		this.startDrag((ev) => { const c = this.at(ev); if (c) { n[b.h] = Math.round(c.ch); n[b.v] = Math.round(c.cv) } }, () => { this.joinOnDrop(o, id); onEnd?.(); this.notify() })
	}
	// Join: if a dragged node is released on top of another node of the same object
	// (within a screen-distance snap), merge it into that node — reconnecting its
	// segments to form a junction (and dropping any self-loops / duplicate edges).
	private joinOnDrop(o: Conduit | Wall, id: string) {
		const n = this.node(o, id); if (!n) return
		const thr = 12 / (this.screenScale() || 1) // ~12px in world-mm
		const t = o.nodes.find((x) => x.id !== id && Math.hypot(x.x - n.x, x.y - n.y, x.z - n.z) <= thr)
		if (!t) return
		for (const s of o.segments) { if (s.a === id) s.a = t.id; if (s.b === id) s.b = t.id }
		o.segments = o.segments.filter((s) => s.a !== s.b) // drop collapsed self-loops
		const seen = new Set<string>() // drop duplicate edges
		o.segments = o.segments.filter((s) => { const k = [s.a, s.b].sort().join('|'); if (seen.has(k)) return false; seen.add(k); return true })
		o.nodes = o.nodes.filter((x) => x.id !== id)
		if (this.vsel?.nodeId === id) this.vsel = { index: this.vsel.index, nodeId: t.id }
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
	deleteSel = () => {
		if (this.multi.length) {
			const del = new Set(this.multi)
			if (this.model) this.model.objects = this.objects.filter((o, i) => del.has(i) ? this.locked(o) : true)
			this.multi = []; this.clearSel(); this.notify(); return
		}
		if (this.vsel) {
			const o = this.objects[this.vsel.index]
			if ((o?.type === 'conduit' || o?.type === 'wall') && o.nodes.length > 2 && deleteNode(o, this.vsel.nodeId)) {
				this.vsel = null; this.notify(); return
			}
		}
		const i = this.selIndex
		if (i !== null && this.objects[i] && !this.locked(this.objects[i])) {
			this.objects.splice(i, 1); this.clearSel(); this.vsel = null; this.notify()
		}
	}

	// ── duplicate / copy / paste (ctrl-drag, Ctrl+D/C/V, or panel buttons for touch) ──
	clipboard: Obj[] = []
	private selIdxs() { return this.multi.length ? [...this.multi] : this.selIndex !== null ? [this.selIndex] : [] }

	// ── multi-select common-property editing ──
	get multiObjs(): Obj[] { return this.multi.map((i) => this.objects[i]).filter(Boolean) }
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
	// Clone in place for a ctrl-drag (caller then drags the clones).
	private duplicateOne(index: number): number {
		this.objects.push(structuredClone($state.snapshot(this.objects[index])) as Obj)
		return this.objects.length - 1
	}
	private duplicateMulti() {
		const clones = this.multi.map((i) => structuredClone($state.snapshot(this.objects[i])) as Obj)
		const base = this.objects.length
		this.objects.push(...clones)
		this.multi = clones.map((_, k) => base + k)
	}
	// Add clones offset by `d` mm and select them (for Duplicate / Paste).
	private addClones(src: Obj[], d: number) {
		const clones = src.map((o) => { const c = structuredClone(o) as Obj; offsetObj(c, d); return c })
		const base = this.objects.length
		this.objects.push(...clones)
		this.clearSel()
		if (clones.length === 1) this.selectObj(base)
		else this.multi = clones.map((_, k) => base + k)
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
	private modelPt(e: MouseEvent): P3 | null { const c = this.at(e); return c ? { x: Math.round(c.ch), y: Math.round(c.cv), z: 0 } : null }

	startPlacing(kind: 'prism' | 'wall' | 'conduit') {
		if (this.direction !== 'plan') return // creation is planar for now
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
	placeMove = (e: MouseEvent) => { if (this.placing) { const p = this.modelPt(e); if (p) this.placing.cursor = p } }
	placeClick = (e: MouseEvent) => {
		if (e.button !== 0 || !this.placing || !this.model) return
		e.stopPropagation()
		const p = this.modelPt(e); if (!p) return
		if (this.placing.kind === 'prism') {
			// Drag out the footprint: press = first corner, drag to size, release to create.
			this.placing.pts = [p]; this.placing.cursor = p
			this.startDrag(
				(ev) => { const c = this.modelPt(ev); if (c && this.placing) this.placing.cursor = c },
				() => {
					const s = this.placing?.pts[0], c = this.placing?.cursor ?? s
					if (s && c && this.model) {
						const x0 = Math.min(s.x, c.x), y0 = Math.min(s.y, c.y)
						const w = Math.max(50, Math.abs(c.x - s.x)), d = Math.max(50, Math.abs(c.y - s.y))
						this.objects.push({ type: 'prism', layer: this.layerForNew(), x: x0, y: y0, z: 0, w, d, h: 750, edges: 4 })
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
				? { type: 'wall', layer: this.layerForNew(), h: 2800, thickness: 100, ...g }
				: { type: 'conduit', layer: this.layerForNew(), w: 80, h: 80, edges: 16, ...g })
			this.placing = null
			this.selectObj(this.objects.length - 1)
			this.notify()
		} else { this.placing = null }
	}

	duplicateSel = () => { const idxs = this.selIdxs(); if (idxs.length) this.addClones(idxs.map((i) => $state.snapshot(this.objects[i]) as Obj), 200) }
	copySel = () => { this.clipboard = this.selIdxs().map((i) => structuredClone($state.snapshot(this.objects[i])) as Obj) }
	cutSel = () => { if (this.selIdxs().length) { this.copySel(); this.deleteSel() } }
	paste = () => { if (this.clipboard.length) this.addClones(this.clipboard, 200) }

	// ── marquee multi-select + group move (overrides SurfaceEditor hooks) ──
	multi = $state<number[]>([])
	inMulti(i: number) { return this.multi.includes(i) }
	hasMultiSel() { return this.multi.length > 0 }
	clearMulti() { this.multi = [] }

	marqueeCollect(r: { x: number; y: number; w: number; h: number }): void {
		super.clearSel(); this.vsel = null; this.usel = null // a marquee (or empty click) drops the single selection
		const piv = xyCenter(this.objects)
		const hit: number[] = []
		this.objects.forEach((o, i) => { if (marqueeHits(o, this.direction, piv, r)) hit.push(i) })
		// Exactly one → single-select it (full handles + property editor); else multi.
		if (hit.length === 1) this.selectObj(hit[0]); else this.multi = hit
	}
	private groupSnap: Map<number, Obj> | null = null
	beginGroupTranslate(): void {
		this.groupSnap = new Map()
		for (const i of this.multi) this.groupSnap.set(i, structuredClone($state.snapshot(this.objects[i])) as Obj)
	}
	applyGroupTranslate(dwx: number, dwy: number): void {
		if (!this.groupSnap) return
		const b = BASIS[this.direction]
		const dch = Math.round(dwx * b.hs), dcv = Math.round(-dwy * b.vs)
		for (const i of this.multi) {
			const o = this.objects[i], snap = this.groupSnap.get(i)
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
