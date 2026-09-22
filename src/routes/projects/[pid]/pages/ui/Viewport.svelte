<script lang="ts">
	// Reusable viewport (kestrel-adoption mockup) with mock CAD drawing modeled on
	// KestrelCad2 (src/app.js acceptPoint / preview / prompts, src/model.js entity
	// types): click-to-place tools with a rubber-band preview, and Select-tool
	// hit-testing. Used inside a sheet's paper page (kind='floorplan') and as a
	// standalone model view (kind='model'). The parent owns the entities/selection
	// (so drawing persists per document, tool + selection per view). Fills its parent.
	import { Icon } from '$lib'
	import { toast } from 'svelte-sonner'
	import { tick } from 'svelte'
	import { panzoom } from './panzoom'
	import Handle from '../parts/Handle.svelte'
	import { BASE, HANDLE_PX } from '../constants'
	import { type Pt, type Ent, type View, type ElevDir, DEFAULT_BOX_H, GROUND, PT, MMPU, PLAN_CX, PLAN_CY, STYLE_DEFAULTS, ELEV_BASIS, elevU, elevUInv, flatSpan, dist, segDist, translate, textBox, boxElev, boxElevSet, boxFaces } from './geometry'
	import { isLayerHidden, isLayerLocked, layerColor, layerOrder } from '../layers.svelte'
	import Model3d from '../3dview/Model3d.svelte'
	import { models, modelById, modelSel, setModelSel } from '../3dview/models.svelte'
	import { guideId, selectedPlanGuide } from '../guides.svelte'
	import { imgEdit, clearImgMode } from '../imageEdit.svelte'
	import { polyToGraph } from '../3dview/migrate'
	import { DEFAULT_YAW, DEFAULT_PITCH, doorGeom, isoBounds, isoR, faces3d, isoDepthR } from '../3dview/projection'
	import type { Obj, Clip } from '../3dview/types'
	// Pure geometry now lives in ./geometry (testable, shared with PropertiesPanel); re-export the
	// entity types so existing `import { type Ent } from './Viewport.svelte'` sites keep working.
	export type { Pt, Ent, View } from './geometry'
	// A section cut shown as a marker on the PLAN: its clip box, viewing direction, and the elevation's
	// label. Clicking the marker opens (or re-focuses) that elevation tab.
	export type SectionMarker = { id: string; clip: Clip; dir: ElevDir; label: string }

	// Drafting/interaction flags are grouped into one `env` object, and all the event callbacks into
	// one `on` object, to keep the prop list small (a step toward a headless editor class — see
	// review.md §4.1). `frame` is only used by PaperPage; the Viewport ignores it.
	export type Env = { acad?: boolean; navContent?: boolean; grid?: boolean; lwt?: boolean; osnap?: boolean; snap?: boolean; ortho?: boolean; cen?: boolean; canvasZoom?: number }
	export type VpOn = {
		activate?: () => void; deactivate?: () => void; add?: (e: Ent) => void; update?: (e: Ent) => void;
		delete?: (ids: string[]) => void; select?: (ids: string[]) => void; view?: (v: View) => void;
		status?: (text: string) => void; coords?: (x: number, y: number) => void; beginedit?: () => void;
		endedit?: (debounceMs?: number) => void; tool?: (name: string) => void; frame?: (f: unknown) => void;
		copy?: (ids: string[]) => void; cut?: (ids: string[]) => void; paste?: () => void;
		group?: (ids: string[]) => void; ungroup?: (ids: string[]) => void;
		reorder?: (ids: string[], op: 'front' | 'back' | 'forward' | 'backward') => void;
		scale?: (s: string) => void; modeledit?: (label?: string) => void; section?: (clip: Clip) => void; orbit?: (yaw: number, pitch: number) => void;
		sectionselect?: (id: string | null) => void; sectionopen?: (id: string) => void; sectionmove?: (id: string, clip: Clip) => void;
		sectionsetdir?: (id: string, dir: ElevDir) => void; sectiondelete?: (id: string) => void; sectiondrop?: (id: string) => void
	}
	let { label = 'Viewport', scale = '1:1', kind = 'floorplan', active = false, focused = true, tool = 'Select', boxW, boxH, border = 'dashed', env = {}, on = {}, frameId = undefined, modelId = undefined,
		entities = [], sel = [], view = { zoom: 1, x: 0, y: 0 }, clip = null, yaw = DEFAULT_YAW, pitch = DEFAULT_PITCH, sections = [], selSection = null }:
		{ label?: string; scale?: string; kind?: 'floorplan' | 'iso' | ElevDir; active?: boolean; tool?: string; boxW?: number; boxH?: number; border?: 'dashed' | 'solid' | 'none'; env?: Env; on?: VpOn; frameId?: string; modelId?: number;
			focused?: boolean; entities?: Ent[]; sel?: string[]; view?: View; clip?: Clip | null; yaw?: number; pitch?: number; sections?: SectionMarker[]; selSection?: string | null } = $props()
	// Callbacks are called directly as on.x?.(…) — no aliases (a $derived rename adds nothing for a
	// function that's only invoked). env flags stay derived because they're read as values.
	const acad = $derived(env.acad ?? true)
	const navContent = $derived(env.navContent ?? false)
	const lwt = $derived(env.lwt ?? true)
	const osnap = $derived(env.osnap ?? true)
	const snap = $derived(env.snap ?? false)     // SNAP: round points to the grid step
	const ortho = $derived(env.ortho ?? false)   // ORTHO: constrain line-draw + move to H/V
	const centerDraw = $derived(env.cen ?? false) // CEN: draw rect/ellipse centre-out (1st point = centre)
	const canvasZoom = $derived(env.canvasZoom ?? 1)
	// Centre-out corners: the first click `c` is the CENTRE, `p` the drag point → box centred on c.
	const centerCorners = (c: Pt, p: Pt): [Pt, Pt] => [[2 * c[0] - p[0], 2 * c[1] - p[1]], p]
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
	const DRAW = new Set(['Line', 'Rectangle', 'Ellipse', 'Dimension', 'Text', 'Box', 'Wall', 'Furniture', 'Trunk', 'Pipe', 'Section', 'Opening', 'Guide'])
	// Guide lines belong to a drawable VIEW space (plan or an elevation); iso has none.
	const viewSpace = $derived(kind === 'floorplan' ? 'plan' : isElev ? elevDir : null)
	const mdl = $derived(modelById(modelId) ?? models[0])   // the model this viewport renders/edits (§5 registry)
	const viewGuides = $derived(viewSpace ? (mdl?.guides ?? []).filter((g) => g.plane === viewSpace) : [])
	const GUIDE_SPAN = 1e7   // guides render as full-view lines (spanning far past the viewport)
	// Polyline-style tools (click points, Enter/dbl-click to finish). Line makes an entity; Wall/Trunk/Pipe
	// build MODEL graph objects (plan only).
	const POLY = new Set(['Line', 'Wall', 'Trunk', 'Pipe'])
	const MODEL_GRAPH = new Set(['Wall', 'Trunk', 'Pipe'])   // build a wall/conduit graph (plan view)
	const MODEL_TOOL = new Set(['Wall', 'Trunk', 'Pipe', 'Furniture', 'Section', 'Opening'])   // plan-only model tools
	// Body-hover cursor: 'move' over a shape (drag to move), else default; grips carry their own
	// crosshair (they render on top, so their cursor wins over the container's).
	let hoverBody = $state(false)
	let cursorStyle = $derived(!active ? 'pointer' : DRAW.has(tool) ? 'crosshair' : hoverBody ? 'move' : 'default')


	// ── drawing (Kestrel-style) ──
	const INK = '#475569', SEL = '#0e7490'
	let svg: SVGSVGElement | undefined = $state()   // outer svg (viewBox space)
	let draft = $state<Pt[]>([])
	let cur = $state<Pt | null>(null)
	let shiftDown = $state(false)   // for aspect-lock override during an image resize
	let scalePts = $state<Pt[]>([])   // the 2-point measure line while calibrating an image's scale
	// The image being calibrated is only shown here if its layer is visible AND it belongs to this view;
	// its overlays (measure line, entry, origin) hide with it.
	const editImgVisible = $derived.by(() => {
		if (!imgEdit.id) return false
		const img = entities.find((e) => e.id === imgEdit.id)
		return !!img && !isLayerHidden(img.layer) && inThisView(img)
	})
	let scaleReal = $state<string | null>(null)   // the user's real-distance entry (null = not calibrating scale)
	// Position + measured distance of the scale entry are DERIVED from the 2 points (+ pan/zoom), so the box
	// tracks the line automatically; only `scaleReal` (typed value) is state. null until both points exist.
	const scaleGeom = $derived.by(() => {
		if (scalePts.length !== 2 || scaleReal === null || !svg || !editImgVisible) return null
		const d = dist(scalePts[0], scalePts[1])
		const m = localToClient((scalePts[0][0] + scalePts[1][0]) / 2, (scalePts[0][1] + scalePts[1][1]) / 2)
		if (!m) return null
		const r = svg.getBoundingClientRect()
		return { x: m.x - r.left, y: m.y - r.top, d }
	})
	let seq = 0
	const uid = () => 'e' + Date.now().toString(36) + (seq++)
	const clipNs = 'ic' + Math.floor(Math.random() * 1e9).toString(36)   // per-viewport-instance namespace for <clipPath> ids (a sheet renders the same image in several viewports → ids must not collide)
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
		// Wheel-zoom always FREE-zooms this viewport's own content view (`on.view`, keyed per pane+tab), so
		// zooming one split pane never touches the other — even when both show the same tab. (It used to
		// fold the zoom into the tab-shared drawing `scale`, which re-scaled both panes together.) The
		// drawing scale stays an explicit property, changed only via the scale selector.
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
	const drawPlane = () => (isElev ? elevDir : undefined)   // the DRAWING PLANE new geometry lands in (plan or this elevation)
	function place(a: Pt, b: Pt) {
		const sp = drawPlane()
		if (tool === 'Line') on.add?.({ id: uid(), type: 'line', a, b, plane: sp })
		else if (tool === 'Rectangle') { const [ra, rb] = centerDraw ? centerCorners(a, b) : [a, b]; on.add?.({ id: uid(), type: 'rect', a: ra, b: rb, plane: sp }) }
		else if (tool === 'Ellipse') { const [ra, rb] = centerDraw ? centerCorners(a, b) : [a, b]; on.add?.({ id: uid(), type: 'ellipse', a: ra, b: rb, plane: sp }) }
		else if (tool === 'Box') on.add?.({ id: uid(), type: 'box', a, b, h: DEFAULT_BOX_H })
		else if (tool === 'Furniture' && isPlan) placePrism(a, b, 'furniture', 750, 'f')   // MODEL prism footprint
		else if (tool === 'Opening' && isPlan) placePrism(a, b, 'openings', 2100, 'o')      // door/window/hole (dashed outline)
		else if (tool === 'Section' && isPlan && mdl) {   // §4 — clip box on the plan → spawn a front elevation
			on.section?.({ x0: Math.round(Math.min(a[0], b[0])), y0: Math.round(Math.min(a[1], b[1])), z0: 0,
				x1: Math.round(Math.max(a[0], b[0])), y1: Math.round(Math.max(a[1], b[1])), z1: mdl.levels?.ceilingSlab ?? 3200 })
		}
		else if (tool === 'Dimension') on.add?.({ id: uid(), type: 'dim', a, b, plane: sp })
	}
	// The Line tool draws a POLYLINE in AutoCAD mode: keep clicking to add segments, Enter /
	// double-click / right-click to finish (Esc cancels). (EOS press-drag = a single segment.)
	function finishPolyline() {
		let pts = draft
		while (pts.length >= 2 && dist(pts.at(-1)!, pts.at(-2)!) < 0.01) pts = pts.slice(0, -1)   // drop the double-click's zero-length tail
		if (tool === 'Line' && pts.length >= 2) on.add?.({ id: uid(), type: 'polyline', pts: pts.map(p => [...p] as Pt), plane: drawPlane() })
		else if (MODEL_GRAPH.has(tool) && pts.length >= 2 && (isPlan || isElev)) placeGraph(pts)   // Wall / Trunk / Pipe (plan or elevation — vertical runs)
		draft = []; cur = null; snapMark = null
	}
	function onClick(e: MouseEvent) {
		e.stopPropagation()
		if (suppressClick) { suppressClick = false; return }   // this click just ended a drag
		if (!active) return   // paper space: enter with a double-click (see onDblclick)
		// IMAGE calibration modes (Properties › Set scale / Set origin) intercept clicks on the image.
		if (imgEdit.mode === 'origin' && imgEdit.id) { const p = toLocal(e); if (p) setImageOrigin(imgEdit.id, p); return }
		if (imgEdit.mode === 'scale' && imgEdit.id && scaleReal === null) {
			const p = toLocal(e); if (!p) return
			scalePts = [...scalePts, p]
			if (scalePts.length === 2) scaleReal = String(Math.round(dist(scalePts[0], scalePts[1])))   // pre-fill with the measurement
			return
		}
		if (tool === 'Select') {
			const p = toLocal(e); if (!p) return
			if (kind === 'iso') {   // 3D view: click a shape to select it for the Properties panel (no in-view grips yet)
				const mid = hitModelIso(p); setModelSel(mid ? [mid] : []); on.select?.([])
				return
			}
			const g = expandGroup(hit(p))   // the clicked entity + any group it belongs to
			if (e.shiftKey || e.ctrlKey || e.metaKey) {   // additive: toggle the whole group
				if (g.length) { const allSel = g.every(x => selSet.has(x)); on.select?.(allSel ? sel.filter(x => !g.includes(x)) : [...new Set([...sel, ...g])]) }
			} else {
				// entity click wins; else a model object; else a section marker; else a guide line; else clear.
				if (g.length) { on.select?.(g); setModelSel([]); on.sectionselect?.(null) }
				else { const mid = hitModel(p); if (mid) { setModelSel([mid]); on.select?.([]); on.sectionselect?.(null) }
					else { const sid = hitSection(p); if (sid) { on.sectionselect?.(sid); setModelSel([]) }   // click a marker border → SELECT it (grips + toolbar); open via the link button
						else { const gid = hitGuide(p); if (gid) { setModelSel([gid]); on.select?.([]); on.sectionselect?.(null) }   // guide selection reuses modelSel (it lives in the model now)
							else { on.select?.([]); setModelSel([]); on.sectionselect?.(null) } } } }
			}
			return
		}
		if (tool === 'Text') { const p = drawPoint(e.clientX, e.clientY); if (p) on.add?.({ id: uid(), type: 'text', a: p, text: 'TEXT', plane: drawPlane() }); snapMark = null; return }
		if (tool === 'Guide') { const p = toLocal(e); if (p) placeGuide(p, e.shiftKey); return }   // drop an alignment guide (Shift = vertical)
		// Model objects are placed in the plan — EXCEPT wall/trunk/pipe graphs, which can also be drawn in
		// an elevation (a vertical wall conduit). Furniture / Section / Opening stay plan-only.
		if (MODEL_TOOL.has(tool) && !isPlan && !(MODEL_GRAPH.has(tool) && isElev)) return
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
	let hoverPt = $state<Pt | null>(null)   // snapped draw point under the cursor (drives the crosshair, even before the first click)
	function onMove(e: MouseEvent) {
		if (on.coords) { const wp = toLocalXY(e.clientX, e.clientY); if (wp) on.coords(Math.round(wp[0]), Math.round(wp[1])) }   // world (model-unit) coords for the status bar
		if (active && tool === 'Guide' && viewSpace) { const gp = toLocalXY(e.clientX, e.clientY); lastGuidePt = gp; guideCur = gp ? { orient: e.shiftKey ? 'v' : 'h', pos: e.shiftKey ? gp[0] : gp[1] } : null } else if (guideCur) { guideCur = null; lastGuidePt = null }
		if (active && draft.length) { const sp = drawPoint(e.clientX, e.clientY, draft.at(-1), e.shiftKey); if (sp) { lastRaw = toLocalXY(e.clientX, e.clientY); cur = sp; hoverPt = sp } }
		else if (active && DRAW.has(tool) && tool !== 'Guide') hoverPt = drawPoint(e.clientX, e.clientY, undefined, e.shiftKey)   // snapped hover point before the first click (crosshair + snap marker)
		else hoverPt = null
		// hover feedback for the Select tool: 'move' when over a shape body (a grip shows its own cursor)
		if (active && tool === 'Select' && !drag && !mDrag && !draft.length && !marquee) {
			const lp = toLocalXY(e.clientX, e.clientY)
			hoverBody = !!lp && (hit(lp).length > 0 || !!hitModel(lp) || !!hitGuide(lp))   // a guide is draggable → show 'move'
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
		if (tool === 'Select' && modelEditable) insertGraphNode(p)   // dbl-click a wall/conduit segment → add a vertex (plan or elevation)
	}
	// Right-click in the viewport (CAD-style): during a multi-point draw it ENDS the draft (= Enter /
	// dbl-click); with a drawing tool selected and no draft it REVERTS to Select (like Esc — Dave prefers
	// right-click). A right-DRAG is a pan, so only a genuine click (little movement since right-down)
	// reverts — `rDownPt` records where the right button went down. Otherwise fall through to the browser
	// menu (panzoom's own handler suppresses it over an active canvas). Only swallow when we consumed it.
	function onContext(e: MouseEvent) {
		if (!active) return
		if (POLY.has(tool) && draft.length) { e.preventDefault(); e.stopPropagation(); finishPolyline(); return }
		const moved = rDownPt ? Math.hypot(e.clientX - rDownPt.x, e.clientY - rDownPt.y) > 5 : false
		rDownPt = null
		if (!moved && tool !== 'Select') { e.preventDefault(); e.stopPropagation(); draft = []; cur = null; snapMark = null; on.tool?.('Select') }
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
		if (e.key === 'Shift') { shiftDown = true; reconstrain(true); updateGuidePreview(true); return }
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
		if ((e.key === 'Delete' || e.key === 'Backspace') && nodeSelValid && !draft.length) { e.preventDefault(); deleteGraphNode(nodeSelValid); nodeSel = null; return }
		if ((e.key === 'Delete' || e.key === 'Backspace') && modelSel.length && !draft.length) { e.preventDefault(); deleteModelSel(); return }
		if ((e.key === 'Delete' || e.key === 'Backspace') && selSection && !draft.length) { e.preventDefault(); on.sectiondelete?.(selSection); return }
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
		// Esc ladder: exit an image-edit mode → cancel a draft → switch a drawing tool back to Select → …
		if (imgEdit.mode) { clearImgMode(); scalePts = []; scaleReal = null }
		else if (draft.length) { draft = []; cur = null; snapMark = null }
		else if (tool !== 'Select') on.tool?.('Select')
		else if (selSection) on.sectionselect?.(null)
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
	const onPlanPlane = (e: Ent) => !e.plane || e.plane === 'plan'
	// A viewport-local (view:<frameId>) annotation shows only in its own frame; a model-scoped one shows in
	// every view. `frameId` is this viewport's id (undefined for a model-layout tab → only model-scoped show).
	const inScope = (e: Ent) => !e.space || e.space === 'model' || e.space === 'view:' + frameId
	// In-view = the object's DRAWING PLANE matches this view (plan projects into every elevation as a ground
	// line; an elevation-native object shows only in that elevation) AND its scope includes this frame.
	// In the 3D ISO view, hide flat plan-plane 2D annotations for now (they'd float unprojected) — only the
	// `box` (a real 3D cuboid) projects; true ground-plane projection of 2D shapes is the v2 work (todo §2).
	const inThisView = (e: Ent) => inScope(e) && (onPlanPlane(e) || e.plane === kind) && !(kind === 'iso' && onPlanPlane(e) && e.type !== 'box')
	const isFlatElev = (e: Ent) => isElev && FLAT.has(e.type) && onPlanPlane(e)   // only floor flats collapse to the ground line
	// Horizontal drawing span of a flat object projected onto the ground line for the current side view.
	function flatXSpan(e: Ent): [number, number] { return flatSpan(e, elevDir, CX, CY) }
	// Rotation (degrees, about the entity's view-bbox centre): render, hit and grips all honour it.
	// bbox() returns the UNrotated extent, so its centre is the correct pivot.
	const rotCenter = (e: Ent): Pt => { const [x0, y0, x1, y1] = bbox(e); return [(x0 + x1) / 2, (y0 + y1) / 2] }
	function rotatePt(p: Pt, c: Pt, deg: number): Pt { const a = deg * Math.PI / 180, s = Math.sin(a), co = Math.cos(a), dx = p[0] - c[0], dy = p[1] - c[1]; return [c[0] + dx * co - dy * s, c[1] + dx * s + dy * co] }
	// A CLOSED shape (rect/ellipse/circle/box-footprint) with no fill is selected by its OUTLINE only
	// (like CAD) — the empty interior is not a hitbox; a filled one picks anywhere inside. `thr` is the
	// pick band half-width (drawing units). `inBox` = point within thr of the rect border, or inside a fill.
	const isFilled = (e: Ent) => !!e.fill && e.fill !== 'none'
	function inBox(p: Pt, x0: number, y0: number, x1: number, y1: number, thr: number, filled: boolean): boolean {
		const outer = p[0] >= x0 - thr && p[0] <= x1 + thr && p[1] >= y0 - thr && p[1] <= y1 + thr
		if (!outer) return false
		if (filled) return true
		const inner = p[0] > x0 + thr && p[0] < x1 - thr && p[1] > y0 + thr && p[1] < y1 - thr
		return !inner   // within the border band only
	}
	function hitEnt(e: Ent, p: Pt, thr: number): boolean {
		if (e.rot) p = rotatePt(p, rotCenter(e), -e.rot)   // test in the entity's un-rotated frame
		if (isFlatElev(e)) { const [x0, x1] = flatXSpan(e); return segDist(p, [x0, GROUND], [x1, GROUND]) < thr }
		if (e.type === 'polyline') { const pts = e.pts ?? []; for (let i = 0; i + 1 < pts.length; i++) if (segDist(p, pts[i], pts[i + 1]) < thr) return true; return false }
		if (e.type === 'line' || e.type === 'dim') return segDist(p, e.a!, e.b!) < thr
		if (e.type === 'box' && isElev) { const f = boxElev(e, elevDir, CX, CY); return inBox(p, f.x0, f.top, f.x1, f.base, thr, true) }   // elevation box draws a filled face
		if (e.type === 'image') { const [x0, y0, x1, y1] = bbox(e); return inBox(p, x0, y0, x1, y1, thr, true) }   // pick anywhere inside the VISIBLE (crop-window) extent
		if (e.type === 'rect' || e.type === 'box') { const x0 = Math.min(e.a![0], e.b![0]), y0 = Math.min(e.a![1], e.b![1]), x1 = Math.max(e.a![0], e.b![0]), y1 = Math.max(e.a![1], e.b![1]); return inBox(p, x0, y0, x1, y1, thr, e.type !== 'rect' || isFilled(e)) }   // box picks anywhere inside
		if (e.type === 'circle') { const d = dist(e.c!, p); return isFilled(e) ? d <= e.r! + thr : Math.abs(d - e.r!) <= thr }
		if (e.type === 'ellipse') {
			const cx = (e.a![0] + e.b![0]) / 2, cy = (e.a![1] + e.b![1]) / 2
			const hx = Math.abs(e.b![0] - e.a![0]) / 2, hy = Math.abs(e.b![1] - e.a![1]) / 2
			const outer = ((p[0] - cx) / ((hx + thr) || 1)) ** 2 + ((p[1] - cy) / ((hy + thr) || 1)) ** 2 <= 1
			if (!outer) return false
			if (isFilled(e)) return true
			const inner = ((p[0] - cx) / ((hx - thr) || 1)) ** 2 + ((p[1] - cy) / ((hy - thr) || 1)) ** 2 < 1
			return !inner   // ring band around the outline only
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
	// The origin anchor of the selected / being-edited image, in model coords (null if none has an origin,
	// or its layer is hidden, or it isn't shown in this view — the marker must vanish with the image).
	const originMark = $derived.by(() => {
		const img = entities.find((e) => e.type === 'image' && e.origin && !isLayerHidden(e.layer) && inThisView(e) && (selSet.has(e.id) || imgEdit.id === e.id))
		if (!img?.origin) return null
		const rx = Math.min(img.a![0], img.b![0]), ry = Math.min(img.a![1], img.b![1]), rw = Math.abs(img.b![0] - img.a![0]), rh = Math.abs(img.b![1] - img.a![1])
		return [rx + img.origin.x * rw, ry + img.origin.y * rh] as Pt
	})
	// PAINT ORDER = layer order first (array position in the layers store — earlier layer = underneath),
	// then the entity's own array position within a layer. So dragging a layer in the panel restacks its
	// objects (imported backgrounds included). No layer / unknown → paints on top (the tool default).
	const paintEnts = $derived(
		entities
			.map((e, i) => { const lo = layerOrder(e.layer); return { e, i, o: lo < 0 ? 1e9 : lo } })
			.sort((a, b) => a.o - b.o || a.i - b.i)
			.map((x) => x.e)
	)
	function hit(p: Pt): string[] {
		// ~3.5px of slack on EITHER side of a line/border (≈7px total pick width) in SCREEN px. Entity
		// coords + `p` are in unscaled drawing space, so convert screen px → drawing units = hitTol()/dscale
		// (hitTol alone is in viewBox-scaled units — the old raw hitTol(7) shrank to sub-pixel at 1:25).
		const thr = hitTol(3.5) / (dscale || 1)
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
	// else null. Snapping coincides the coords so runs join. `origin` (the drag's start position) lets a
	// node be pulled OFF a partner it started coincident with — DISCONNECT: candidates within a break
	// radius of the origin are skipped, so re-snapping only grabs a genuinely new target.
	function snapNode(p: Pt, exclude: GN, origin?: Pt): Pt | null {
		if (!mdl) return null
		const thr = hitTol(10) / (dscale || 1)   // ~10px in model units
		const brk = hitTol(8) / (dscale || 1)    // pull-apart radius around the drag origin
		let best: Pt | null = null, bestD = thr
		for (const o of mdl.objects) {
			if ((o.type !== 'wall' && o.type !== 'conduit') || !modelLayerVisible(o)) continue
			for (const nn of o.nodes as GN[]) {
				if (nn === exclude) continue
				const d = graphNodeDraw(nn)
				if (origin && Math.hypot(d[0] - origin[0], d[1] - origin[1]) < brk) continue   // don't re-grab the node we're leaving
				const dd = Math.hypot(d[0] - p[0], d[1] - p[1])
				if (dd < bestD) { bestD = dd; best = d }
			}
		}
		return best
	}
	function graphNodeApply(n: GN, p: Pt, origin?: Pt) {
		const q = snapNode(p, n, origin) ?? p   // snap to a nearby node so runs join
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
	// 3D (iso) PICK: the frontmost object whose projected 3D face contains p — so you can click a shape in
	// the 3D view to select it (edit props in the panel). Reproduces Model3d's iso projection: each face
	// vertex → isoR → the same centring xform (translate(CX−icx, CY+icy) scale(1 −1)) → drawing coords.
	// Frontmost = smallest camera depth (isoDepthR: larger = farther). Geometry editing in iso stays
	// deferred (no grips); this is selection only.
	function hitModelIso(p: Pt): string | null {
		if (!mdl) return null
		const b = isoBounds(mdl.objects, yaw, pitch, CX, CY, modelLayerVisible); if (!b) return null
		const D = (v: { x: number; y: number; z: number }): Pt => { const q = isoR(v, yaw, pitch, CX, CY); return [q.u + CX - b.icx, -q.v + CY + b.icy] }
		const inPoly = (pt: Pt, poly: Pt[]) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], d = poly[j]; if ((a[1] > pt[1]) !== (d[1] > pt[1]) && pt[0] < ((d[0] - a[0]) * (pt[1] - a[1])) / (d[1] - a[1]) + a[0]) c = !c } return c }
		let best: string | null = null, bestDepth = Infinity
		for (const o of mdl.objects) {
			if (!o.id || !modelLayerVisible(o)) continue
			for (const f of faces3d(o)) {
				if (f.pts.length < 3) continue
				const D3 = f.pts.map(D)
				if (!inPoly(p, D3)) continue
				// True depth AT the click point (not the centroid): depth is affine in the projected plane,
				// so interpolate from the first 3 verts — a big face no longer beats a nearer small one.
				const d0 = D3[0], d1 = D3[1], d2 = D3[2]
				const v0x = d1[0] - d0[0], v0y = d1[1] - d0[1], v1x = d2[0] - d0[0], v1y = d2[1] - d0[1]
				const den = v0x * v1y - v1x * v0y; if (Math.abs(den) < 1e-6) continue
				const v2x = p[0] - d0[0], v2y = p[1] - d0[1]
				const bb = (v2x * v1y - v1x * v2y) / den, cc = (v0x * v2y - v2x * v0y) / den
				const z0 = isoDepthR(f.pts[0], yaw, pitch, CX, CY), z1 = isoDepthR(f.pts[1], yaw, pitch, CX, CY), z2 = isoDepthR(f.pts[2], yaw, pitch, CX, CY)
				const depth = (1 - bb - cc) * z0 + bb * z1 + cc * z2
				if (depth < bestDepth) { bestDepth = depth; best = o.id }
			}
		}
		return best
	}
	// A section marker under p (plan only): its box BORDER within tolerance (the interior stays free for
	// model/entity picks). Returns the section id, topmost last-drawn first.
	function hitSection(p: Pt): string | null {
		if (!isPlan || !sections.length) return null
		const thr = hitTol(6) / (dscale || 1)   // screen px → UNSCALED model units (border is an edge-distance test)
		for (let i = sections.length - 1; i >= 0; i--) {
			const c = sections[i].clip
			const corners: Pt[] = [[c.x0, c.y0], [c.x1, c.y0], [c.x1, c.y1], [c.x0, c.y1]]
			for (let k = 0; k < 4; k++) if (segDist(p, corners[k], corners[(k + 1) % 4]) < thr) return sections[i].id
		}
		return null
	}
	// The currently-selected section marker (grips + toolbar), if it's shown in this plan view.
	const selSectionObj = $derived.by(() => (isPlan && selSection ? sections.find((s) => s.id === selSection) ?? null : null))
	// A section clip's 4 corners in drawing coords, order tl,tr,br,bl (normalised min→max).
	function sectionCorners(c: Clip): Pt[] {
		const x0 = Math.min(c.x0, c.x1), x1 = Math.max(c.x0, c.x1), y0 = Math.min(c.y0, c.y1), y1 = Math.max(c.y0, c.y1)
		return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
	}
	// Resize the selected section by dragging corner `gi` to p, holding the opposite corner fixed (x/y
	// only — z stays the section's cut band). Returns the new clip. `anchor` = the opposite corner.
	function resizeSectionClip(c: Clip, gi: number, p: Pt, anchor: Pt): Clip {
		return { ...c, x0: Math.round(Math.min(p[0], anchor[0])), x1: Math.round(Math.max(p[0], anchor[0])), y0: Math.round(Math.min(p[1], anchor[1])), y1: Math.round(Math.max(p[1], anchor[1])) }
	}
	// Which corner grip of the selected section a press grabs (constant screen tolerance), with a resize
	// apply that mutates the clip about the fixed opposite corner. null = no grip under the cursor.
	function pickSectionGrip(clientX: number, clientY: number): { id: string; apply: (p: Pt) => Clip } | null {
		if (!selSectionObj) return null
		const cs = sectionCorners(selSectionObj.clip), id = selSectionObj.id, c0 = { ...selSectionObj.clip }
		for (let gi = 0; gi < 4; gi++) { const sp = localToClient(cs[gi][0], cs[gi][1]); if (sp && Math.hypot(sp.x - clientX, sp.y - clientY) < 14) return { id, apply: (p: Pt) => resizeSectionClip(c0, gi, p, cs[(gi + 2) % 4]) } }
		return null
	}
	// Screen position (in .vp-local px) for the selected section's floating toolbar — pinned just above
	// the box's top-left, tracking pan/zoom (reads view/canvasZoom/vpW so it recomputes as they change).
	const secToolbar = $derived.by(() => {
		void view; void canvasZoom; void vpW; void vpH   // deps: reposition on pan/zoom/resize
		if (!active || !selSectionObj || !svg) return null
		const bx = Math.min(selSectionObj.clip.x0, selSectionObj.clip.x1), by = Math.min(selSectionObj.clip.y0, selSectionObj.clip.y1)
		const sp = localToClient(bx, by); if (!sp) return null
		const r = svg.getBoundingClientRect()
		return { x: sp.x - r.left, y: sp.y - r.top, id: selSectionObj.id, dir: selSectionObj.dir }
	})
	// The section marker's direction arrow, drawn INSIDE the rect: the observer stands at one edge and
	// looks across, so the arrow's TAIL sits just inside the edge OPPOSITE the sight and the tip points
	// the way the elevation looks — front = tail at the bottom edge pointing up, rear = top edge pointing
	// down, right = left edge pointing right, left = right edge pointing left (matches the dropdown +
	// ELEV_BASIS). Sized in ~screen px (hitTol). `dir` is one of front/rear/left/right.
	function sectionArrowFor(c: Clip, dir: ElevDir): string {
		const x0 = Math.min(c.x0, c.x1), x1 = Math.max(c.x0, c.x1), y0 = Math.min(c.y0, c.y1), y1 = Math.max(c.y0, c.y1)
		const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, a = hitTol(11) / (dscale || 1)   // ~screen px in unscaled model units
		const pad = a * 0.9
		let tail: Pt, d: Pt
		if (dir === 'front') { tail = [cx, y1 - pad]; d = [0, -1] }        // bottom edge, look up
		else if (dir === 'rear') { tail = [cx, y0 + pad]; d = [0, 1] }     // top edge, look down
		else if (dir === 'right') { tail = [x0 + pad, cy]; d = [1, 0] }    // left edge, look right
		else { tail = [x1 - pad, cy]; d = [-1, 0] }                        // right edge, look left
		const perp: Pt = [-d[1], d[0]], w = a * 0.8
		const tip: Pt = [tail[0] + d[0] * a * 1.8, tail[1] + d[1] * a * 1.8]
		const b1: Pt = [tail[0] + perp[0] * w, tail[1] + perp[1] * w], b2: Pt = [tail[0] - perp[0] * w, tail[1] - perp[1] * w]
		return `${tip[0]},${tip[1]} ${b1[0]},${b1[1]} ${b2[0]},${b2[1]}`
	}
	const sectionArrowPts = (s: SectionMarker): string => sectionArrowFor(s.clip, s.dir)

	// ── alignment GUIDES ── the Guide tool drops a full-view h/v line (Shift = vertical) in this view's
	// space; a selected PLAN guide then fixes the depth when drawing a conduit in an elevation.
	let guideCur = $state<{ orient: 'h' | 'v'; pos: number } | null>(null)   // hover preview for the Guide tool
	let lastGuidePt: Pt | null = null   // last cursor point, so Shift can flip the preview orientation instantly
	function updateGuidePreview(shift: boolean) {   // re-orient the Guide preview on Shift, without a mousemove
		if (tool !== 'Guide' || !lastGuidePt) return
		guideCur = { orient: shift ? 'v' : 'h', pos: shift ? lastGuidePt[0] : lastGuidePt[1] }
	}
	function placeGuide(p: Pt, shift: boolean) {
		if (!viewSpace || !mdl) return
		const orient = shift ? 'v' : 'h'
		on.beginedit?.()   // capture the pre-add baseline, then fold the add into one undo step (model history)
		;(mdl.guides ??= []).push({ id: guideId(), plane: viewSpace, orient, pos: Math.round(orient === 'h' ? p[1] : p[0]) })
		on.modeledit?.('Add guide'); on.endedit?.()
	}
	// IMAGE calibration (Uploads-tool model). ORIGIN: store the clicked point as a normalized anchor.
	function setImageOrigin(id: string, p: Pt) {
		const img = entities.find((x) => x.id === id); if (!img || img.type !== 'image') return
		const rx = Math.min(img.a![0], img.b![0]), ry = Math.min(img.a![1], img.b![1]), rw = Math.abs(img.b![0] - img.a![0]) || 1, rh = Math.abs(img.b![1] - img.a![1]) || 1
		on.update?.({ ...img, origin: { x: Math.max(0, Math.min(1, (p[0] - rx) / rw)), y: Math.max(0, Math.min(1, (p[1] - ry) / rh)) } })
		clearImgMode()
	}
	// SCALE: after the 2-point line + a real-world distance, resize the image (a→b) by real/measured about
	// its origin (or centre), so that measurement is correct in model mm. Keeps the anchor point fixed.
	// Drag an endpoint of the measure line to adjust it (the geometry + measured distance are derived).
	let scaleDrag: number | null = null
	function onScaleDragMove(ev: PointerEvent) {
		if (scaleDrag == null) return
		const p = toLocalXY(ev.clientX, ev.clientY); if (!p) return
		scalePts = scalePts.map((sp, i) => (i === scaleDrag ? p : sp))
	}
	function onScaleDragUp() { scaleDrag = null; window.removeEventListener('pointermove', onScaleDragMove); window.removeEventListener('pointerup', onScaleDragUp) }
	function applyScale() {
		const d = scaleGeom?.d ?? 0, real = parseFloat(scaleReal ?? '')
		const img = imgEdit.id ? entities.find((x) => x.id === imgEdit.id) : null
		scaleReal = null; scalePts = []; clearImgMode()
		if (!img || img.type !== 'image' || !(real > 0) || !(d > 0)) return
		const f = real / d
		const rx = Math.min(img.a![0], img.b![0]), ry = Math.min(img.a![1], img.b![1]), rw = Math.abs(img.b![0] - img.a![0]), rh = Math.abs(img.b![1] - img.a![1])
		const ax = img.origin ? rx + img.origin.x * rw : rx + rw / 2, ay = img.origin ? ry + img.origin.y * rh : ry + rh / 2
		const na: Pt = [ax + (img.a![0] - ax) * f, ay + (img.a![1] - ay) * f]
		const nb: Pt = [ax + (img.b![0] - ax) * f, ay + (img.b![1] - ay) * f]
		on.update?.({ ...img, a: na, b: nb })
	}
	function hitGuide(p: Pt): string | null {
		if (!viewGuides.length) return null
		const thr = hitTol(6) / (dscale || 1)
		for (let i = viewGuides.length - 1; i >= 0; i--) { const g = viewGuides[i]; if (Math.abs((g.orient === 'h' ? p[1] : p[0]) - g.pos) < thr) return g.id }
		return null
	}
	// DRAG a guide to reposition it — one history gesture (begin → move → 'Move guide' on release, on the
	// MODEL history). The guide is a live proxy in the model's `guides` array, so mutating `pos` is reactive.
	let guideDrag: { id: string; moved: boolean } | null = null
	function onGuideDragMove(e: PointerEvent) {
		if (!guideDrag) return
		const p = toLocalXY(e.clientX, e.clientY); if (!p) return
		const g = mdl?.guides?.find((x) => x.id === guideDrag!.id); if (!g) return
		g.pos = Math.round(g.orient === 'h' ? p[1] : p[0])
		guideDrag.moved = true
	}
	function onGuideDragUp() {
		window.removeEventListener('pointermove', onGuideDragMove)
		window.removeEventListener('pointerup', onGuideDragUp)
		if (guideDrag?.moved) { suppressClick = true; on.modeledit?.('Move guide') }
		on.endedit?.()
		guideDrag = null
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
	// A single wall/conduit NODE selected (by clicking its grip without dragging) — enables node-level
	// Delete (segments handled by degree). Cleared on any fresh press; only valid while its object is selected.
	let nodeSel = $state<{ obj: string; node: string } | null>(null)
	const nodeSelValid = $derived(nodeSel && mSelObj?.id === nodeSel.obj && (mSelObj as { nodes?: GN[] }).nodes?.some((n) => n.id === nodeSel!.node) ? nodeSel : null)
	// The prism's 4 corner grips in drawing coords, order tl,tr,br,bl (matches prismRect's face / footprint).
	function prismCorners(o: Obj): Pt[] {
		const r = prismRect(o); if (!r) return []
		let cs: Pt[] = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]]
		if (isPlan && o.type === 'prism' && o.rot) { const c: Pt = [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2]; cs = cs.map((p) => rotatePt(p, c, o.rot!)) }   // grips follow the rotation
		return cs
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
	// Grips of the selected object: prism = 4 resize corners (about the opposite corner, captured now)
	// + a rotate handle; wall/conduit = one move-handle per node. `apply(p, origin)` mutates the store
	// object given a drawing point (origin = the drag start, so a node grip can be pulled off a partner).
	// `node`/`obj` are carried on wall/conduit node grips so an Alt-press can BRANCH a new segment.
	type MGrip = { x: number; y: number; apply: (p: Pt, origin?: Pt) => void; node?: GN; obj?: Obj }
	function modelGrips(o: Obj): MGrip[] {
		if (o.type === 'prism') {
			const cs = prismCorners(o)
			const grips: MGrip[] = cs.map((c, gi) => ({ x: c[0], y: c[1], apply: (p: Pt) => applyPrismGrip(o, gi, p, cs[(gi + 2) % 4]) }))
			if (isPlan && o.open !== 'door') {   // rotate handle above the top-centre, following the rotation
				const cx = o.x + o.w / 2, cy = o.y + o.d / 2, off = o.d / 2 + Math.max(o.w, o.d) * 0.35
				const hp = o.rot ? rotatePt([cx, cy - off], [cx, cy], o.rot) : [cx, cy - off] as Pt
				grips.push({ x: hp[0], y: hp[1], apply: (p: Pt) => { o.rot = Math.round(((Math.atan2(p[1] - cy, p[0] - cx) * 180) / Math.PI + 90 + 360) % 360) } })
			}
			if (isPlan && o.open === 'door') {   // door SWING handle at the leaf tip — drag to set the swing angle
				const g = doorGeom(o), a = (o.swing ?? 90) * Math.PI / 180
				const tx = g.hx + g.L * (Math.cos(a) * g.ux + Math.sin(a) * g.vx), ty = g.hy + g.L * (Math.cos(a) * g.uy + Math.sin(a) * g.vy)
				grips.push({ x: tx, y: ty, apply: (p: Pt) => {
					const ang = Math.atan2((p[0] - g.hx) * g.vx + (p[1] - g.hy) * g.vy, (p[0] - g.hx) * g.ux + (p[1] - g.hy) * g.uy) * 180 / Math.PI
					o.swing = Math.round(Math.max(0, Math.min(180, ang)))
				} })
			}
			return grips
		}
		if (o.type === 'wall' || o.type === 'conduit') {
			return (o.nodes as GN[]).map((n) => { const d = graphNodeDraw(n); return { x: d[0], y: d[1], node: n, obj: o, apply: (p: Pt, origin?: Pt) => graphNodeApply(n, p, origin) } })
		}
		return []
	}
	// Which grip of the selected object a press grabs (constant screen tolerance).
	function pickModelGrip(clientX: number, clientY: number): MGrip | null {
		if (!mSelObj) return null
		for (const g of modelGrips(mSelObj)) { const sp = localToClient(g.x, g.y); if (sp && Math.hypot(sp.x - clientX, sp.y - clientY) < 14) return g }
		return null
	}
	// Sprout a NEW segment from an existing node (a junction/tee): add a coincident node + a segment
	// joining them, and return the new node so the caller can drag it out. graph.ts handles the junction
	// in its sweep, so this is purely the editing gesture.
	function branchNode(o: Extract<Obj, { type: 'wall' | 'conduit' }>, from: GN): GN {
		const nid = mUid('n')
		;(o.nodes as GN[]).push({ id: nid, x: from.x, y: from.y, z: from.z })
		;(o.segments as { id: string; a: string; b: string }[]).push({ id: mUid('s'), a: from.id, b: nid })
		// Return the STORE's node, not the pushed literal: $state deep-proxies array elements, so the
		// drag closure must mutate the proxy (what the renderer reads) — mutating the raw literal is a no-op.
		return (o.nodes as GN[])[(o.nodes as GN[]).length - 1]
	}
	let mGrip: { grip: MGrip; origin: Pt; moved: boolean; branch?: () => void } | null = null
	function onModelGripMove(e: PointerEvent) {
		if (!mGrip) return
		const p = toLocalXY(e.clientX, e.clientY); if (!p) return
		mGrip.moved = true
		mGrip.grip.apply(p, mGrip.origin)
		on.modeledit?.()   // fold this reshape into the open undo step
	}
	function onModelGripUp() {
		if (mGrip?.moved) { suppressClick = true; on.modeledit?.() }
		else if (mGrip?.branch) mGrip.branch()   // an Ctrl-branch press with no drag: drop the stray zero-length segment
		else if (mGrip?.grip.node && mGrip.grip.obj && (mGrip.grip.obj.type === 'wall' || mGrip.grip.obj.type === 'conduit')) {
			nodeSel = { obj: mGrip.grip.obj.id!, node: mGrip.grip.node.id }   // no-move click on a node grip → select the node
		}
		mGrip = null; snapMark = null; on.endedit?.()   // close the gesture's undo step
		window.removeEventListener('pointermove', onModelGripMove)
		window.removeEventListener('pointerup', onModelGripUp)
	}

	// ── section marker MOVE — drag a marker's box border to reposition the cut; the linked elevation
	// re-clips live (Model3d reads the clip reactively). Absolute from the gesture start (no drift). ──
	let secDrag: { id: string; start: Pt; c0: Clip; moved: boolean } | null = null
	function onSecDragMove(e: PointerEvent) {
		if (!secDrag) return
		const p = toLocalXY(e.clientX, e.clientY); if (!p) return
		secDrag.moved = true
		const dx = p[0] - secDrag.start[0], dy = p[1] - secDrag.start[1], c = secDrag.c0
		on.sectionmove?.(secDrag.id, { ...c, x0: Math.round(c.x0 + dx), x1: Math.round(c.x1 + dx), y0: Math.round(c.y0 + dy), y1: Math.round(c.y1 + dy) })
	}
	function onSecDragUp() {
		if (secDrag?.moved) suppressClick = true   // a real move: don't also re-select on click
		secDrag = null
		window.removeEventListener('pointermove', onSecDragMove)
		window.removeEventListener('pointerup', onSecDragUp)
	}
	// ── section marker RESIZE — drag a corner grip of the SELECTED section (opposite corner fixed). ──
	let secResize: { id: string; apply: (p: Pt) => Clip; moved: boolean } | null = null
	function onSecResizeMove(e: PointerEvent) {
		if (!secResize) return
		const p = toLocalXY(e.clientX, e.clientY); if (!p) return
		secResize.moved = true
		on.sectionmove?.(secResize.id, secResize.apply(p))
	}
	function onSecResizeUp() {
		if (secResize?.moved) suppressClick = true
		secResize = null
		window.removeEventListener('pointermove', onSecResizeMove)
		window.removeEventListener('pointerup', onSecResizeUp)
	}
	// ── 3D iso ORBIT — a plain drag in the iso view rotates the camera (yaw/pitch). The projection
	// already takes yaw/pitch; here we just turn a drag into new angles. Pitch is clamped to (0, 90°).
	let orbitDrag: { sx: number; sy: number; yaw0: number; pitch0: number; moved: boolean } | null = null
	function onOrbitMove(e: PointerEvent) {
		if (!orbitDrag) return
		orbitDrag.moved = true
		const dx = e.clientX - orbitDrag.sx, dy = e.clientY - orbitDrag.sy
		const ny = orbitDrag.yaw0 + dx * 0.008
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
	// Delete the selected model object(s) AND guide(s) from the store (one undo step). Guides share the
	// modelSel namespace now, so a Delete over a selected guide removes it here too.
	function deleteModelSel() {
		if (!mdl || !modelSel.length) return
		const rm = new Set(modelSel)
		on.beginedit?.()
		mdl.objects = mdl.objects.filter((o) => !o.id || !rm.has(o.id))
		if (mdl.guides) mdl.guides = mdl.guides.filter((g) => !rm.has(g.id))
		on.modeledit?.('Delete'); on.endedit?.()
		setModelSel([])
	}
	// Delete a single wall/conduit NODE, resolving its incident segments by DEGREE (Dave's spec):
	//   1 segment  → delete that segment;
	//   2 segments → join them into one (drop the node, connect the two far ends);
	//   3+ segments → keep the FIRST TWO joined into one, delete the rest.
	// Then prune any node left with no segments (the deleted one + orphaned far ends); remove the whole
	// object if nothing remains. One undo step.
	function deleteGraphNode(sel: { obj: string; node: string }) {
		const o = mdl?.objects.find((x) => x.id === sel.obj)
		if (!mdl || !o || (o.type !== 'wall' && o.type !== 'conduit')) return
		const segs = o.segments as { id: string; a: string; b: string }[]
		const inc = segs.filter((s) => s.a === sel.node || s.b === sel.node)
		const far = (s: { a: string; b: string }) => (s.a === sel.node ? s.b : s.a)
		const keep = segs.filter((s) => s.a !== sel.node && s.b !== sel.node)   // segments not touching the node
		if (inc.length >= 2) { const e1 = far(inc[0]), e2 = far(inc[1]); if (e1 !== e2) keep.push({ id: mUid('s'), a: e1, b: e2 }) }   // join first two
		on.beginedit?.()
		o.segments = keep
		const used = new Set<string>(); for (const s of keep) { used.add(s.a); used.add(s.b) }
		o.nodes = (o.nodes as GN[]).filter((n) => used.has(n.id))   // drop the deleted node + any orphaned far ends
		if (!keep.length) { mdl.objects = mdl.objects.filter((x) => x.id !== o.id); setModelSel([]) }   // nothing left → remove object
		on.modeledit?.('Delete node'); on.endedit?.()
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
					// Seed at a's coords, then set its in-view coords from p (no snap): the plan takes x/y,
					// an elevation takes the on-axis coord + z (keeping a's off-axis coord).
					const nn: GN = { id: nid, x: a.x, y: a.y, z: a.z }
					if (isElev) { const ax = ELEV_BASIS[elevDir].axis; if (ax === 0) nn.x = rndSnap(projUInv(p[0])); else nn.y = rndSnap(projUInv(p[0])); nn.z = Math.max(0, rndSnap(GROUND - p[1])) }
					else { nn.x = rndSnap(p[0]); nn.y = rndSnap(p[1]) }
					;(o.nodes as GN[]).push(nn)
					const bId = s.b; s.b = nid
					;(o.segments as { id: string; a: string; b: string }[]).push({ id: mUid('s'), a: nid, b: bId })
					on.modeledit?.(); on.endedit?.()
					setModelSel([o.id])
					return
				}
			}
		}
	}
	// In an elevation, find the model wall/conduit SEGMENT whose projected line the drawn point p (drawing
	// coords) is nearest, and return the off-axis (DEPTH) coord there + the projected endpoints (for a
	// marker). Lets a conduit point SNAP ONTO a wall's depth instead of the plan-centre default. Null if
	// nothing is within tolerance. (front/rear: on-axis = x, depth = y; left/right: on-axis = y, depth = x.)
	function elevDepthSnap(p: Pt): { off: number; a: Pt; b: Pt } | null {
		if (!isElev || !mdl) return null
		const ax = ELEV_BASIS[elevDir].axis
		const onC = (n: GN) => (ax === 0 ? n.x : n.y), offC = (n: GN) => (ax === 0 ? n.y : n.x)
		const ept = (n: GN): Pt => [elevU(elevDir, onC(n), CX, CY), GROUND - n.z]   // projected endpoints (for the marker)
		// Match in MODEL space (on-axis coord + z) — projUInv/GROUND give the drawn point's model on-axis + z
		// exactly, so this avoids any screen-projection/centring mismatch with how the model is rendered.
		const pu = projUInv(p[0]), pz = GROUND - p[1]
		const tol = hitTol(12) / (dscale || 1)
		let best: { off: number; a: Pt; b: Pt } | null = null, bestD = tol
		for (const o of mdl.objects) {
			if ((o.type !== 'wall' && o.type !== 'conduit') || !o.id || !modelLayerVisible(o)) continue
			const nm = new Map((o.nodes as GN[]).map((n) => [n.id, n]))
			for (const s of o.segments as { a: string; b: string }[]) {
				const a = nm.get(s.a), b = nm.get(s.b); if (!a || !b) continue
				const a1 = onC(a), z1 = a.z, dx = onC(b) - a1, dz = b.z - z1, L2 = dx * dx + dz * dz || 1
				const t = Math.max(0, Math.min(1, ((pu - a1) * dx + (pz - z1) * dz) / L2))
				const d = Math.hypot(pu - (a1 + dx * t), pz - (z1 + dz * t))
				if (d < bestD) { bestD = d; best = { off: Math.round(offC(a) * (1 - t) + offC(b) * t), a: ept(a), b: ept(b) } }
			}
		}
		return best
	}
	// A clicked run (plan drawing pts) → a wall or conduit graph with the tool's default profile.
	function placeGraph(pts: Pt[]) {
		if (!mdl || pts.length < 2) return
		const nodesZ = tool === 'Wall' ? 0 : (mdl.levels?.ceilingTile ?? 2600)   // plan default height (trunks/pipes near the ceiling)
		// In an ELEVATION the drawn point gives the on-axis coord (projUInv) and z (GROUND − y) — so you can
		// draw a VERTICAL wall conduit. The off-axis (depth into the view) is unknown, so it defaults to the
		// plan centre; nudge it in plan afterwards. In plan the point is x/y at the default height.
		// Depth plane: a selected PLAN guide fixes the off-axis coord (h-guide → y for front/rear, v-guide →
		// x for left/right). No guide → fall back to the model centre and nudge the user to set one.
		const ax = isElev ? ELEV_BASIS[elevDir].axis : 0
		const guide = isElev ? selectedPlanGuide(mdl?.guides ?? [], modelSel, ax === 0 ? 'h' : 'v') : null
		if (isElev && !guide) toast('No depth guide — points snap onto nearby walls where possible, else the model centre. Tip: select a plan guide to fix the depth.', { duration: 5000 })
		const toNode = (p: Pt) => {
			if (!isElev) return { x: Math.round(p[0]), y: Math.round(p[1]), z: nodesZ }
			const onAxis = Math.round(projUInv(p[0])), z = Math.max(0, Math.round(GROUND - p[1]))
			// Depth: an explicitly SELECTED plan guide wins; else SNAP onto a nearby wall/conduit; else the plan centre.
			const off = guide ? guide.pos : (elevDepthSnap(p)?.off ?? (ax === 0 ? PLAN_CY : PLAN_CX))
			return ax === 0 ? { x: onAxis, y: off, z } : { x: off, y: onAxis, z }
		}
		const { nodes, segments } = polyToGraph(pts.map(toNode))
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
		// A new opening defaults to a DOOR (leaf + swing) — the most common; change it in Properties.
		const extra = layer === 'openings' ? { open: 'door' as const, z: 0, h: 2100 } : {}
		addModelObj({ type: 'prism', x, y, z: 0, w, d, h, edges: 4, layer: layerId(layer), id: mUid(tag), ...extra })
	}

	// ── object snap (osnap), Kestrel-style ──
	// Each entity contributes snap points (endpoints, midpoints, centres, quadrants). While
	// drawing or dragging a grip we find the nearest within ~10px and lock the point to it,
	// showing a marker. Gated by the OSNAP status-bar toggle.
	let snapMark = $state<{ p: Pt; type: string } | null>(null)
	// While drawing a Wall/Trunk/Pipe in an elevation, the wall segment the NEXT point will snap its depth
	// onto (highlighted amber) — live feedback for the depth-snap. Only the graph tools, only in elevation.
	const depthSnapMark = $derived.by(() => {
		if (!isElev || !active || !cur || !mdl || !(tool === 'Wall' || tool === 'Trunk' || tool === 'Pipe')) return null
		return elevDepthSnap(cur)
	})
	function entSnaps(e: Ent): { point: Pt; type: string }[] {
		const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
		if (e.type === 'polyline') { const pts = e.pts ?? []; const out = pts.map(p => ({ point: p, type: 'end' })); for (let i = 0; i + 1 < pts.length; i++) out.push({ point: mid(pts[i], pts[i + 1]), type: 'mid' }); return out }
		if (e.type === 'line' || e.type === 'dim') return [{ point: e.a!, type: 'end' }, { point: e.b!, type: 'end' }, { point: mid(e.a!, e.b!), type: 'mid' }]
		if (e.type === 'rect' || e.type === 'ellipse' || e.type === 'box' || e.type === 'image') {
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
	// A grip: `apply(p)` handles the UN-rotated (or non-rotated) drag. For a ROTATED shape, `anchor` (the
	// local coord that must stay put) + `resize(dragged, anchor)` (build from the two diagonal corners)
	// drive a world-anchored resize instead, so a corner drags about the opposite corner in the shape's own
	// axes; `square` opts the shift-constrain into that local frame (rects, not lines). `rotate` = the handle.
	type Grip = { x: number; y: number; apply: (p: Pt) => Ent; rotate?: boolean; anchor?: Pt; resize?: (d: Pt, f: Pt) => Ent; square?: boolean }
	// Which entity kinds get a rotate HANDLE (a circle above the bbox top-centre, like the prism's). `rot`
	// already exists on Ent and render/hit/grips honour it — this just exposes it as a draggable handle.
	// Excluded: flat-elev floor projections (a ground line) and an image mid-CROP (its grips are the window).
	const ROTATABLE = new Set(['rect', 'ellipse', 'image', 'line'])
	// `box` rotates only in PLAN (its footprint) — in elevation it uses the boxElev face grips instead.
	const canRotate = (e: Ent) => (ROTATABLE.has(e.type) || (e.type === 'box' && isPlan)) && !isFlatElev(e) && !(e.type === 'image' && imgEdit.mode === 'crop' && imgEdit.id === e.id)
	// The rotate handle in the entity's LOCAL (un-rotated) frame; gripsFor then rotates its POSITION with the
	// shape but leaves apply on the RAW pointer (angle from centre + 90°, matching the prism/model handle).
	function rotGripLocal(e: Ent): Grip {
		const [x0, y0, x1, y1] = bbox(e)
		const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
		// A CONSTANT screen gap above the top edge (gripSize is already screen-constant) — the handle stays
		// attached to the top rather than drifting further out as the object grows. Shift snaps to 15°
		// (read live from shiftDown, so `reconstrain` re-applies it the instant Shift is pressed/released).
		return { x: cx, y: y0 - gripSize * 6, rotate: true, apply: (p: Pt) => {
			let deg = Math.round((Math.atan2(p[1] - cy, p[0] - cx) * 180 / Math.PI + 90 + 360) % 360)
			if (shiftDown) deg = (Math.round(deg / 15) * 15) % 360
			return { ...e, rot: deg }
		} }
	}
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
		let gs = gripsLocal(e)
		if (canRotate(e)) gs = [...gs, rotGripLocal(e)]
		if (!e.rot) return gs
		const c = rotCenter(e)
		// A geometry grip works in the local frame → rotate its position AND un-rotate the pointer for apply.
		// The rotate handle needs the RAW pointer (it computes a world angle), so only its position rotates.
		const rot = e.rot!
		return gs.map(g => {
			const rp = rotatePt([g.x, g.y], c, rot)
			if (g.rotate) return { ...g, x: rp[0], y: rp[1] }
			// World-anchored resize: keep the opposite corner (anchor) FIXED in world while the dragged
			// corner follows the pointer, doing all the box math in the shape's un-rotated local frame.
			if (g.anchor && g.resize) {
				const Aw = rotatePt(g.anchor, c, rot), resize = g.resize, square = g.square
				return { x: rp[0], y: rp[1], apply: (P: Pt): Ent => {
					let Pw = P
					if (square && shiftDown) {   // shift → square about the anchor, in LOCAL axes
						const rel = rotatePt(P, Aw, -rot), dx = rel[0] - Aw[0], dy = rel[1] - Aw[1]
						const s = Math.max(Math.abs(dx), Math.abs(dy)), sq = rotatePt([(dx < 0 ? -s : s), (dy < 0 ? -s : s)], [0, 0], rot)
						Pw = [Aw[0] + sq[0], Aw[1] + sq[1]]
					}
					const cn: Pt = [(Aw[0] + Pw[0]) / 2, (Aw[1] + Pw[1]) / 2]   // new centre = midpoint(anchor, pointer)
					const D = rotatePt(Pw, cn, -rot)                             // dragged corner, un-rotated
					const F: Pt = [2 * cn[0] - D[0], 2 * cn[1] - D[1]]           // opposite corner → anchor stays world-fixed
					return resize(D, F)
				} }
			}
			return { x: rp[0], y: rp[1], apply: (p: Pt) => g.apply(rotatePt(p, c, -rot)) }
		})
	}
	function gripsLocal(e: Ent): Grip[] {
		if (isFlatElev(e)) { const [x0, x1] = flatXSpan(e); return [{ x: x0, y: GROUND, apply: p => setFlatX(e, 'min', p[0]) }, { x: x1, y: GROUND, apply: p => setFlatX(e, 'max', p[0]) }] }
		if (e.type === 'polyline') return (e.pts ?? []).map((v, i) => ({ x: v[0], y: v[1], apply: (p: Pt) => ({ ...e, pts: (e.pts ?? []).map((q, j) => j === i ? p : q) }) }))
		if (e.type === 'line' || e.type === 'dim') return [
			// Rotated: drag one endpoint (D) keeping the other (anchor F) world-fixed. No square-constrain.
			{ x: e.a![0], y: e.a![1], anchor: e.b!, resize: (D, F) => ({ ...e, a: D, b: F }), apply: p => ({ ...e, a: p }) },
			{ x: e.b![0], y: e.b![1], anchor: e.a!, resize: (D, F) => ({ ...e, b: D, a: F }), apply: p => ({ ...e, b: p }) },
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
		if (e.type === 'image' && imgEdit.mode === 'crop' && imgEdit.id === e.id) {   // CROP mode: corner grips move the crop WINDOW, not the placement rect
			const rx = Math.min(e.a![0], e.b![0]), ry = Math.min(e.a![1], e.b![1]), rw = Math.abs(e.b![0] - e.a![0]) || 1, rh = Math.abs(e.b![1] - e.a![1]) || 1
			const cr = e.crop ?? { x: 0, y: 0, w: 1, h: 1 }, x0 = cr.x, y0 = cr.y, x1 = cr.x + cr.w, y1 = cr.y + cr.h
			const cl = (v: number) => Math.max(0, Math.min(1, v)), nX = (p: Pt) => cl((p[0] - rx) / rw), nY = (p: Pt) => cl((p[1] - ry) / rh)
			const set = (nx0: number, ny0: number, nx1: number, ny1: number): Ent => { const ax0 = Math.min(nx0, nx1), ay0 = Math.min(ny0, ny1); return { ...e, crop: { x: ax0, y: ay0, w: Math.max(0.03, Math.abs(nx1 - nx0)), h: Math.max(0.03, Math.abs(ny1 - ny0)) } } }
			return [
				{ x: rx + x0 * rw, y: ry + y0 * rh, apply: (p: Pt) => set(nX(p), nY(p), x1, y1) },   // TL
				{ x: rx + x1 * rw, y: ry + y0 * rh, apply: (p: Pt) => set(x0, nY(p), nX(p), y1) },   // TR
				{ x: rx + x1 * rw, y: ry + y1 * rh, apply: (p: Pt) => set(x0, y0, nX(p), nY(p)) },   // BR
				{ x: rx + x0 * rw, y: ry + y1 * rh, apply: (p: Pt) => set(nX(p), y0, x1, nY(p)) },   // BL
			]
		}
		if (e.type === 'image') {   // resize grips at the VISIBLE (crop-window) corners, so they track the
			// CROPPED image; dragging scales the full placement so that window corner follows (opposite fixed).
			const rx = Math.min(e.a![0], e.b![0]), ry = Math.min(e.a![1], e.b![1]), rw = Math.abs(e.b![0] - e.a![0]) || 1, rh = Math.abs(e.b![1] - e.a![1]) || 1
			const cr = e.crop ?? { x: 0, y: 0, w: 1, h: 1 }, aspect = rh / rw, lock = e.lockAspect !== false
			const wres = (dnx: number, dny: number, fnx: number, fny: number) => (p: Pt): Ent => {
				const fx = rx + fnx * rw, fy = ry + fny * rh
				let RW = dnx - fnx !== 0 ? (p[0] - fx) / (dnx - fnx) : rw
				let RH = dny - fny !== 0 ? (p[1] - fy) / (dny - fny) : rh
				if (lock && !shiftDown) RH = (Math.sign(RH) || 1) * Math.abs(RW) * aspect   // keep source aspect (Shift = free stretch)
				const Ax = fx - fnx * RW, Ay = fy - fny * RH
				return { ...e, a: [Math.round(Ax), Math.round(Ay)], b: [Math.round(Ax + RW), Math.round(Ay + RH)] }
			}
			const x0 = cr.x, y0 = cr.y, x1 = cr.x + cr.w, y1 = cr.y + cr.h
			return [
				{ x: rx + x0 * rw, y: ry + y0 * rh, apply: wres(x0, y0, x1, y1) },   // TL — keep BR fixed
				{ x: rx + x1 * rw, y: ry + y0 * rh, apply: wres(x1, y0, x0, y1) },   // TR — keep BL fixed
				{ x: rx + x1 * rw, y: ry + y1 * rh, apply: wres(x1, y1, x0, y0) },   // BR — keep TL fixed
				{ x: rx + x0 * rw, y: ry + y1 * rh, apply: wres(x0, y1, x1, y0) },   // BL — keep TR fixed
			]
		}
		if (e.type === 'rect' || e.type === 'ellipse' || e.type === 'box') {   // 4 corner grips on the footprint/bbox
			const [ax, ay] = e.a!, [bx, by] = e.b!
			// When rotated, gripsFor resizes from the two diagonal corners (dragged D + opposite anchor F);
			// this rebuilds the axis-aligned box from them. Each corner grip carries its opposite as `anchor`.
			const box = (D: Pt, F: Pt): Ent => ({ ...e, a: [Math.min(D[0], F[0]), Math.min(D[1], F[1])] as Pt, b: [Math.max(D[0], F[0]), Math.max(D[1], F[1])] as Pt })
			return [
				{ x: ax, y: ay, anchor: [bx, by], square: true, resize: box, apply: p => ({ ...e, a: p }) },
				{ x: bx, y: by, anchor: [ax, ay], square: true, resize: box, apply: p => ({ ...e, b: p }) },
				{ x: ax, y: by, anchor: [bx, ay], square: true, resize: box, apply: p => ({ ...e, a: [p[0], e.a![1]] as Pt, b: [e.b![0], p[1]] as Pt }) },
				{ x: bx, y: ay, anchor: [ax, by], square: true, resize: box, apply: p => ({ ...e, a: [e.a![0], p[1]] as Pt, b: [p[0], e.b![1]] as Pt }) },
			]
		}
		if (e.type === 'circle') return [
			{ x: e.c![0], y: e.c![1], apply: p => ({ ...e, c: p }) },                       // move centre
			{ x: e.c![0] + e.r!, y: e.c![1], apply: p => ({ ...e, r: Math.max(1, dist(e.c!, p)) }) }, // radius
		]
		if (e.type === 'text') {
			const gs: Grip[] = [{ x: e.a![0], y: e.a![1], apply: p => ({ ...e, a: p }) }]
			if (e.callout) {   // leader-tip grip (drag where the callout points)
				const bb = textBox(e), tfs = (e.fontPt ?? STYLE_DEFAULTS.fontPt) * PT, lp = e.leader ?? ([bb[0] - tfs * 3, bb[3] + tfs * 3] as Pt)
				gs.push({ x: lp[0], y: lp[1], apply: p => ({ ...e, leader: p }) })
			}
			return gs
		}
		return []
	}
	// (translate lives in ./geometry)
	// Shift-constrain a grip drag: box corner → square about the opposite corner; line/dim
	// endpoint → 15° about the other end. (Circle radius left free.)
	function constrainGrip(base: Ent, gi: number, p: Pt, shift: boolean): Pt {
		if (!shift) return p
		if (gripsFor(base)[gi]?.rotate) return p   // rotate handle: no square/ortho constrain (Shift-free-rotate)
		if (base.rot) return p   // rotated shape: the world-anchored resize does its own local-frame square (gripsFor)
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
	// A filled arrowhead triangle AT `to`, pointing away from `from` — constant screen size (via gripSize),
	// returned as SVG polygon points. Shared by the Line arrow prop and the callout leader tip.
	function arrowPts(from: Pt, to: Pt): string {
		const dx = to[0] - from[0], dy = to[1] - from[1], len = Math.hypot(dx, dy) || 1
		const ux = dx / len, uy = dy / len, vx = -uy, vy = ux, L = gripSize * 3.2, HW = gripSize * 1.4
		const bx = to[0] - ux * L, by = to[1] - uy * L
		return `${to[0]},${to[1]} ${bx + vx * HW},${by + vy * HW} ${bx - vx * HW},${by - vy * HW}`
	}
	// A REVISION CLOUD outline around the a→b rect: outward semicircle bumps along each edge (SVG path).
	// Clockwise winding (TL→TR→BR→BL) with sweep-flag 1 keeps every bump on the OUTSIDE — matching the
	// proven Sheets `cloudPath` (sheets/annotations/geometry.ts). Bump size ~constant on screen (gripSize).
	function cloudPath(a: Pt, b: Pt): string {
		const x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]), x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1])
		const D = Math.max(gripSize * 5, 1)   // target bump diameter
		const edges: [Pt, Pt][] = [[[x0, y0], [x1, y0]], [[x1, y0], [x1, y1]], [[x1, y1], [x0, y1]], [[x0, y1], [x0, y0]]]
		let d = `M ${x0} ${y0}`
		for (const [p, q] of edges) {
			const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, n = Math.max(1, Math.round(len / D)), step = len / n
			const ux = (q[0] - p[0]) / len, uy = (q[1] - p[1]) / len, r = step / 2
			for (let i = 1; i <= n; i++) { const ex = p[0] + ux * step * i, ey = p[1] + uy * step * i; d += ` A ${r} ${r} 0 0 1 ${ex} ${ey}` }
		}
		return d + ' Z'
	}

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
		if (guideDrag) {   // abort an in-progress guide reposition (2nd finger → pan/zoom)
			guideDrag = null; on.endedit?.()
			window.removeEventListener('pointermove', onGuideDragMove)
			window.removeEventListener('pointerup', onGuideDragUp)
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
		if (secDrag) {   // abort an in-progress section-marker move
			secDrag = null
			window.removeEventListener('pointermove', onSecDragMove)
			window.removeEventListener('pointerup', onSecDragUp)
		}
		if (secResize) {   // abort an in-progress section-marker resize
			secResize = null
			window.removeEventListener('pointermove', onSecResizeMove)
			window.removeEventListener('pointerup', onSecResizeUp)
		}
	}
	$effect(() => {
		const up = (e: PointerEvent) => pointers.delete(e.pointerId)
		window.addEventListener('pointerup', up)
		window.addEventListener('pointercancel', up)
		return () => { window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up) }
	})
	// Where the RIGHT button went down, so onContext can tell a genuine click from a pan-drag. Captured in
	// the CAPTURE phase (see the .vp handler) because panzoom's own pointerdown listener stopPropagation()s
	// right/middle presses, and Svelte delegates onDown to the root — so a bubble-phase read never sees them.
	let rDownPt: { x: number; y: number } | null = null
	function onDown(e: PointerEvent) {
		if (editText || !active || e.button !== 0) return   // ignore while editing text in place
		suppressClick = false   // clear any stale flag from a drag that never got its click
		nodeSel = null          // a fresh press resets the node selection (re-set on a no-move node-grip click)
		pointers.add(e.pointerId)
		if (pointers.size > 1) { cancelPointerDrag(); return }   // 2nd finger → hand off to pan/zoom
		// While calibrating scale, a press near a placed endpoint drags it (adjust the measure line).
		if (imgEdit.mode === 'scale' && scalePts.length === 2) {
			for (let i = 0; i < 2; i++) { const sp = localToClient(scalePts[i][0], scalePts[i][1]); if (sp && Math.hypot(sp.x - e.clientX, sp.y - e.clientY) < 14) { scaleDrag = i; try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch { /* synthetic */ } e.preventDefault(); window.addEventListener('pointermove', onScaleDragMove); window.addEventListener('pointerup', onScaleDragUp); return } }
		}
		// In scale/origin PICK modes, don't start a select/move-drag — let onClick place the point.
		if (imgEdit.mode === 'scale' || imgEdit.mode === 'origin') return
		// EOS mode: shapes are drawn with a single press-drag-release (not two clicks).
		if (tool !== 'Select') {
			if (acad || tool === 'Text' || tool === 'Guide') return   // AutoCAD two-click / text + guide single-click via onClick
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
			const g = pickModelGrip(e.clientX, e.clientY)
			if (g) {
				on.beginedit?.()   // one undo step for the whole reshape gesture
				// Ctrl/⌘-press on a wall/conduit node BRANCHES: sprout a new segment and drag the new node
				// out (a junction/tee). Plain press moves the node. origin = the grip's start position so
				// the dragged node can be pulled off any partner it was coincident with (disconnect).
				let grip = g, origin: Pt = [g.x, g.y], branch: (() => void) | undefined
				if ((e.ctrlKey || e.metaKey) && g.node && g.obj && (g.obj.type === 'wall' || g.obj.type === 'conduit')) {
					const obj = g.obj, nn = branchNode(obj, g.node)
					const d = graphNodeDraw(nn); origin = [d[0], d[1]]
					grip = { x: d[0], y: d[1], node: nn, obj, apply: (p: Pt, o?: Pt) => graphNodeApply(nn, p, o) }
					branch = () => { obj.nodes = (obj.nodes as GN[]).filter((x) => x.id !== nn.id); obj.segments = (obj.segments as { id: string; a: string; b: string }[]).filter((s) => s.b !== nn.id && s.a !== nn.id) }
				}
				mGrip = { grip, origin, moved: false, branch }
				try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch { /* synthetic */ }
				e.preventDefault()
				window.addEventListener('pointermove', onModelGripMove)
				window.addEventListener('pointerup', onModelGripUp)
				return
			}
		}
		// A corner grip of the SELECTED section resizes it (wins over everything, like a model grip).
		{
			const g = pickSectionGrip(e.clientX, e.clientY)
			if (g) {
				secResize = { ...g, moved: false }
				try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch { /* synthetic */ }
				e.preventDefault()
				window.addEventListener('pointermove', onSecResizeMove)
				window.addEventListener('pointerup', onSecResizeUp)
				return
			}
		}
		const p = toLocalXY(e.clientX, e.clientY); if (!p) return
		const hitInfo = pick(e.clientX, e.clientY)
		if (!hitInfo) {
			// an alignment guide under the cursor → select + drag it to reposition. Priority: below entities/
			// grips (hitInfo), above sections/model/marquee (a guide is a thin overlay you grab in open space).
			const gid = hitGuide(p)
			if (gid) {
				setModelSel([gid]); on.select?.([])   // guide selection reuses modelSel (exclusive with entities)
				guideDrag = { id: gid, moved: false }
				on.beginedit?.()
				try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch { /* synthetic */ }
				e.preventDefault()
				window.addEventListener('pointermove', onGuideDragMove)
				window.addEventListener('pointerup', onGuideDragUp)
				return
			}
			// a section marker border → SELECT it (grips + toolbar) and start a move drag; a click with no
			// drag just selects (open / re-aim / delete live in the toolbar).
			const sid = hitSection(p)
			if (sid) {
				const sm = sections.find(s => s.id === sid)
				if (sm) {
					if (selSection !== sid) on.sectionselect?.(sid)
					secDrag = { id: sid, start: p, c0: { ...sm.clip }, moved: false }
					try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch { /* synthetic */ }
					e.preventDefault()
					window.addEventListener('pointermove', onSecDragMove)
					window.addEventListener('pointerup', onSecDragUp)
					return
				}
			}
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
	// Grid snap for a MOVE: round the delta so the entity's defining point (a / centre / first vertex)
	// lands on the grid, keeping its shape — like model-object moves (rndSnap). Off when SNAP is off.
	function snapDelta(dx: number, dy: number, base: Ent): [number, number] {
		if (!snap) return [dx, dy]
		const A = base.a ?? base.c ?? base.pts?.[0]
		if (!A) return [Math.round(dx / SNAP_STEP) * SNAP_STEP, Math.round(dy / SNAP_STEP) * SNAP_STEP]
		const g = snapToGrid([A[0] + dx, A[1] + dy])
		return [g[0] - A[0], g[1] - A[1]]
	}
	function applyDrag(p: Pt, shift: boolean): Ent {
		if (drag!.kind === 'grip') { const cp = constrainGrip(drag!.base, drag!.gi, p, shift); return gripsFor(drag!.base)[drag!.gi].apply(snap ? snapToGrid(cp) : cp) }
		let dx = p[0] - drag!.start[0], dy = p[1] - drag!.start[1]
		if (shift !== ortho) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0 }   // ortho / axis-lock
		const [sdx, sdy] = snapDelta(dx, dy, drag!.base)   // grid snap (SNAP toggle)
		return moveEnt(drag!.base, sdx, sdy)
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
			const [gdx, gdy] = snapDelta(dx, dy, drag.bases[0])   // grid-snap the whole group by its first member (stays rigid)
			for (const b of drag.bases) on.update?.(moveEnt(b, gdx, gdy))   // move the whole group (or the copies)
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
		if (e.type === 'image' && e.crop) {   // the VISIBLE extent is the crop window, not the full placement
			const rx = Math.min(e.a![0], e.b![0]), ry = Math.min(e.a![1], e.b![1]), rw = Math.abs(e.b![0] - e.a![0]), rh = Math.abs(e.b![1] - e.a![1])
			return [rx + e.crop.x * rw, ry + e.crop.y * rh, rx + (e.crop.x + e.crop.w) * rw, ry + (e.crop.y + e.crop.h) * rh]
		}
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
			case 'Select': return mSelObj && (mSelObj.type === 'wall' || mSelObj.type === 'conduit') ? 'Drag a node to reshape · Ctrl-drag a node to branch · double-click a segment to add a node' : 'Click an element'
			case 'Line': return n ? 'Specify next point (Enter / double-click to finish)' : 'Specify first point'
			case 'Guide': return viewSpace ? 'Click to drop a horizontal guide · Shift = vertical · select a plan guide to fix the depth for elevation drawing' : 'Guides are placed on a plan or elevation view'
			case 'Wall': case 'Trunk': case 'Pipe': {
				if (!isPlan && !isElev) return `Switch to a plan or elevation view to draw ${tool.toLowerCase()}s`
				const depthHint = isElev ? (selectedPlanGuide(mdl?.guides ?? [], modelSel, ELEV_BASIS[elevDir].axis === 0 ? 'h' : 'v') ? ' — depth from the selected plan guide' : ' — no depth guide (uses model centre); select a plan guide') : ''
				return n ? `Specify next ${tool.toLowerCase()} point (Enter / double-click to finish)${depthHint}` : `Specify ${tool.toLowerCase()} start${depthHint}`
			}
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
	// Instruction line for the active image-calibration mode.
	const imgModeText = $derived(
		imgEdit.mode === 'origin' ? 'Set origin · click a reference point inside the image · Esc = cancel'
			: imgEdit.mode === 'crop' ? 'Crop · drag the corner handles to trim the image · Esc = done'
			: imgEdit.mode === 'scale' ? (scaleReal !== null ? 'Scale · drag either endpoint to adjust, then enter the real distance · Esc = cancel' : scalePts.length === 1 ? 'Scale · click the SECOND point of a known distance' : 'Scale · click the FIRST point of a known distance')
			: null)
	let statusText = $derived(
		editText ? 'Editing text · Enter = new line · Ctrl/⌘+Enter = commit · Esc = cancel'
			: active && imgModeText ? imgModeText
			: active && selSectionObj && tool === 'Select' ? 'Section selected · drag a corner to resize · drag the box to move · toolbar: open / re-aim / delete'
			: active ? `${tool} · ${prompt}` : '')
	$effect(() => { if (focused) on.status?.(statusText) })   // only the focused pane drives the shared status
</script>

<svelte:window onkeydown={onKey} onkeyup={(e) => { if (e.key === 'Shift') { shiftDown = false; if (active && focused) { reconstrain(false); updateGuidePreview(false) } } }} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="vp print:!border-transparent" class:active bind:clientWidth={vpW} bind:clientHeight={vpH} role="button" tabindex="0" style:cursor={cursorStyle}
	style:border-style={active ? 'solid' : border === 'none' ? 'dotted' : border}
	style:border-color={border === 'none' && !active ? '#94a3b866' : undefined}
	use:panzoom={{ enabled: () => active && navContent, wheelZoom: () => acad, onpan: onPan, onzoom: onZoom }}
	onpointerdowncapture={(e) => { if (e.button === 2) rDownPt = { x: e.clientX, y: e.clientY } }}
	onclick={onClick} ondblclick={onDblclick} oncontextmenu={onContext} onpointerdown={onDown} onpointermove={onMove}
	onpointerleave={() => { hoverPt = null }}
	onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); on.activate?.() } }}>

	<svg bind:this={svg} class="vp-svg {kind === 'iso' || isElev ? 'model' : ''}" viewBox="{minX} {minY} {vbW} {vbH}" preserveAspectRatio="xMidYMid meet">
		<g transform="translate({view.x} {view.y}) scale({view.zoom}) translate({CX} {CY}) scale({dscale}) translate({-CX} {-CY})">
			{#if isElev}
				<!-- flat elevation backdrop: just the ground line at GROUND (in mm; the mock floorplan / iso
				     backdrops were retired once the real Model3d renders). -->
				<line x1={8 * MMPU} y1={GROUND} x2={392 * MMPU} y2={GROUND} stroke="#94a3b8" stroke-width="1.2" />
				<text x={12 * MMPU} y={GROUND + 14 * MMPU} font-size={8 * MMPU} fill="#64748b" font-weight="600">{elevDir.toUpperCase()}</text>
			{/if}
			<!-- P1b: real 3D model in plan + the four elevations + iso. Read-only for now (P2 = editing). -->
			{#if mdl}<Model3d model={mdl} dir={(kind === 'floorplan' ? 'plan' : kind) as 'plan' | ElevDir | 'iso'} cx={CX} cy={CY} ground={GROUND} selIds={modelSel} canvasZoom={canvasZoom} clip={clip} yaw={yaw} pitch={pitch} />{/if}
			<!-- Alignment GUIDES (full-view h/v lines) for this view's space + the Guide-tool hover preview. -->
			{#if viewSpace}
				{#each viewGuides as gd (gd.id)}
					{#if gd.orient === 'h'}
						<line class="guide" class:sel={modelSel.includes(gd.id)} x1={-GUIDE_SPAN} y1={gd.pos} x2={GUIDE_SPAN} y2={gd.pos} stroke-width={1 / (canvasZoom || 1)} />
					{:else}
						<line class="guide" class:sel={modelSel.includes(gd.id)} x1={gd.pos} y1={-GUIDE_SPAN} x2={gd.pos} y2={GUIDE_SPAN} stroke-width={1 / (canvasZoom || 1)} />
					{/if}
				{/each}
				{#if active && tool === 'Guide' && guideCur}
					{#if guideCur.orient === 'h'}
						<line class="guide preview" x1={-GUIDE_SPAN} y1={guideCur.pos} x2={GUIDE_SPAN} y2={guideCur.pos} stroke-width={1 / (canvasZoom || 1)} />
					{:else}
						<line class="guide preview" x1={guideCur.pos} y1={-GUIDE_SPAN} x2={guideCur.pos} y2={GUIDE_SPAN} stroke-width={1 / (canvasZoom || 1)} />
					{/if}
				{/if}
			{/if}
			<!-- Section markers (plan only): the cut box + a direction arrow + the elevation's label. Click a
			     marker border to SELECT it (grips + a floating toolbar); the toolbar opens / re-aims / deletes. -->
			{#if isPlan}
				{#each sections as s (s.id)}
					{@const bx = Math.min(s.clip.x0, s.clip.x1)}
					{@const by = Math.min(s.clip.y0, s.clip.y1)}
					<rect class="section-mark" class:sel={s.id === selSection} x={bx} y={by} width={Math.abs(s.clip.x1 - s.clip.x0)} height={Math.abs(s.clip.y1 - s.clip.y0)} stroke-width={(s.id === selSection ? 2 : 1.4) / (canvasZoom || 1)} />
					<polygon class="section-arrow" points={sectionArrowPts(s)} stroke-width={1.4 / (canvasZoom || 1)} />
					{@const pad = hitTol(6) / (dscale || 1)}
					<text class="section-label" x={bx + pad} y={by - pad} font-size={hitTol(12) / (dscale || 1)}>{s.label}</text>
				{/each}
				<!-- resize grips on the selected section's corners -->
				{#if active && selSectionObj}
					{#each sectionCorners(selSectionObj.clip) as c (c.join(','))}
						<Handle cx={c[0]} cy={c[1]} size={gripSize} cursor="crosshair" strokeWidth={1.2 / (canvasZoom || 1)} />
					{/each}
				{/if}
			{/if}
			<!-- drawn entities (objects on a hidden layer are skipped; the edited text is hidden too) -->
			{#each paintEnts as e (e.id)}{#if e.id !== editText?.id && !isLayerHidden(e.layer) && inThisView(e)}{#if e.rot}{@const c = rotCenter(e)}<g transform="rotate({e.rot} {c[0]} {c[1]})">{@render drawn(e, selSet.has(e.id))}</g>{:else}{@render drawn(e, selSet.has(e.id))}{/if}{/if}{/each}
			<!-- depth-snap: the wall/conduit whose depth the next elevation point will snap onto (amber) -->
			{#if depthSnapMark}
				<line x1={depthSnapMark.a[0]} y1={depthSnapMark.a[1]} x2={depthSnapMark.b[0]} y2={depthSnapMark.b[1]} stroke="#e0a020" stroke-width={2.5 / (canvasZoom || 1)} vector-effect="non-scaling-stroke" stroke-dasharray="{6 / (canvasZoom || 1)} {3 / (canvasZoom || 1)}" />
			{/if}
			{#if active && POLY.has(tool) && draft.length}
				<!-- polyline / wall / trunk / pipe preview: committed segments (solid) + rubber band to the cursor -->
				<polyline points={draft.map(p => p.join(',')).join(' ')} fill="none" stroke={SEL} stroke-width={1 / (canvasZoom || 1)} />
				{#if cur}<line x1={draft.at(-1)![0]} y1={draft.at(-1)![1]} x2={cur[0]} y2={cur[1]} stroke={SEL} stroke-width={1 / (canvasZoom || 1)} />{/if}
			{:else if active && draft.length && cur}
				{@render preview(draft[0], cur)}
			{/if}
			<!-- cursor crosshair: precise endpoint placement for any draw tool, before + during a draft -->
			{#if active && DRAW.has(tool) && tool !== 'Guide'}
				{@const cp = cur ?? hoverPt}
				{#if cp}{@render crosshair(cp)}{/if}
			{/if}
			<!-- image SCALE calibration: the 2-point measure line -->
			{#if scalePts.length && editImgVisible}
				<polyline points={scalePts.map((p) => p.join(',')).join(' ')} fill="none" stroke={SEL} stroke-width={1.5 / (canvasZoom || 1)} vector-effect="non-scaling-stroke" />
				{#each scalePts as sp (sp.join(','))}<circle cx={sp[0]} cy={sp[1]} r={gripSize} fill={SEL} />{/each}
			{/if}
			<!-- image ORIGIN anchor marker (selected image / while editing) -->
			{#if active && originMark}
				<circle cx={originMark[0]} cy={originMark[1]} r={gripSize * 1.3} fill="none" stroke={SEL} stroke-width={1.4 / (canvasZoom || 1)} vector-effect="non-scaling-stroke" />
				<line x1={originMark[0] - gripSize * 2} y1={originMark[1]} x2={originMark[0] + gripSize * 2} y2={originMark[1]} stroke={SEL} stroke-width={1 / (canvasZoom || 1)} vector-effect="non-scaling-stroke" />
				<line x1={originMark[0]} y1={originMark[1] - gripSize * 2} x2={originMark[0]} y2={originMark[1] + gripSize * 2} stroke={SEL} stroke-width={1 / (canvasZoom || 1)} vector-effect="non-scaling-stroke" />
			{/if}
			<!-- editing handles: square grips at each selected entity's defining points -->
			{#if active && tool === 'Select'}
				{#each entities as e (e.id)}
					{#if selSet.has(e.id) && inThisView(e) && !isLayerHidden(e.layer) && !isLayerLocked(e.layer)}
						{#each gripsFor(e) as g}
							{#if g.rotate}
								{@const bc = rotCenter(e)}
								{@const tc = rotatePt([bc[0], bbox(e)[1]], bc, e.rot ?? 0)}
								<line x1={tc[0]} y1={tc[1]} x2={g.x} y2={g.y} stroke={SEL} stroke-width={1 / (canvasZoom || 1)} vector-effect="non-scaling-stroke" opacity="0.6" />
								<circle cx={g.x} cy={g.y} r={gripSize * 0.85} fill="white" stroke={SEL} stroke-width={1.2 / (canvasZoom || 1)} vector-effect="non-scaling-stroke" style="cursor:grab" />
							{:else}
								<Handle cx={g.x} cy={g.y} size={gripSize} cursor="crosshair" strokeWidth={1.2 / (canvasZoom || 1)} />
							{/if}
						{/each}
					{/if}
				{/each}
			{/if}
			<!-- model grips: prism resize corners, or wall/conduit node handles (of the selected object) -->
			{#if active && tool === 'Select' && mSelObj}
				{#each modelGrips(mSelObj) as g, i (i)}
					{#if g.node && nodeSelValid && g.node.id === nodeSelValid.node}
						<circle cx={g.x} cy={g.y} r={gripSize * 0.95} fill={SEL} opacity="0.85" />
					{/if}
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
	<!-- Selected section's floating toolbar: open its elevation (link), re-aim the cut (direction), delete. -->
	{#if secToolbar}
		<div class="section-toolbar" style="left:{secToolbar.x}px; top:{Math.max(2, secToolbar.y - 30)}px"
			onpointerdown={(e) => e.stopPropagation()} onclick={(e) => e.stopPropagation()}>
			<button class="st-btn" title="Open the section elevation" onclick={() => on.sectionopen?.(secToolbar.id)}><Icon name="link" size={13} /></button>
			<button class="st-btn" title="Drop as a viewport on the sheet" onclick={() => on.sectiondrop?.(secToolbar.id)}><Icon name="panels" size={13} /></button>
			<select class="st-dir" title="View direction" value={secToolbar.dir} onchange={(e) => on.sectionsetdir?.(secToolbar.id, (e.currentTarget as HTMLSelectElement).value as ElevDir)}>
				<option value="front">Front</option><option value="rear">Rear</option><option value="left">Left</option><option value="right">Right</option>
			</select>
			<button class="st-btn st-del" title="Delete this section" onclick={() => on.sectiondelete?.(secToolbar.id)}><Icon name="trash" size={13} /></button>
		</div>
	{/if}
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
	<!-- image SCALE: after the 2-point line, an inline entry for the real-world distance → resize. -->
	{#if scaleGeom}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="scale-entry" style="left:{scaleGeom.x}px; top:{scaleGeom.y}px" onpointerdown={(e) => e.stopPropagation()} onclick={(e) => e.stopPropagation()}>
			<span>Real distance</span>
			<!-- svelte-ignore a11y_autofocus -->
			<input type="number" min="1" step="1" autofocus value={scaleReal} oninput={(e) => { scaleReal = (e.currentTarget as HTMLInputElement).value }}
				onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); applyScale() } else if (e.key === 'Escape') { e.preventDefault(); scaleReal = null; scalePts = []; clearImgMode() } }} />
			<span class="se-unit">mm</span>
			<button onclick={applyScale}>Set</button>
		</div>
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
		{#if e.arrow === 'end' || e.arrow === 'both'}<polygon points={arrowPts(e.a!, e.b!)} fill={ink} />{/if}
		{#if e.arrow === 'start' || e.arrow === 'both'}<polygon points={arrowPts(e.b!, e.a!)} fill={ink} />{/if}
	{:else if e.type === 'image'}
		<!-- an imported background image placed FULL in the a→b rect (origin + scale); CROP is the visible
		     WINDOW = a normalized sub-rect of that placement (the rest is trimmed away). -->
		{@const rx = Math.min(e.a![0], e.b![0])}{@const ry = Math.min(e.a![1], e.b![1])}
		{@const rw = Math.abs(e.b![0] - e.a![0])}{@const rh = Math.abs(e.b![1] - e.a![1])}
		{@const cr = e.crop ?? { x: 0, y: 0, w: 1, h: 1 }}
		{@const cropping = imgEdit.mode === 'crop' && imgEdit.id === e.id}
		<clipPath id="{clipNs}-{e.id}"><rect x={rx + cr.x * rw} y={ry + cr.y * rh} width={cr.w * rw} height={cr.h * rh} /></clipPath>
		{#if cropping}<image href={e.src} x={rx} y={ry} width={rw} height={rh} opacity="0.35" preserveAspectRatio="none" />{/if}
		<image href={e.src} x={rx} y={ry} width={rw} height={rh} opacity={e.opacity ?? 1} clip-path="url(#{clipNs}-{e.id})" preserveAspectRatio="none" />
		{#if cropping}<rect x={rx + cr.x * rw} y={ry + cr.y * rh} width={cr.w * rw} height={cr.h * rh} fill="none" stroke={SEL} stroke-width={1 / (canvasZoom || 1)} stroke-dasharray="{5 / (canvasZoom || 1)} {3 / (canvasZoom || 1)}" vector-effect="non-scaling-stroke" />{/if}
	{:else if e.type === 'polyline'}
		<polyline points={(e.pts ?? []).map(p => p.join(',')).join(' ')} fill={fill} stroke={ink} stroke-width={w} vector-effect="non-scaling-stroke" stroke-linejoin="round" />
	{:else if e.type === 'rect'}
		{#if e.cloud}
			<path d={cloudPath(e.a!, e.b!)} fill={fill} stroke={ink} stroke-width={w} vector-effect="non-scaling-stroke" stroke-linejoin="round" />
		{:else}
			<rect x={Math.min(e.a![0], e.b![0])} y={Math.min(e.a![1], e.b![1])} width={Math.abs(e.b![0] - e.a![0])} height={Math.abs(e.b![1] - e.a![1])} fill={fill} stroke={ink} stroke-width={w} vector-effect="non-scaling-stroke" />
		{/if}
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
		{#if e.callout}
			<!-- callout: a box around the text + a leader line to e.leader (attached to the box side nearest the tip) -->
			{@const bb = textBox(e)}
			{@const pad = fs * 0.4}
			{@const bx0 = bb[0] - pad}
			{@const by0 = bb[1] - pad}
			{@const bx1 = bb[2] + pad}
			{@const by1 = bb[3] + pad}
			{@const lp = e.leader ?? [bb[0] - fs * 3, bb[3] + fs * 3]}
			{@const nx = lp[0] < (bx0 + bx1) / 2 ? bx0 : bx1}
			{@const ny = lp[1] < (by0 + by1) / 2 ? by0 : by1}
			<rect x={bx0} y={by0} width={bx1 - bx0} height={by1 - by0} rx={fs * 0.3} fill="none" stroke={ink} stroke-width={1.2 / (canvasZoom || 1)} vector-effect="non-scaling-stroke" />
			<line x1={nx} y1={ny} x2={lp[0]} y2={lp[1]} stroke={ink} stroke-width={1.2 / (canvasZoom || 1)} vector-effect="non-scaling-stroke" />
			<polygon points={arrowPts([nx, ny] as Pt, lp as Pt)} fill={ink} />
		{/if}
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
	{@const qa = centerDraw && (tool === 'Rectangle' || tool === 'Ellipse') ? ([2 * a[0] - p[0], 2 * a[1] - p[1]] as Pt) : a}
	<!-- clean, crisp SOLID outline (no chunky dashes); stroke ÷ canvasZoom keeps it ~1px on screen at ANY
	     zoom (non-scaling-stroke only cancels the SVG-internal transform, not the CSS canvas zoom). -->
	{@const sw = 1 / (canvasZoom || 1)}
	{#if tool === 'Line' || tool === 'Dimension'}
		<line x1={a[0]} y1={a[1]} x2={p[0]} y2={p[1]} stroke={SEL} stroke-width={sw} />
	{:else if tool === 'Rectangle'}
		<rect x={Math.min(qa[0], p[0])} y={Math.min(qa[1], p[1])} width={Math.abs(p[0] - qa[0])} height={Math.abs(p[1] - qa[1])} fill="none" stroke={SEL} stroke-width={sw} />
	{:else if tool === 'Ellipse'}
		<ellipse cx={(qa[0] + p[0]) / 2} cy={(qa[1] + p[1]) / 2} rx={Math.abs(p[0] - qa[0]) / 2} ry={Math.abs(p[1] - qa[1]) / 2} fill="none" stroke={SEL} stroke-width={sw} />
	{:else if tool === 'Box' || tool === 'Furniture' || tool === 'Opening'}
		<rect x={Math.min(a[0], p[0])} y={Math.min(a[1], p[1])} width={Math.abs(p[0] - a[0])} height={Math.abs(p[1] - a[1])} fill="none" stroke={SEL} stroke-width={sw} />
	{:else if tool === 'Section'}
		<rect x={Math.min(a[0], p[0])} y={Math.min(a[1], p[1])} width={Math.abs(p[0] - a[0])} height={Math.abs(p[1] - a[1])} fill="#0e749011" stroke="#0e7490" stroke-width={1.2 * sw} vector-effect="non-scaling-stroke" />
	{/if}
	<!-- the fixed anchor point (first click / centre) as a small hollow square, for precise reference -->
	{@render drawDot(qa)}
{/snippet}
{#snippet drawDot(pt: Pt)}
	{@const s = gripSize * 1.2}
	<rect x={pt[0] - s / 2} y={pt[1] - s / 2} width={s} height={s} fill="white" stroke={SEL} stroke-width={1 / (canvasZoom || 1)} />
{/snippet}
{#snippet crosshair(pt: Pt)}
	{@const s = gripSize * 2.4}
	{@const sw = 1 / (canvasZoom || 1)}
	<line x1={pt[0] - s} y1={pt[1]} x2={pt[0] + s} y2={pt[1]} stroke={SEL} stroke-width={sw} opacity="0.85" />
	<line x1={pt[0]} y1={pt[1] - s} x2={pt[0]} y2={pt[1] + s} stroke={SEL} stroke-width={sw} opacity="0.85" />
	<rect x={pt[0] - s * 0.28} y={pt[1] - s * 0.28} width={s * 0.56} height={s * 0.56} fill="none" stroke={SEL} stroke-width={sw} />
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
	/* Section marker on the plan: a teal cut box + a direction arrow + the elevation's label. */
	/* Alignment guide lines (Visio-style): thin magenta dashed, brighter when selected; preview dimmer. */
	.guide { stroke:#c026d3; stroke-width:1; stroke-dasharray:10 6; vector-effect:non-scaling-stroke; pointer-events:none; opacity:0.7; }
	.guide.sel { stroke:#e879f9; opacity:1; stroke-dasharray:none; }
	.guide.preview { opacity:0.4; }
	.section-mark { fill:#0e749010; stroke:#0e7490; stroke-dasharray:7 4; vector-effect:non-scaling-stroke; pointer-events:none; }
	.section-mark.sel { fill:#0e749022; stroke-dasharray:none; }
	.section-arrow { fill:#0e7490; stroke:#0e7490; vector-effect:non-scaling-stroke; pointer-events:none; }
	.section-label { fill:#0e7490; font-weight:700; font-family:Consolas,monospace; pointer-events:none; }
	/* Selected-section floating toolbar (screen space, tracks the box): open / re-aim / delete. */
	.section-toolbar { position:absolute; z-index:12; display:flex; align-items:center; gap:3px; padding:2px;
		background:#fff; border:1px solid #0e7490; border-radius:6px; box-shadow:0 2px 8px #0003; }
	.section-toolbar .st-btn { display:flex; align-items:center; justify-content:center; width:22px; height:20px;
		color:#0e7490; background:transparent; border:none; border-radius:4px; cursor:pointer; }
	.section-toolbar .st-btn:hover { background:#0e74901a; }
	.section-toolbar .st-del { color:#dc2626; }
	.section-toolbar .st-del:hover { background:#dc26261a; }
	.section-toolbar .st-dir { font-size:11px; color:#0e7490; background:#fff; border:1px solid #cbd5e1; border-radius:4px; padding:1px 3px; font-family:Consolas,monospace; }
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
	.scale-entry { position:absolute; z-index:12; transform:translate(-50%, -140%); display:flex; align-items:center; gap:5px; white-space:nowrap;
		background:var(--panel, #fff); color:var(--text, #111827); border:1px solid #0e7490; border-radius:6px; padding:4px 6px; font-size:11px; box-shadow:0 4px 16px #0005; }
	.scale-entry input { width:64px; background:var(--input, #f1f5f9); color:inherit; border:1px solid var(--line, #cbd5e1); border-radius:4px; padding:2px 5px; font-size:12px; }
	.scale-entry input:focus { outline:none; border-color:#0e7490; }
	.scale-entry .se-unit { color:var(--muted, #64748b); }
	.scale-entry button { background:#0e7490; color:#fff; border:none; border-radius:4px; padding:3px 9px; font-size:11px; font-weight:600; cursor:pointer; }
</style>
