<script lang="ts">
	// Reusable viewport (kestrel-adoption mockup) with mock CAD drawing modeled on
	// KestrelCad2 (src/app.js acceptPoint / preview / prompts, src/model.js entity
	// types): click-to-place tools with a rubber-band preview, and Select-tool
	// hit-testing. Used inside a sheet's paper page (kind='floorplan') and as a
	// standalone model view (kind='model'). The parent owns the entities/selection
	// (so drawing persists per document, tool + selection per view). Fills its parent.
	import { Icon } from '$lib'
	import { tick } from 'svelte'
	import { panzoom } from './panzoom'
	import Handle from '../parts/Handle.svelte'
	import { BASE, HANDLE_PX } from '../constants'
	import { type Pt, type Ent, type View, type ElevDir, DEFAULT_BOX_H, GROUND, PT, MMPU, PLAN_CX, PLAN_CY, STYLE_DEFAULTS, ELEV_BASIS, elevU, elevUInv, flatSpan, dist, segDist, translate, textBox, boxElev, boxElevSet, boxFaces } from './geometry'
	import { isLayerHidden, isLayerLocked, layerColor } from '../layers.svelte'
	import Model3d from '../3dview/Model3d.svelte'
	import { models, modelSel, setModelSel } from '../3dview/models.svelte'
	import { polyToGraph } from '../3dview/migrate'
	import { DEFAULT_YAW, DEFAULT_PITCH } from '../3dview/projection'
	import type { Obj, Clip } from '../3dview/types'
	// Pure geometry now lives in ./geometry (testable, shared with PropertiesPanel); re-export the
	// entity types so existing `import { type Ent } from './Viewport.svelte'` sites keep working.
	export type { Pt, Ent, View } from './geometry'

	// Drafting/interaction flags are grouped into one `env` object, and all the event callbacks into
	// one `on` object, to keep the prop list small (a step toward a headless editor class — see
	// review.md §4.1). `frame` is only used by PaperPage; the Viewport ignores it.
	export type Env = { acad?: boolean; navContent?: boolean; grid?: boolean; lwt?: boolean; osnap?: boolean; snap?: boolean; ortho?: boolean; canvasZoom?: number }
	export type VpOn = {
		activate?: () => void; deactivate?: () => void; add?: (e: Ent) => void; update?: (e: Ent) => void;
		delete?: (ids: string[]) => void; select?: (ids: string[]) => void; view?: (v: View) => void;
		status?: (text: string) => void; coords?: (x: number, y: number) => void; beginedit?: () => void;
		endedit?: (debounceMs?: number) => void; tool?: (name: string) => void; frame?: (f: unknown) => void;
		copy?: (ids: string[]) => void; cut?: (ids: string[]) => void; paste?: () => void;
		group?: (ids: string[]) => void; ungroup?: (ids: string[]) => void;
		reorder?: (ids: string[], op: 'front' | 'back' | 'forward' | 'backward') => void;
		scale?: (s: string) => void; modeledit?: () => void; section?: (clip: Clip) => void; orbit?: (yaw: number, pitch: number) => void
	}
	let { label = 'Viewport', scale = '1:1', kind = 'floorplan', active = false, focused = true, tool = 'Select', boxW, boxH, border = 'dashed', env = {}, on = {},
		entities = [], sel = [], view = { zoom: 1, x: 0, y: 0 }, clip = null, yaw = DEFAULT_YAW, pitch = DEFAULT_PITCH }:
		{ label?: string; scale?: string; kind?: 'floorplan' | 'iso' | ElevDir; active?: boolean; tool?: string; boxW?: number; boxH?: number; border?: 'dashed' | 'solid' | 'none'; env?: Env; on?: VpOn;
			focused?: boolean; entities?: Ent[]; sel?: string[]; view?: View; clip?: Clip | null; yaw?: number; pitch?: number } = $props()
	// Callbacks are called directly as on.x?.(…) — no aliases (a $derived rename adds nothing for a
	// function that's only invoked). env flags stay derived because they're read as values.
	const acad = $derived(env.acad ?? true)
	const navContent = $derived(env.navContent ?? false)
	const grid = $derived(env.grid ?? true)
	const lwt = $derived(env.lwt ?? true)
	const osnap = $derived(env.osnap ?? true)
	const snap = $derived(env.snap ?? false)     // SNAP: round points to the grid step
	const ortho = $derived(env.ortho ?? false)   // ORTHO: constrain line-draw + move to H/V
	const canvasZoom = $derived(env.canvasZoom ?? 1)
	const SNAP_STEP = 100                         // grid snap spacing (mm)
	const snapToGrid = (p: Pt): Pt => [Math.round(p[0] / SNAP_STEP) * SNAP_STEP, Math.round(p[1] / SNAP_STEP) * SNAP_STEP]
	const orthoPt = (a: Pt, p: Pt): Pt => (Math.abs(p[0] - a[0]) >= Math.abs(p[1] - a[1]) ? [p[0], a[1]] : [a[0], p[1]])

	const tagIcon: Record<string, string> = { floorplan: 'mapPin', iso: 'box', front: 'server', rear: 'server', left: 'server', right: 'server' }
	// Elevation projection: which side view (front/rear/left/right) and its footprint axis + sign.
	const ELEV = new Set<string>(['front', 'rear', 'left', 'right'])
	const isElev = $derived(ELEV.has(kind))
	const elevDir = $derived((isElev ? kind : 'front') as ElevDir)
	// Project a footprint coordinate (along the current dir's axis) to the drawing horizontal, and back.
	const projU = (coord: number) => elevU(elevDir, coord, CX, CY)
	const projUInv = (u: number) => elevUInv(elevDir, u, CX, CY)
	const DRAW = new Set(['Line', 'Rectangle', 'Ellipse', 'Dimension', 'Text', 'Box', 'Wall', 'Furniture', 'Trunk', 'Pipe', 'Section', 'Opening'])
	// Polyline-style tools (click points, Enter/dbl-click to finish). Line makes an entity; Wall/Trunk/Pipe
	// build MODEL graph objects (plan only).
	const POLY = new Set(['Line', 'Wall', 'Trunk', 'Pipe'])
	const MODEL_GRAPH = new Set(['Wall', 'Trunk', 'Pipe'])   // build a wall/conduit graph (plan view)
	const MODEL_TOOL = new Set(['Wall', 'Trunk', 'Pipe', 'Furniture', 'Section', 'Opening'])   // plan-only model tools
	// Body-hover cursor: 'move' over a shape (drag to move), else default; grips carry their own
	// crosshair (they render on top, so their cursor wins over the container's).
	let hoverBody = $state(false)
	let cursorStyle = $derived(!active ? 'pointer' : DRAW.has(tool) ? 'crosshair' : hoverBody ? 'move' : 'default')

	// ── background mock content ──
	const desks: { x: number; y: number }[] = []
	for (let c = 0; c < 4; c++) for (let r = 0; r < 5; r++) desks.push({ x: 54 + c * 82, y: 44 + r * 38 })
	const DW = 56, DH = 26
	const outlets = desks.map((d, i) => ({ x: d.x + DW / 2, y: d.y + DH + 7, k: i % 4 === 0 ? 'p' : i % 4 === 2 ? 'a' : 'n' }))
	const outletColor: Record<string, string> = { p: '#f97316', n: '#3b82f6', a: '#10b981' }
	const IX = 205, IY = 70, SX = 1.15, SY = 0.58
	const pt = (x: number, y: number, z: number) => `${IX + (x - z) * SX},${IY + (x + z) * SY - y * 1.1}`
	function boxF(x: number, z: number, w: number, d: number, h: number) {
		return {
			top: `${pt(x, h, z)} ${pt(x + w, h, z)} ${pt(x + w, h, z + d)} ${pt(x, h, z + d)}`,
			left: `${pt(x, 0, z)} ${pt(x, h, z)} ${pt(x, h, z + d)} ${pt(x, 0, z + d)}`,
			right: `${pt(x, 0, z + d)} ${pt(x, h, z + d)} ${pt(x + w, h, z + d)} ${pt(x + w, 0, z + d)}`,
		}
	}
	const racks = [boxF(20, 10, 26, 46, 60), boxF(60, 10, 26, 46, 60), boxF(100, 10, 26, 46, 60), boxF(20, 80, 26, 46, 42)]
	const floorGrid: string[] = []
	for (let i = 0; i <= 6; i++) { floorGrid.push(`${pt(i * 24, 0, 0)} ${pt(i * 24, 0, 144)}`); floorGrid.push(`${pt(0, 0, i * 24)} ${pt(144, 0, i * 24)}`) }

	// ── drawing (Kestrel-style) ──
	const INK = '#475569', SEL = '#0e7490'
	let svg: SVGSVGElement | undefined = $state()   // outer svg (viewBox space)
	let draft = $state<Pt[]>([])
	let cur = $state<Pt | null>(null)
	let seq = 0
	const uid = () => 'e' + Date.now().toString(36) + (seq++)
	const selSet = $derived(new Set(sel))

	// Coordinate mapping uses getBoundingClientRect, NOT getScreenCTM: getScreenCTM ignores CSS
	// transforms on HTML ancestors, so it's wrong whenever the canvas is zoomed (its scale lives
	// in a CSS transform above this SVG). getBoundingClientRect reflects every ancestor transform,
	// so mapping stays correct at any canvas/viewport zoom.
	//
	// A viewport is a fixed-SCALE window into model space (like an AutoCAD viewport): BASE px on
	// screen = 1 model unit at zoom 1, whatever the frame size — so resizing the frame reveals/
	// crops more model rather than rescaling the drawing. The viewBox is sized to the container
	// (÷ BASE) and centred on the plan (CX,CY); the parent passes boxW/boxH when it owns the size
	// (a paper viewport frame — reliable), else we measure via bind:clientWidth (standalone
	// viewports). The mock drawing (0..400 × 0..250) sits at that fixed scale.
	const CX = PLAN_CX, CY = PLAN_CY   // plan centre in mm (viewBox centre + scale pivot)
	// Drawing SCALE (1:N) actually scales the content: a 1:10 view draws a 1000-unit object 100 units
	// wide. Applied about the plan centre so the view stays put. 1:1 = as-drawn (the default), so the
	// mock content is unaffected until you pick a scale. (Real mm sizing is the §4.2 refactor.)
	const dscale = $derived(1 / (parseInt((scale || '1:1').split(':')[1] || '1') || 1))
	let vpW = $state(0), vpH = $state(0)
	let vbW = $derived(((boxW ?? vpW) || 400) / BASE), vbH = $derived(((boxH ?? vpH) || 250) / BASE)
	let minX = $derived(CX - vbW / 2), minY = $derived(CY - vbH / 2)
	// viewBox → screen mapping (aspect matches the frame, so no letterboxing).
	function vbMap(): { scale: number; left: number; top: number } | null {
		if (!svg) return null
		const r = svg.getBoundingClientRect()
		return { scale: r.width / vbW, left: r.left, top: r.top }   // px per model unit (incl. canvas zoom)
	}
	function clientToVB(cx: number, cy: number): Pt | null {
		const m = vbMap(); if (!m) return null
		return [minX + (cx - m.left) / m.scale, minY + (cy - m.top) / m.scale]
	}
	// Client px → drawing (view-local) coords, for placing/hit-testing.
	function toLocalXY(cx: number, cy: number): Pt | null {
		const v = clientToVB(cx, cy); if (!v) return null
		return [CX + ((v[0] - view.x) / view.zoom - CX) / dscale, CY + ((v[1] - view.y) / view.zoom - CY) / dscale]
	}
	function toLocal(e: MouseEvent): Pt | null { return toLocalXY(e.clientX, e.clientY) }
	// Drawing (view-local) coords → client px, for handle hit-testing.
	function localToClient(x: number, y: number): { x: number; y: number } | null {
		const m = vbMap(); if (!m) return null
		const vx = view.x + view.zoom * (CX + dscale * (x - CX)), vy = view.y + view.zoom * (CY + dscale * (y - CY))
		return { x: m.left + (vx - minX) * m.scale, y: m.top + (vy - minY) * m.scale }
	}
	// ── pan/zoom the viewport content (SVG group transform, in viewBox units) ──
	function onPan(dx: number, dy: number) {
		const m = vbMap(); if (!m) return
		on.view?.({ zoom: view.zoom, x: view.x + dx / m.scale, y: view.y + dy / m.scale })
	}
	function onZoom(f: number, cx: number, cy: number) {
		// Pan-content mode: zooming re-SCALES the view (like a CAD viewport) rather than free-zooming —
		// fold the zoom into the drawing scale and keep the cursor's model point fixed.
		if (on.scale) {
			const p = toLocalXY(cx, cy); if (!p) return
			const denom = parseInt((scale || '1:1').split(':')[1] || '1') || 1
			const nd = Math.round(Math.min(2000, Math.max(1, denom / f)))
			if (nd === denom) return
			const ods = dscale, nds = 1 / nd
			on.view?.({ zoom: view.zoom, x: view.x + view.zoom * (ods - nds) * (p[0] - CX), y: view.y + view.zoom * (ods - nds) * (p[1] - CY) })
			on.scale('1:' + nd)
			return
		}
		const v = clientToVB(cx, cy); if (!v) return   // cursor in viewBox coords
		const nz = Math.min(8, Math.max(0.25, view.zoom * f)), r = nz / view.zoom
		on.view?.({ zoom: nz, x: v[0] - (v[0] - view.x) * r, y: v[1] - (v[1] - view.y) * r })
	}
	// panzoom passes its node as a trailing arg (unused here)
	// Shift-constrain the drawing point relative to the start: rectangle → square, line/dim →
	// 15° angle increments (which includes ortho), circle → free radius.
	function constrainPt(a: Pt, p: Pt, shift: boolean): Pt {
		if (!shift) return p
		const dx = p[0] - a[0], dy = p[1] - a[1]
		if (tool === 'Rectangle' || tool === 'Ellipse' || tool === 'Box') {   // Shift → square bbox (a circle for the ellipse)
			const s = Math.max(Math.abs(dx), Math.abs(dy))
			return [a[0] + (dx < 0 ? -s : s), a[1] + (dy < 0 ? -s : s)]
		}
		if (tool === 'Line' || tool === 'Dimension') {
			const len = Math.hypot(dx, dy), step = Math.PI / 12   // 15°
			const ang = Math.round(Math.atan2(dy, dx) / step) * step
			return [a[0] + len * Math.cos(ang), a[1] + len * Math.sin(ang)]
		}
		return p
	}
	// Objects drawn in an elevation view are NATIVE to that elevation (space = the dir); a box stays
	// plan-space (it's a 3D footprint) and projects like normal.
	const drawSpace = () => (isElev ? elevDir : undefined)
	function place(a: Pt, b: Pt) {
		const sp = drawSpace()
		if (tool === 'Line') on.add?.({ id: uid(), type: 'line', a, b, space: sp })
		else if (tool === 'Rectangle') on.add?.({ id: uid(), type: 'rect', a, b, space: sp })
		else if (tool === 'Ellipse') on.add?.({ id: uid(), type: 'ellipse', a, b, space: sp })
		else if (tool === 'Box') on.add?.({ id: uid(), type: 'box', a, b, h: DEFAULT_BOX_H })
		else if (tool === 'Furniture' && isPlan) placePrism(a, b, 'furniture', 750, 'f')   // MODEL prism footprint
		else if (tool === 'Opening' && isPlan) placePrism(a, b, 'openings', 2100, 'o')      // door/window/hole (dashed outline)
		else if (tool === 'Section' && isPlan && mdl) {   // §4 — clip box on the plan → spawn a front elevation
			on.section?.({ x0: Math.round(Math.min(a[0], b[0])), y0: Math.round(Math.min(a[1], b[1])), z0: 0,
				x1: Math.round(Math.max(a[0], b[0])), y1: Math.round(Math.max(a[1], b[1])), z1: mdl.levels?.ceilingSlab ?? 3200 })
		}
		else if (tool === 'Dimension') on.add?.({ id: uid(), type: 'dim', a, b, space: sp })
	}
	// The Line tool draws a POLYLINE in AutoCAD mode: keep clicking to add segments, Enter /
	// double-click / right-click to finish (Esc cancels). (EOS press-drag = a single segment.)
	function finishPolyline() {
		let pts = draft
		while (pts.length >= 2 && dist(pts.at(-1)!, pts.at(-2)!) < 0.01) pts = pts.slice(0, -1)   // drop the double-click's zero-length tail
		if (tool === 'Line' && pts.length >= 2) on.add?.({ id: uid(), type: 'polyline', pts: pts.map(p => [...p] as Pt), space: drawSpace() })
		else if (MODEL_GRAPH.has(tool) && pts.length >= 2 && isPlan) placeGraph(pts)   // Wall / Trunk / Pipe
		draft = []; cur = null; snapMark = null
	}
	function onClick(e: MouseEvent) {
		e.stopPropagation()
		if (suppressClick) { suppressClick = false; return }   // this click just ended a drag
		if (!active) return   // paper space: enter with a double-click (see onDblclick)
		if (tool === 'Select') {
			const p = toLocal(e); if (!p) return
			const g = expandGroup(hit(p))   // the clicked entity + any group it belongs to
			if (e.shiftKey || e.ctrlKey || e.metaKey) {   // additive: toggle the whole group
				if (g.length) { const allSel = g.every(x => selSet.has(x)); on.select?.(allSel ? sel.filter(x => !g.includes(x)) : [...new Set([...sel, ...g])]) }
			} else {
				// entity click wins; else a model object; else clear both (empty click).
				if (g.length) { on.select?.(g); setModelSel([]) }
				else { const mid = hitModel(p); if (mid) { setModelSel([mid]); on.select?.([]) } else { on.select?.([]); setModelSel([]) } }
			}
			return
		}
		if (tool === 'Text') { const p = drawPoint(e.clientX, e.clientY); if (p) on.add?.({ id: uid(), type: 'text', a: p, text: 'TEXT', space: drawSpace() }); snapMark = null; return }
		if (MODEL_TOOL.has(tool) && !isPlan) return   // model objects are placed in the plan view
		if (!acad) return   // EOS mode: shapes are drawn press-drag (onDown), not by clicking
		const sp = drawPoint(e.clientX, e.clientY, draft.at(-1), e.shiftKey); if (!sp) return
		if (POLY.has(tool)) { if (!draft.length || dist(draft.at(-1)!, sp) > 0.01) draft = [...draft, sp]; cur = sp; snapMark = null; return }   // polyline / wall / trunk / pipe run: accumulate (skip dup)
		// other tools: two clicks — first corner, then the (snapped/Shift-constrained) opposite one.
		// Seed `cur` to the first corner so the rubber-band starts zero-size (else it flashes from the
		// PREVIOUS shape's last point until the next mousemove updates cur).
		if (!draft.length) { draft = [sp]; cur = sp; snapMark = null; return }
		place(draft[0], sp)
		draft = []; cur = null; snapMark = null
	}
	let lastRaw: Pt | null = null   // last UNconstrained pointer during a draft (for re-constraining on Shift)
	function onMove(e: MouseEvent) {
		if (on.coords) { const wp = toLocalXY(e.clientX, e.clientY); if (wp) on.coords(Math.round(wp[0]), Math.round(wp[1])) }   // world (model-unit) coords for the status bar
		if (active && draft.length) { const sp = drawPoint(e.clientX, e.clientY, draft.at(-1), e.shiftKey); if (sp) { lastRaw = toLocalXY(e.clientX, e.clientY); cur = sp } }
		else if (active && osnap && DRAW.has(tool)) findSnap(e.clientX, e.clientY)   // show snap marker before the first click (DRAW excludes Select)
		// hover feedback for the Select tool: 'move' when over a shape body (a grip shows its own cursor)
		if (active && tool === 'Select' && !drag && !mDrag && !draft.length && !marquee) {
			const lp = toLocalXY(e.clientX, e.clientY)
			hoverBody = !!lp && (hit(lp).length > 0 || !!hitModel(lp))
		} else hoverBody = false
	}
	// Re-apply the constraint the instant Shift changes (don't wait for a pointer move) — for
	// both an in-progress draw and an in-progress move/grip drag.
	function reconstrain(shift: boolean) {
		if (drag && lastDragRaw) {
			if (drag.kind === 'grip') on.update?.(applyDrag(lastDragRaw, shift))
			else { let dx = lastDragRaw[0] - drag.start[0], dy = lastDragRaw[1] - drag.start[1]; if (shift !== ortho) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0 } for (const b of drag.bases) on.update?.(moveEnt(b, dx, dy)) }
		} else if (active && draft.length && lastRaw) cur = constrainPt(draft.at(-1)!, lastRaw, shift)
	}
	// Double-click: outside a viewport → enter model space; inside an active viewport, on a
	// TEXT object → edit it in place.
	function onDblclick(e: MouseEvent) {
		e.stopPropagation()
		if (!active) { on.activate?.(); return }
		if (POLY.has(tool) && draft.length) { finishPolyline(); return }   // double-click ends a polyline / wall / trunk / pipe
		const p = toLocal(e); if (!p) return
		const ent = entities.find(x => x.id === hit(p)[0])
		if (ent?.type === 'text') { startTextEdit(ent); return }
		if (tool === 'Select' && isPlan) insertGraphNode(p)   // dbl-click a wall/conduit segment → add a vertex
	}
	// ── edit text in place ──
	let editText = $state<{ id: string; x: number; y: number; fontPx: number; value: string } | null>(null)
	let textInput: HTMLTextAreaElement | undefined = $state()
	function startTextEdit(ent: Ent) {
		if (!vpW || !vpH) return
		// Position + font in .vp-LOCAL px (pre canvas-CSS-transform), so the transform scales the
		// editor exactly like the SVG text — it stays glued to the object at any zoom/pan (screen-px
		// math double-applied the canvas zoom, so the box floated off and ballooned when zoomed in).
		const vbx = view.x + view.zoom * (CX + dscale * (ent.a![0] - CX)), vby = view.y + view.zoom * (CY + dscale * (ent.a![1] - CY))
		const x = (vbx - minX) / vbW * vpW, y = (vby - minY) / vbH * vpH
		const fontPx = (ent.fontPt ?? STYLE_DEFAULTS.fontPt) * PT * view.zoom * (vpW / vbW) * dscale
		editText = { id: ent.id, x, y, fontPx, value: ent.text ?? '' }
		tick().then(() => { textInput?.focus(); textInput?.select() })
	}
	function commitText() {
		if (!editText) return
		const ent = entities.find(x => x.id === editText!.id)
		if (ent) on.update?.({ ...ent, text: editText.value })
		editText = null
	}
	// Note: right-button is reserved for pan/zoom (incl. mid-draw, to reach a far
	// endpoint), so it must NOT cancel the draft. Esc cancels an in-progress draw.
	// Esc ladder (CAD-style): cancel an in-progress draw → clear selection → exit viewport.
	// True when the keystroke is going into a form field (sidebar Properties inputs, etc.) — the
	// viewport must NOT then treat Delete/Backspace/Ctrl-C… as canvas commands and nuke the selection.
	const isTypingTarget = (el: EventTarget | null) => { const n = el as HTMLElement | null; if (!n?.tagName) return false; const t = n.tagName; return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || n.isContentEditable }
	function onKey(e: KeyboardEvent) {
		if (!active || !focused || editText) return   // in split view only the focused pane's instance handles keys
		if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return   // typing in a field → let it through
		if (e.key === 'Shift') { reconstrain(true); return }
		if (e.key === 'Enter' && POLY.has(tool) && draft.length) { e.preventDefault(); finishPolyline(); return }   // finish polyline / wall / trunk / pipe
		if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); on.select?.(entities.map(x => x.id)); return }   // select all
		if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D') && sel.length) {   // duplicate (offset +8,+8)
			e.preventDefault()
			const copies = sel.map(id => entities.find(x => x.id === id)).filter(Boolean).map(en => ({ ...translate(en!, 8, 8), id: uid() }))
			copies.forEach(c => on.add?.(c)); on.select?.(copies.map(c => c.id))
			return
		}
		if (e.ctrlKey || e.metaKey) {   // clipboard + grouping + draw order
			// draw order: Ctrl+] forward · Ctrl+[ backward · +Shift = to front / back
			if ((e.key === ']' || e.key === '}') && sel.length) { e.preventDefault(); on.reorder?.(sel, e.shiftKey ? 'front' : 'forward'); return }
			if ((e.key === '[' || e.key === '{') && sel.length) { e.preventDefault(); on.reorder?.(sel, e.shiftKey ? 'back' : 'backward'); return }
			const k = e.key.toLowerCase()
			if (k === 'c' && sel.length) { e.preventDefault(); on.copy?.(sel); return }
			if (k === 'x' && sel.length) { e.preventDefault(); on.cut?.(sel); return }
			if (k === 'v') { e.preventDefault(); on.paste?.(); return }
			if (k === 'g' && !e.shiftKey && sel.length) { e.preventDefault(); on.group?.(sel); return }
			if (k === 'g' && e.shiftKey && sel.length) { e.preventDefault(); on.ungroup?.(sel); return }
		}
		if ((e.key === 'Delete' || e.key === 'Backspace') && sel.length && !draft.length) { e.preventDefault(); on.delete?.(sel); return }
		if ((e.key === 'Delete' || e.key === 'Backspace') && modelSel.length && !draft.length) { e.preventDefault(); deleteModelSel(); return }
		if (sel.length && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
			e.preventDefault()
			const s = e.shiftKey ? 10 : 1
			const dx = e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0
			const dy = e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0
			on.beginedit?.()   // coalesce a nudge burst into one history step (closes 600ms after the last)
			for (const id of sel) { const en = entities.find(x => x.id === id); if (en) on.update?.(moveEnt(en, dx, dy)) }
			on.endedit?.(600)
			return
		}
		if (e.key !== 'Escape') return
		// Esc ladder: cancel a draft → switch a drawing tool back to Select → clear selection → exit.
		if (draft.length) { draft = []; cur = null; snapMark = null }
		else if (tool !== 'Select') on.tool?.('Select')
		else if (sel.length) on.select?.([])
		else on.deactivate?.()
	}

	// hit-test (topmost first). segDist/textBox/boxElev live in ./geometry.
	// Flat (z=0, no height) objects that project to an edge-on ground line in elevation.
	const FLAT = new Set(['line', 'polyline', 'dim', 'rect', 'ellipse', 'circle'])
	// Object SPACE (v1 — per-view annotations, like the Sheets tool): 'plan'/undefined = model/plan
	// space (projected into every elevation, layer-gated); an ElevDir = drawn natively in that
	// elevation only (a wall/rack label, a leader, a dimension), rendered as-is there and hidden in
	// other views. The full 3D-position/construction-plane model (project onto x/y/z planes, oriented
	// per view) is a later upgrade — see todo §2.
	const isPlanSpace = (e: Ent) => !e.space || e.space === 'plan'
	const inThisView = (e: Ent) => isPlanSpace(e) || e.space === kind
	const isFlatElev = (e: Ent) => isElev && FLAT.has(e.type) && isPlanSpace(e)   // only floor flats collapse to the ground line
	// Horizontal drawing span of a flat object projected onto the ground line for the current side view.
	function flatXSpan(e: Ent): [number, number] { return flatSpan(e, elevDir, CX, CY) }
	// Rotation (degrees, about the entity's view-bbox centre): render, hit and grips all honour it.
	// bbox() returns the UNrotated extent, so its centre is the correct pivot.
	const rotCenter = (e: Ent): Pt => { const [x0, y0, x1, y1] = bbox(e); return [(x0 + x1) / 2, (y0 + y1) / 2] }
	function rotatePt(p: Pt, c: Pt, deg: number): Pt { const a = deg * Math.PI / 180, s = Math.sin(a), co = Math.cos(a), dx = p[0] - c[0], dy = p[1] - c[1]; return [c[0] + dx * co - dy * s, c[1] + dx * s + dy * co] }
	function hitEnt(e: Ent, p: Pt, thr: number): boolean {
		if (e.rot) p = rotatePt(p, rotCenter(e), -e.rot)   // test in the entity's un-rotated frame
		if (isFlatElev(e)) { const [x0, x1] = flatXSpan(e); return segDist(p, [x0, GROUND], [x1, GROUND]) < thr }
		if (e.type === 'polyline') { const pts = e.pts ?? []; for (let i = 0; i + 1 < pts.length; i++) if (segDist(p, pts[i], pts[i + 1]) < thr) return true; return false }
		if (e.type === 'line' || e.type === 'dim') return segDist(p, e.a!, e.b!) < thr
		if (e.type === 'box' && isElev) { const f = boxElev(e, elevDir, CX, CY); return p[0] >= f.x0 - thr && p[0] <= f.x1 + thr && p[1] >= f.top - thr && p[1] <= f.base + thr }
		if (e.type === 'rect' || e.type === 'box') { const x0 = Math.min(e.a![0], e.b![0]), y0 = Math.min(e.a![1], e.b![1]), x1 = Math.max(e.a![0], e.b![0]), y1 = Math.max(e.a![1], e.b![1]); return p[0] >= x0 - thr && p[0] <= x1 + thr && p[1] >= y0 - thr && p[1] <= y1 + thr }
		if (e.type === 'circle') return dist(e.c!, p) <= e.r! + thr
		if (e.type === 'ellipse') {
			const cx = (e.a![0] + e.b![0]) / 2, cy = (e.a![1] + e.b![1]) / 2
			const rx = Math.abs(e.b![0] - e.a![0]) / 2 + thr, ry = Math.abs(e.b![1] - e.a![1]) / 2 + thr
			const nx = (p[0] - cx) / (rx || 1), ny = (p[1] - cy) / (ry || 1)
			return nx * nx + ny * ny <= 1
		}
		if (e.type === 'text') { const [x0, y0, x1, y1] = textBox(e); return p[0] >= x0 - thr && p[0] <= x1 + thr && p[1] >= y0 - thr && p[1] <= y1 + thr }
		return false
	}
	// Pick tolerance in MODEL units for a target of `px` screen pixels (px of slack around a line
	// edge). 8 model units was huge at scale — this keeps it a few px whatever the zoom.
	function hitTol(px: number): number {
		const m = vbMap()
		return m ? px / (view.zoom * m.scale) : px
	}
	// A hidden or locked layer's objects can't be picked; nor can objects that don't belong to this view.
	const pickable = (e: Ent) => inThisView(e) && !isLayerHidden(e.layer) && !isLayerLocked(e.layer)
	function hit(p: Pt): string[] {
		const thr = hitTol(7)
		for (let i = entities.length - 1; i >= 0; i--) if (pickable(entities[i]) && hitEnt(entities[i], p, thr)) return [entities[i].id]
		return []
	}
	// Expand a set of ids to include every member of any group they touch (a group selects as one).
	function expandGroup(ids: string[]): string[] {
		const gids = new Set(ids.map(id => entities.find(e => e.id === id)?.groupId).filter(Boolean) as string[])
		if (!gids.size) return ids
		const out = new Set(ids)
		for (const e of entities) if (e.groupId && gids.has(e.groupId)) out.add(e.id)
		return [...out]
	}

	// ── 3D MODEL editing (P2) ──
	// The floor MODEL (walls/prisms/conduits, 3dview/) renders read-mostly via <Model3d>; P2a/P2b add
	// PICK + MOVE for prisms in the PLAN *and* the four ELEVATION views. Selection is the shared
	// `modelSel` (global to the model for now); moves mutate the `models` store directly. Editing uses
	// the SAME projection Pages entities use — plan footprint, or elevation via `projU`/ELEV_BASIS +
	// GROUND — so a prism picks/moves exactly where <Model3d> draws it. (Iso editing + walls/conduits +
	// undo are the next slices — see model-plan.md P2.)
	const mdl = $derived(models[0])
	const isPlan = $derived(kind === 'floorplan')
	const modelEditable = $derived(isPlan || isElev)   // iso (oblique) editing deferred to the 3D camera
	const modelLayerVisible = (o: Obj) => { const l = mdl?.layers?.find(x => x.id === o.layer); return !l || l.visible }
	// A prism's drawing-space AABB in the CURRENT view: plan = footprint [x..x+w]×[y..y+d]; elevation =
	// silhouette face (its on-axis extent projected via projU, standing on GROUND from z to z+h). Matches
	// Model3d + the entity-box convention (boxElev). null for non-prisms / non-editable views.
	function prismRect(o: Obj): { x0: number; y0: number; x1: number; y1: number } | null {
		if (o.type !== 'prism') return null
		if (isElev) {
			const ax = ELEV_BASIS[elevDir].axis
			const lo = ax === 0 ? o.x : o.y, hi = lo + (ax === 0 ? o.w : o.d)
			const u0 = projU(lo), u1 = projU(hi), base = GROUND - o.z
			return { x0: Math.min(u0, u1), y0: base - o.h, x1: Math.max(u0, u1), y1: base }
		}
		if (isPlan) return { x0: o.x, y0: o.y, x1: o.x + o.w, y1: o.y + o.d }
		return null
	}
	// A graph node (wall/conduit vertex) → drawing coords for the current view (plan x/y; elevation
	// on-axis via projU + GROUND−z), and the inverse edit (drawing point → node coords).
	type GN = { id: string; x: number; y: number; z: number }
	const rndSnap = (v: number) => (snap ? Math.round(v / SNAP_STEP) * SNAP_STEP : v)
	function graphNodeDraw(n: GN): Pt {
		if (isElev) { const ax = ELEV_BASIS[elevDir].axis; return [projU(ax === 0 ? n.x : n.y), GROUND - n.z] }
		return [n.x, n.y]
	}
	// Nearest OTHER graph node's drawing position within a screen-tolerance of p (for node-drag snapping),
	// else null. Snapping coincides the coords so runs join; dragging apart later separates them (disconnect).
	function snapNode(p: Pt, exclude: GN): Pt | null {
		if (!mdl) return null
		const thr = hitTol(10) / (dscale || 1)   // ~10px in model units
		let best: Pt | null = null, bestD = thr
		for (const o of mdl.objects) {
			if ((o.type !== 'wall' && o.type !== 'conduit') || !modelLayerVisible(o)) continue
			for (const nn of o.nodes as GN[]) {
				if (nn === exclude) continue
				const d = graphNodeDraw(nn), dd = Math.hypot(d[0] - p[0], d[1] - p[1])
				if (dd < bestD) { bestD = dd; best = d }
			}
		}
		return best
	}
	function graphNodeApply(n: GN, p: Pt) {
		const q = snapNode(p, n) ?? p   // snap to a nearby node so runs join
		snapMark = q === p ? null : { p: q, type: 'end' }
		if (isElev) { const ax = ELEV_BASIS[elevDir].axis; if (ax === 0) n.x = rndSnap(projUInv(q[0])); else n.y = rndSnap(projUInv(q[0])); n.z = Math.max(0, rndSnap(GROUND - q[1])) }
		else { n.x = rndSnap(q[0]); n.y = rndSnap(q[1]) }
	}
	// Any wall/conduit segment under p (drawing coords): distance to the segment's drawn centreline
	// within the pick tolerance + half the profile width, so clicking anywhere on the ribbon selects.
	function graphHit(o: Extract<Obj, { type: 'wall' | 'conduit' }>, p: Pt, thr: number): boolean {
		const nm = new Map((o.nodes as GN[]).map((n) => [n.id, n]))
		const half = ((o.type === 'wall' ? o.thickness : o.w) ?? 0) / 2
		for (const s of o.segments as { a: string; b: string }[]) {
			const a = nm.get(s.a), b = nm.get(s.b); if (!a || !b) continue
			if (segDist(p, graphNodeDraw(a), graphNodeDraw(b)) < thr + half) return true
		}
		return false
	}
	// Topmost model object under p (drawing coords): a prism (footprint/face AABB, rot-aware in plan)
	// or a wall/conduit graph (any segment). Returns its id.
	function hitModel(p: Pt): string | null {
		if (!modelEditable || !mdl) return null
		const thr = hitTol(4)
		for (let i = mdl.objects.length - 1; i >= 0; i--) {
			const o = mdl.objects[i]
			if (!o.id || !modelLayerVisible(o)) continue
			if (o.type === 'wall' || o.type === 'conduit') { if (graphHit(o, p, thr)) return o.id; continue }
			if (o.type !== 'prism') continue
			if (isPlan && o.rot) {
				const cx = o.x + o.w / 2, cy = o.y + o.d / 2, q = rotatePt(p, [cx, cy], -o.rot)
				if (q[0] >= o.x - thr && q[0] <= o.x + o.w + thr && q[1] >= o.y - thr && q[1] <= o.y + o.d + thr) return o.id
				continue
			}
			const r = prismRect(o); if (!r) continue
			if (p[0] >= r.x0 - thr && p[0] <= r.x1 + thr && p[1] >= r.y0 - thr && p[1] <= r.y1 + thr) return o.id
		}
		return null
	}
	// A body move drag. Absolute from the gesture's start (no drift). A prism moves its position; a
	// wall/conduit translates ALL its nodes (keeping the graph rigid). In elevation the horizontal drag
	// maps to the view's on-axis coord (× ELEV_BASIS sign) and the vertical drag changes z (clamped ≥0).
	let mDrag: { id: string; start: Pt; o0?: { x: number; y: number; z: number }; n0?: GN[]; moved: boolean } | null = null
	function onModelDragMove(e: PointerEvent) {
		if (!mDrag || !mdl) return
		const p = toLocalXY(e.clientX, e.clientY); if (!p) return
		const o = mdl.objects.find(x => x.id === mDrag!.id); if (!o) return
		mDrag.moved = true
		const dx = p[0] - mDrag.start[0], dy = p[1] - mDrag.start[1]
		const elev = isElev ? ELEV_BASIS[elevDir] : null
		if (o.type === 'prism' && mDrag.o0) {
			if (elev) { if (elev.axis === 0) o.x = rndSnap(mDrag.o0.x + elev.sign * dx); else o.y = rndSnap(mDrag.o0.y + elev.sign * dx); o.z = Math.max(0, rndSnap(mDrag.o0.z - dy)) }
			else { o.x = rndSnap(mDrag.o0.x + dx); o.y = rndSnap(mDrag.o0.y + dy) }
		} else if ((o.type === 'wall' || o.type === 'conduit') && mDrag.n0) {
			for (const g of mDrag.n0) {
				const n = (o.nodes as GN[]).find((x) => x.id === g.id); if (!n) continue
				if (elev) { if (elev.axis === 0) n.x = rndSnap(g.x + elev.sign * dx); else n.y = rndSnap(g.y + elev.sign * dx); n.z = Math.max(0, rndSnap(g.z - dy)) }
				else { n.x = rndSnap(g.x + dx); n.y = rndSnap(g.y + dy) }
			}
		}
		on.modeledit?.()   // fold this move into the open undo step
	}
	function onModelDragUp() {
		if (mDrag?.moved) suppressClick = true
		mDrag = null; on.endedit?.()   // close the model-move gesture's undo step
		window.removeEventListener('pointermove', onModelDragMove)
		window.removeEventListener('pointerup', onModelDragUp)
	}

	// ── model grips (P2b/P2e) — corner handles that resize a prism, or node handles that reshape a
	// wall/conduit graph (drag a corner → re-mitred join). Each grip carries its own apply, so a drag
	// just replays it. The single selected model object drives grip render + pick. ──
	const mSelObj = $derived.by(() => {
		if (!modelEditable || modelSel.length !== 1) return null
		return mdl?.objects.find((x) => x.id === modelSel[0]) ?? null
	})
	// The prism's 4 corner grips in drawing coords, order tl,tr,br,bl (matches prismRect's face / footprint).
	function prismCorners(o: Obj): Pt[] {
		const r = prismRect(o); if (!r) return []
		return [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]]
	}
	// Resize the prism by dragging corner `gi` to p, holding the opposite corner (`anchor`, captured in
	// drawing coords at grip-down) fixed. Plan edits the footprint (x/y/w/d); elevation edits the on-axis
	// size (w or d, via projUInv) + z/h (base + height from screen-y, base = larger y). Clamped, snappable.
	function applyPrismGrip(o: Extract<Obj, { type: 'prism' }>, gi: number, p: Pt, anchor: Pt) {
		if (isElev) {
			const ax = ELEV_BASIS[elevDir].axis
			const c1 = projUInv(p[0]), c2 = projUInv(anchor[0])   // on-axis model coords (drawing u → coord)
			const lo = rndSnap(Math.min(c1, c2)), size = Math.max(1, rndSnap(Math.abs(c1 - c2)))
			if (ax === 0) { o.x = lo; o.w = size } else { o.y = lo; o.d = size }
			const baseY = Math.max(p[1], anchor[1]), topY = Math.min(p[1], anchor[1])
			o.z = Math.max(0, rndSnap(GROUND - baseY)); o.h = Math.max(1, rndSnap(baseY - topY))
		} else {
			o.x = rndSnap(Math.min(p[0], anchor[0])); o.w = Math.max(1, rndSnap(Math.abs(p[0] - anchor[0])))
			o.y = rndSnap(Math.min(p[1], anchor[1])); o.d = Math.max(1, rndSnap(Math.abs(p[1] - anchor[1])))
		}
	}
	// Grips of the selected object: prism = 4 resize corners (about the opposite corner, captured now);
	// wall/conduit = one move-handle per node. `apply(p)` mutates the store object given a drawing point.
	type MGrip = { x: number; y: number; apply: (p: Pt) => void }
	function modelGrips(o: Obj): MGrip[] {
		if (o.type === 'prism') {
			const cs = prismCorners(o)
			return cs.map((c, gi) => ({ x: c[0], y: c[1], apply: (p: Pt) => applyPrismGrip(o, gi, p, cs[(gi + 2) % 4]) }))
		}
		if (o.type === 'wall' || o.type === 'conduit') {
			return (o.nodes as GN[]).map((n) => { const d = graphNodeDraw(n); return { x: d[0], y: d[1], apply: (p: Pt) => graphNodeApply(n, p) } })
		}
		return []
	}
	// Which grip of the selected object a press grabs (constant screen tolerance), with its apply.
	function pickModelGrip(clientX: number, clientY: number): ((p: Pt) => void) | null {
		if (!mSelObj) return null
		for (const g of modelGrips(mSelObj)) { const sp = localToClient(g.x, g.y); if (sp && Math.hypot(sp.x - clientX, sp.y - clientY) < 14) return g.apply }
		return null
	}
	let mGrip: { apply: (p: Pt) => void; moved: boolean } | null = null
	function onModelGripMove(e: PointerEvent) {
		if (!mGrip) return
		const p = toLocalXY(e.clientX, e.clientY); if (!p) return
		mGrip.moved = true
		mGrip.apply(p)
		on.modeledit?.()   // fold this reshape into the open undo step
	}
	function onModelGripUp() {
		if (mGrip?.moved) suppressClick = true
		mGrip = null; snapMark = null; on.endedit?.()   // close the gesture's undo step
		window.removeEventListener('pointermove', onModelGripMove)
		window.removeEventListener('pointerup', onModelGripUp)
	}

	// ── 3D iso ORBIT — a plain drag in the iso view rotates the camera (yaw/pitch). The projection
	// already takes yaw/pitch; here we just turn a drag into new angles. Pitch is clamped to (0, 90°).
	let orbitDrag: { sx: number; sy: number; yaw0: number; pitch0: number; moved: boolean } | null = null
	function onOrbitMove(e: PointerEvent) {
		if (!orbitDrag) return
		orbitDrag.moved = true
		const dx = e.clientX - orbitDrag.sx, dy = e.clientY - orbitDrag.sy
		const ny = orbitDrag.yaw0 - dx * 0.008
		const np = Math.max(0.06, Math.min(Math.PI / 2 - 0.02, orbitDrag.pitch0 + dy * 0.006))
		on.orbit?.(ny, np)
	}
	function onOrbitUp() {
		if (orbitDrag?.moved) suppressClick = true
		orbitDrag = null
		window.removeEventListener('pointermove', onOrbitMove)
		window.removeEventListener('pointerup', onOrbitUp)
	}

	// ── model PLACEMENT (P2f / §3) — create new model objects on the store, one undo step, select it ──
	let mSeq = 0
	const mUid = (p: string) => p + Date.now().toString(36) + (mSeq++)
	const layerId = (id: string) => mdl?.layers?.find((l) => l.id === id)?.id ?? mdl?.layers?.[0]?.id
	function addModelObj(o: Obj) {
		if (!mdl) return
		on.beginedit?.()          // captures the pre-add baseline
		mdl.objects.push(o)
		on.modeledit?.(); on.endedit?.()   // one undo step
		setModelSel(o.id ? [o.id] : [])
	}
	// Delete the selected model object(s) from the store (one undo step).
	function deleteModelSel() {
		if (!mdl || !modelSel.length) return
		const rm = new Set(modelSel)
		on.beginedit?.()
		mdl.objects = mdl.objects.filter((o) => !o.id || !rm.has(o.id))
		on.modeledit?.(); on.endedit?.()
		setModelSel([])
	}
	// Insert a vertex into a wall/conduit at p by splitting the nearest segment (dbl-click). The new
	// node inherits the segment's z (keeps the run's height); the new segment inherits object defaults.
	function insertGraphNode(p: Pt) {
		if (!mdl) return
		const thr = hitTol(6) / (dscale || 1)   // screen px → MODEL units (coords are in the ÷dscale space)
		for (let i = mdl.objects.length - 1; i >= 0; i--) {
			const o = mdl.objects[i]
			if ((o.type !== 'wall' && o.type !== 'conduit') || !o.id || !modelLayerVisible(o)) continue
			const half = ((o.type === 'wall' ? o.thickness : o.w) ?? 0) / 2
			const nm = new Map((o.nodes as GN[]).map((n) => [n.id, n]))
			for (const s of o.segments as { id: string; a: string; b: string }[]) {
				const a = nm.get(s.a), b = nm.get(s.b); if (!a || !b) continue
				if (segDist(p, graphNodeDraw(a), graphNodeDraw(b)) < thr + half) {
					on.beginedit?.()
					const nid = mUid('n')
					;(o.nodes as GN[]).push({ id: nid, x: Math.round(p[0]), y: Math.round(p[1]), z: a.z })
					const bId = s.b; s.b = nid
					;(o.segments as { id: string; a: string; b: string }[]).push({ id: mUid('s'), a: nid, b: bId })
					on.modeledit?.(); on.endedit?.()
					setModelSel([o.id])
					return
				}
			}
		}
	}
	// A clicked run (plan drawing pts) → a wall or conduit graph with the tool's default profile.
	function placeGraph(pts: Pt[]) {
		if (!mdl || pts.length < 2) return
		const nodesZ = tool === 'Wall' ? 0 : (mdl.levels?.ceilingTile ?? 2600)   // trunks/pipes default near the ceiling
		const { nodes, segments } = polyToGraph(pts.map((p) => ({ x: Math.round(p[0]), y: Math.round(p[1]), z: nodesZ })))
		if (tool === 'Wall') addModelObj({ type: 'wall', h: 2800, thickness: 100, nodes, segments, layer: layerId('walls'), id: mUid('w') })
		else if (tool === 'Trunk') addModelObj({ type: 'conduit', w: 300, h: 150, edges: 4, nodes, segments, layer: layerId('trunks'), id: mUid('t') })
		else if (tool === 'Pipe') addModelObj({ type: 'conduit', w: 80, h: 80, edges: 16, nodes, segments, layer: layerId('trunks'), id: mUid('p') })
	}
	// A footprint drag (plan a→b) → a prism on a layer with a default height. Furniture (h=750) and
	// Openings (h=2100, on the dashed Openings layer so it reads as a door/window/hole cut) share this.
	function placePrism(a: Pt, b: Pt, layer: string, h: number, tag: string) {
		if (!mdl) return
		const x = Math.round(Math.min(a[0], b[0])), y = Math.round(Math.min(a[1], b[1]))
		const w = Math.max(1, Math.round(Math.abs(b[0] - a[0]))), d = Math.max(1, Math.round(Math.abs(b[1] - a[1])))
		addModelObj({ type: 'prism', x, y, z: 0, w, d, h, edges: 4, layer: layerId(layer), id: mUid(tag) })
	}

	// ── object snap (osnap), Kestrel-style ──
	// Each entity contributes snap points (endpoints, midpoints, centres, quadrants). While
	// drawing or dragging a grip we find the nearest within ~10px and lock the point to it,
	// showing a marker. Gated by the OSNAP status-bar toggle.
	let snapMark = $state<{ p: Pt; type: string } | null>(null)
	function entSnaps(e: Ent): { point: Pt; type: string }[] {
		const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
		if (e.type === 'polyline') { const pts = e.pts ?? []; const out = pts.map(p => ({ point: p, type: 'end' })); for (let i = 0; i + 1 < pts.length; i++) out.push({ point: mid(pts[i], pts[i + 1]), type: 'mid' }); return out }
		if (e.type === 'line' || e.type === 'dim') return [{ point: e.a!, type: 'end' }, { point: e.b!, type: 'end' }, { point: mid(e.a!, e.b!), type: 'mid' }]
		if (e.type === 'rect' || e.type === 'ellipse' || e.type === 'box') {
			const [x0, y0, x1, y1] = bbox(e)
			const c: Pt[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
			return [...c.map(p => ({ point: p, type: 'end' })),
				{ point: mid(c[0], c[1]), type: 'mid' }, { point: mid(c[1], c[2]), type: 'mid' }, { point: mid(c[2], c[3]), type: 'mid' }, { point: mid(c[3], c[0]), type: 'mid' },
				{ point: [(x0 + x1) / 2, (y0 + y1) / 2] as Pt, type: 'center' }]
		}
		if (e.type === 'circle') { const [cx, cy, r] = [e.c![0], e.c![1], e.r!]; return [{ point: e.c!, type: 'center' }, { point: [cx + r, cy], type: 'quad' }, { point: [cx - r, cy], type: 'quad' }, { point: [cx, cy + r], type: 'quad' }, { point: [cx, cy - r], type: 'quad' }] }
		if (e.type === 'text') return [{ point: e.a!, type: 'end' }]
		return []
	}
	function findSnap(clientX: number, clientY: number, exclude?: string): Pt | null {
		if (!osnap) { snapMark = null; return null }
		let best: { p: Pt; type: string; d: number } | null = null
		for (const e of entities) {
			if (e.id === exclude || e.id === editText?.id) continue
			for (const s of entSnaps(e)) {
				const sp = localToClient(s.point[0], s.point[1]); if (!sp) continue
				const d = Math.hypot(sp.x - clientX, sp.y - clientY)
				if (d < 11 && (!best || d < best.d)) best = { p: s.point, type: s.type, d }
			}
		}
		snapMark = best ? { p: best.p, type: best.type } : null
		return best ? best.p : null
	}
	// The point a draw/place should use: snap wins; else the shift-constrained pointer.
	function drawPoint(clientX: number, clientY: number, base?: Pt, shift = false): Pt | null {
		const s = findSnap(clientX, clientY)
		if (s) return s   // object snap wins over grid snap
		const raw = toLocalXY(clientX, clientY); if (!raw) return null
		let p = raw
		if (base) {
			if (shift) p = constrainPt(base, raw, true)                                          // Shift: 15° / square
			else if (ortho && (tool === 'Line' || tool === 'Dimension')) p = orthoPt(base, raw)   // ORTHO: H/V
		}
		if (snap) p = snapToGrid(p)   // grid snap
		return p
	}

	// ── editing handles (Kestrel-style grips) ──
	// Each selected entity shows square grips at its defining points. Dragging a grip edits
	// that point; dragging the body moves the whole entity. Grips render at a constant
	// screen size (÷ zoom) so they don't grow as the viewport zooms, like real CAD.
	type Grip = { x: number; y: number; apply: (p: Pt) => Ent }
	// A flat object in elevation is a ground line; its grips are the two ground-line ends (drag = move
	// the min/max x-edge, keeping it flat), NOT the plan footprint corners.
	function setFlatX(e: Ent, edge: 'min' | 'max', u: number): Ent {
		if (e.type === 'circle' || e.type === 'polyline') return e   // no simple edge; leave as-is
		const ax = ELEV_BASIS[elevDir].axis
		const ua = projU(e.a![ax]), ub = projU(e.b![ax])   // endpoints projected to the drawing horizontal
		const aIsMin = ua <= ub, moveA = (edge === 'min') === aIsMin
		const m = projUInv(u)                              // dragged horizontal → model coord along the axis
		const setPt = (pt: Pt): Pt => ax === 0 ? [m, pt[1]] : [pt[0], m]
		return moveA ? { ...e, a: setPt(e.a!) } : { ...e, b: setPt(e.b!) }
	}
	// Grips honour rotation: positions rotate into the view; a grip drag un-rotates the pointer first.
	function gripsFor(e: Ent): Grip[] {
		const gs = gripsLocal(e)
		if (!e.rot) return gs
		const c = rotCenter(e)
		return gs.map(g => { const rp = rotatePt([g.x, g.y], c, e.rot!); return { x: rp[0], y: rp[1], apply: (p: Pt) => g.apply(rotatePt(p, c, -e.rot!)) } })
	}
	function gripsLocal(e: Ent): Grip[] {
		if (isFlatElev(e)) { const [x0, x1] = flatXSpan(e); return [{ x: x0, y: GROUND, apply: p => setFlatX(e, 'min', p[0]) }, { x: x1, y: GROUND, apply: p => setFlatX(e, 'max', p[0]) }] }
		if (e.type === 'polyline') return (e.pts ?? []).map((v, i) => ({ x: v[0], y: v[1], apply: (p: Pt) => ({ ...e, pts: (e.pts ?? []).map((q, j) => j === i ? p : q) }) }))
		if (e.type === 'line' || e.type === 'dim') return [
			{ x: e.a![0], y: e.a![1], apply: p => ({ ...e, a: p }) },
			{ x: e.b![0], y: e.b![1], apply: p => ({ ...e, b: p }) },
		]
		if (e.type === 'box' && isElev) {   // grips on the projected FACE (width × height)
			const { x0, x1, base, top } = boxElev(e, elevDir, CX, CY)
			return [
				{ x: x0, y: base, apply: p => boxElevSet(e, { x0: p[0], z0: GROUND - p[1] }, elevDir, CX, CY) },      // bottom-left: width + base elevation
				{ x: x1, y: base, apply: p => boxElevSet(e, { x1: p[0], z0: GROUND - p[1] }, elevDir, CX, CY) },      // bottom-right
				{ x: x0, y: top, apply: p => boxElevSet(e, { x0: p[0], h: base - p[1] }, elevDir, CX, CY) },          // top-left: width + height
				{ x: x1, y: top, apply: p => boxElevSet(e, { x1: p[0], h: base - p[1] }, elevDir, CX, CY) },          // top-right
			]
		}
		if (e.type === 'rect' || e.type === 'ellipse' || e.type === 'box') {   // 4 corner grips on the footprint/bbox
			const [ax, ay] = e.a!, [bx, by] = e.b!
			return [
				{ x: ax, y: ay, apply: p => ({ ...e, a: p }) },
				{ x: bx, y: by, apply: p => ({ ...e, b: p }) },
				{ x: ax, y: by, apply: p => ({ ...e, a: [p[0], e.a![1]] as Pt, b: [e.b![0], p[1]] as Pt }) },
				{ x: bx, y: ay, apply: p => ({ ...e, a: [e.a![0], p[1]] as Pt, b: [p[0], e.b![1]] as Pt }) },
			]
		}
		if (e.type === 'circle') return [
			{ x: e.c![0], y: e.c![1], apply: p => ({ ...e, c: p }) },                       // move centre
			{ x: e.c![0] + e.r!, y: e.c![1], apply: p => ({ ...e, r: Math.max(1, dist(e.c!, p)) }) }, // radius
		]
		if (e.type === 'text') return [{ x: e.a![0], y: e.a![1], apply: p => ({ ...e, a: p }) }]
		return []
	}
	// (translate lives in ./geometry)
	// Shift-constrain a grip drag: box corner → square about the opposite corner; line/dim
	// endpoint → 15° about the other end. (Circle radius left free.)
	function constrainGrip(base: Ent, gi: number, p: Pt, shift: boolean): Pt {
		if (!shift) return p
		if (base.type === 'box' && isElev) {   // shift → square FACE about the opposite face corner
			const f = boxElev(base, elevDir, CX, CY)
			const an: Pt = gi === 0 ? [f.x1, f.top] : gi === 1 ? [f.x0, f.top] : gi === 2 ? [f.x1, f.base] : [f.x0, f.base]
			const s = Math.max(Math.abs(p[0] - an[0]), Math.abs(p[1] - an[1]))
			return [an[0] + (p[0] < an[0] ? -s : s), an[1] + (p[1] < an[1] ? -s : s)]
		}
		if (base.type === 'rect' || base.type === 'ellipse' || (base.type === 'box' && !isElev)) {
			const [ax, ay] = base.a!, [bx, by] = base.b!
			const an: Pt = gi === 0 ? [bx, by] : gi === 1 ? [ax, ay] : gi === 2 ? [bx, ay] : [ax, by]
			const s = Math.max(Math.abs(p[0] - an[0]), Math.abs(p[1] - an[1]))
			return [an[0] + (p[0] < an[0] ? -s : s), an[1] + (p[1] < an[1] ? -s : s)]
		}
		if (base.type === 'line' || base.type === 'dim') {
			const an = gi === 0 ? base.b! : base.a!
			const dx = p[0] - an[0], dy = p[1] - an[1], len = Math.hypot(dx, dy), step = Math.PI / 12
			const ang = Math.round(Math.atan2(dy, dx) / step) * step
			return [an[0] + len * Math.cos(ang), an[1] + len * Math.sin(ang)]
		}
		return p
	}
	// Grips must be a CONSTANT screen size (Kestrel / Outlets), whatever the zoom. On-screen
	// px of a model-unit length = length · view.zoom · (BASE · canvasZoom); dividing by both
	// zooms cancels them so the grip is always HANDLE_PX px — the canvas CSS zoom included
	// (without canvasZoom the grips grew as you zoomed the canvas in).
	const gripSize = $derived(HANDLE_PX / BASE / view.zoom / (canvasZoom || 1) / (dscale || 1))

	// What a press at these client coords would grab: a grip of a selected entity, or the
	// body of any entity (topmost). Drives the pointer-drag start (mouse-left / 1-finger
	// touch) — navigation is 2-finger, so a single finger is always free to edit.
	function pick(clientX: number, clientY: number): { kind: 'grip' | 'move'; id: string; gi: number } | null {
		for (const id of sel) {
			const ent = entities.find(x => x.id === id); if (!ent) continue
			const gs = gripsFor(ent)
			for (let i = 0; i < gs.length; i++) {
				const sp = localToClient(gs[i].x, gs[i].y); if (!sp) continue
				if (Math.hypot(sp.x - clientX, sp.y - clientY) < 14) return { kind: 'grip', id, gi: i }
			}
		}
		const lp = toLocalXY(clientX, clientY)
		if (lp) { const ids = hit(lp); if (ids.length) return { kind: 'move', id: ids[0], gi: -1 } }
		return null
	}

	// ── drag to move / edit ──
	// `bases` = the entities a body-move drags (the whole selection when you grab a selected one,
	// else just the grabbed one). `base`/`gi` drive grip drags (always a single entity).
	let drag: { id: string; base: Ent; bases: Ent[]; kind: 'grip' | 'move'; gi: number; start: Pt; dup?: boolean; duplicated?: boolean } | null = null
	let dragged = false        // true once the pointer actually moved during a drag
	let suppressClick = false  // swallow the click that ends a real drag (avoids re-select)
	// Track pressed pointers so a second finger (2-finger pan/zoom) aborts an entity drag —
	// otherwise finger 1 landing on a shape starts a move that the pan then drags around.
	const pointers = new Set<number>()
	function cancelPointerDrag() {
		if (drag) {
			if (dragged) for (const b of drag.bases) on.update?.(b)   // revert any partial move/resize
			drag = null; on.endedit?.()
			window.removeEventListener('pointermove', onDragMove)
			window.removeEventListener('pointerup', onDragUp)
		}
		if (marquee) {
			marquee = null
			window.removeEventListener('pointermove', onMarqueeMove)
			window.removeEventListener('pointerup', onMarqueeUp)
		}
		if (draft.length) {   // abort an in-progress press-drag draw
			draft = []; cur = null; snapMark = null
			window.removeEventListener('pointermove', onDrawMove)
			window.removeEventListener('pointerup', onDrawUp)
		}
		if (mDrag) {   // abort an in-progress model-object move (2nd finger → pan/zoom)
			mDrag = null; on.endedit?.()
			window.removeEventListener('pointermove', onModelDragMove)
			window.removeEventListener('pointerup', onModelDragUp)
		}
		if (mGrip) {   // abort an in-progress model-object resize
			mGrip = null; on.endedit?.()
			window.removeEventListener('pointermove', onModelGripMove)
			window.removeEventListener('pointerup', onModelGripUp)
		}
		if (orbitDrag) {   // abort an in-progress iso orbit
			orbitDrag = null
			window.removeEventListener('pointermove', onOrbitMove)
			window.removeEventListener('pointerup', onOrbitUp)
		}
	}
	$effect(() => {
		const up = (e: PointerEvent) => pointers.delete(e.pointerId)
		window.addEventListener('pointerup', up)
		window.addEventListener('pointercancel', up)
		return () => { window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up) }
	})
	function onDown(e: PointerEvent) {
		if (editText || !active || e.button !== 0) return   // ignore while editing text in place
		suppressClick = false   // clear any stale flag from a drag that never got its click
		pointers.add(e.pointerId)
		if (pointers.size > 1) { cancelPointerDrag(); return }   // 2nd finger → hand off to pan/zoom
		// EOS mode: shapes are drawn with a single press-drag-release (not two clicks).
		if (tool !== 'Select') {
			if (acad || tool === 'Text') return   // AutoCAD two-click / text single-click via onClick
			const dp = drawPoint(e.clientX, e.clientY); if (!dp) return
			draft = [dp]; cur = dp
			try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch { /* synthetic */ }
			e.preventDefault()
			window.addEventListener('pointermove', onDrawMove)
			window.addEventListener('pointerup', onDrawUp)
			return
		}
		// 3D iso view: a plain drag orbits the camera (nothing is edited in iso).
		if (kind === 'iso') {
			orbitDrag = { sx: e.clientX, sy: e.clientY, yaw0: yaw, pitch0: pitch, moved: false }
			try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch { /* synthetic */ }
			e.preventDefault()
			window.addEventListener('pointermove', onOrbitMove)
			window.addEventListener('pointerup', onOrbitUp)
			return
		}
		// A selected model object's grip (prism corner / wall node) wins over everything (like entity grips).
		if (mSelObj) {
			const apply = pickModelGrip(e.clientX, e.clientY)
			if (apply) {
				mGrip = { apply, moved: false }
				on.beginedit?.()   // one undo step for the whole reshape gesture
				try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch { /* synthetic */ }
				e.preventDefault()
				window.addEventListener('pointermove', onModelGripMove)
				window.addEventListener('pointerup', onModelGripUp)
				return
			}
		}
		const p = toLocalXY(e.clientX, e.clientY); if (!p) return
		const hitInfo = pick(e.clientX, e.clientY)
		if (!hitInfo) {
			// no entity under the cursor → try a MODEL object (P2a: prisms in plan), else marquee.
			const mid = hitModel(p)
			const mo = mid ? mdl?.objects.find(o => o.id === mid) : undefined
			if (mo) {
				setModelSel([mo.id!]); on.select?.([])   // model selection is exclusive with entity selection
				mDrag = {
					id: mo.id!, start: p, moved: false,
					o0: mo.type === 'prism' ? { x: mo.x, y: mo.y, z: mo.z } : undefined,
					n0: (mo.type === 'wall' || mo.type === 'conduit') ? (mo.nodes as GN[]).map((n) => ({ id: n.id, x: n.x, y: n.y, z: n.z })) : undefined,
				}
				on.beginedit?.()   // one undo step for the whole model-move gesture
				try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch { /* synthetic */ }
				e.preventDefault()
				window.addEventListener('pointermove', onModelDragMove)
				window.addEventListener('pointerup', onModelDragUp)
				return
			}
			// empty space → drag a Kestrel-style selection box (window / crossing); Shift/Ctrl = additive
			marquee = { a: p, b: p, add: e.shiftKey || e.ctrlKey || e.metaKey }
			try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch { /* synthetic */ }
			e.preventDefault()
			window.addEventListener('pointermove', onMarqueeMove)
			window.addEventListener('pointerup', onMarqueeUp)
			return
		}
		const base = entities.find(x => x.id === hitInfo.id); if (!base) return
		setModelSel([])   // grabbing an entity clears any model-object selection (they're exclusive)
		// Shift-press on a body is selection-only (toggles on release) — must NOT start a move drag.
		if (e.shiftKey && hitInfo.kind === 'move') { pointers.delete(e.pointerId); return }
		if (!(e.ctrlKey || e.metaKey) && !selSet.has(hitInfo.id)) on.select?.(expandGroup([hitInfo.id]))   // plain press on an unselected entity → select it (+ its group)
		// a body move drags the whole selection when the grabbed entity is part of it, else just it (+ its group)
		const moveIds = hitInfo.kind === 'move' ? (selSet.has(hitInfo.id) ? sel : expandGroup([hitInfo.id])) : [hitInfo.id]
		const bases = moveIds.map(id => entities.find(x => x.id === id)).filter(Boolean) as Ent[]
		// Ctrl/⌘-drag DUPLICATES the selection (copies created on the first move); a Ctrl-CLICK (no
		// move) instead toggles selection via onClick.
		drag = { id: hitInfo.id, base, bases, kind: hitInfo.kind, gi: hitInfo.gi, start: p, dup: (e.ctrlKey || e.metaKey) && hitInfo.kind === 'move', duplicated: false }
		dragged = false
		on.beginedit?.()   // one history step for the whole drag
		try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch { /* synthetic events */ }
		e.preventDefault()
		window.addEventListener('pointermove', onDragMove)
		window.addEventListener('pointerup', onDragUp)
	}
	let lastDragRaw: Pt | null = null   // last UNconstrained pointer during a move/grip drag
	// Move an entity by (dx,dy). In an ELEVATION view the horizontal drag maps to the VIEW's footprint
	// axis (x for front/rear, y for left/right, mirrored by the dir's sign); vertical drag changes a
	// box's base elevation (screen-down lowers it) and does nothing to a ground-line flat. Plan/iso
	// translate normally.
	function moveEnt(en: Ent, dx: number, dy: number): Ent {
		if (isElev) {
			const { axis, sign } = ELEV_BASIS[elevDir]
			const d = sign * dx   // drawing-horizontal delta → model delta along the view axis
			if (en.type === 'box') {
				const a: Pt = axis === 0 ? [en.a![0] + d, en.a![1]] : [en.a![0], en.a![1] + d]
				const b: Pt = axis === 0 ? [en.b![0] + d, en.b![1]] : [en.b![0], en.b![1] + d]
				return { ...en, a, b, z0: Math.max(0, (en.z0 ?? 0) - dy) }
			}
			if (FLAT.has(en.type)) return axis === 0 ? translate(en, d, 0) : translate(en, 0, d)
		}
		return translate(en, dx, dy)
	}
	function applyDrag(p: Pt, shift: boolean): Ent {
		if (drag!.kind === 'grip') return gripsFor(drag!.base)[drag!.gi].apply(constrainGrip(drag!.base, drag!.gi, p, shift))
		let dx = p[0] - drag!.start[0], dy = p[1] - drag!.start[1]
		if (shift !== ortho) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0 }   // ortho / axis-lock
		return moveEnt(drag!.base, dx, dy)
	}
	function onDragMove(e: PointerEvent) {
		if (!drag) return
		const p = toLocalXY(e.clientX, e.clientY); if (!p) return
		dragged = true; lastDragRaw = p
		if (drag.kind === 'grip') {
			const s = osnap ? findSnap(e.clientX, e.clientY, drag.id) : null
			on.update?.(s ? gripsFor(drag.base)[drag.gi].apply(s) : applyDrag(p, e.shiftKey))
		} else {
			// Ctrl/⌘-drag: on the first real move, drop copies at the originals and drag the copies.
			if (drag.dup && !drag.duplicated) {
				const copies = drag.bases.map(b => ({ ...b, id: uid() }))
				copies.forEach(c => on.add?.(c)); on.select?.(copies.map(c => c.id))
				drag.bases = copies; drag.duplicated = true
			}
			let dx = p[0] - drag.start[0], dy = p[1] - drag.start[1]
			if (e.shiftKey !== ortho) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0 }   // ortho / axis-lock (Shift toggles)
			for (const b of drag.bases) on.update?.(moveEnt(b, dx, dy))   // move the whole group (or the copies)
		}
	}
	function onDragUp() {
		if (dragged) suppressClick = true
		drag = null; snapMark = null; on.endedit?.()   // close the drag's history step
		window.removeEventListener('pointermove', onDragMove)
		window.removeEventListener('pointerup', onDragUp)
	}

	// ── press-drag draw (EOS mode): press = first point, drag (Shift-constrained) = preview,
	// release = second point. ──
	function onDrawMove(e: PointerEvent) {
		if (!draft.length) return
		const sp = drawPoint(e.clientX, e.clientY, draft[0], e.shiftKey); if (!sp) return
		lastRaw = toLocalXY(e.clientX, e.clientY)
		cur = sp
	}
	function onDrawUp(e: PointerEvent) {
		window.removeEventListener('pointermove', onDrawMove)
		window.removeEventListener('pointerup', onDrawUp)
		const a = draft[0]; draft = []; cur = null
		const b = drawPoint(e.clientX, e.clientY, a, e.shiftKey); snapMark = null
		if (!a || !b) return
		if (dist(a, b) < 2) return   // no drag → not a shape (ignore)
		place(a, b)
		suppressClick = true   // swallow the click that follows the release
	}

	// ── selection marquee (Kestrel/AutoCAD): drag L→R = window (enclose fully),
	// R→L = crossing (touch). bbox tests are enough for the mock. ──
	let marquee = $state<{ a: Pt; b: Pt; add?: boolean } | null>(null)
	function bbox(e: Ent): [number, number, number, number] {
		if (isFlatElev(e)) { const [x0, x1] = flatXSpan(e); return [x0, GROUND - 2, x1, GROUND + 2] }
		if (e.type === 'polyline') { const pts = e.pts ?? []; const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }
		if (e.type === 'circle') return [e.c![0] - e.r!, e.c![1] - e.r!, e.c![0] + e.r!, e.c![1] + e.r!]
		if (e.type === 'text') return textBox(e)
		if (e.type === 'box' && isElev) { const f = boxElev(e, elevDir, CX, CY); return [f.x0, f.top, f.x1, f.base] }
		const xs = [e.a![0], e.b![0]], ys = [e.a![1], e.b![1]]
		return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
	}
	function onMarqueeMove(e: PointerEvent) {
		if (!marquee) return
		const p = toLocalXY(e.clientX, e.clientY); if (!p) return
		marquee = { a: marquee.a, b: p, add: marquee.add }
	}
	function onMarqueeUp() {
		window.removeEventListener('pointermove', onMarqueeMove)
		window.removeEventListener('pointerup', onMarqueeUp)
		const m = marquee; marquee = null
		if (!m) return
		const x0 = Math.min(m.a[0], m.b[0]), y0 = Math.min(m.a[1], m.b[1])
		const x1 = Math.max(m.a[0], m.b[0]), y1 = Math.max(m.a[1], m.b[1])
		if (x1 - x0 < 2 && y1 - y0 < 2) return   // tiny → treat as a click (let onClick clear)
		const crossing = m.b[0] < m.a[0]   // dragged right→left
		const ids = entities.filter(en => {
			if (!pickable(en)) return false   // hidden/locked layers don't marquee-select
			const [bx0, by0, bx1, by1] = bbox(en)
			return crossing
				? bx0 <= x1 && bx1 >= x0 && by0 <= y1 && by1 >= y0        // intersects
				: bx0 >= x0 && bx1 <= x1 && by0 >= y0 && by1 <= y1        // fully enclosed
		}).map(en => en.id)
		const g = expandGroup(ids)   // include whole groups the marquee touched
		on.select?.(m.add ? [...new Set([...sel, ...g])] : g)   // Shift/Ctrl marquee unions with the current selection
		suppressClick = true   // don't let the ensuing click clear this selection
	}
	// (box projection helpers boxFaces / boxElevSet live in ./geometry)

	// Kestrel-style prompt
	let prompt = $derived.by(() => {
		if (!active) return ''
		const n = draft.length
		switch (tool) {
			case 'Select': return 'Click an element'
			case 'Line': return n ? 'Specify next point (Enter / double-click to finish)' : 'Specify first point'
			case 'Wall': case 'Trunk': case 'Pipe': return !isPlan ? `Switch to the plan view to draw ${tool.toLowerCase()}s` : (n ? `Specify next ${tool.toLowerCase()} point (Enter / double-click to finish)` : `Specify ${tool.toLowerCase()} start`)
			case 'Furniture': return isPlan ? (n ? 'Specify opposite corner' : 'Specify furniture footprint corner') : 'Switch to the plan view to place furniture'
			case 'Section': return isPlan ? (n ? 'Specify opposite corner (→ front elevation)' : 'Specify section box corner') : 'Switch to the plan view to cut a section'
			case 'Opening': return isPlan ? (n ? 'Specify opposite corner' : 'Specify opening (door / window / hole) corner') : 'Switch to the plan view to place an opening'
			case 'Rectangle': return n ? 'Specify opposite corner' : 'Specify first corner'
			case 'Ellipse': return n ? 'Specify opposite corner (Shift = circle)' : 'Specify first corner'
			case 'Box': return n ? 'Specify opposite corner (Shift = square footprint)' : 'Specify first corner'
			case 'Dimension': return n ? 'Specify second point' : 'Specify first point'
			case 'Text': return 'Click to place text'
			default: return tool + ' tool'
		}
	})
	// Status line shown at the PANE bottom-centre (screen space, +page) so it stays visible when
	// zoomed in — includes the inline-edit key help while editing text.
	let statusText = $derived(
		editText ? 'Editing text · Enter = new line · Ctrl/⌘+Enter = commit · Esc = cancel'
			: active ? `${tool} · ${prompt}` : '')
	$effect(() => { if (focused) on.status?.(statusText) })   // only the focused pane drives the shared status
