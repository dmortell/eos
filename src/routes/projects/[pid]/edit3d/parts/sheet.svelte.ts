import { tick } from 'svelte'
import { nanoid } from 'nanoid'
import { BASIS, PAPER, MIN_FRAME, type Axis, type Conduit, type Dir, type Prism, type View } from './types'
import { moveAlong, roundObj, modelZRange, modelBounds, xyCenter, isoR, DEFAULT_YAW, DEFAULT_PITCH } from './projection'
import { models as initialModels, initialViews } from './data'
import type { Clip, Layer, Model, Obj } from './types'

/**
 * Reactive state + interaction logic for the A3 sheet.
 *
 * Coordinate spaces:
 *  - paper (mm): the SVG viewBox is `0 0 PAPER.w PAPER.h`.
 *  - screen (px): paper is shown via `translate(tx,ty) scale(zoom)`.
 *  - maximized model view uses a transient camera (mtx/mty/mzoom) that is
 *    NOT persisted to the view's stored viewport (mx/my/scale).
 */
export class Sheet {
	models = $state(initialModels)
	views = $state<View[]>(initialViews)

	// Page (paper) pan/zoom.
	tx = $state(40)
	ty = $state(40)
	zoom = $state(1.6) // px per paper-mm
	viewport = $state<HTMLDivElement>()

	// Selection / interaction state.
	selectedIds = $state<number[]>([1]) // selected viewport ids (supports multi-select)
	marquee = $state<{ x0: number; y0: number; x1: number; y1: number } | null>(null) // rubber-band box (paper mm)
	activeId = $state<number | null>(null) // view whose contents are interactive (dblclick)
	panViewId = $state<number | null>(null) // view in content pan/zoom mode
	selectedObj = $state<{ viewId: number; index: number } | null>(null)
	selectedVertex = $state<{ viewId: number; index: number; vi: number } | null>(null) // conduit path point
	maximizedId = $state<number | null>(null) // view filling the whole content area
	hiddenLines = $state(true) // iso view: occlude hidden edges (painter's algorithm)

	// Section tool: draw a rectangle on a plan to create a cropped elevation.
	drawingSection = $state(false)
	sectionPreview = $state<{ viewId: number; x0: number; y0: number; x1: number; y1: number } | null>(null)

	// Insert palette (which insertable is armed) + floating panels (View menu).
	insertMode = $state<string | null>(null)
	panels = $state<{ layers: boolean; outlets: boolean; trunks: boolean }>({ layers: false, outlets: false, trunks: false })

	// Firestore: shared models live at drawings/{pid}; views live per named sheet
	// at drawings/{pid}/sheets/{id}. (Wired in parts/persist.svelte.ts.)
	currentSheetId = $state<string>('')
	sheetName = $state<string>('')
	sheetList = $state<{ id: string; name: string }[]>([])

	// Transient maximize camera.
	mtx = $state(0)
	mty = $state(0)
	mzoom = $state(1)

	// Single-selection convenience: reads/writes the multi-select set.
	get selectedId() { return this.selectedIds.length === 1 ? this.selectedIds[0] : null }
	set selectedId(v: number | null) { this.selectedIds = v == null ? [] : [v] }

	get selected() { return this.views.find((v) => v.id === this.selectedId) ?? null }
	get maxView() { return this.views.find((v) => v.id === this.maximizedId) ?? null }
	// The selected view, if it's a clipped section/elevation (shows its marker on plans).
	get markerView() { const v = this.selected; return v?.clip ? v : null }

	// The currently selected object (only while its view is active), with context.
	get selectedObject() {
		if (!this.selectedObj || this.activeId !== this.selectedObj.viewId) return null
		const view = this.views.find((v) => v.id === this.selectedObj!.viewId)
		const obj = view && this.modelFor(view)?.objects[this.selectedObj.index]
		return view && obj ? { view, obj, index: this.selectedObj.index } : null
	}

