import { SurfaceEditor } from '../../edit/surface.svelte'
import { BASIS, type Conduit, type Dir, type Model, type Obj, type Prism } from './types'
import { moveAlong, roundObj } from './projection'

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
	selectObj(i: number) { this.select('obj', String(i)); this.usel = null }

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

	// ── conduit path editing ──
	private dragVertex(o: Conduit, vi: number) {
		const b = BASIS[this.direction]
		this.startDrag((ev) => {
			const c = this.at(ev); if (!c) return
			o.path[vi][b.h] = Math.round(c.ch); o.path[vi][b.v] = Math.round(c.cv)
		}, () => this.notify())
	}
	startVertex = (e: MouseEvent, index: number, vi: number) => {
		if (e.button !== 0) return // right/middle bubble up so the canvas pans
		e.stopPropagation()
		const o = this.objects[index]
		if (o?.type !== 'conduit' || this.locked(o)) return
		this.selectObj(index); this.vsel = { index, vi }
		this.dragVertex(o, vi)
	}
	startInsert = (e: MouseEvent, index: number, seg: number) => {
		if (e.button !== 0) return // right/middle bubble up so the canvas pans
		e.stopPropagation()
		const o = this.objects[index]
		if (o?.type !== 'conduit' || this.locked(o)) return
		const a = o.path[seg], b2 = o.path[seg + 1]
		o.path.splice(seg + 1, 0, { x: Math.round((a.x + b2.x) / 2), y: Math.round((a.y + b2.y) / 2), z: Math.round((a.z + b2.z) / 2) })
		this.selectObj(index); this.vsel = { index, vi: seg + 1 }
		this.dragVertex(o, seg + 1)
	}
	startExtend = (e: MouseEvent, index: number, end: 'start' | 'end') => {
		if (e.button !== 0) return // right/middle bubble up so the canvas pans
		e.stopPropagation()
		const o = this.objects[index]
		if (o?.type !== 'conduit' || this.locked(o)) return
		const vi = end === 'end' ? o.path.length : 0
		o.path.splice(vi, 0, { ...o.path[end === 'end' ? o.path.length - 1 : 0] })
		this.selectObj(index); this.vsel = { index, vi }
		this.dragVertex(o, vi)
	}

	// ── delete: selected conduit vertex first, else the selected object ──
	deleteSel = () => {
		if (this.vsel) {
			const o = this.objects[this.vsel.index]
			if (o?.type === 'conduit' && o.path.length > 2) { o.path.splice(this.vsel.vi, 1); this.vsel = null; this.notify(); return }
		}
		const i = this.selIndex
		if (i !== null && this.objects[i] && !this.locked(this.objects[i])) {
			this.objects.splice(i, 1); this.clearSel(); this.vsel = null; this.notify()
		}
	}

	clearSel() { super.clearSel(); this.vsel = null; this.usel = null }
}
