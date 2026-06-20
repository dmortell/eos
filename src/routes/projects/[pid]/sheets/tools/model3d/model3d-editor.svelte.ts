import { SurfaceEditor } from '../../edit/surface.svelte'
import { BASIS, type Conduit, type Dir, type Model, type Obj, type Prism, type Wall } from './types'
import { moveAlong, objBounds, roundObj } from './projection'

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

	get objects(): Obj[] { return this.model?.objects ?? [] }
	get selIndex(): number | null { return this.sel?.kind === 'obj' ? +this.sel.id : null }
	isObj(i: number) { return this.sel?.kind === 'obj' && +this.sel.id === i }
	selectObj(i: number) { this.select('obj', String(i)); this.usel = null; this.multi = [] }

	// Conduit path point selection (for Delete / highlight).
	vsel = $state<{ index: number; vi: number } | null>(null)
	isVertex(i: number, vi: number) { return this.vsel?.index === i && this.vsel?.vi === vi }

	// Underlay selection (drag/resize its placement rect).
	usel = $state<string | null>(null)
	isUnderlay(id: string) { return this.usel === id }
	private underlay(id: string) { return this.model?.underlays?.find((u) => u.id === id) ?? null }
	selectUnderlay(id: string) { this.usel = id; super.clearSel(); this.vsel = null }

	startUnderlayMove = (e: MouseEvent, id: string) => {
		if (e.button !== 0) return // right/middle bubble up so the canvas pans
		e.stopPropagation()
		const u = this.underlay(id); if (!u?.rect) return
		this.selectUnderlay(id)
		const w0 = this.toWorld(e); if (!w0) return
		const r0 = { ...u.rect }
		this.startDrag((ev) => { const w = this.toWorld(ev); if (!w || !u.rect) return; u.rect.x = r0.x + (w.x - w0.x); u.rect.y = r0.y + (w.y - w0.y) }, () => this.notify())
	}
	startUnderlayResize = (e: MouseEvent, id: string, corner: string) => {
		if (e.button !== 0) return // right/middle bubble up so the canvas pans
		e.stopPropagation()
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
		const l = this.model?.layers?.find((x) => x.id === o.layer)
		return !!l?.locked
	}

	// ── object move (drag in the projected plane, whole-mm steps) ──
	startObjMove = (e: MouseEvent, index: number) => {
		if (e.button !== 0) return // right/middle bubble up so the canvas pans
		e.stopPropagation()
		const o = this.objects[index]
		if (!o || this.locked(o)) return
		if (this.inMulti(index)) { this.beginGroupDrag(e); return } // drag the whole marquee group
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
			} else if (o.type === 'wall' && handle.startsWith('p')) {
				if (this.direction === 'plan') { const k = +handle.slice(1); o.pts[k].x = c.u; o.pts[k].y = c.v }
				else o.h = Math.max(MIN, c.cv - o.z)
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
	private setPathPoint(o: Conduit | Wall, vi: number, ch: number, cv: number) {
		const b = BASIS[this.direction]
		if (o.type === 'conduit') { o.path[vi][b.h] = Math.round(ch); o.path[vi][b.v] = Math.round(cv) }
		else { o.pts[vi].x = Math.round(ch); o.pts[vi].y = Math.round(cv) } // wall, plan: ch=x, cv=y
	}
	private dragPathPoint(o: Conduit | Wall, vi: number) {
		this.startDrag((ev) => { const c = this.at(ev); if (c) this.setPathPoint(o, vi, c.ch, c.cv) }, () => this.notify())
	}
	startVertex = (e: MouseEvent, index: number, vi: number) => {
		if (e.button !== 0) return // right/middle bubble up so the canvas pans
		e.stopPropagation()
		const o = this.objects[index]
		if (!this.pathEditable(o)) return
		this.selectObj(index); this.vsel = { index, vi }
		this.dragPathPoint(o, vi)
	}
	startInsert = (e: MouseEvent, index: number, seg: number) => {
		if (e.button !== 0) return // right/middle bubble up so the canvas pans
		e.stopPropagation()
		const o = this.objects[index]
		if (!this.pathEditable(o)) return
		if (o.type === 'conduit') {
			const a = o.path[seg], b2 = o.path[seg + 1]
			o.path.splice(seg + 1, 0, { x: Math.round((a.x + b2.x) / 2), y: Math.round((a.y + b2.y) / 2), z: Math.round((a.z + b2.z) / 2) })
		} else {
			const a = o.pts[seg], b2 = o.pts[seg + 1]
			o.pts.splice(seg + 1, 0, { x: Math.round((a.x + b2.x) / 2), y: Math.round((a.y + b2.y) / 2) })
		}
		this.selectObj(index); this.vsel = { index, vi: seg + 1 }
		this.dragPathPoint(o, seg + 1)
	}
	startExtend = (e: MouseEvent, index: number, end: 'start' | 'end') => {
		if (e.button !== 0) return // right/middle bubble up so the canvas pans
		e.stopPropagation()
		const o = this.objects[index]
		if (!this.pathEditable(o)) return
		if (o.type === 'conduit') {
			const vi = end === 'end' ? o.path.length : 0
			o.path.splice(vi, 0, { ...o.path[end === 'end' ? o.path.length - 1 : 0] })
			this.selectObj(index); this.vsel = { index, vi }; this.dragPathPoint(o, vi)
		} else {
			const vi = end === 'end' ? o.pts.length : 0
			o.pts.splice(vi, 0, { ...o.pts[end === 'end' ? o.pts.length - 1 : 0] })
			this.selectObj(index); this.vsel = { index, vi }; this.dragPathPoint(o, vi)
		}
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
			if (o?.type === 'conduit' && o.path.length > 2) { o.path.splice(this.vsel.vi, 1); this.vsel = null; this.notify(); return }
			if (o?.type === 'wall' && o.pts.length > 2) { o.pts.splice(this.vsel.vi, 1); this.vsel = null; this.notify(); return }
		}
		const i = this.selIndex
		if (i !== null && this.objects[i] && !this.locked(this.objects[i])) {
			this.objects.splice(i, 1); this.clearSel(); this.vsel = null; this.notify()
		}
	}

	// ── marquee multi-select + group move (overrides SurfaceEditor hooks) ──
	multi = $state<number[]>([])
	inMulti(i: number) { return this.multi.includes(i) }
	hasMultiSel() { return this.multi.length > 0 }
	clearMulti() { this.multi = [] }

	// World-mm bounding box of an object's projected extent (for marquee hit-test).
	private worldBounds(o: Obj) {
		const b = BASIS[this.direction], bb = objBounds(o)
		let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
		for (const x of [bb.x0, bb.x1]) for (const y of [bb.y0, bb.y1]) for (const z of [bb.z0, bb.z1]) {
			const p = { x, y, z }, wx = b.hs * p[b.h], wy = -(b.vs * p[b.v])
			x0 = Math.min(x0, wx); x1 = Math.max(x1, wx); y0 = Math.min(y0, wy); y1 = Math.max(y1, wy)
		}
		return { x0, y0, x1, y1 }
	}
	marqueeCollect(r: { x: number; y: number; w: number; h: number }): void {
		super.clearSel(); this.vsel = null; this.usel = null // a marquee (or empty click) drops the single selection
		const hit: number[] = []
		this.objects.forEach((o, i) => {
			const wb = this.worldBounds(o)
			if (wb.x1 >= r.x && wb.x0 <= r.x + r.w && wb.y1 >= r.y && wb.y0 <= r.y + r.h) hit.push(i)
		})
		this.multi = hit
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

	clearSel() { super.clearSel(); this.vsel = null; this.usel = null; this.multi = [] }
}

// Reset an object's position to a snapshot (before applying a group translate).
function restorePos(o: Obj, s: any) {
	if (o.type === 'prism') { o.x = s.x; o.y = s.y; o.z = s.z }
	else if (o.type === 'wall') { o.z = s.z; o.pts.forEach((p, k) => { p.x = s.pts[k].x; p.y = s.pts[k].y }) }
	else o.path.forEach((p, k) => { p.x = s.path[k].x; p.y = s.path[k].y; p.z = s.path[k].z })
}