	modelFor = (v: View) => this.models.find((m) => m.id === v.modelId)
	isSelected = (v: View) => this.selectedIds.includes(v.id)
	isOnlySelected = (v: View) => this.selectedIds.length === 1 && this.selectedIds[0] === v.id
	isActive = (v: View) => v.id === this.activeId
	isPanMode = (v: View) => v.id === this.panViewId

	// ---- Page canvas ----------------------------------------------------
	onCanvasPointerDown = (e: PointerEvent) => {
		if (e.button === 0) { this.startMarquee(e); return }
		this.maybePanPage(e)
	}

	// Left-drag on empty paper rubber-band-selects viewports; a plain click clears.
	startMarquee = (e: PointerEvent) => {
		const rect = this.viewport!.getBoundingClientRect()
		const toPaper = (ev: PointerEvent) => ({
			x: (ev.clientX - rect.left - this.tx) / this.zoom,
			y: (ev.clientY - rect.top - this.ty) / this.zoom,
		})
		const s = toPaper(e)
		this.panViewId = null
		this.selectedObj = null
		this.selectedVertex = null
		this.marquee = { x0: s.x, y0: s.y, x1: s.x, y1: s.y }
		let moved = false
		onDrag(
			(ev) => {
				const p = toPaper(ev)
				if (this.marquee) { this.marquee.x1 = p.x; this.marquee.y1 = p.y }
				if (Math.abs(p.x - s.x) * this.zoom > 3 || Math.abs(p.y - s.y) * this.zoom > 3) moved = true
			},
			() => {
				const m = this.marquee
				this.marquee = null
				this.activeId = null
				if (!moved || !m) { this.selectedIds = []; return }
				const x0 = Math.min(m.x0, m.x1), x1 = Math.max(m.x0, m.x1)
				const y0 = Math.min(m.y0, m.y1), y1 = Math.max(m.y0, m.y1)
				this.selectedIds = this.views
					.filter((v) => v.fx <= x1 && v.fx + v.fw >= x0 && v.fy <= y1 && v.fy + v.fh >= y0)
					.map((v) => v.id)
			},
		)
	}

	// Double-clicking outside the active view's frame deactivates it.
	onCanvasDblClick = (e: MouseEvent) => {
		const v = this.views.find((vw) => vw.id === this.activeId)
		if (!v || !this.viewport) return
		const rect = this.viewport.getBoundingClientRect()
		const px = (e.clientX - rect.left - this.tx) / this.zoom
		const py = (e.clientY - rect.top - this.ty) / this.zoom
		const inside = px >= v.fx && px <= v.fx + v.fw && py >= v.fy && py <= v.fy + v.fh
		if (!inside) {
			this.activeId = null
			this.selectedObj = null
		}
	}

	// Pan the page with right/middle button. Tracks incrementally so a
	// wheel-zoom mid-drag isn't discarded on the next move.
	maybePanPage = (e: PointerEvent) => {
		if (e.button !== 1 && e.button !== 2) return
		e.preventDefault()
		drag(e, (dx, dy) => { this.tx += dx; this.ty += dy })
	}

	onWheel = (e: WheelEvent) => {
		// Zoom the page with a modifier, or while a middle/right button is held.
		if (!(e.ctrlKey || e.metaKey || e.altKey || e.buttons & 6)) return
		e.preventDefault()
		const rect = this.viewport!.getBoundingClientRect()
		const px = e.clientX - rect.left
		const py = e.clientY - rect.top
		const nz = clamp(this.zoom * wheelFactor(e), 0.3, 8)
		// Keep the point under the cursor fixed.
		this.tx = px - (px - this.tx) * (nz / this.zoom)
		this.ty = py - (py - this.ty) * (nz / this.zoom)
		this.zoom = nz
	}

