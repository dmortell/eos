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
	import { BASE, HANDLE_PX, PAPER_PX_PER_MM } from '../constants'
	import { type Pt, type Ent, type View, type ElevDir, GROUND, MMPU, PLAN_CX, PLAN_CY, STYLE_DEFAULTS, ELEV_BASIS, elevU, elevUInv, dist, segDist, translate, textBox } from './geometry'
	import { makeMapper, type Mapper } from './mapper'
	import { beginPointerDrag, DragRegistry } from './gestures'
	import type { ViewCtx } from './view'
	import { pickSectionGrip as gPickSectionGrip, modelGrips as gModelGrips, pickModelGrip as gPickModelGrip, gripsFor as gGripsFor, constrainGrip as gConstrainGrip, type MGrip, type Grip, type GripOpts } from './grips'
	import { SNAP_STEP, snapToGrid, rndTo, snapDelta as sSnapDelta, findSnap as sFindSnap, drawPoint as sDrawPoint, snapNode as sSnapNode, graphNodeApply as sGraphNodeApply, elevDepthSnap as sElevDepthSnap } from './snap'
	import { rotatePt, inScope as hInScope, inThisView as hInThisView, groundInIso as hGroundInIso, isFlatElev as hIsFlatElev, flatXSpan as hFlatXSpan, rotCenter as hRotCenter, bbox as hBbox, hitEnt as hHitEnt, pickable as hPickable, prismRect as hPrismRect, prismTilted, graphNodeDraw as hGraphNodeDraw, hitModel as hHitModel, hitModelIso as hHitModelIso, sectionCorners, hitSection as hHitSection, hitGuide as hHitGuide, marqueeSelect as hMarqueeSelect, type GN } from './hit'
	import { isLayerHidden, isLayerLocked, layerColor, layerOrder } from '../layers.svelte'
	import Model3d from '../3dview/Model3d.svelte'
	import { models, modelById, modelSel, setModelSel } from '../3dview/models.svelte'
	import { newId } from '../ids'
	import { arrowPts, cloudPath, groundPts, centerCorners, constrainPt as aConstrainPt } from './annotations'
	import { guideId, selectedPlanGuide } from '../guides.svelte'
	import { imgEdit, clearImgMode } from '../imageEdit.svelte'
	import { polyToGraph } from '../3dview/migrate'
	import { DEFAULT_YAW, DEFAULT_PITCH, doorGeom, isoBounds, isoR } from '../3dview/projection'
	import type { Obj, Clip } from '../3dview/types'
	// Pure geometry (Pt/Ent/View + helpers) lives in ./geometry; import those types directly from there.
	// (svelte-check can't resolve type re-exports from an instance <script>, so we don't re-export them.)
	// A section cut shown as a marker on the PLAN: its clip box, viewing direction, and the elevation's
	// label. Clicking the marker opens (or re-focuses) that elevation tab.
	export type SectionMarker = { id: string; clip: Clip; dir: ElevDir; label: string }

	// Drafting/interaction flags are grouped into one `env` object, and all the event callbacks into
	// one `on` object, to keep the prop list small (a step toward a headless editor class — see
	// review.md §4.1). `frame` is only used by PaperPage; the Viewport ignores it.
	export type Env = { acad?: boolean; navContent?: boolean; grid?: boolean; lwt?: boolean; osnap?: boolean; snap?: boolean; ortho?: boolean; cen?: boolean; guideVert?: boolean; canvasZoom?: number }
	export type VpOn = {
		activate?: () => void; deactivate?: () => void; add?: (e: Ent) => void; update?: (e: Ent) => void;
		delete?: (ids: string[]) => void; select?: (ids: string[]) => void; view?: (v: View) => void;
		status?: (text: string) => void; coords?: (x: number, y: number) => void; beginedit?: () => void;
		endedit?: (debounceMs?: number) => void; tool?: (name: string) => void;
		copy?: (ids: string[]) => void; cut?: (ids: string[]) => void; paste?: () => void;
		group?: (ids: string[]) => void; ungroup?: (ids: string[]) => void;
		reorder?: (ids: string[], op: 'front' | 'back' | 'forward' | 'backward') => void;
		scale?: (s: string) => void; modeledit?: (label?: string) => void; section?: (clip: Clip) => void; orbit?: (yaw: number, pitch: number) => void;
		sectionselect?: (id: string | null) => void; sectionmove?: (id: string, clip: Clip) => void;
		sectionsetdir?: (id: string, dir: ElevDir) => void; sectiondelete?: (id: string) => void
		sectiondropdir?: (id: string, dir: ElevDir) => void   // drop this direction's elevation as a viewport frame on the current sheet
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
	// Guide orientation: a base (set by the Guide tool's H/V pop-out, for touch) XOR the Shift key, so on a
	// mouse Shift still flips it and on touch the pop-out picks it. true = vertical.
	const guideIsVert = (shift: boolean) => (env.guideVert ?? false) !== shift
	const canvasZoom = $derived(env.canvasZoom ?? 1)
	// SNAP_STEP / snapToGrid / entSnaps / snapDelta live in ui/snap.ts (R1 step 5).

	const tagIcon: Record<string, string> = { floorplan: 'mapPin', iso: 'box', front: 'server', rear: 'server', left: 'server', right: 'server' }
	// Elevation projection: which side view (front/rear/left/right) and its footprint axis + sign.
	const ELEV = new Set<string>(['front', 'rear', 'left', 'right'])
	const isElev = $derived(ELEV.has(kind))
	const elevDir = $derived((isElev ? kind : 'front') as ElevDir)
	// Project a footprint coordinate (along the current dir's axis) to the drawing horizontal, and back.
	const projU = (coord: number) => elevU(elevDir, coord, CX, CY)
	const projUInv = (u: number) => elevUInv(elevDir, u, CX, CY)
	const DRAW = new Set(['Line', 'Rectangle', 'Ellipse', 'Dimension', 'Text', 'Wall', 'Furniture', 'Trunk', 'Pipe', 'Section', 'Opening', 'Guide'])
	const SECTION_DIRS: ElevDir[] = ['front', 'rear', 'left', 'right']   // the 4 cut directions a section box can spawn
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
	const uid = () => newId('e')
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
	// px per model unit for the viewBox basis. A PAPER frame (parent passes boxW/boxH in paper px) uses
	// PAPER_PX_PER_MM so 1 model unit = 1 paper mm at 1:1 → true 1:N scale (B2). A standalone/full-size
	// viewport (no boxW; measured on screen) keeps the arbitrary on-screen BASE.
	const pxPerUnit = $derived(boxW ? PAPER_PX_PER_MM : BASE)
	let vbW = $derived(((boxW ?? vpW) || 400) / pxPerUnit), vbH = $derived(((boxH ?? vpH) || 250) / pxPerUnit)
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
	// The single source of truth for point ↔ screen math (ui/mapper.ts, R1 step 2). Built from ONE
	// getBoundingClientRect; a hit/snap loop should build it ONCE (below) and reuse `m.toClient` per point
	// instead of calling localToClient (a layout read) per point — that is the P1 fix.
	function mapper(): Mapper | null {
		if (!svg) return null
		return makeMapper({ rect: svg.getBoundingClientRect(), vbW, minX, minY, cx: CX, cy: CY, view, dscale })
	}
	// Client px → drawing (view-local) coords, for placing/hit-testing.
	function toLocalXY(cx: number, cy: number): Pt | null {
		const m = mapper(); return m ? m.toModel(cx, cy) : null
	}
	function toLocal(e: MouseEvent): Pt | null { return toLocalXY(e.clientX, e.clientY) }
	// Drawing (view-local) coords → client px, for handle hit-testing.
	function localToClient(x: number, y: number): { x: number; y: number } | null {
		const m = mapper(); return m ? m.toClient(x, y) : null
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
	// Shift-constrain the drawing point relative to the start (square / 15°, per tool) — ui/annotations.ts.
	const constrainPt = (a: Pt, p: Pt, shift: boolean): Pt => aConstrainPt(tool, a, p, shift)
	// Objects drawn in an elevation view are NATIVE to that elevation (space = the dir); a box stays
	// plan-space (it's a 3D footprint) and projects like normal.
	const drawPlane = () => (isElev ? elevDir : undefined)   // the DRAWING PLANE new geometry lands in (plan or this elevation)
	function place(a: Pt, b: Pt) {
		const sp = drawPlane()
		if (tool === 'Line') on.add?.({ id: uid(), type: 'line', a, b, plane: sp })
		else if (tool === 'Rectangle') { const [ra, rb] = centerDraw ? centerCorners(a, b) : [a, b]; on.add?.({ id: uid(), type: 'rect', a: ra, b: rb, plane: sp }) }
		else if (tool === 'Ellipse') { const [ra, rb] = centerDraw ? centerCorners(a, b) : [a, b]; on.add?.({ id: uid(), type: 'ellipse', a: ra, b: rb, plane: sp }) }
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
		if ((e.target as Element)?.closest?.('.section-arrow.pick')) return   // handled by the arrow's pointerdown; don't clear the section selection
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
		if (tool === 'Guide') { const p = toLocal(e); if (p) placeGuide(p, guideIsVert(e.shiftKey)); return }   // drop an alignment guide (H/V pop-out, Shift flips)
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
		if (active && tool === 'Guide' && viewSpace) { const gp = toLocalXY(e.clientX, e.clientY); lastGuidePt = gp; const v = guideIsVert(e.shiftKey); guideCur = gp ? { orient: v ? 'v' : 'h', pos: v ? gp[0] : gp[1] } : null } else if (guideCur) { guideCur = null; lastGuidePt = null }
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
		const fontPx = (ent.fontPt ?? STYLE_DEFAULTS.fontPt) * PT_MM * view.zoom * (vpW / vbW)   // annotative: paperMm·dscale cancels (B3)
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

	// hit-test (topmost first). segDist/textBox live in ./geometry; hit predicates in ./hit.
	// Flat (z=0, no height) objects that project to an edge-on ground line in elevation.
	const FLAT = new Set(['line', 'polyline', 'dim', 'rect', 'ellipse'])
	// Object SPACE (v1 — per-view annotations, like the Sheets tool): 'plan'/undefined = model/plan
	// space (projected into every elevation, layer-gated); an ElevDir = drawn natively in that
	// elevation only (a wall/rack label, a leader, a dimension), rendered as-is there and hidden in
	// other views. The full 3D-position/construction-plane model (project onto x/y/z planes, oriented
	// per view) is a later upgrade — see todo §2.
	// The hit logic lives in ui/hit.ts (R1 step 3); those functions take a ViewCtx so they read no
	// component state. Viewport builds `ctx` once (a $derived from the view props) and the thin wrappers
	// below inject it, so existing call sites (bbox(e), hitEnt(e,p,thr), pickable(e), …) stay unchanged.
	// (`dir: kind` keeps 'floorplan'; the 'floorplan'→'plan' rename is a separate mop-up.)
	const ctx = $derived<ViewCtx>({ dir: kind, isPlan: kind === 'floorplan', isElev, isIso: kind === 'iso', elevDir, cx: CX, cy: CY, ground: GROUND, frameId, paperMm: 1 / (dscale || 1), mdl, yaw, pitch })   // paperMm = 1/dscale (declared later; inlined to avoid TDZ)
	const layerPreds = { hidden: isLayerHidden, locked: isLayerLocked }
	const inScope = (e: Ent) => hInScope(ctx, e)
	const inThisView = (e: Ent) => hInThisView(ctx, e)
	const groundInIso = (e: Ent) => hGroundInIso(ctx, e)
	const isFlatElev = (e: Ent) => hIsFlatElev(ctx, e)
	const flatXSpan = (e: Ent): [number, number] => hFlatXSpan(ctx, e)
	const rotCenter = (e: Ent): Pt => hRotCenter(ctx, e)
	const bbox = (e: Ent): [number, number, number, number] => hBbox(ctx, e)
	const hitEnt = (e: Ent, p: Pt, thr: number): boolean => hHitEnt(ctx, e, p, thr)
	// Pick tolerance in MODEL units for a target of `px` screen pixels (px of slack around a line
	// edge). 8 model units was huge at scale — this keeps it a few px whatever the zoom.
	// Pick tolerance in MODEL mm for `px` screen pixels (B9): screen px → viewBox units (dscale-scaled) ÷
	// dscale, since entity/object coords live in the ÷dscale (real-mm) space. ONE helper for every hit + snap
	// test — the old mix of `hitTol(px)/dscale` and a raw `hitTol(px)` (100× too small at 1:100, so walls/thin
	// pipes were barely pickable) is gone. Delegates to the mapper (ui/mapper.ts) so the math lives in one place.
	const tolMm = (px: number) => { const m = mapper(); return m ? m.tolMm(px) : px / (dscale || 1) }
	// A hidden or locked layer's objects can't be picked; nor can objects that don't belong to this view.
	const pickable = (e: Ent) => hPickable(ctx, e, layerPreds)
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
		const thr = tolMm(3.5)
		// Scan in PAINT order (top-most first), not raw array order (B7): rendering sorts by layer then
		// array index, so a later-added entity on a lower layer must not win the click over what's drawn on top.
		for (let i = paintEnts.length - 1; i >= 0; i--) if (pickable(paintEnts[i]) && hitEnt(paintEnts[i], p, thr)) return [paintEnts[i].id]
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
	const modelLayerLocked = (o: Obj) => !!mdl?.layers?.find(x => x.id === o.layer)?.locked   // locked → not pickable (B16)
	// Model-object hit-testing lives in ui/hit.ts (R1 step 3), taking ctx + the model-layer preds; the thin
	// wrappers below inject them (prismTilted/prismOutline/convexHull/inPoly/graphHit are now hit.ts-internal).
	const mlayers = { visible: modelLayerVisible, locked: modelLayerLocked }
	const prismRect = (o: Obj) => hPrismRect(ctx, o)
	const graphNodeDraw = (n: GN) => hGraphNodeDraw(ctx, n)
	const rndSnap = (v: number) => rndTo(v, snap ? SNAP_STEP : 0)   // grid-round when SNAP is on
	// snapNode / graphNodeApply live in ui/snap.ts (R1 step 5). The wrappers inject ctx, the tolerances
	// (~10px snap radius, ~8px pull-apart radius around the drag origin) + the layer preds, and assign
	// `snapMark` from the returned mark.
	const snapNode = (p: Pt, exclude: GN, origin?: Pt): Pt | null => sSnapNode(ctx, p, exclude, tolMm(10), tolMm(8), mlayers, origin)
	function graphNodeApply(n: GN, p: Pt, origin?: Pt) { snapMark = sGraphNodeApply(ctx, n, p, { snapNode, rnd: rndSnap }, origin) }
	// hitModel / hitModelIso live in ui/hit.ts (R1 step 3); the wrappers inject ctx + the model-layer preds.
	// hitModel's pick tolerance (tolMm(4), B9) is passed in. graphHit is now hit.ts-internal.
	const hitModel = (p: Pt) => hHitModel(ctx, p, tolMm(4), mlayers)
	const hitModelIso = (p: Pt) => hHitModelIso(ctx, p, mlayers)
	// hitSection / sectionCorners live in ui/hit.ts (R1 step 3); the wrapper injects ctx + the section list.
	const hitSection = (p: Pt) => hHitSection(ctx, sections, p, tolMm(6))
	// The currently-selected section marker (grips + toolbar), if it's shown in this plan view.
	const selSectionObj = $derived.by(() => (isPlan && selSection ? sections.find((s) => s.id === selSection) ?? null : null))
	// Section grips live in ui/grips.ts (R1 step 4). The wrapper builds ONE mapper for the press (P1).
	function pickSectionGrip(clientX: number, clientY: number): { id: string; apply: (p: Pt) => Clip } | null {
		const m = mapper(); if (!m || !selSectionObj) return null
		return gPickSectionGrip(m, selSectionObj, clientX, clientY)
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
		const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, a = tolMm(11)   // ~screen px in unscaled model units
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

	// ── alignment GUIDES ── the Guide tool drops a full-view h/v line (Shift = vertical) in this view's
	// space; a selected PLAN guide then fixes the depth when drawing a conduit in an elevation.
	let guideCur = $state<{ orient: 'h' | 'v'; pos: number } | null>(null)   // hover preview for the Guide tool
	let lastGuidePt: Pt | null = null   // last cursor point, so Shift can flip the preview orientation instantly
	function updateGuidePreview(shift: boolean) {   // re-orient the Guide preview on Shift, without a mousemove
		if (tool !== 'Guide' || !lastGuidePt) return
		const v = guideIsVert(shift)
		guideCur = { orient: v ? 'v' : 'h', pos: v ? lastGuidePt[0] : lastGuidePt[1] }
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
	// hitGuide lives in ui/hit.ts (R1 step 3); the wrapper passes this view's guide list.
	const hitGuide = (p: Pt) => hHitGuide(viewGuides, p, tolMm(6))
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
	// Model-object grips (prismCorners/applyPrismGrip/modelGrips) live in ui/grips.ts (R1 step 4); MGrip is
	// imported. The wrapper injects ctx + the grid-snap (rndSnap) and node-apply (graphNodeApply) opts.
	const modelGrips = (o: Obj): MGrip[] => gModelGrips(ctx, o, { rnd: rndSnap, applyNode: graphNodeApply })
	// pickModelGrip builds ONE mapper for the press (P1), then tests every grip against it.
	function pickModelGrip(clientX: number, clientY: number): MGrip | null {
		const m = mapper(); if (!m || !mSelObj) return null
		return gPickModelGrip(m, modelGrips(mSelObj), clientX, clientY)
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
		if (secDrag?.moved) { suppressClick = true; on.modeledit?.('Move section') }   // one undo step for the drag
		on.endedit?.()   // ALWAYS close the gesture opened at drag start (a no-move click must not leave it open)
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
		if (secResize?.moved) { suppressClick = true; on.modeledit?.('Resize section') }   // one undo step for the resize
		on.endedit?.()   // ALWAYS close the gesture opened at drag start (a no-move click must not leave it open)
		secResize = null
		window.removeEventListener('pointermove', onSecResizeMove)
		window.removeEventListener('pointerup', onSecResizeUp)
	}
	// ── 3D iso ORBIT — a plain drag in the iso view rotates the camera (yaw/pitch). The projection
	// already takes yaw/pitch; here we just turn a drag into new angles. Pitch is clamped to (0, 90°).
	// Runs on beginPointerDrag (ui/gestures.ts): the drag's start + camera angles ride in the state.
	type OrbitDrag = { sx: number; sy: number; yaw0: number; pitch0: number }
	function onOrbitMove(e: PointerEvent, s: OrbitDrag) {
		const dx = e.clientX - s.sx, dy = e.clientY - s.sy
		let ny = s.yaw0 + dx * 0.008
		let np = Math.max(0.06, Math.min(Math.PI / 2 - 0.02, s.pitch0 + dy * 0.006))
		if (e.shiftKey) {   // Shift = snap yaw + pitch to 15° increments
			const S = Math.PI / 12
			ny = Math.round(ny / S) * S
			np = Math.max(S, Math.min(Math.PI / 2 - 0.02, Math.round(np / S) * S))
		}
		on.orbit?.(ny, np)
	}

	// ── model PLACEMENT (P2f / §3) — create new model objects on the store, one undo step, select it ──
	const mUid = (p: string) => newId(p)
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
		const thr = tolMm(6)   // screen px → MODEL units (coords are in the ÷dscale space)
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
	// Elevation depth-snap (a drawn point snaps its DEPTH onto the nearest wall/conduit segment) lives in
	// ui/snap.ts (R1 step 5); the wrapper injects ctx, the ~12px tolerance and the layer preds.
	const elevDepthSnap = (p: Pt) => sElevDepthSnap(ctx, p, tolMm(12), mlayers)
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
	// entSnaps / findSnap / drawPoint live in ui/snap.ts (R1 step 5). They RETURN the snap mark; these thin
	// wrappers build the one-per-pass mapper (P1), pass the drafting flags, and assign `snapMark`.
	function findSnap(clientX: number, clientY: number, exclude?: string): Pt | null {
		const m = mapper()
		const hit = osnap && m ? sFindSnap(ctx, m, entities, clientX, clientY, { exclude, editingId: editText?.id }) : null
		snapMark = hit
		return hit ? hit.p : null
	}
	// The point a draw/place should use: object snap wins; else the shift/ortho-constrained, grid-snapped pointer.
	function drawPoint(clientX: number, clientY: number, base?: Pt, shift = false): Pt | null {
		const m = mapper(); if (!m) { snapMark = null; return null }
		const r = sDrawPoint(ctx, m, { osnap, snap, ortho, tool, ents: entities, editingId: editText?.id }, clientX, clientY, base, shift)
		snapMark = r.mark
		return r.p
	}

	// ── editing handles (Kestrel-style grips) ──
	// Each selected entity shows square grips at its defining points. Dragging a grip edits
	// that point; dragging the body moves the whole entity. Grips render at a constant
	// screen size (÷ zoom) so they don't grow as the viewport zooms, like real CAD.
	// A grip: `apply(p)` handles the UN-rotated (or non-rotated) drag. For a ROTATED shape, `anchor` (the
	// Entity grips (Grip type, gripsFor/gripsLocal/rotGripLocal/setFlatX/canRotate/constrainGrip) live in
	// ui/grips.ts (R1 step 4). The wrappers inject ctx + the opts bundle: the screen-constant grip length
	// (gripSize), a live Shift getter, and the id of any image mid-CROP. Built per call (gripSize is
	// declared below — a function body defers the read, so no TDZ).
	const gripOpts = (): GripOpts => ({ gripMm: gripSize, shift: () => shiftDown, imgCropId: imgEdit.mode === 'crop' ? imgEdit.id : null })
	const gripsFor = (e: Ent): Grip[] => gGripsFor(ctx, e, gripOpts())
	const constrainGrip = (base: Ent, gi: number, p: Pt, shift: boolean): Pt => gConstrainGrip(ctx, base, gi, p, shift, gripOpts())
	// Grips must be a CONSTANT screen size (Kestrel / Outlets), whatever the zoom. On-screen
	// px of a model-unit length = length · view.zoom · (pxPerUnit · canvasZoom); dividing by both
	// zooms cancels them so the grip is always HANDLE_PX px — the canvas CSS zoom included
	// (without canvasZoom the grips grew as you zoomed the canvas in). Uses pxPerUnit (not BASE) so
	// grips/hit-tolerances stay HANDLE_PX on a true-scale paper frame too (B2).
	const gripSize = $derived(HANDLE_PX / pxPerUnit / view.zoom / (canvasZoom || 1) / (dscale || 1))
	// ANNOTATIVE sizing (B3): annotation geometry (dim text/arrows/ticks, cloud bumps, callout leader, text,
	// section labels) must be a fixed size ON PAPER — constant paper mm, scaling with screen zoom like the
	// drawing — NOT screen-constant like gripSize. A length of N paper mm = N·paperMm model units. (gripSize
	// stays for grips/handles/snap marks/preview only, which SHOULD be screen-constant.) Fixes: the same
	// sheet at two content zooms printed different arrowheads, and 8 pt text measured 7.7 mm on paper at 1:100.
	const paperMm = $derived(1 / (dscale || 1))   // model mm per paper mm
	const PT_MM = 0.352778   // mm per typographic point → fontPt · PT_MM = paper mm
	// Project a plan point (x,y,0) to iso DRAWING coords, matching how the model renders (isoR + the same
	// bounds-centring as Model3d / hitModelIso). Null off iso. Used to lay plan 2D shapes on the ground.
	const isoGround = $derived.by(() => {
		if (kind !== 'iso' || !mdl) return null
		const b = isoBounds(mdl.objects, yaw, pitch, CX, CY, modelLayerVisible); if (!b) return null
		return (x: number, y: number): Pt => { const q = isoR({ x, y, z: 0 }, yaw, pitch, CX, CY); return [q.u + CX - b.icx, -q.v + CY + b.icy] }
	})
	// A plan entity's outline points (plan coords) + whether it's a closed shape, for ground projection.

	// What a press at these client coords would grab: a grip of a selected entity, or the
	// body of any entity (topmost). Drives the pointer-drag start (mouse-left / 1-finger
	// touch) — navigation is 2-finger, so a single finger is always free to edit.
	function pick(clientX: number, clientY: number): { kind: 'grip' | 'move'; id: string; gi: number } | null {
		const m = mapper(); if (!m) return null   // ONE layout read for the whole grip pass (P1)
		for (const id of sel) {
			const ent = entities.find(x => x.id === id); if (!ent) continue
			const gs = gripsFor(ent)
			for (let i = 0; i < gs.length; i++) {
				const sp = m.toClient(gs[i].x, gs[i].y)
				if (Math.hypot(sp.x - clientX, sp.y - clientY) < 14) return { kind: 'grip', id, gi: i }
			}
		}
		const ids = hit(m.toModel(clientX, clientY)); if (ids.length) return { kind: 'move', id: ids[0], gi: -1 }
		return null
	}

	// What a press grabs, in onDown's priority order (model grip → section grip → entity grip → entity
	// body → guide → section border → model object → nothing/marquee). A pure DECISION — onDown switches on
	// it to start the matching gesture. `p` is the model point (toLocalXY). (review.md §R1 pickAt.)
	type Pick =
		| { kind: 'mgrip'; grip: MGrip }
		| { kind: 'sgrip'; sg: { id: string; apply: (p: Pt) => Clip } }
		| { kind: 'grip'; id: string; gi: number }
		| { kind: 'ent'; id: string }
		| { kind: 'guide'; id: string }
		| { kind: 'section'; id: string }
		| { kind: 'obj'; id: string }
		| null
	function pickAt(clientX: number, clientY: number, p: Pt): Pick {
		if (mSelObj) { const g = pickModelGrip(clientX, clientY); if (g) return { kind: 'mgrip', grip: g } }
		const sg = pickSectionGrip(clientX, clientY); if (sg) return { kind: 'sgrip', sg }
		const hi = pick(clientX, clientY); if (hi) return hi.kind === 'grip' ? { kind: 'grip', id: hi.id, gi: hi.gi } : { kind: 'ent', id: hi.id }
		const gid = hitGuide(p); if (gid) return { kind: 'guide', id: gid }
		const sid = hitSection(p); if (sid) return { kind: 'section', id: sid }
		const mid = hitModel(p); if (mid) return { kind: 'obj', id: mid }
		return null
	}

	// ── drag to move / edit ──
	// `bases` = the entities a body-move drags (the whole selection when you grab a selected one,
	// else just the grabbed one). `base`/`gi` drive grip drags (always a single entity).
	let drag: { id: string; base: Ent; bases: Ent[]; kind: 'grip' | 'move'; gi: number; start: Pt; dup?: boolean; duplicated?: boolean } | null = null
	let dragged = false        // true once the pointer actually moved during a drag
	let suppressClick = false  // swallow the click that ends a real drag (avoids re-select)
	// The drag registry (ui/gestures.ts, R1 step 7) tracks pressed pointers so a second finger (2-finger
	// pan/zoom) aborts a drag — otherwise finger 1 landing on a shape starts a move that the pan then drags
	// around — and holds every live beginPointerDrag so cancelPointerDrag can abort them all. The machines
	// not yet moved onto it (below) still tear down by hand.
	const reg = new DragRegistry()
	function cancelPointerDrag() {
		reg.cancelAll()   // every beginPointerDrag-managed drag (orbit so far)
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
		if (secDrag) {   // abort an in-progress section-marker move
			secDrag = null
			on.endedit?.()   // close the gesture opened at drag start
			window.removeEventListener('pointermove', onSecDragMove)
			window.removeEventListener('pointerup', onSecDragUp)
		}
		if (secResize) {   // abort an in-progress section-marker resize
			secResize = null
			on.endedit?.()   // close the gesture opened at drag start
			window.removeEventListener('pointermove', onSecResizeMove)
			window.removeEventListener('pointerup', onSecResizeUp)
		}
	}
	$effect(() => {
		const up = (e: PointerEvent) => reg.noteUp(e)
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
		if ((e.target as Element)?.closest?.('.section-arrow.pick')) return   // a section-arrow click adds/opens a direction (Svelte delegation ignores its stopPropagation)
		suppressClick = false   // clear any stale flag from a drag that never got its click
		nodeSel = null          // a fresh press resets the node selection (re-set on a no-move node-grip click)
		if (reg.noteDown(e)) { cancelPointerDrag(); return }   // 2nd finger → hand off to pan/zoom
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
			beginPointerDrag<OrbitDrag>(e, { sx: e.clientX, sy: e.clientY, yaw0: yaw, pitch0: pitch }, { onMove: onOrbitMove, onUp: (_e, _s, moved) => { if (moved) suppressClick = true } }, reg)
			return
		}
		const p = toLocalXY(e.clientX, e.clientY); if (!p) return
		const pk = pickAt(e.clientX, e.clientY, p)
		// A selected model object's grip (prism corner / wall node) wins over everything (like entity grips).
		if (pk?.kind === 'mgrip') {
			const g = pk.grip
			on.beginedit?.()   // one undo step for the whole reshape gesture
			// Ctrl/⌘-press on a wall/conduit node BRANCHES: sprout a new segment + drag the new node out (a
			// junction/tee). Plain press moves the node. origin = the grip's start (disconnect from a partner).
			let grip = g, origin: Pt = [g.x, g.y], branch: (() => void) | undefined
			if ((e.ctrlKey || e.metaKey) && g.node && g.obj && (g.obj.type === 'wall' || g.obj.type === 'conduit')) {
				const obj = g.obj, nn = branchNode(obj, g.node)
				const d = graphNodeDraw(nn); origin = [d[0], d[1]]
				grip = { x: d[0], y: d[1], node: nn, obj, apply: (p: Pt, o?: Pt) => graphNodeApply(nn, p, o) }
				branch = () => { obj.nodes = (obj.nodes as GN[]).filter((x) => x.id !== nn.id); obj.segments = (obj.segments as { id: string; a: string; b: string }[]).filter((s) => s.b !== nn.id && s.a !== nn.id) }
			}
			mGrip = { grip, origin, moved: false, branch }
			try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch { /* synthetic */ }
			e.preventDefault(); window.addEventListener('pointermove', onModelGripMove); window.addEventListener('pointerup', onModelGripUp)
			return
		}
		// A corner grip of the SELECTED section resizes it (wins over everything, like a model grip).
		if (pk?.kind === 'sgrip') {
			on.beginedit?.()   // one undo step for the whole resize gesture (committed on release)
			secResize = { ...pk.sg, moved: false }
			try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch { /* synthetic */ }
			e.preventDefault(); window.addEventListener('pointermove', onSecResizeMove); window.addEventListener('pointerup', onSecResizeUp)
			return
		}
		// an alignment guide (below entities/grips, above sections/model/marquee — a thin overlay grabbed in open space).
		if (pk?.kind === 'guide') {
			setModelSel([pk.id]); on.select?.([])   // guide selection reuses modelSel (exclusive with entities)
			guideDrag = { id: pk.id, moved: false }; on.beginedit?.()
			try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch { /* synthetic */ }
			e.preventDefault(); window.addEventListener('pointermove', onGuideDragMove); window.addEventListener('pointerup', onGuideDragUp)
			return
		}
		// a section marker border → SELECT it (grips + toolbar) + start a move drag (a no-move press just selects).
		if (pk?.kind === 'section') {
			const sm = sections.find(s => s.id === pk.id)
			if (sm) {
				if (selSection !== pk.id) on.sectionselect?.(pk.id)
				on.beginedit?.()   // one undo step for the whole move gesture (committed on release)
				secDrag = { id: pk.id, start: p, c0: { ...sm.clip }, moved: false }
				try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch { /* synthetic */ }
				e.preventDefault(); window.addEventListener('pointermove', onSecDragMove); window.addEventListener('pointerup', onSecDragUp)
			}
			return
		}
		// a MODEL object (P2a: prisms in plan) → select + move (exclusive with entity selection).
		if (pk?.kind === 'obj') {
			const mo = mdl?.objects.find(o => o.id === pk.id)
			if (mo) {
				setModelSel([mo.id!]); on.select?.([])
				mDrag = { id: mo.id!, start: p, moved: false,
					o0: mo.type === 'prism' ? { x: mo.x, y: mo.y, z: mo.z } : undefined,
					n0: (mo.type === 'wall' || mo.type === 'conduit') ? (mo.nodes as GN[]).map((n) => ({ id: n.id, x: n.x, y: n.y, z: n.z })) : undefined,
				}
				on.beginedit?.()   // one undo step for the whole model-move gesture
				try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch { /* synthetic */ }
				e.preventDefault(); window.addEventListener('pointermove', onModelDragMove); window.addEventListener('pointerup', onModelDragUp)
			}
			return
		}
		// empty space → drag a Kestrel-style selection box (window / crossing); Shift/Ctrl = additive.
		if (!pk) {
			marquee = { a: p, b: p, add: e.shiftKey || e.ctrlKey || e.metaKey }
			try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch { /* synthetic */ }
			e.preventDefault(); window.addEventListener('pointermove', onMarqueeMove); window.addEventListener('pointerup', onMarqueeUp)
			return
		}
		// pk is an entity grip or body — start the entity drag.
		const hitInfo = { kind: (pk.kind === 'grip' ? 'grip' : 'move') as 'grip' | 'move', id: pk.id, gi: pk.kind === 'grip' ? pk.gi : -1 }
		const base = entities.find(x => x.id === hitInfo.id); if (!base) return
		setModelSel([])   // grabbing an entity clears any model-object selection (they're exclusive)
		// Shift-press on a body is selection-only (toggles on release) — must NOT start a move drag.
		if (e.shiftKey && hitInfo.kind === 'move') { reg.forget(e); return }
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
			if (FLAT.has(en.type)) return axis === 0 ? translate(en, d, 0) : translate(en, 0, d)
		}
		return translate(en, dx, dy)
	}
	// snapDelta lives in ui/snap.ts (R1 step 5); the wrapper passes the live grid step (0 when SNAP is off).
	const snapDelta = (dx: number, dy: number, base: Ent): [number, number] => sSnapDelta(dx, dy, base, snap ? SNAP_STEP : 0)
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
	// bbox now lives in ui/hit.ts (R1 step 3); the `bbox(e)` wrapper above injects ctx.
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
		const ids = hMarqueeSelect(ctx, entities, m.a, m.b, pickable)   // window (L→R) vs crossing (R→L), layer-gated
		const g = expandGroup(ids)   // include whole groups the marquee touched
		on.select?.(m.add ? [...new Set([...sel, ...g])] : g)   // Shift/Ctrl marquee unions with the current selection
		suppressClick = true   // don't let the ensuing click clear this selection
	}

	// Kestrel-style prompt
	let prompt = $derived.by(() => {
		if (!active) return ''
		const n = draft.length
		switch (tool) {
			case 'Select': return mSelObj && (mSelObj.type === 'wall' || mSelObj.type === 'conduit') ? 'Drag a node to reshape · Ctrl-drag a node to branch · double-click a segment to add a node' : 'Click an element'
			case 'Line': return n ? 'Specify next point (Enter / double-click to finish)' : 'Specify first point'
			case 'Guide': {
				if (!viewSpace) return 'Guides are placed on a plan or elevation view'
				let s = `Click to drop a ${guideIsVert(false) ? 'vertical' : 'horizontal'} guide · Shift flips · select a plan guide to fix the depth for elevation drawing`
				// Live spacing readout: if a guide of the SAME orientation is selected, show the perpendicular
				// distance from it to the drop preview, so you can place guides an exact distance apart.
				if (guideCur) { const ref = viewGuides.find((g) => modelSel.includes(g.id) && g.orient === guideCur!.orient); if (ref) s += ` · Δ ${Math.round(Math.abs(ref.pos - guideCur.pos))} mm` }
				return s
			}
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
					<!-- The primary sight arrow shows always (the cut direction on the plan). When the box is
					     SELECTED all 4 arrows show + are clickable: each DROPS that direction's elevation as a
					     viewport frame on the current sheet. -->
					{#each SECTION_DIRS as d (d)}
						{#if d === s.dir || s.id === selSection}
							{@const pick = tool === 'Select' && s.id === selSection}
							<polygon class="section-arrow" class:inactive={d !== s.dir} class:pick points={sectionArrowFor(s.clip, d)} stroke-width={1.4 / (canvasZoom || 1)}
								onpointerdown={(e) => { if (!pick) return; e.stopPropagation(); on.sectiondropdir?.(s.id, d) }} />
						{/if}
					{/each}
					{@const pad = 1.5 * paperMm}
					<text class="section-label" x={bx + pad} y={by - pad} font-size={3 * paperMm}>{s.label}</text>
				{/each}
				<!-- resize grips on the selected section's corners -->
				{#if active && selSectionObj}
					{#each sectionCorners(selSectionObj.clip) as c (c.join(','))}
						<Handle cx={c[0]} cy={c[1]} size={gripSize} cursor="crosshair" strokeWidth={1.2 / (canvasZoom || 1)} />
					{/each}
				{/if}
			{/if}
			<!-- drawn entities (objects on a hidden layer are skipped; the edited text is hidden too) -->
			{#each paintEnts as e (e.id)}{#if e.id !== editText?.id && !isLayerHidden(e.layer) && inThisView(e)}{#if groundInIso(e)}{@render drawnGround(e)}{:else if e.rot}{@const c = rotCenter(e)}<g transform="rotate({e.rot} {c[0]} {c[1]})">{@render drawn(e, selSet.has(e.id))}</g>{:else}{@render drawn(e, selSet.has(e.id))}{/if}{/if}{/each}
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
					{#if selSet.has(e.id) && inThisView(e) && !isLayerHidden(e.layer) && !isLayerLocked(e.layer) && !groundInIso(e)}
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
			<button class="st-btn" title="Drop this direction as a viewport on the sheet" onclick={() => on.sectiondropdir?.(secToolbar.id, secToolbar.dir)}><Icon name="panels" size={13} /></button>
			<select class="st-dir" title="Primary sight direction (arrow on the plan)" value={secToolbar.dir} onchange={(e) => on.sectionsetdir?.(secToolbar.id, (e.currentTarget as HTMLSelectElement).value as ElevDir)}>
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

{#snippet drawnGround(e: Ent)}
	<!-- a plan 2D shape laid on the GROUND in the iso view: outline points (rotated by e.rot) projected via
	     isoGround. Text places at its projected anchor; other types draw as a (foreshortened) poly. -->
	{@const ink = e.color ?? layerColor(e.layer) ?? INK}
	{@const w = (e.weight ?? (lwt ? STYLE_DEFAULTS.weight : 0.5)) / (canvasZoom || 1)}
	{#if isoGround}
		{#if e.type === 'text'}
			{@const tp = isoGround(e.a![0], e.a![1])}
			<text class="anno" x={tp[0]} y={tp[1]} font-size={gripSize * 2} fill={ink} text-anchor="start">{(e.text ?? '').split('\n')[0]}</text>
		{:else}
			{@const g = groundPts(e)}
			{@const c = e.rot ? rotCenter(e) : null}
			{@const pr = g.pts.map((p) => { const q = e.rot && c ? rotatePt(p, c, e.rot) : p; return isoGround!(q[0], q[1]) })}
			{#if pr.length >= 2}
				{#if g.closed}<polygon points={pr.map((p) => p.join(',')).join(' ')} fill={e.fill ?? 'none'} stroke={ink} stroke-width={w} vector-effect="non-scaling-stroke" />
				{:else}<polyline points={pr.map((p) => p.join(',')).join(' ')} fill="none" stroke={ink} stroke-width={w} vector-effect="non-scaling-stroke" />{/if}
			{/if}
		{/if}
	{/if}
{/snippet}
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
		{#if e.arrow === 'end' || e.arrow === 'both'}<polygon points={arrowPts(e.a!, e.b!, 3.5 * paperMm)} fill={ink} />{/if}
		{#if e.arrow === 'start' || e.arrow === 'both'}<polygon points={arrowPts(e.b!, e.a!, 3.5 * paperMm)} fill={ink} />{/if}
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
			<path d={cloudPath(e.a!, e.b!, 4 * paperMm)} fill={fill} stroke={ink} stroke-width={w} vector-effect="non-scaling-stroke" stroke-linejoin="round" />
		{:else}
			<rect x={Math.min(e.a![0], e.b![0])} y={Math.min(e.a![1], e.b![1])} width={Math.abs(e.b![0] - e.a![0])} height={Math.abs(e.b![1] - e.a![1])} fill={fill} stroke={ink} stroke-width={w} vector-effect="non-scaling-stroke" />
		{/if}
	{:else if e.type === 'ellipse'}
		<ellipse cx={(e.a![0] + e.b![0]) / 2} cy={(e.a![1] + e.b![1]) / 2} rx={Math.abs(e.b![0] - e.a![0]) / 2} ry={Math.abs(e.b![1] - e.a![1]) / 2} fill={fill} stroke={ink} stroke-width={w} vector-effect="non-scaling-stroke" />
	{:else if e.type === 'dim'}
		<!-- a real dimension: dim line with arrowheads, perpendicular extension ticks, and the measured
		     length (mm) set above the line, aligned to it, at a constant on-screen size. -->
		{@const col = seld ? SEL : (e.color ?? '#0e766e')}
		{@const A = e.a!}{@const B = e.b!}
		{@const len = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1}
		{@const ux = (B[0] - A[0]) / len}{@const uy = (B[1] - A[1]) / len}
		{@const px = -uy}{@const py = ux}
		{@const tk = 1.5 * paperMm}
		{@const off = e.dimOff ?? 2.5 * paperMm}
		{@const t = e.dimT ?? 0.5}
		{@const mx = A[0] + ux * len * t + px * off}
		{@const my = A[1] + uy * len * t + py * off}
		{@const ang = Math.atan2(uy, ux) * 180 / Math.PI}
		{@const rang = ang > 90 || ang < -90 ? ang + 180 : ang}
		<line x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} stroke={col} stroke-width={w} vector-effect="non-scaling-stroke" />
		<polygon points={arrowPts(B, A, 3.5 * paperMm)} fill={col} />
		<polygon points={arrowPts(A, B, 3.5 * paperMm)} fill={col} />
		<line x1={A[0] - px * tk} y1={A[1] - py * tk} x2={A[0] + px * tk} y2={A[1] + py * tk} stroke={col} stroke-width={w} vector-effect="non-scaling-stroke" />
		<line x1={B[0] - px * tk} y1={B[1] - py * tk} x2={B[0] + px * tk} y2={B[1] + py * tk} stroke={col} stroke-width={w} vector-effect="non-scaling-stroke" />
		<text class="anno" x={mx} y={my} font-size={2.5 * paperMm} fill={col} text-anchor="middle" transform="rotate({rang} {mx} {my})">{Math.round(len)}</text>
	{:else if e.type === 'text'}
		{@const fs = (e.fontPt ?? STYLE_DEFAULTS.fontPt) * PT_MM * paperMm}
		{@const anchor = e.align === 'center' ? 'middle' : e.align === 'right' ? 'end' : 'start'}
		{@const lines = (e.text ?? '').split('\n')}
		{@const lh = fs * 1.18}
		<!-- vertical align shifts the whole block about the anchor a[1] (top = first baseline here). -->
		{@const oy = e.valign === 'middle' ? -((lines.length - 1) * lh) / 2 : e.valign === 'bottom' ? -((lines.length - 1) * lh) : 0}
		{#if e.callout}
			<!-- callout: a box around the text + a leader line to e.leader (attached to the box side nearest the tip) -->
			{@const bb = textBox(e, PT_MM * paperMm)}
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
			<polygon points={arrowPts([nx, ny] as Pt, lp as Pt, 3.5 * paperMm)} fill={ink} />
		{/if}
		<text class="anno" x={e.a![0]} y={e.a![1] + oy} font-size={fs} fill={ink} font-weight="600" text-anchor={anchor} dominant-baseline={e.valign === 'middle' ? 'central' : undefined}>
			{#each lines as line, i (i)}<tspan x={e.a![0]} dy={i === 0 ? 0 : lh}>{line}</tspan>{/each}
		</text>
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
	{:else if tool === 'Furniture' || tool === 'Opening'}
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
	.section-arrow.inactive { fill:#0e749033; stroke:#0e749077; }   /* a direction with no elevation yet — click to add */
	.section-arrow.pick { pointer-events:auto; cursor:pointer; }
	.section-arrow.pick:hover { fill:#e0a020; stroke:#e0a020; }
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