</script>

<svelte:window onkeydown={onKey} onkeyup={(e) => { if (active && focused && e.key === 'Shift') reconstrain(false) }} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="vp print:!border-transparent" class:active bind:clientWidth={vpW} bind:clientHeight={vpH} role="button" tabindex="0" style:cursor={cursorStyle}
	style:border-style={active ? 'solid' : border === 'none' ? 'dotted' : border}
	style:border-color={border === 'none' && !active ? '#94a3b866' : undefined}
	use:panzoom={{ enabled: () => active && navContent, wheelZoom: () => acad, onpan: onPan, onzoom: onZoom }}
	onclick={onClick} ondblclick={onDblclick} onpointerdown={onDown} onpointermove={onMove}
	onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); on.activate?.() } }}>

	<svg bind:this={svg} class="vp-svg {kind === 'iso' || isElev ? 'model' : ''}" viewBox="{minX} {minY} {vbW} {vbH}" preserveAspectRatio="xMidYMid meet">
		<g transform="translate({view.x} {view.y}) scale({view.zoom}) translate({CX} {CY}) scale({dscale}) translate({-CX} {-CY})">
			<!-- Decorative mock backdrop, authored in legacy abstract units; scale(MMPU) converts it to
			     the mm model space so it lines up with real-mm entities without renumbering. -->
			<g transform="scale({MMPU})">
			{#if false && kind === 'iso'}
				<!-- OLD mock iso racks/floorGrid — retired now the real model renders in iso. -->
				{#if grid}{#each floorGrid as g (g)}<polyline points={g} fill="none" stroke="#d5deea" stroke-width="0.7" />{/each}{/if}
				{#each racks as b (b.top)}
					<polygon points={b.left} fill="#8aa0bf" stroke="#5c7396" stroke-width="0.6" />
					<polygon points={b.right} fill="#6f88ab" stroke="#4a5f7d" stroke-width="0.6" />
					<polygon points={b.top} fill="#a9bcd6" stroke="#7f95b4" stroke-width="0.6" />
				{/each}
			{:else if isElev}
				<!-- flat elevation backdrop: just the ground line at GROUND (the faint vertical mock grid was removed) -->
				<line x1="8" y1={GROUND / MMPU} x2="392" y2={GROUND / MMPU} stroke="#94a3b8" stroke-width="1.2" />
				<text x="12" y={GROUND / MMPU + 14} font-size="8" fill="#64748b" font-weight="600">{elevDir.toUpperCase()}</text>
			{:else if false}
				<!-- OLD mock floorplan backdrop — retired now the real 3D model renders (Model3d). Kept
				     disabled (flip `false`) for reference; the desks/outlets/grid arrays still feed iso. -->
				<rect x="8" y="8" width="384" height="234" fill="#ffffff" stroke="#94a3b8" stroke-width="1.4" />
				{#if grid}
					{#each Array(19) as _, i (i)}<line x1={8 + i * 20} y1="8" x2={8 + i * 20} y2="242" stroke="#eef2f6" stroke-width="0.6" />{/each}
					{#each Array(12) as _, i (i)}<line x1="8" y1={8 + i * 20} x2="392" y2={8 + i * 20} stroke="#eef2f6" stroke-width="0.6" />{/each}
				{/if}
				<line x1="200" y1="8" x2="200" y2="150" stroke="#cbd5e1" stroke-width="1" />
				<line x1="8" y1="150" x2="392" y2="150" stroke="#cbd5e1" stroke-width="1" />
				{#each desks as d, i (i)}<rect x={d.x} y={d.y} width={DW} height={DH} rx="2" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="0.7" />{/each}
				{#each outlets as o, i (i)}
					<circle cx={o.x} cy={o.y} r="5.5" fill={outletColor[o.k]} opacity="0.9" />
					<text x={o.x} y={o.y + 2.2} font-size="5.5" text-anchor="middle" fill="#fff" font-weight="700">{o.k === 'p' ? '4' : '6'}</text>
				{/each}
				<text x="24" y="230" font-size="9" fill="#64748b" font-weight="600">OFFICE — 33F</text>
			{/if}
			</g>
			<!-- P1b: real 3D model in plan + the four elevations + iso. Read-only for now (P2 = editing). -->
			{#if models[0]}<Model3d model={models[0]} dir={(kind === 'floorplan' ? 'plan' : kind) as 'plan' | ElevDir | 'iso'} cx={CX} cy={CY} ground={GROUND} selIds={modelSel} canvasZoom={canvasZoom} clip={clip} yaw={yaw} pitch={pitch} />{/if}
			<!-- drawn entities (objects on a hidden layer are skipped; the edited text is hidden too) -->
			{#each entities as e (e.id)}{#if e.id !== editText?.id && !isLayerHidden(e.layer) && inThisView(e)}{#if e.rot}{@const c = rotCenter(e)}<g transform="rotate({e.rot} {c[0]} {c[1]})">{@render drawn(e, selSet.has(e.id))}</g>{:else}{@render drawn(e, selSet.has(e.id))}{/if}{/if}{/each}
			{#if active && POLY.has(tool) && draft.length}
				<!-- polyline / wall / trunk / pipe preview: committed segments + rubber band to the cursor -->
				<polyline points={draft.map(p => p.join(',')).join(' ')} fill="none" stroke={SEL} stroke-width="1.2" />
				{#if cur}<line x1={draft.at(-1)![0]} y1={draft.at(-1)![1]} x2={cur[0]} y2={cur[1]} stroke={SEL} stroke-width="1" stroke-dasharray="4 3" />{/if}
			{:else if active && draft.length && cur}
				{@render preview(draft[0], cur)}
			{/if}
			<!-- editing handles: square grips at each selected entity's defining points -->
			{#if active && tool === 'Select'}
				{#each entities as e (e.id)}
					{#if selSet.has(e.id) && inThisView(e) && !isLayerHidden(e.layer) && !isLayerLocked(e.layer)}
						{#each gripsFor(e) as g}
							<Handle cx={g.x} cy={g.y} size={gripSize} cursor="crosshair" strokeWidth={1.2 / (canvasZoom || 1)} />
						{/each}
					{/if}
				{/each}
			{/if}
			<!-- model grips: prism resize corners, or wall/conduit node handles (of the selected object) -->
			{#if active && tool === 'Select' && mSelObj}
				{#each modelGrips(mSelObj) as g, i (i)}
					<Handle cx={g.x} cy={g.y} size={gripSize} cursor="crosshair" strokeWidth={1.2 / (canvasZoom || 1)} />
				{/each}
			{/if}
			<!-- object-snap marker (constant screen size): □ endpoint · △ midpoint · ○ centre · ◇ quadrant -->
			{#if active && snapMark}
				{@const s = gripSize * 1.5}
				{@const [mx, my] = snapMark.p}
				{#if snapMark.type === 'end'}
					<rect class="snap" x={mx - s / 2} y={my - s / 2} width={s} height={s} />
				{:else if snapMark.type === 'mid'}
					<polygon class="snap" points="{mx},{my - s / 2} {mx + s / 2},{my + s / 2} {mx - s / 2},{my + s / 2}" />
				{:else if snapMark.type === 'center'}
					<circle class="snap" cx={mx} cy={my} r={s / 2} />
				{:else}
					<polygon class="snap" points="{mx},{my - s / 2} {mx + s / 2},{my} {mx},{my + s / 2} {mx - s / 2},{my}" />
				{/if}
			{/if}
			<!-- Kestrel selection box: solid blue = window (enclose), dashed green = crossing -->
			{#if active && marquee}
				<rect class="marquee {marquee.b[0] < marquee.a[0] ? 'crossing' : 'window'}"
					x={Math.min(marquee.a[0], marquee.b[0])} y={Math.min(marquee.a[1], marquee.b[1])}
					width={Math.abs(marquee.b[0] - marquee.a[0])} height={Math.abs(marquee.b[1] - marquee.a[1])} />
			{/if}
		</g>
	</svg>

	<div class="vp-tag"><Icon name={tagIcon[kind]} size={10} /> {label}{#if scale}<span class="vp-scale">{scale}</span>{/if}</div>
	<!-- the tool prompt + inline-edit help now render at the PANE bottom-centre (see +page), so they
	     stay put and readable when zoomed in -->
	{#if editText}
		{@const lines = (editText.value || ' ').split('\n')}
		{@const cols = Math.max(...lines.map(l => l.length), 3)}
		{@const w = cols * editText.fontPx * 0.62 + 14}
		<!-- Opaque, auto-sizing editor placed over the (hidden) text (in .vp-local px so it tracks the
		     text at any zoom). Enter = newline (keydown is stopped so the viewport's own Enter handler
		     can't preempt it); Ctrl/⌘-Enter or blur commits; Esc cancels. -->
		<textarea class="text-edit" bind:this={textInput} bind:value={editText.value} spellcheck="false" wrap="off"
			style="left:{editText.x}px; top:{editText.y - editText.fontPx * 0.8}px; font-size:{editText.fontPx}px; line-height:{editText.fontPx * 1.2}px; width:{w}px; height:{lines.length * editText.fontPx * 1.2 + 6}px"
			onpointerdown={(e) => e.stopPropagation()} onclick={(e) => e.stopPropagation()} ondblclick={(e) => e.stopPropagation()}
			onblur={commitText}
			onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); editText = null } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commitText() } }}></textarea>
	{/if}
</div>

{#snippet drawn(e: Ent, seld: boolean)}
	<!-- Selection is shown by the grips, NOT by recolouring/thickening the stroke — so colour and
	     lineweight edits are visible live while the object stays selected. -->
	<!-- colour resolves ByLayer: explicit object colour → its layer's colour → the tool ink. -->
	{@const ink = e.color ?? layerColor(e.layer) ?? INK}
	<!-- An explicit per-object weight ALWAYS renders; LWT only chooses the thickness for objects with
	     no weight set (on = the default 1.2, off = a thin 0.5 display line). -->
	{@const w = (e.weight ?? (lwt ? STYLE_DEFAULTS.weight : 0.5)) / (canvasZoom || 1)}
	{@const fill = e.fill ?? 'none'}
	{#if isFlatElev(e)}
		<!-- any flat (z=0, no height) object seen in elevation is an edge-on line at the ground -->
		{@const sp = flatXSpan(e)}
		<line x1={sp[0]} y1={GROUND} x2={sp[1]} y2={GROUND} stroke={ink} stroke-width={w} vector-effect="non-scaling-stroke" />
	{:else if e.type === 'line'}
		<line x1={e.a![0]} y1={e.a![1]} x2={e.b![0]} y2={e.b![1]} stroke={ink} stroke-width={w} vector-effect="non-scaling-stroke" />
	{:else if e.type === 'polyline'}
		<polyline points={(e.pts ?? []).map(p => p.join(',')).join(' ')} fill={fill} stroke={ink} stroke-width={w} vector-effect="non-scaling-stroke" stroke-linejoin="round" />
	{:else if e.type === 'rect'}
		<rect x={Math.min(e.a![0], e.b![0])} y={Math.min(e.a![1], e.b![1])} width={Math.abs(e.b![0] - e.a![0])} height={Math.abs(e.b![1] - e.a![1])} fill={fill} stroke={ink} stroke-width={w} vector-effect="non-scaling-stroke" />
	{:else if e.type === 'circle'}
		<circle cx={e.c![0]} cy={e.c![1]} r={e.r} fill={fill} stroke={ink} stroke-width={w} vector-effect="non-scaling-stroke" />
	{:else if e.type === 'ellipse'}
		<ellipse cx={(e.a![0] + e.b![0]) / 2} cy={(e.a![1] + e.b![1]) / 2} rx={Math.abs(e.b![0] - e.a![0]) / 2} ry={Math.abs(e.b![1] - e.a![1]) / 2} fill={fill} stroke={ink} stroke-width={w} vector-effect="non-scaling-stroke" />
	{:else if e.type === 'dim'}
		<line x1={e.a![0]} y1={e.a![1]} x2={e.b![0]} y2={e.b![1]} stroke={seld ? SEL : (e.color ?? '#0e766e')} stroke-width={w} vector-effect="non-scaling-stroke" />
		<text x={(e.a![0] + e.b![0]) / 2} y={(e.a![1] + e.b![1]) / 2 - 3} font-size="9" fill={seld ? SEL : (e.color ?? '#0e766e')} text-anchor="middle">{Math.round(dist(e.a!, e.b!))}</text>
	{:else if e.type === 'text'}
		{@const fs = (e.fontPt ?? STYLE_DEFAULTS.fontPt) * PT}
		{@const anchor = e.align === 'center' ? 'middle' : e.align === 'right' ? 'end' : 'start'}
		{@const lines = (e.text ?? '').split('\n')}
		{@const lh = fs * 1.18}
		<!-- vertical align shifts the whole block about the anchor a[1] (top = first baseline here). -->
		{@const oy = e.valign === 'middle' ? -((lines.length - 1) * lh) / 2 : e.valign === 'bottom' ? -((lines.length - 1) * lh) : 0}
		<text class="anno" x={e.a![0]} y={e.a![1] + oy} font-size={fs} fill={ink} font-weight="600" text-anchor={anchor} dominant-baseline={e.valign === 'middle' ? 'central' : undefined}>
			{#each lines as line, i (i)}<tspan x={e.a![0]} dy={i === 0 ? 0 : lh}>{line}</tspan>{/each}
		</text>
	{:else if e.type === 'box'}
		{@const f = boxFaces(e)}
		{#if kind === 'iso'}
			<!-- oblique cuboid: base footprint, two side faces, then the raised top -->
			<rect x={f.x0} y={f.y0} width={f.x1 - f.x0} height={f.y1 - f.y0} fill="none" stroke={ink} stroke-width={w} vector-effect="non-scaling-stroke" stroke-dasharray="2 2" opacity="0.5" />
			<polygon points={f.right} fill="#c2d1e8" stroke={ink} stroke-width={w} vector-effect="non-scaling-stroke" />
			<polygon points={f.back} fill="#b2c3dc" stroke={ink} stroke-width={w} vector-effect="non-scaling-stroke" />
			<polygon points={f.top} fill="#dce7f5" stroke={ink} stroke-width={w} vector-effect="non-scaling-stroke" />
		{:else if isElev}
			{@const fe = boxElev(e, elevDir, CX, CY)}
			<!-- side-elevation face: width (the projected footprint axis: x for front/rear, y for
			     left/right) × height, base at (ground − z0). Vertical is z0/height, NOT the plan depth. -->
			<rect x={fe.x0} y={fe.top} width={fe.x1 - fe.x0} height={fe.h} fill={e.fill ?? '#dce7f5'} stroke={ink} stroke-width={w} vector-effect="non-scaling-stroke" />
		{:else}
			<!-- plan: footprint rectangle -->
			<rect x={f.x0} y={f.y0} width={f.x1 - f.x0} height={f.y1 - f.y0} fill={e.fill ?? '#dce7f533'} stroke={ink} stroke-width={w} vector-effect="non-scaling-stroke" />
		{/if}
	{/if}
{/snippet}

{#snippet preview(a: Pt, p: Pt)}
	{#if tool === 'Line' || tool === 'Dimension'}
		<line x1={a[0]} y1={a[1]} x2={p[0]} y2={p[1]} stroke={SEL} stroke-width="1" stroke-dasharray="4 3" />
	{:else if tool === 'Rectangle'}
		<rect x={Math.min(a[0], p[0])} y={Math.min(a[1], p[1])} width={Math.abs(p[0] - a[0])} height={Math.abs(p[1] - a[1])} fill="none" stroke={SEL} stroke-width="1" stroke-dasharray="4 3" />
	{:else if tool === 'Ellipse'}
		<ellipse cx={(a[0] + p[0]) / 2} cy={(a[1] + p[1]) / 2} rx={Math.abs(p[0] - a[0]) / 2} ry={Math.abs(p[1] - a[1]) / 2} fill="none" stroke={SEL} stroke-width="1" stroke-dasharray="4 3" />
	{:else if tool === 'Box' || tool === 'Furniture' || tool === 'Opening'}
		<rect x={Math.min(a[0], p[0])} y={Math.min(a[1], p[1])} width={Math.abs(p[0] - a[0])} height={Math.abs(p[1] - a[1])} fill="none" stroke={SEL} stroke-width="1" stroke-dasharray="4 3" />
	{:else if tool === 'Section'}
		<rect x={Math.min(a[0], p[0])} y={Math.min(a[1], p[1])} width={Math.abs(p[0] - a[0])} height={Math.abs(p[1] - a[1])} fill="#0e749011" stroke="#0e7490" stroke-width="1.4" vector-effect="non-scaling-stroke" stroke-dasharray="6 3" />
	{/if}
{/snippet}

<style>
	.vp { position:relative; width:100%; height:100%; border:1.5px dashed #94a3b8; background:#fff; cursor:pointer; overflow:hidden; touch-action:none;
		user-select:none; -webkit-user-select:none; }
	.vp:hover { border-color:#5ac6d2; }
	.vp.active { border:1.5px solid #157a8b; box-shadow:0 0 0 2px #5ac6d233; cursor:default; }
	.vp-svg { display:block; width:100%; height:100%; }
	.vp-svg.model { background:#eef3f8; }
	/* Lineweights stay constant as the viewport zooms (like Kestrel / real CAD):
	   the view <g> scales the geometry, non-scaling-stroke keeps stroke thickness
	   fixed on screen. Fills and text still scale with the drawing. */
	.vp-svg :where(line, rect, circle, ellipse, polyline, polygon, path) { vector-effect: non-scaling-stroke; }
	.vp-svg text { font-family:'Inter','Segoe UI',system-ui,sans-serif; }
	/* Text annotations use a monospaced font (matches the Sheets tool). */
	.vp-svg text.anno { font-family:'Consolas','SF Mono',ui-monospace,'Menlo',monospace; }
	/* Kestrel/AutoCAD selection box: window (L→R) solid blue, crossing (R→L) dashed green. */
	/* Object-snap marker — amber, constant border, never intercepts pointer events. */
	.snap { fill:none; stroke:#f59e0b; stroke-width:1.4; vector-effect:non-scaling-stroke; pointer-events:none; }
	.marquee { pointer-events:none; }
	.marquee.window { fill:#3b82f61f; stroke:#3b82f6; stroke-width:1; }
	.marquee.crossing { fill:#10b9811f; stroke:#10b981; stroke-width:1; stroke-dasharray:5 3; }
	.vp-tag {
		position:absolute; top:6px; left:6px; display:flex; align-items:center; gap:5px;
		font-size:9px; color:#475569; background:#ffffffcc; border:1px solid #e2e8f0; border-radius:3px; padding:2px 6px;
	}
	.vp-tag :global(svg) { color:#94a3b8; }
	.vp-scale { color:#94a3b8; font-family:Consolas,monospace; }
	/* Opaque editor over the (hidden) text: dark text on white so it reads on the paper; auto-sized
	   to the content (width/height set inline from the value) so multi-line shows fully. */
	.text-edit { position:absolute; z-index:10; background:#fff; color:#111827; font-weight:600;
		border:1px solid #0e7490; border-radius:2px; padding:0 2px; font-family:inherit; resize:none; overflow:hidden; white-space:pre;
		box-shadow:0 1px 6px #0003; user-select:text; -webkit-user-select:text; }
	.text-edit { font-family:'Consolas','SF Mono',ui-monospace,'Menlo',monospace; }
	.text-edit:focus { outline:none; box-shadow:0 0 0 2px #0e749044; }
</style>