	zoomToFit = async () => {
		await tick()
		if (!this.viewport) return
		const rect = this.viewport.getBoundingClientRect()
		const pad = 40
		this.zoom = Math.min((rect.width - pad * 2) / PAPER.w, (rect.height - pad * 2) / PAPER.h)
		this.tx = (rect.width - PAPER.w * this.zoom) / 2
		this.ty = (rect.height - PAPER.h * this.zoom) / 2
	}

	// ---- View selection / modes ----------------------------------------
	activate = (v: View) => {
		this.selectedId = v.id
		this.activeId = v.id
		this.selectedObj = null
	}

	togglePan = (v: View) => {
		this.panViewId = this.panViewId === v.id ? null : v.id
		this.selectedObj = null
	}

	isObjectSelected = (v: View, index: number) =>
		this.selectedObj?.viewId === v.id && this.selectedObj?.index === index

	// ---- Insert palette / View panels ----------------------------------
	// Arm an insertable. Some are immediate (viewport), some are draw modes
	// (section), the rest are placeholders until implemented.
	arm = (kind: string) => {
		if (kind === 'viewport') { this.addViewport(); this.insertMode = null; this.drawingSection = false; return }
		const next = this.insertMode === kind ? null : kind
		this.insertMode = next
		this.drawingSection = next === 'section'
	}

	togglePanel = (k: 'layers' | 'outlets' | 'trunks') => { this.panels[k] = !this.panels[k] }

	// ---- Layers (model-scoped: color / visibility / lock) --------------
	// The model whose layers the Layers panel edits (selected view's, else first).
	get layerModel(): Model | null {
		return (this.selected && this.modelFor(this.selected)) ?? this.models[0] ?? null
	}

	// The layer an object belongs to (falls back to the model's first layer).
	objLayer(model: Model, o: Obj): Layer | null {
		const ls = model.layers
		if (!ls?.length) return null
		return ls.find((l) => l.id === o.layer) ?? ls[0]
	}
	isHidden = (model: Model, o: Obj) => this.objLayer(model, o)?.visible === false
	isLocked = (model: Model, o: Obj) => this.objLayer(model, o)?.locked === true
	colorOf = (model: Model, o: Obj) => this.objLayer(model, o)?.color ?? '#000000'

	addLayer = () => {
		const m = this.layerModel
		if (!m) return
		m.layers ??= []
		m.layers.push({ id: nanoid(6), name: `Layer ${m.layers.length + 1}`, color: '#111827', visible: true, locked: false })
	}

	removeLayer = (id: string) => {
		const m = this.layerModel
		if (!m?.layers || m.layers.length <= 1) return
		m.layers = m.layers.filter((l) => l.id !== id)
		const first = m.layers[0].id
		m.objects.forEach((o) => { if (o.layer === id) o.layer = first }) // reassign orphans
	}

	// Assign the selected object (and any object selected in an active view) to a layer.
	assignSelectedToLayer = (id: string) => {
		const sel = this.selectedObject
		if (sel) sel.obj.layer = id
	}

	// Insert a new viewport (a plan view of the selected view's model).
	addViewport = (direction: View['direction'] = 'plan') => {
		const model = this.selected ? this.modelFor(this.selected) : this.models[0]
		const modelId = model?.id ?? this.models[0]?.id ?? 1
		const id = Math.max(0, ...this.views.map((v) => v.id)) + 1
		const n = this.views.length
		const v: View = {
			id, modelId, name: `View ${id}`, direction,
			fx: 30 + (n % 4) * 8, fy: 30 + (n % 4) * 8, fw: 140, fh: 90, mx: -10, my: -10, scale: 1,
		}
		this.views.push(v)
		this.selectedId = id
		this.activeId = null
	}

	// ---- Section / elevation tool --------------------------------------
	toggleSectionDraw = () => { this.drawingSection = !this.drawingSection }

	// Drag a rectangle on a plan view; on release create a cropped elevation.
	startSectionDraw = (e: PointerEvent, plan: View) => {
		if (e.button !== 0) return
		e.stopPropagation()
		e.preventDefault()
		const s = this.drawingAt(e, plan) // plan: u=x, vv=y
		this.sectionPreview = { viewId: plan.id, x0: s.u, y0: s.vv, x1: s.u, y1: s.vv }
		onDrag(
			(ev) => { const c = this.drawingAt(ev, plan); if (this.sectionPreview) { this.sectionPreview.x1 = c.u; this.sectionPreview.y1 = c.vv } },
			() => {
				const p = this.sectionPreview
				this.sectionPreview = null
				this.drawingSection = false
				this.insertMode = null
				if (p && Math.abs(p.x1 - p.x0) > 50 && Math.abs(p.y1 - p.y0) > 50) this.createSectionView(plan, p)
			},
		)
	}

	createSectionView(plan: View, box: { x0: number; y0: number; x1: number; y1: number }) {
		const model = this.modelFor(plan)
		if (!model) return
		const { z0, z1 } = modelZRange(model.objects)
		const clip: Clip = {
			x0: Math.round(Math.min(box.x0, box.x1)), x1: Math.round(Math.max(box.x0, box.x1)),
			y0: Math.round(Math.min(box.y0, box.y1)), y1: Math.round(Math.max(box.y0, box.y1)),
			z0, z1,
		}
		const id = Math.max(0, ...this.views.map((v) => v.id)) + 1
		const n = this.views.filter((v) => v.clip).length
		const view: View = {
			id, modelId: plan.modelId, name: `Section ${id}`, direction: 'front',
			fx: 265 + n * 6, fy: 170 + n * 6, fw: 140, fh: 75, mx: 0, my: 0, scale: 1, clip,
		}
		this.views.push(view)
		this.fitView(view)
		this.selectedId = id
		this.activeId = null
	}

	// Change a view's projection direction and refit (the old pan/scale frames a
	// different axis pair, so a section usually lands off-screen otherwise).
	setDirection = (v: View, dir: Dir) => { v.direction = dir; this.fitView(v) }

	// Fit a view's pan/scale so its content fills the frame: the clip box if it's
	// a section, otherwise the whole model. Handles ortho and iso projection.
	fitView = (v: View) => {
		const model = this.modelFor(v)
		const bnds = v.clip ?? (model ? modelBounds(model.objects) : null)
		if (!model || !bnds) return
		const toUV: (p: { x: number; y: number; z: number }) => { u: number; v: number } =
			v.direction === 'iso'
				? (() => {
					const piv = xyCenter(model.objects)
					const yaw = v.yaw ?? DEFAULT_YAW, pitch = v.pitch ?? DEFAULT_PITCH
					return (p) => isoR(p, yaw, pitch, piv.cx, piv.cy)
				})()
				: (() => { const b = BASIS[v.direction]; return (p) => ({ u: b.hs * p[b.h], v: b.vs * p[b.v] }) })()

		const us: number[] = [], vs: number[] = []
		for (const x of [bnds.x0, bnds.x1]) for (const y of [bnds.y0, bnds.y1]) for (const z of [bnds.z0, bnds.z1]) {
			const q = toUV({ x, y, z }); us.push(q.u); vs.push(q.v)
		}
		const uMin = Math.min(...us), uMax = Math.max(...us), vMin = Math.min(...vs), vMax = Math.max(...vs)
		const scale = Math.min(v.fw / (uMax - uMin || 1), v.fh / (vMax - vMin || 1)) * 0.9
		v.scale = scale
		v.mx = (uMin + uMax) / 2 - v.fw / (2 * scale)
		v.my = (vMin + vMax) / 2 - v.fh / (2 * scale)
	}

	// Drag the section marker on a plan to move its clip (x,y), re-framing the elevation.
	startMarkerMove = (e: PointerEvent, plan: View, elev: View) => {
		if (e.button !== 0 || !elev.clip) return
		e.stopPropagation()
		e.preventDefault()
		this.selectedId = elev.id
		const c = elev.clip
		const o = { x0: c.x0, x1: c.x1, y0: c.y0, y1: c.y1 }
		const s = this.drawingAt(e, plan)
		onDrag((ev) => {
			const cur = this.drawingAt(ev, plan)
			const dx = Math.round(cur.u - s.u), dy = Math.round(cur.vv - s.vv)
			c.x0 = o.x0 + dx; c.x1 = o.x1 + dx; c.y0 = o.y0 + dy; c.y1 = o.y1 + dy
			this.fitView(elev)
		})
	}

	// Drag a marker corner: `xk`/`yk` say which clip edge moves.
	startMarkerResize = (e: PointerEvent, plan: View, elev: View, xk: 'x0' | 'x1', yk: 'y0' | 'y1') => {
		if (e.button !== 0 || !elev.clip) return
		e.stopPropagation()
		e.preventDefault()
		this.selectedId = elev.id
		const c = elev.clip
		onDrag((ev) => {
			const cur = this.drawingAt(ev, plan)
			c[xk] = Math.round(cur.u); c[yk] = Math.round(cur.vv)
			this.fitView(elev)
		})
	}

	// Paper coordinate under the cursor (paper canvas or maximized overlay).
	private paperPoint(e: PointerEvent | WheelEvent, v: View) {
		const rect = this.viewport!.getBoundingClientRect()
		if (this.maximizedId === v.id) {
			return {
				x: v.fx + (e.clientX - rect.left - this.mtx) / this.mzoom,
				y: v.fy + (e.clientY - rect.top - this.mty) / this.mzoom,
			}
		}
		return {
			x: (e.clientX - rect.left - this.tx) / this.zoom,
			y: (e.clientY - rect.top - this.ty) / this.zoom,
		}
	}

	// Drawing-plane (u,v) coordinate under the cursor (v points up).
	private drawingAt(e: PointerEvent | WheelEvent, v: View) {
		const p = this.paperPoint(e, v)
		return {
			u: v.mx + (p.x - v.fx) / v.scale,
			vv: v.my + (v.fy + v.fh - p.y) / v.scale,
		}
	}

	// Click selects; drag moves the object in the projected plane. Horizontal
	// drag edits the model axis shown horizontally, vertical the one shown up.
	startObjectMove = (e: PointerEvent, v: View, index: number) => {
		if (e.button !== 0) return
		e.stopPropagation()
		e.preventDefault()
		this.selectedObj = { viewId: v.id, index }
		this.selectedVertex = null
		const o = this.modelFor(v)?.objects[index]
		if (!o) return
		const b = BASIS[v.direction]
		const start = this.drawingAt(e, v)
		// Apply whole-mm steps relative to the start so a slow drag never stalls.
		let appliedH = 0, appliedV = 0
		onDrag((ev) => {
			const c = this.drawingAt(ev, v)
			const dh = Math.round((c.u - start.u) * b.hs)
			const dv = Math.round((c.vv - start.vv) * b.vs)
			moveAlong(o, b.h, dh - appliedH)
			moveAlong(o, b.v, dv - appliedV)
			appliedH = dh; appliedV = dv
		})
	}

	// Drag an object handle. Handles live in the projected plane; `handle`:
	// box corners 'box:<h0|h1>:<v0|v1>', polygon 'radius', wall vertex 'p<n>'.
	startObjectResize = (e: PointerEvent, v: View, index: number, handle: string) => {
		if (e.button !== 0) return
		e.stopPropagation()
		e.preventDefault()
		this.selectedObj = { viewId: v.id, index }
		const o = this.modelFor(v)?.objects[index]
		if (!o) return
		const b = BASIS[v.direction]
		const MIN = 1 // model mm
		onDrag((ev) => {
			const c = this.drawingAt(ev, v)
			const ch = c.u * b.hs, cv = c.vv * b.vs // cursor in model-axis coords

			if (o.type === 'wall' && handle.startsWith('p')) {
				if (v.direction === 'plan') { const k = +handle.slice(1); o.pts[k].x = c.u; o.pts[k].y = c.vv }
				else o.h = Math.max(MIN, cv - o.z)
			} else if (o.type === 'prism') {
				resizeBoxAxis(o, b.h, handle.includes('h1'), ch, MIN)
				resizeBoxAxis(o, b.v, handle.includes('v1'), cv, MIN)
			}
			roundObj(o)
		})
	}

	// ---- Conduit path editing ------------------------------------------
	// Drag a path point along the two visible axes (depth unchanged).
	private dragVertex(o: Conduit, vi: number, v: View) {
		const b = BASIS[v.direction]
		onDrag((ev) => {
			const c = this.drawingAt(ev, v)
			o.path[vi][b.h] = Math.round(c.u * b.hs)
			o.path[vi][b.v] = Math.round(c.vv * b.vs)
		})
	}

	startConduitVertex = (e: PointerEvent, v: View, index: number, vi: number) => {
		if (e.button !== 0) return
		e.stopPropagation()
		e.preventDefault()
		this.selectedObj = { viewId: v.id, index }
		this.selectedVertex = { viewId: v.id, index, vi }
		const o = this.modelFor(v)?.objects[index]
		if (o?.type === 'conduit') this.dragVertex(o, vi, v)
	}

	// Insert a vertex at a segment midpoint, then drag it.
	startInsert = (e: PointerEvent, v: View, index: number, seg: number) => {
		if (e.button !== 0) return
		e.stopPropagation()
		e.preventDefault()
		const o = this.modelFor(v)?.objects[index]
		if (o?.type !== 'conduit') return
		const a = o.path[seg], b2 = o.path[seg + 1]
		o.path.splice(seg + 1, 0, {
			x: Math.round((a.x + b2.x) / 2), y: Math.round((a.y + b2.y) / 2), z: Math.round((a.z + b2.z) / 2),
		})
		this.selectedObj = { viewId: v.id, index }
		this.selectedVertex = { viewId: v.id, index, vi: seg + 1 }
		this.dragVertex(o, seg + 1, v)
	}

	// Extend a new segment from an end vertex, then drag the new point.
	startExtend = (e: PointerEvent, v: View, index: number, end: 'start' | 'end') => {
		if (e.button !== 0) return
		e.stopPropagation()
		e.preventDefault()
		const o = this.modelFor(v)?.objects[index]
		if (o?.type !== 'conduit') return
		const vi = end === 'end' ? o.path.length : 0
		o.path.splice(vi, 0, { ...o.path[end === 'end' ? o.path.length - 1 : 0] })
		this.selectedObj = { viewId: v.id, index }
		this.selectedVertex = { viewId: v.id, index, vi }
		this.dragVertex(o, vi, v)
	}

	deleteSelectedVertex = () => {
		const sv = this.selectedVertex
		if (!sv) return
		const view = this.views.find((x) => x.id === sv.viewId)
		const o = view && this.modelFor(view)?.objects[sv.index]
		if (o?.type === 'conduit' && o.path.length > 2) {
			o.path.splice(sv.vi, 1)
			this.selectedVertex = null
		}
	}

	isVertexSelected = (v: View, index: number, vi: number) =>
		this.selectedVertex?.viewId === v.id && this.selectedVertex?.index === index && this.selectedVertex?.vi === vi

	onKeyDown = (e: KeyboardEvent) => {
		const t = e.target as HTMLElement | null
		if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
		if (e.key !== 'Delete' && e.key !== 'Backspace') return
		// Most-specific selection first: conduit vertex, then object, then viewports.
		if (this.selectedVertex) { e.preventDefault(); this.deleteSelectedVertex(); return }
		if (this.selectedObject) { e.preventDefault(); this.deleteSelectedObject(); return }
		if (this.selectedIds.length) { e.preventDefault(); this.deleteSelectedViews() }
	}

	// Delete the active view's selected object from its model.
	deleteSelectedObject = () => {
		const sel = this.selectedObject
		if (!sel) return
		const model = this.modelFor(sel.view)
		model?.objects.splice(sel.index, 1)
		this.selectedObj = null
		this.selectedVertex = null
	}

	// Delete the selected viewport(s) from the sheet.
	deleteSelectedViews = () => {
		if (!this.selectedIds.length) return
		const del = new Set(this.selectedIds)
		this.views = this.views.filter((v) => !del.has(v.id))
		if (this.maximizedId != null && del.has(this.maximizedId)) this.maximizedId = null
		if (this.activeId != null && del.has(this.activeId)) this.activeId = null
		this.selectedIds = []
		this.selectedObj = null
		this.selectedVertex = null
	}

	// ---- Move / resize the frame ---------------------------------------
	startFrameMove = (e: PointerEvent, v: View) => {
		if (e.button !== 0) return
		e.stopPropagation()
		e.preventDefault()
		this.selectedId = v.id
		drag(e, (dx, dy) => {
			v.fx += dx / this.zoom
			v.fy += dy / this.zoom
		})
	}

	// Drag a corner handle; the opposite corner stays put.
	startResize = (e: PointerEvent, v: View, corner: string) => {
		if (e.button !== 0) return
		e.stopPropagation()
		e.preventDefault()
		this.selectedId = v.id
		const sx = e.clientX, sy = e.clientY
		const left = v.fx, top = v.fy, right = v.fx + v.fw, bottom = v.fy + v.fh
		dragAbs(sx, sy, (tdx, tdy) => {
			const dx = tdx / this.zoom, dy = tdy / this.zoom
			let nl = left, nt = top, nr = right, nb = bottom
			if (corner.includes('w')) nl = Math.min(left + dx, right - MIN_FRAME)
			if (corner.includes('e')) nr = Math.max(right + dx, left + MIN_FRAME)
			if (corner.includes('n')) nt = Math.min(top + dy, bottom - MIN_FRAME)
			if (corner.includes('s')) nb = Math.max(bottom + dy, top + MIN_FRAME)
			v.fx = nl; v.fy = nt; v.fw = nr - nl; v.fh = nb - nt
		})
	}

	// ---- In-frame content pan/zoom (edits the view's stored viewport) ---
	startContentPan = (e: PointerEvent, v: View) => {
		if (e.button !== 0) return
		e.stopPropagation()
		e.preventDefault()
		const k = this.zoom * v.scale // screen px per drawing unit
		drag(e, (dx, dy) => {
			v.mx -= dx / k // pan horizontally
			v.my += dy / k // y-up: dragging down increases my
		})
	}

	contentZoom = (e: WheelEvent, v: View) => {
		e.preventDefault()
		e.stopPropagation()
		const at = this.drawingAt(e, v) // drawing coord under cursor (kept fixed)
		const p = this.paperPoint(e, v)
		v.scale = clamp(v.scale * wheelFactor(e), 0.002, 50)
		v.mx = at.u - (p.x - v.fx) / v.scale
		v.my = at.vv - (v.fy + v.fh - p.y) / v.scale
	}

	// Drag the iso view to orbit: horizontal = yaw (around vertical axis),
	// vertical = pitch (elevation). Pitch clamped to avoid flipping over.
	startIsoRotate = (e: PointerEvent, v: View) => {
		if (e.button !== 0) return
		e.stopPropagation()
		e.preventDefault()
		this.selectedId = v.id
		drag(e, (dx, dy) => {
			v.yaw = (v.yaw ?? DEFAULT_YAW) + dx * 0.01
			v.pitch = clamp((v.pitch ?? DEFAULT_PITCH) + dy * 0.01, 0.05, Math.PI / 2)
		})
	}

	// ---- Maximize (transient model-space camera) -----------------------
	toggleMax = (v: View) => {
		this.maximizedId = this.maximizedId === v.id ? null : v.id
		if (this.maximizedId) {
			this.selectedId = v.id
			this.activeId = v.id
			this.panViewId = null
			this.fitMax(v)
		}
	}

	// Fit the view's frame to the content area when entering maximize.
	fitMax = (v: View) => {
		const r = this.viewport!.getBoundingClientRect()
		const s = Math.min(r.width / v.fw, r.height / v.fh)
		this.mzoom = s
		this.mtx = (r.width - v.fw * s) / 2
		this.mty = (r.height - v.fh * s) / 2
	}

	maxPanStart = (e: PointerEvent) => {
		if (e.button !== 1 && e.button !== 2) return
		e.preventDefault()
		drag(e, (dx, dy) => { this.mtx += dx; this.mty += dy })
	}

	maxWheel = (e: WheelEvent) => {
		if (!(e.ctrlKey || e.metaKey || e.altKey || e.buttons & 6)) return
		e.preventDefault()
		e.stopPropagation() // don't also zoom the page underneath
		const r = this.viewport!.getBoundingClientRect()
		const px = e.clientX - r.left
		const py = e.clientY - r.top
		const nz = clamp(this.mzoom * wheelFactor(e), 0.002, 40)
		this.mtx = px - (px - this.mtx) * (nz / this.mzoom)
		this.mty = py - (py - this.mty) * (nz / this.mzoom)
		this.mzoom = nz
	}
}

// ---- Small shared helpers ----------------------------------------------
// Resize a cuboid along one model axis by dragging its near (far=false) or
// far (far=true) edge to `cursor`; the opposite edge stays put.
const BOX_DIM: Record<Axis, 'w' | 'd' | 'h'> = { x: 'w', y: 'd', z: 'h' }
function resizeBoxAxis(o: Prism, axis: Axis, far: boolean, cursor: number, min: number) {
	const dimKey = BOX_DIM[axis]
	let lo = o[axis], hi = o[axis] + o[dimKey]
	if (far) hi = Math.max(cursor, lo + min)
	else lo = Math.min(cursor, hi - min)
	o[axis] = lo
	o[dimKey] = hi - lo
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const wheelFactor = (e: WheelEvent) => (e.deltaY < 0 ? 1.1 : 1 / 1.1)

// Incremental pointer drag: calls `onMove` with per-frame screen deltas.
function drag(e: PointerEvent, onMove: (dx: number, dy: number) => void) {
	let lastX = e.clientX, lastY = e.clientY
	const move = (ev: PointerEvent) => {
		onMove(ev.clientX - lastX, ev.clientY - lastY)
		lastX = ev.clientX
		lastY = ev.clientY
	}
	const up = () => {
		window.removeEventListener('pointermove', move)
		window.removeEventListener('pointerup', up)
	}
	window.addEventListener('pointermove', move)
	window.addEventListener('pointerup', up)
}

// Absolute pointer drag: calls `onMove` with total screen deltas from the start.
function dragAbs(sx: number, sy: number, onMove: (dx: number, dy: number) => void) {
	const move = (ev: PointerEvent) => onMove(ev.clientX - sx, ev.clientY - sy)
	const up = () => {
		window.removeEventListener('pointermove', move)
		window.removeEventListener('pointerup', up)
	}
	window.addEventListener('pointermove', move)
	window.addEventListener('pointerup', up)
}

// Pointer drag passing the raw move event (for callers that re-map coordinates).
function onDrag(onMove: (ev: PointerEvent) => void, onEnd?: () => void) {
	const move = (ev: PointerEvent) => onMove(ev)
	const up = () => {
		window.removeEventListener('pointermove', move)
		window.removeEventListener('pointerup', up)
		onEnd?.()
	}
	window.addEventListener('pointermove', move)
	window.addEventListener('pointerup', up)
}
