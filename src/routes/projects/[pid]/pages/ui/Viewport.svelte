<script lang="ts">
	// Reusable viewport (kestrel-adoption mockup) with mock CAD drawing modeled on
	// KestrelCad2 (src/app.js acceptPoint / preview / prompts, src/model.js entity
	// types): click-to-place tools with a rubber-band preview, and Select-tool
	// hit-testing. Used inside a sheet's paper page (kind='plan') and as a
	// standalone model view (kind='model'). The parent owns the entities/selection
	// (so drawing persists per document, tool + selection per view). Fills its parent.
	import { Icon } from '$lib'
	import { toast } from 'svelte-sonner'
	import { tick } from 'svelte'
	import { panzoom } from './panzoom'
	import Handle from '../parts/Handle.svelte'
	import EntRender from './render/EntRender.svelte'
	import { BASE, HANDLE_PX, PAPER_PX_PER_MM, PT_MM } from '../constants'
	import { type Pt, type Ent, type View, type ElevDir, GROUND, MMPU, PLAN_CX, PLAN_CY, STYLE_DEFAULTS, ELEV_BASIS, dist, segDist, translate } from './geometry'
	import { makeMapper, type Mapper } from './mapper'
	import { beginPointerDrag, DragRegistry } from './gestures'
	import { drawPlane, buildEnt, sectionObj, sectionName, PRISM_TOOL, trimTail, polylineEnt, graphObj, prismObj, guideObj, imageWithOrigin, imageScaled, moveEnt as pMoveEnt } from './place'
	import {
		addModelObj as meAddModelObj,
		insertGraphNode as meInsertGraphNode, branchNode as meBranchNode, addGuide as meAddGuide, addSection as meAddSection,
		setSectionDir as meSetSectionDir, deleteSection as meDeleteSection, setSectionClip as meSetSectionClip,
	} from './modelEdit'
	import { noopEditor, type Editor } from './editor'
	import { idsOfKind, singleOfKind, type SelItem } from './selection'
	import type { ViewCtx } from './view'
	import { pickSectionGrip as gPickSectionGrip, modelGrips as gModelGrips, pickModelGrip as gPickModelGrip, gripsFor as gGripsFor, constrainGrip, type MGrip, type Grip, type GripOpts } from './grips'
	import { SNAP_STEP, snapToGrid, rndTo, snapDelta as sSnapDelta, findSnap as sFindSnap, drawPoint as sDrawPoint, snapNode as sSnapNode, graphNodeApply as sGraphNodeApply, elevDepthSnap as sElevDepthSnap } from './snap'
	import { rotatePt, inThisView as hInThisView, groundInIso, rotCenter, bbox as hBbox, hitEnt as hHitEnt, pickable as hPickable, prismTilted, graphNodeDraw as hGraphNodeDraw, hitModel as hHitModel, hitModelIso, sectionCorners, hitSection as hHitSection, hitGuide as hHitGuide, marqueeSelect as hMarqueeSelect, type GN } from './hit'
	import { isLayerHidden as lsHidden, isLayerLocked as lsLocked, layerColor as lsColor, layerOrder as lsOrder } from '../layers.svelte'
	import Model3d from '../3dview/Model3d.svelte'
	import { MODEL_SPACE_INK, onDark } from './modelSpace'
	import { models, modelById } from '../3dview/models.svelte'
	import { newId } from '../ids'
	import { constrainPt, sectionArrowFor } from './annotations'
	import { guideId, selectedPlanGuide } from '../guides.svelte'
	import { imgEdit, clearImgMode } from '../imageEdit.svelte'
	import { DEFAULT_YAW, DEFAULT_PITCH, doorGeom, isoBounds, isoR } from '../3dview/projection'
	import type { Obj, Clip } from '../3dview/types'
	// Pure geometry (Pt/Ent/View + helpers) lives in ./geometry; import those types directly from there.
	// (svelte-check can't resolve type re-exports from an instance <script>, so we don't re-export them.)

	// R6: the callback bundle is split in two. `on` (VpOn) is now VIEW events only — things that happen to
	// the CAMERA/UI, not the document — so it stays useful even for a read-only/preview Viewport with no
	// `editor`. `editor` (./editor.ts) carries everything that MUTATES the document: entity ops (`ents`),
	// the undo-history bracket (`edit`, commit 1's EditScope), and section-marker workspace selection
	// (`sections`) — defaulting to `noopEditor` so every call site can read `editor.ents.add(e)` etc.
	// directly, no `?.`. Drafting/interaction flags stay grouped into one `env` object. `frame` is only
	// used by PaperPage; the Viewport ignores it.
	export type Env = { acad?: boolean; navContent?: boolean; grid?: boolean; lwt?: boolean; osnap?: boolean; snap?: boolean; ortho?: boolean; cen?: boolean; guideVert?: boolean; canvasZoom?: number }
	export type VpOn = {
		activate?: () => void; deactivate?: () => void; view?: (v: View) => void; orbit?: (yaw: number, pitch: number) => void;
		scale?: (s: string) => void; status?: (text: string) => void; coords?: (x: number, y: number) => void; tool?: (name: string) => void;
	}
	let { label = 'Viewport', scale = '1:1', kind = 'plan', active = false, modelSpace = false, focused = true, tool = 'Select', boxW, boxH, border = 'dashed', env = {}, on = {}, editor = noopEditor, frameId = undefined, modelId = undefined,
		entities = [], view = { zoom: 1, x: 0, y: 0 }, clip = null, yaw = DEFAULT_YAW, pitch = DEFAULT_PITCH }:
		{ label?: string; scale?: string; kind?: 'plan' | 'iso' | ElevDir; active?: boolean;
			/** B31: this viewport IS a model-layout pane (not a frame on paper) — dark AutoCAD-style model
			 *  space, and it pans/zooms its own view regardless of "Pan content". */
			modelSpace?: boolean; tool?: string; boxW?: number; boxH?: number; border?: 'dashed' | 'solid' | 'none'; env?: Env; on?: VpOn; editor?: Editor; frameId?: string; modelId?: number;
			focused?: boolean; entities?: Ent[]; view?: View; clip?: Clip | null; yaw?: number; pitch?: number } = $props()
	// R3 commits 2a+2b (review.md §R3): every kind of selection now comes from `editor.sel` (the
	// per-VIEWPORT Selection, ui/selection.ts) instead of a `sel`/`selSection` PROP (was tab-shared docSel /
	// session.selSection) or the global `modelSel` store (3dview/models.svelte, was shared across every
	// viewport showing a model). Kept as LOCAL `sel`/`modelSel`/`selSection` names (derived, read-only) so
	// every existing READ below is unchanged — only the WRITE call sites move to the helpers below.
	// `modelSel` carries obj + guide + node ids together (a node's `.id` is its PARENT object's id) so
	// `mSelObj`/grips/Model3d highlighting keep working exactly as before when a NODE (not the plain object)
	// is selected — matches the pre-R3 behaviour where `modelSel` always held the parent regardless of
	// whether a specific node was also picked.
	const selection = $derived(editor.sel.get())
	const sel = $derived(idsOfKind(selection, 'ent'))
	const modelSel = $derived([...idsOfKind(selection, 'obj'), ...idsOfKind(selection, 'guide'), ...idsOfKind(selection, 'node')])
	const selSection = $derived(singleOfKind(selection, 'section')?.id ?? null)
	const selectEnts = (ids: string[]) => editor.sel.only(ids.map((id): SelItem => ({ kind: 'ent', id })))
	const toggleEnts = (ids: string[]) => editor.sel.toggle(ids.map((id): SelItem => ({ kind: 'ent', id })))
	const selectObj = (id: string) => editor.sel.only([{ kind: 'obj', id }])
	const selectGuide = (id: string) => editor.sel.only([{ kind: 'guide', id }])
	const selectSection = (id: string) => editor.sel.only([{ kind: 'section', id }])
	const selectNode = (objId: string, nodeId: string) => editor.sel.only([{ kind: 'node', id: objId, sub: nodeId }])
	const clearSel = () => editor.sel.clear()
	// A fresh press "forgets" any specific NODE pick, falling back to the plain object it belongs to (still
	// selected — a node is only ever reachable through its already-selected parent) — matches the pre-R3
	// `nodeSel = null` reset, which left the independent `modelSel` (parent) untouched.
	const demoteNodeToObj = () => { const n = singleOfKind(selection, 'node'); if (n) selectObj(n.id) }
	// VIEW callbacks are called directly as on.x?.(…); EDITOR ops as editor.ents.x(…) / editor.edit.x(…) /
	// editor.sections.x(…) — no `?.` needed there since `editor` defaults to noopEditor. No aliases either
	// way (a $derived rename adds nothing for a function that's only invoked). env flags stay derived
	// because they're read as values.
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

	const tagIcon: Record<string, string> = { plan: 'mapPin', iso: 'box', front: 'server', rear: 'server', left: 'server', right: 'server' }
	// Elevation projection: which side view (front/rear/left/right) and its footprint axis + sign.
	const ELEV = new Set<string>(['front', 'rear', 'left', 'right'])
	const isElev = $derived(ELEV.has(kind))
	const elevDir = $derived((isElev ? kind : 'front') as ElevDir)
	const DRAW = new Set(['Line', 'Rectangle', 'Ellipse', 'Dimension', 'Text', 'Wall', 'Furniture', 'Trunk', 'Pipe', 'Section', 'Opening', 'Guide'])
	const SECTION_DIRS: ElevDir[] = ['front', 'rear', 'left', 'right']   // the 4 cut directions a section box can spawn
	// Guide lines belong to a drawable VIEW space (plan or an elevation); iso has none.
	const viewSpace = $derived(kind === 'plan' ? 'plan' : isElev ? elevDir : null)
	const mdl = $derived(modelById(modelId) ?? models[0])   // the model this viewport renders/edits (§5 registry)
	// R5: ONE layer list per model files both its objects and its entities — hide / lock / colour / draw
	// order all resolve against the model this viewport shows (was a global page-layer store, B16).
	const mls = $derived(mdl?.layers ?? [])
	const isLayerHidden = (id?: string) => lsHidden(mls, id)
	const isLayerLocked = (id?: string) => lsLocked(mls, id)
	const layerColor = (id?: string) => lsColor(mls, id)
	const layerOrder = (id?: string) => lsOrder(mls, id)
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
	// The entity / model-object builders live in ui/place.ts (R1 step 6); the Viewport keeps the side
	// effects (editor.ents.add / addModelObj / meAddSection) and the tool dispatch.
	function place(a: Pt, b: Pt) {
		const ent = buildEnt(ctx, tool, a, b, { centerDraw, uid })   // Line / Rectangle / Ellipse / Dimension
		if (ent) { editor.ents.add(ent); return }
		const ps = PRISM_TOOL[tool]   // Furniture / Opening → a MODEL prism footprint (plan only)
		if (ps && isPlan) { addModelObj(prismObj(ctx, a, b, ps.layer, ps.h, () => mUid(ps.tag))); return }
		if (tool === 'Section' && isPlan && mdl) {   // §4 / B5 — clip box on the plan → a section marker in the MODEL (one undo step), selected
			const sec = sectionObj(ctx, a, b, mUid('sec'), sectionName(mdl.sections ?? [])); if (!sec) return
			meAddSection(mdl, editor.edit, sec)
			selectSection(sec.id)   // grips + toolbar; drop its elevations via the arrows
		}
	}
	// The Line tool draws a POLYLINE in AutoCAD mode: keep clicking to add segments, Enter /
	// double-click / right-click to finish (Esc cancels). (EOS press-drag = a single segment.)
	function finishPolyline() {
		if (tool === 'Line') { const pl = polylineEnt(ctx, draft, uid); if (pl) editor.ents.add(pl) }
		else if (MODEL_GRAPH.has(tool) && (isPlan || isElev)) placeGraph(trimTail(draft))   // Wall / Trunk / Pipe (plan or elevation — vertical runs)
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
				const mid = hitModelIso(ctx, p, mlayers); if (mid) selectObj(mid); else clearSel()
				return
			}
			// B25: a Shift-press toggles the entity that was PRESSED (recorded in onDown), not whatever sits under
			// the release point — so a Shift-press that drifts off the shape before release still toggles it.
			const g = expandGroup(shiftPressId ? [shiftPressId] : hit(p))   // the clicked entity + any group it belongs to
			shiftPressId = null
			if (e.shiftKey || e.ctrlKey || e.metaKey) {   // additive: toggle the whole group (B25 "whole group" semantics)
				if (g.length) toggleEnts(g)
			} else {
				// entity click wins; else a model object; else a section marker; else a guide line; else clear.
				// R3 2b: every kind now lives in the ONE Selection, so a single `select*`/`clearSel` call per
				// branch is enough — it already replaces (and so implicitly clears) whatever the other kinds held.
				if (g.length) selectEnts(g)
				else { const mid = hitModel(p); if (mid) selectObj(mid)
					else { const sid = hitSection(p); if (sid) selectSection(sid)   // click a marker border → SELECT it (grips + toolbar); open via the link button
						else { const gid = hitGuide(p); if (gid) selectGuide(gid)   // guide selection shares the model-object kind (it lives in the model now)
							else clearSel() } } }
			}
			return
		}
		if (tool === 'Text') { const p = drawPoint(e.clientX, e.clientY); if (p) editor.ents.add({ id: uid(), type: 'text', a: p, text: 'TEXT', plane: drawPlane(ctx) }); snapMark = null; return }
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
		if (active && tool === 'Select' && !drag && !reg.active && !draft.length && !marquee) {
			const lp = toLocalXY(e.clientX, e.clientY)
			hoverBody = !!lp && (hit(lp).length > 0 || !!hitModel(lp) || !!hitGuide(lp))   // a guide is draggable → show 'move'
		} else hoverBody = false
	}
	// Re-apply the constraint the instant Shift changes (don't wait for a pointer move) — for
	// both an in-progress draw and an in-progress move/grip drag.
	function reconstrain(shift: boolean) {
		if (drag && lastDragRaw) {
			if (drag.kind === 'grip') editor.ents.update(applyDrag(lastDragRaw, shift))
			else { let dx = lastDragRaw[0] - drag.start[0], dy = lastDragRaw[1] - drag.start[1]; if (shift !== ortho) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0 } for (const b of drag.bases) editor.ents.update(moveEnt(b, dx, dy)) }
		} else if (active && draft.length && lastRaw) cur = constrainPt(tool, draft.at(-1)!, lastRaw, shift)   // Shift: square / 15° (ui/annotations.ts)
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
	let editText = $state<{ id: string; x: number; y: number; fontPx: number; value: string; align: 'left' | 'center' | 'right'; valign: 'top' | 'middle' | 'bottom'; rot: number; cx: number; cy: number } | null>(null)   // x/y = anchor, cx/cy = rotation centre, all in .vp-local px
	let textInput: HTMLTextAreaElement | undefined = $state()
	function startTextEdit(ent: Ent) {
		if (!vpW || !vpH) return
		// Position + font in .vp-LOCAL px (pre canvas-CSS-transform), so the transform scales the
		// editor exactly like the SVG text — it stays glued to the object at any zoom/pan (screen-px
		// math double-applied the canvas zoom, so the box floated off and ballooned when zoomed in).
		const localPx = (q: Pt): Pt => { const vbx = view.x + view.zoom * (CX + dscale * (q[0] - CX)), vby = view.y + view.zoom * (CY + dscale * (q[1] - CY)); return [(vbx - minX) / vbW * vpW, (vby - minY) / vbH * vpH] }
		const [x, y] = localPx(ent.a!)
		const [cx, cy] = localPx(rotCenter(ctx, ent))   // B19: the SVG text rotates about its bbox centre — so does the editor
		const fontPx = (ent.fontPt ?? STYLE_DEFAULTS.fontPt) * PT_MM * view.zoom * (vpW / vbW)   // annotative: paperMm·dscale cancels (B3)
		editText = { id: ent.id, x, y, fontPx, value: ent.text ?? '', align: ent.align ?? 'left', valign: ent.valign ?? 'top', rot: ent.rot ?? 0, cx, cy }
		tick().then(() => { textInput?.focus(); textInput?.select() })
	}
	function commitText() {
		if (!editText) return
		const ent = entities.find(x => x.id === editText!.id)
		if (ent) editor.ents.update({ ...ent, text: editText.value })
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
		if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); selectEnts(entities.map(x => x.id)); return }   // select all
		if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D') && sel.length) {   // duplicate (offset +8,+8)
			e.preventDefault()
			const off = 5 * paperMm; const copies = sel.map(id => entities.find(x => x.id === id)).filter(Boolean).map(en => ({ ...translate(en!, off, off), id: uid() }))   // B19: 5 PAPER mm, visible at any scale
			copies.forEach(c => editor.ents.add(c)); selectEnts(copies.map(c => c.id))
			return
		}
		if (e.ctrlKey || e.metaKey) {   // clipboard + grouping + draw order
			// draw order: Ctrl+] forward · Ctrl+[ backward · +Shift = to front / back
			if ((e.key === ']' || e.key === '}') && sel.length) { e.preventDefault(); editor.ents.reorder(sel, e.shiftKey ? 'front' : 'forward'); return }
			if ((e.key === '[' || e.key === '{') && sel.length) { e.preventDefault(); editor.ents.reorder(sel, e.shiftKey ? 'back' : 'backward'); return }
			const k = e.key.toLowerCase()
			if (k === 'c' && sel.length) { e.preventDefault(); editor.ents.copy(sel); return }
			if (k === 'x' && sel.length) { e.preventDefault(); editor.ents.cut(sel); return }
			if (k === 'v') { e.preventDefault(); editor.ents.paste(); return }
			if (k === 'g' && !e.shiftKey && sel.length) { e.preventDefault(); editor.ents.group(sel); return }
			if (k === 'g' && e.shiftKey && sel.length) { e.preventDefault(); editor.ents.ungroup(sel); return }
		}
		// R3 2b: every kind's delete now dispatches through ONE call (`editor.sel.delete()`, +page.svelte's
		// `deleteSelAt`) — every kind is mutually exclusive in the Selection (at most one of `sel`/`modelSel`/
		// `selSection` is ever non-empty), so this collapses what were 3-4 separate onKey branches with no
		// change in behaviour or the labels each delete records ('Delete' / 'Delete node' / 'Delete section').
		if ((e.key === 'Delete' || e.key === 'Backspace') && (sel.length || modelSel.length || selSection) && !draft.length) { e.preventDefault(); editor.sel.delete(); return }
		if (sel.length && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
			e.preventDefault()
			const s = e.shiftKey ? 10 : 1
			const dx = e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0
			const dy = e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0
			editor.edit.begin()   // coalesce a nudge burst into one history step (closes 600ms after the last)
			for (const id of sel) { const en = entities.find(x => x.id === id); if (en) editor.ents.update(moveEnt(en, dx, dy)) }
			editor.edit.end(600)
			return
		}
		if (e.key !== 'Escape') return
		// Esc ladder: exit an image-edit mode → cancel a draft → switch a drawing tool back to Select → …
		if (imgEdit.mode) { clearImgMode(); scalePts = []; scaleReal = null }
		else if (draft.length) { draft = []; cur = null; snapMark = null }
		else if (tool !== 'Select') on.tool?.('Select')
		else if (selSection || sel.length || modelSel.length) clearSel()   // R3 2b: every kind clears in one step (was 2 separate rungs)
		else on.deactivate?.()
	}

	// hit-test (topmost first). segDist/textBox live in ./geometry; hit predicates in ./hit.
	// Flat (z=0, no height) objects that project to an edge-on ground line in elevation.
	// Object SPACE (v1 — per-view annotations, like the Sheets tool): 'plan'/undefined = model/plan
	// space (projected into every elevation, layer-gated); an ElevDir = drawn natively in that
	// elevation only (a wall/rack label, a leader, a dimension), rendered as-is there and hidden in
	// other views. The full 3D-position/construction-plane model (project onto x/y/z planes, oriented
	// per view) is a later upgrade — see todo §2.
	// The hit logic lives in ui/hit.ts (R1 step 3); those functions take a ViewCtx so they read no
	// component state. Viewport builds `ctx` once (a $derived from the view props) and the thin wrappers
	// below inject it, so existing call sites (bbox(e), hitEnt(e,p,thr), pickable(e), …) stay unchanged.
	const ctx = $derived<ViewCtx>({ dir: kind, isPlan: kind === 'plan', isElev, isIso: kind === 'iso', elevDir, cx: CX, cy: CY, ground: GROUND, frameId, paperMm: 1 / (dscale || 1), mdl, yaw, pitch })   // paperMm = 1/dscale (declared later; inlined to avoid TDZ)
	const layerPreds = { hidden: isLayerHidden, locked: isLayerLocked }
	const inThisView = (e: Ent) => hInThisView(ctx, e)
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
	// PICK + MOVE for prisms in the PLAN *and* the four ELEVATION views. Selection is this viewport's own
	// `editor.sel` (R3 2a; local `modelSel` above is its obj+guide ids); moves mutate the `models` store
	// directly. Editing uses
	// the SAME projection Pages entities use — plan footprint, or elevation via `projU`/ELEV_BASIS +
	// GROUND — so a prism picks/moves exactly where <Model3d> draws it. (Iso editing + walls/conduits +
	// undo are the next slices — see model-plan.md P2.)
	const isPlan = $derived(kind === 'plan')
	const modelEditable = $derived(isPlan || isElev)   // iso (oblique) editing deferred to the 3D camera
	const modelLayerVisible = (o: Obj) => !isLayerHidden(o.layer)
	const modelLayerLocked = (o: Obj) => isLayerLocked(o.layer)   // locked → not pickable (B16)
	// Model-object hit-testing lives in ui/hit.ts (R1 step 3), taking ctx + the model-layer preds; the thin
	// wrappers below inject them (prismTilted/prismOutline/convexHull/inPoly/graphHit are now hit.ts-internal).
	const mlayers = { visible: modelLayerVisible, locked: modelLayerLocked }
	const graphNodeDraw = (n: GN) => hGraphNodeDraw(ctx, n)
	const rndSnap = (v: number) => rndTo(v, snap ? SNAP_STEP : 0)   // grid-round when SNAP is on
	// snapNode / graphNodeApply live in ui/snap.ts (R1 step 5). The wrappers inject ctx, the tolerances
	// (~10px snap radius, ~8px pull-apart radius around the drag origin) + the layer preds, and assign
	// `snapMark` from the returned mark.
	function graphNodeApply(n: GN, p: Pt, origin?: Pt) {
		snapMark = sGraphNodeApply(ctx, n, p, { snapNode: (q, ex, o) => sSnapNode(ctx, q, ex, tolMm(10), tolMm(8), mlayers, o), rnd: rndSnap }, origin)
	}
	// hitModel / hitModelIso live in ui/hit.ts (R1 step 3); the wrappers inject ctx + the model-layer preds.
	// hitModel's pick tolerance (tolMm(4), B9) is passed in. graphHit is now hit.ts-internal.
	const hitModel = (p: Pt) => hHitModel(ctx, p, tolMm(4), mlayers)
	// Section markers live in the MODEL (B5): this plan view shows its model's list; edits mutate it in place
	// (like guides) bracketed by beginedit/modeledit/endedit so they ride the model history.
	const sections = $derived(isPlan ? (mdl?.sections ?? []) : [])
	const setSectionClip = (id: string, clip: Clip) => { if (mdl) meSetSectionClip(mdl, id, clip) }   // inside a drag gesture (the caller records the step)
	function setSectionDir(id: string, dir: ElevDir) {
		if (mdl) meSetSectionDir(mdl, editor.edit, id, dir)
	}
	function deleteSection(id: string) {
		if (!mdl) return
		if (meDeleteSection(mdl, editor.edit, id) && selSection === id) clearSel()
	}
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
		if (!mdl) return
		const g = guideObj(ctx, p, shift, guideId()); if (!g) return   // null in iso (no drawing plane)
		meAddGuide(mdl, editor.edit, g)
	}
	// IMAGE calibration (Uploads-tool model). ORIGIN: store the clicked point as a normalized anchor.
	function setImageOrigin(id: string, p: Pt) {
		const img = entities.find((x) => x.id === id); if (!img) return
		const next = imageWithOrigin(img, p); if (next === img) return   // not an image
		editor.ents.update(next)
		clearImgMode()
	}
	// SCALE: after the 2-point line + a real-world distance, resize the image (a→b) by real/measured about
	// its origin (or centre), so that measurement is correct in model mm. Keeps the anchor point fixed.
	// Drag an endpoint of the measure line to adjust it (the geometry + measured distance are derived).
	function onScaleDragMove(ev: PointerEvent, i: number) {   // beginPointerDrag-managed; state = the endpoint index
		const p = toLocalXY(ev.clientX, ev.clientY); if (!p) return
		scalePts = scalePts.map((sp, j) => (j === i ? p : sp))
	}
	function applyScale() {
		const d = scaleGeom?.d ?? 0, real = parseFloat(scaleReal ?? '')
		const img = imgEdit.id ? entities.find((x) => x.id === imgEdit.id) : null
		scaleReal = null; scalePts = []; clearImgMode()
		if (!img) return
		const next = imageScaled(img, d, real); if (next !== img) editor.ents.update(next)   // unchanged when not an image / bad inputs
	}
	// hitGuide lives in ui/hit.ts (R1 step 3); the wrapper passes this view's guide list.
	const hitGuide = (p: Pt) => hHitGuide(viewGuides, p, tolMm(6))
	// DRAG a guide to reposition it — one history gesture (begin → move → 'Move guide' on release, on the
	// MODEL history). The guide is a live proxy in the model's `guides` array, so mutating `pos` is reactive.
	// beginPointerDrag-managed; state = the guide id.
	function onGuideDragMove(e: PointerEvent, id: string) {
		const p = toLocalXY(e.clientX, e.clientY); if (!p) return
		const g = mdl?.guides?.find((x) => x.id === id); if (!g) return
		g.pos = Math.round(g.orient === 'h' ? p[1] : p[0])
	}
	function onGuideDragUp(_e: PointerEvent, _id: string, moved: boolean) {
		if (moved) { suppressClick = true; editor.edit.mark('Move guide') }
		editor.edit.end()
	}
	// A body move drag. Absolute from the gesture's start (no drift). A prism moves its position; a
	// wall/conduit translates ALL its nodes (keeping the graph rigid). In elevation the horizontal drag
	// maps to the view's on-axis coord (× ELEV_BASIS sign) and the vertical drag changes z (clamped ≥0).
	// beginPointerDrag-managed; state = the object id + press point + the object's starting position/nodes.
	type MDrag = { id: string; start: Pt; o0?: { x: number; y: number; z: number }; n0?: GN[] }
	function onModelDragMove(e: PointerEvent, s: MDrag) {
		if (!mdl) return
		const p = toLocalXY(e.clientX, e.clientY); if (!p) return
		const o = mdl.objects.find(x => x.id === s.id); if (!o) return
		const dx = p[0] - s.start[0], dy = p[1] - s.start[1]
		const elev = isElev ? ELEV_BASIS[elevDir] : null
		if (o.type === 'prism' && s.o0) {
			if (elev) { if (elev.axis === 0) o.x = rndSnap(s.o0.x + elev.sign * dx); else o.y = rndSnap(s.o0.y + elev.sign * dx); o.z = Math.max(0, rndSnap(s.o0.z - dy)) }
			else { o.x = rndSnap(s.o0.x + dx); o.y = rndSnap(s.o0.y + dy) }
		} else if ((o.type === 'wall' || o.type === 'conduit') && s.n0) {
			for (const g of s.n0) {
				const n = (o.nodes as GN[]).find((x) => x.id === g.id); if (!n) continue
				if (elev) { if (elev.axis === 0) n.x = rndSnap(g.x + elev.sign * dx); else n.y = rndSnap(g.y + elev.sign * dx); n.z = Math.max(0, rndSnap(g.z - dy)) }
				else { n.x = rndSnap(g.x + dx); n.y = rndSnap(g.y + dy) }
			}
		}
		editor.edit.mark()   // fold this move into the open undo step
	}
	function onModelDragUp(_e: PointerEvent, _s: MDrag, moved: boolean) {
		if (moved) suppressClick = true
		editor.edit.end()   // close the model-move gesture's undo step
	}

	// ── model grips (P2b/P2e) — corner handles that resize a prism, or node handles that reshape a
	// wall/conduit graph (drag a corner → re-mitred join). Each grip carries its own apply, so a drag
	// just replays it. The single selected model object drives grip render + pick. ──
	const mSelObj = $derived.by(() => {
		if (!modelEditable || modelSel.length !== 1) return null
		return mdl?.objects.find((x) => x.id === modelSel[0]) ?? null
	})
	// A single wall/conduit NODE selected (by clicking its grip without dragging) — enables node-level
	// Delete (segments handled by degree). R3 2b: lives in the Selection now (kind 'node', `.id` = the
	// parent object's id, `.sub` = the node's own id) — `nodeSelValid` reshapes it back to the `{obj,node}`
	// pair every existing reader below expects. Only valid while its parent object is (still) selected.
	const nodeSelItem = $derived(singleOfKind(selection, 'node'))
	const nodeSelValid = $derived(nodeSelItem && mSelObj?.id === nodeSelItem.id && (mSelObj as { nodes?: GN[] }).nodes?.some((n) => n.id === nodeSelItem!.sub) ? { obj: nodeSelItem.id, node: nodeSelItem.sub! } : null)
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
		return meBranchNode(o, from, mUid)
	}
	// beginPointerDrag-managed; state = the grip, the drag origin (for node disconnect) and the Ctrl-branch undo.
	type MGripDrag = { grip: MGrip; origin: Pt; branch?: () => void }
	function onModelGripMove(e: PointerEvent, s: MGripDrag) {
		const p = toLocalXY(e.clientX, e.clientY); if (!p) return
		s.grip.apply(p, s.origin)
		editor.edit.mark()   // fold this reshape into the open undo step
	}
	function onModelGripUp(_e: PointerEvent, s: MGripDrag, moved: boolean) {
		if (moved) { suppressClick = true; editor.edit.mark() }
		else if (s.branch) s.branch()   // an Ctrl-branch press with no drag: drop the stray zero-length segment
		else if (s.grip.node && s.grip.obj && (s.grip.obj.type === 'wall' || s.grip.obj.type === 'conduit')) {
			// B29: swallow the click that follows this release — else onClick's Select cascade re-runs at the
			// same point, hits the object's BODY (hitModel), and calls selectObj(mid), REPLACING the 'node'
			// item just set here with a plain 'obj' one (the two were independent stores pre-R3, so this
			// didn't matter; now they share one exclusive Selection). Matches every other no-move-vs-moved
			// gesture here (onDragUp/onSecDragUp/onGuideDragUp/…) already swallowing the trailing click.
			suppressClick = true
			selectNode(s.grip.obj.id!, s.grip.node.id)   // no-move click on a node grip → select the node
		}
		snapMark = null; editor.edit.end()   // close the gesture's undo step
	}
	const onModelGripCancel = () => { snapMark = null; editor.edit.end() }

	// ── section marker MOVE — drag a marker's box border to reposition the cut; the linked elevation
	// re-clips live (Model3d reads the clip reactively). Absolute from the gesture start (no drift).
	// beginPointerDrag-managed; the gesture's undo step is opened at press and ALWAYS closed on release or
	// cancel (a no-move click must not leave it open). ──
	type SecDrag = { id: string; start: Pt; c0: Clip }
	function onSecDragMove(e: PointerEvent, s: SecDrag) {
		const p = toLocalXY(e.clientX, e.clientY); if (!p) return
		const dx = p[0] - s.start[0], dy = p[1] - s.start[1], c = s.c0
		setSectionClip(s.id, { ...c, x0: Math.round(c.x0 + dx), x1: Math.round(c.x1 + dx), y0: Math.round(c.y0 + dy), y1: Math.round(c.y1 + dy) })
	}
	function onSecDragUp(_e: PointerEvent, _s: SecDrag, moved: boolean) {
		if (moved) { suppressClick = true; editor.edit.mark('Move section') }   // one undo step for the drag
		editor.edit.end()
	}
	// ── section marker RESIZE — drag a corner grip of the SELECTED section (opposite corner fixed). ──
	type SecResize = { id: string; apply: (p: Pt) => Clip }
	function onSecResizeMove(e: PointerEvent, s: SecResize) {
		const p = toLocalXY(e.clientX, e.clientY); if (!p) return
		setSectionClip(s.id, s.apply(p))
	}
	function onSecResizeUp(_e: PointerEvent, _s: SecResize, moved: boolean) {
		if (moved) { suppressClick = true; editor.edit.mark('Resize section') }   // one undo step for the resize
		editor.edit.end()
	}
	const closeEdit = () => editor.edit.end()   // onCancel for the gestures that open an undo step at press
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
	function addModelObj(o: Obj) {
		if (!mdl) return
		const id = meAddModelObj(mdl, editor.edit, o)
		// R3 2a: selOnly's exclusivity means selecting the new object also drops any stray entity selection
		// (the old independent `modelSel`/docSel stores could each hold a selection at once; the new
		// Selection model enforces the same one-kind-at-a-time rule used everywhere else).
		if (id) selectObj(id)
	}
	// Node DELETE (degree-based join/prune, Dave's spec) now dispatches through `editor.sel.delete()` →
	// +page.svelte's `deleteSelAt`, which calls modelEdit.ts's `deleteGraphNode` directly — no local wrapper
	// needed here any more (this Viewport used to own it; R3 2b moved it alongside the obj/guide delete).
	// Insert a vertex into a wall/conduit at p by splitting the nearest segment (dbl-click). The new
	// node inherits the segment's z (keeps the run's height); the new segment inherits object defaults.
	function insertGraphNode(p: Pt) {
		if (!mdl) return
		const hitId = meInsertGraphNode(ctx, mdl, editor.edit, p, tolMm(6), mlayers, rndSnap, mUid)
		if (hitId) selectObj(hitId)
	}
	// Elevation depth-snap (a drawn point snaps its DEPTH onto the nearest wall/conduit segment) lives in
	// ui/snap.ts (R1 step 5); the wrapper injects ctx, the ~12px tolerance and the layer preds.
	const elevDepthSnap = (p: Pt) => sElevDepthSnap(ctx, p, tolMm(12), mlayers)
	// A clicked run (drawing pts) → a wall or conduit graph (place.graphObj). In an ELEVATION the depth
	// (off-axis coord) comes from the SELECTED plan guide, else the depth-snap, else the plan centre —
	// with a nudge to select a guide when there is none.
	function placeGraph(pts: Pt[]) {
		if (!mdl || pts.length < 2) return
		const ax = isElev ? ELEV_BASIS[elevDir].axis : 0
		const guide = isElev ? selectedPlanGuide(mdl.guides ?? [], modelSel, ax === 0 ? 'h' : 'v') : null
		if (isElev && !guide) toast('No depth guide — points snap onto nearby walls where possible, else the model centre. Tip: select a plan guide to fix the depth.', { duration: 5000 })
		const o = graphObj(ctx, tool, pts, { guide, depthSnap: (p) => elevDepthSnap(p)?.off ?? null, uid: mUid })   // layer via graphObj's resolveLayer default
		if (o) addModelObj(o)
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
		const hit = osnap && m ? sFindSnap(ctx, m, entities, clientX, clientY, { exclude, editingId: editText?.id, objs: mdl?.objects, ml: mlayers }) : null   // K5: model corners/nodes snap too
		snapMark = hit
		return hit ? hit.p : null
	}
	// The point a draw/place should use: object snap wins; else the shift/ortho-constrained, grid-snapped pointer.
	function drawPoint(clientX: number, clientY: number, base?: Pt, shift = false): Pt | null {
		const m = mapper(); if (!m) { snapMark = null; return null }
		const r = sDrawPoint(ctx, m, { osnap, snap, ortho, tool, ents: entities, editingId: editText?.id, objs: mdl?.objects, ml: mlayers }, clientX, clientY, base, shift)
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
	// Everything EntRender (ui/render/EntRender.svelte, R1 step 8) reads from this component's closures, built
	// ONCE so every entity gets the same reference (one derived, not one object per entity per paint).
	// B31: on dark model space the ByLayer ink is light and too-dark colours are lifted (ui/modelSpace.ts).
	const entStyle = $derived(modelSpace
		? { lwt, canvasZoom, paperMm, gripSize, ink: MODEL_SPACE_INK, sel: SEL, layerColor, adapt: onDark }
		: { lwt, canvasZoom, paperMm, gripSize, ink: INK, sel: SEL, layerColor })
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
	// `drag` stays a component-level variable (not just the gesture's state) because onMove's Shift/ORTHO
	// re-apply and the hover-cursor guard read it between pointer events.
	type EntDrag = { id: string; base: Ent; bases: Ent[]; kind: 'grip' | 'move'; gi: number; start: Pt; dup?: boolean; duplicated?: boolean }
	let drag: EntDrag | null = null
	let suppressClick = false  // swallow the click that ends a real drag (avoids re-select)
	let shiftPressId: string | null = null   // the entity a Shift-press landed on (B25: onClick toggles THIS id, not the release-point hit)
	// The drag registry (ui/gestures.ts, R1 step 7) tracks pressed pointers so a second finger (2-finger
	// pan/zoom) aborts a drag — otherwise finger 1 landing on a shape starts a move that the pan then drags
	// around — and holds every live beginPointerDrag so one cancelAll() aborts them all (each gesture's
	// onCancel restores its own state).
	const reg = new DragRegistry()
	function cancelPointerDrag() {
		reg.cancelAll()
		if (draft.length) { draft = []; cur = null; snapMark = null }   // abort an in-progress draw (press-drag or two-click)
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
		shiftPressId = null
		demoteNodeToObj()       // a fresh press resets the node selection (re-set on a no-move node-grip click)
		if (reg.noteDown(e)) { cancelPointerDrag(); return }   // 2nd finger → hand off to pan/zoom
		// While calibrating scale, a press near a placed endpoint drags it (adjust the measure line).
		if (imgEdit.mode === 'scale' && scalePts.length === 2) {
			for (let i = 0; i < 2; i++) { const sp = localToClient(scalePts[i][0], scalePts[i][1]); if (sp && Math.hypot(sp.x - e.clientX, sp.y - e.clientY) < 14) { beginPointerDrag<number>(e, i, { onMove: onScaleDragMove }, reg); return } }
		}
		// In scale/origin PICK modes, don't start a select/move-drag — let onClick place the point.
		if (imgEdit.mode === 'scale' || imgEdit.mode === 'origin') return
		// EOS mode: shapes are drawn with a single press-drag-release (not two clicks).
		if (tool !== 'Select') {
			if (acad || tool === 'Text' || tool === 'Guide') return   // AutoCAD two-click / text + guide single-click via onClick
			const dp = drawPoint(e.clientX, e.clientY); if (!dp) return
			draft = [dp]; cur = dp
			beginPointerDrag(e, null, { onMove: onDrawMove, onUp: onDrawUp, onCancel: () => { draft = []; cur = null; snapMark = null } }, reg)
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
			editor.edit.begin()   // one undo step for the whole reshape gesture
			// Ctrl/⌘-press on a wall/conduit node BRANCHES: sprout a new segment + drag the new node out (a
			// junction/tee). Plain press moves the node. origin = the grip's start (disconnect from a partner).
			let grip = g, origin: Pt = [g.x, g.y], branch: (() => void) | undefined
			if ((e.ctrlKey || e.metaKey) && g.node && g.obj && (g.obj.type === 'wall' || g.obj.type === 'conduit')) {
				const obj = g.obj, nn = branchNode(obj, g.node)
				const d = graphNodeDraw(nn); origin = [d[0], d[1]]
				grip = { x: d[0], y: d[1], node: nn, obj, apply: (p: Pt, o?: Pt) => graphNodeApply(nn, p, o) }
				branch = () => { obj.nodes = (obj.nodes as GN[]).filter((x) => x.id !== nn.id); obj.segments = (obj.segments as { id: string; a: string; b: string }[]).filter((s) => s.b !== nn.id && s.a !== nn.id) }
			}
			beginPointerDrag<MGripDrag>(e, { grip, origin, branch }, { onMove: onModelGripMove, onUp: onModelGripUp, onCancel: onModelGripCancel }, reg)
			return
		}
		// A corner grip of the SELECTED section resizes it (wins over everything, like a model grip).
		if (pk?.kind === 'sgrip') {
			editor.edit.begin()   // one undo step for the whole resize gesture (committed on release)
			beginPointerDrag<SecResize>(e, { ...pk.sg }, { onMove: onSecResizeMove, onUp: onSecResizeUp, onCancel: closeEdit }, reg)
			return
		}
		// an alignment guide (below entities/grips, above sections/model/marquee — a thin overlay grabbed in open space).
		if (pk?.kind === 'guide') {
			selectGuide(pk.id)   // exclusive with entities (selOnly replaces the whole Selection)
			editor.edit.begin()
			beginPointerDrag<string>(e, pk.id, { onMove: onGuideDragMove, onUp: onGuideDragUp, onCancel: closeEdit }, reg)
			return
		}
		// a section marker border → SELECT it (grips + toolbar) + start a move drag (a no-move press just selects).
		if (pk?.kind === 'section') {
			const sm = sections.find(s => s.id === pk.id)
			if (sm) {
				if (selSection !== pk.id) selectSection(pk.id)
				editor.edit.begin()   // one undo step for the whole move gesture (committed on release)
				beginPointerDrag<SecDrag>(e, { id: pk.id, start: p, c0: { ...sm.clip } }, { onMove: onSecDragMove, onUp: onSecDragUp, onCancel: closeEdit }, reg)
			}
			return
		}
		// a MODEL object (P2a: prisms in plan) → select + move (exclusive with entity selection).
		if (pk?.kind === 'obj') {
			const mo = mdl?.objects.find(o => o.id === pk.id)
			if (mo) {
				selectObj(mo.id!)
				editor.edit.begin()   // one undo step for the whole model-move gesture
				beginPointerDrag<MDrag>(e, { id: mo.id!, start: p,
					o0: mo.type === 'prism' ? { x: mo.x, y: mo.y, z: mo.z } : undefined,
					n0: (mo.type === 'wall' || mo.type === 'conduit') ? (mo.nodes as GN[]).map((n) => ({ id: n.id, x: n.x, y: n.y, z: n.z })) : undefined,
				}, { onMove: onModelDragMove, onUp: onModelDragUp, onCancel: closeEdit }, reg)
			}
			return
		}
		// empty space → drag a Kestrel-style selection box (window / crossing); Shift/Ctrl = additive.
		if (!pk) {
			marquee = { a: p, b: p, add: e.shiftKey || e.ctrlKey || e.metaKey }
			beginPointerDrag(e, null, { onMove: onMarqueeMove, onUp: onMarqueeUp, onCancel: () => { marquee = null } }, reg)
			return
		}
		// pk is an entity grip or body — start the entity drag.
		const hitInfo = { kind: (pk.kind === 'grip' ? 'grip' : 'move') as 'grip' | 'move', id: pk.id, gi: pk.kind === 'grip' ? pk.gi : -1 }
		const base = entities.find(x => x.id === hitInfo.id); if (!base) return
		// R3 2a: no explicit "clear any model-object selection" step needed here any more — selOnly's
		// exclusivity means an obj/guide selection can never coexist with an entity one in the first place.
		// Shift-press on a body is selection-only (toggles on release) — must NOT start a move drag.
		if (e.shiftKey && hitInfo.kind === 'move') { shiftPressId = hitInfo.id; reg.forget(e); return }
		if (!(e.ctrlKey || e.metaKey) && !selSet.has(hitInfo.id)) selectEnts(expandGroup([hitInfo.id]))   // plain press on an unselected entity → select it (+ its group)
		// a body move drags the whole selection when the grabbed entity is part of it, else just it (+ its group)
		const moveIds = hitInfo.kind === 'move' ? (selSet.has(hitInfo.id) ? sel : expandGroup([hitInfo.id])) : [hitInfo.id]
		const bases = moveIds.map(id => entities.find(x => x.id === id)).filter(Boolean) as Ent[]
		// Ctrl/⌘-drag DUPLICATES the selection (copies created on the first move); a Ctrl-CLICK (no
		// move) instead toggles selection via onClick.
		drag = { id: hitInfo.id, base, bases, kind: hitInfo.kind, gi: hitInfo.gi, start: p, dup: (e.ctrlKey || e.metaKey) && hitInfo.kind === 'move', duplicated: false }
		editor.edit.begin()   // one history step for the whole drag
		beginPointerDrag<EntDrag>(e, drag, { onMove: onDragMove, onUp: onDragUp, onCancel: onDragCancel }, reg)
	}
	let lastDragRaw: Pt | null = null   // last UNconstrained pointer during a move/grip drag
	// Move an entity by (dx,dy) — place.moveEnt (elevation: horizontal drag → the view's footprint axis).
	const moveEnt = (en: Ent, dx: number, dy: number): Ent => pMoveEnt(ctx, en, dx, dy)
	// snapDelta lives in ui/snap.ts (R1 step 5); the wrapper passes the live grid step (0 when SNAP is off).
	const snapDelta = (dx: number, dy: number, base: Ent): [number, number] => sSnapDelta(dx, dy, base, snap ? SNAP_STEP : 0)
	function applyDrag(p: Pt, shift: boolean): Ent {
		if (drag!.kind === 'grip') { const cp = constrainGrip(ctx, drag!.base, drag!.gi, p, shift, gripOpts()); return gripsFor(drag!.base)[drag!.gi].apply(snap ? snapToGrid(cp) : cp) }
		let dx = p[0] - drag!.start[0], dy = p[1] - drag!.start[1]
		if (shift !== ortho) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0 }   // ortho / axis-lock
		const [sdx, sdy] = snapDelta(dx, dy, drag!.base)   // grid snap (SNAP toggle)
		return moveEnt(drag!.base, sdx, sdy)
	}
	function onDragMove(e: PointerEvent) {
		if (!drag) return
		const p = toLocalXY(e.clientX, e.clientY); if (!p) return
		lastDragRaw = p
		if (drag.kind === 'grip') {
			const s = osnap ? findSnap(e.clientX, e.clientY, drag.id) : null
			editor.ents.update(s ? gripsFor(drag.base)[drag.gi].apply(s) : applyDrag(p, e.shiftKey))
		} else {
			// Ctrl/⌘-drag: on the first real move, drop copies at the originals and drag the copies.
			if (drag.dup && !drag.duplicated) {
				const copies = drag.bases.map(b => ({ ...b, id: uid() }))
				copies.forEach(c => editor.ents.add(c)); selectEnts(copies.map(c => c.id))
				drag.bases = copies; drag.duplicated = true
			}
			let dx = p[0] - drag.start[0], dy = p[1] - drag.start[1]
			if (e.shiftKey !== ortho) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0 }   // ortho / axis-lock (Shift toggles)
			const [gdx, gdy] = snapDelta(dx, dy, drag.bases[0])   // grid-snap the whole group by its first member (stays rigid)
			for (const b of drag.bases) editor.ents.update(moveEnt(b, gdx, gdy))   // move the whole group (or the copies)
		}
	}
	function onDragUp(_e: PointerEvent, _s: EntDrag, moved: boolean) {
		if (moved) suppressClick = true
		drag = null; snapMark = null; editor.edit.end()   // close the drag's history step
	}
	function onDragCancel(s: EntDrag, moved: boolean) {   // 2nd finger → revert any partial move/resize
		if (moved) for (const b of s.bases) editor.ents.update(b)
		drag = null; snapMark = null; editor.edit.end()
	}

	// ── press-drag draw (EOS mode): press = first point, drag (Shift-constrained) = preview,
	// release = second point. beginPointerDrag-managed; the draft itself is the state (component $state). ──
	function onDrawMove(e: PointerEvent) {
		if (!draft.length) return
		const sp = drawPoint(e.clientX, e.clientY, draft[0], e.shiftKey); if (!sp) return
		lastRaw = toLocalXY(e.clientX, e.clientY)
		cur = sp
	}
	function onDrawUp(e: PointerEvent) {
		const a = draft[0]; draft = []; cur = null
		const b = drawPoint(e.clientX, e.clientY, a, e.shiftKey); snapMark = null
		if (!a || !b) return
		if (dist(a, b) < 2) return   // no drag → not a shape (ignore)
		place(a, b)
		suppressClick = true   // swallow the click that follows the release
	}

	// ── selection marquee (Kestrel/AutoCAD): drag L→R = window (enclose fully),
	// R→L = crossing (touch). bbox tests are enough for the mock. ──
	let marquee = $state<{ a: Pt; b: Pt; add?: boolean } | null>(null)   // rendered → $state; beginPointerDrag-managed
	// bbox now lives in ui/hit.ts (R1 step 3); the `bbox(e)` wrapper above injects ctx.
	function onMarqueeMove(e: PointerEvent) {
		if (!marquee) return
		const p = toLocalXY(e.clientX, e.clientY); if (!p) return
		marquee = { a: marquee.a, b: p, add: marquee.add }
	}
	function onMarqueeUp() {
		const m = marquee; marquee = null
		if (!m) return
		const x0 = Math.min(m.a[0], m.b[0]), y0 = Math.min(m.a[1], m.b[1])
		const x1 = Math.max(m.a[0], m.b[0]), y1 = Math.max(m.a[1], m.b[1])
		if (x1 - x0 < 2 && y1 - y0 < 2) return   // tiny → treat as a click (let onClick clear)
		const ids = hMarqueeSelect(ctx, entities, m.a, m.b, pickable)   // window (L→R) vs crossing (R→L), layer-gated
		const g = expandGroup(ids)   // include whole groups the marquee touched
		selectEnts(m.add ? [...new Set([...sel, ...g])] : g)   // Shift/Ctrl marquee UNIONS with the current selection (not a toggle)
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
<div class="vp print:!border-transparent" class:active class:model-space={modelSpace} bind:clientWidth={vpW} bind:clientHeight={vpH} role="button" tabindex="0" style:cursor={cursorStyle}
	style:border-style={active ? 'solid' : border === 'none' ? 'dotted' : border}
	style:border-color={border === 'none' && !active ? '#94a3b866' : undefined}
	use:panzoom={{ enabled: () => active && (navContent || modelSpace), wheelZoom: () => acad, onpan: onPan, onzoom: onZoom }}
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
			{#if mdl}<Model3d model={mdl} adapt={modelSpace ? onDark : undefined} dir={kind} cx={CX} cy={CY} ground={GROUND} selIds={modelSel} canvasZoom={canvasZoom} clip={clip} yaw={yaw} pitch={pitch} />{/if}
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
							<polygon class="section-arrow" class:inactive={d !== s.dir} class:pick points={sectionArrowFor(s.clip, d, tolMm(11))} stroke-width={1.4 / (canvasZoom || 1)}
								onpointerdown={(e) => { if (!pick) return; e.stopPropagation(); editor.sections.dropDir(s.id, d) }} />
						{/if}
					{/each}
					{@const pad = 1.5 * paperMm}
					<text class="section-label" x={bx + pad} y={by - pad} font-size={3 * paperMm}>{s.name ?? 'Section'}</text>
				{/each}
				<!-- resize grips on the selected section's corners -->
				{#if active && selSectionObj}
					{#each sectionCorners(selSectionObj.clip) as c (c.join(','))}
						<Handle cx={c[0]} cy={c[1]} size={gripSize} cursor="crosshair" strokeWidth={1.2 / (canvasZoom || 1)} />
					{/each}
				{/if}
			{/if}
			<!-- drawn entities (objects on a hidden layer are skipped; the edited text is hidden too) -->
			{#each paintEnts as e (e.id)}{#if e.id !== editText?.id && !isLayerHidden(e.layer) && inThisView(e)}<EntRender {e} {ctx} selected={selSet.has(e.id)} style={entStyle} {isoGround} imgCrop={imgEdit.mode === 'crop' ? imgEdit.id : null} {clipNs} />{/if}{/each}
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
					{#if selSet.has(e.id) && inThisView(e) && !isLayerHidden(e.layer) && !isLayerLocked(e.layer) && !groundInIso(ctx, e)}
						{#each gripsFor(e) as g}
							{#if g.rotate}
								{@const bc = rotCenter(ctx, e)}
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

	{#if !modelSpace}<div class="vp-tag"><Icon name={tagIcon[kind]} size={10} /> {label}{#if scale}<span class="vp-scale">{scale}</span>{/if}</div>{/if}   <!-- B31: model space names itself in the pane's bar -->
	<!-- Selected section's floating toolbar: open its elevation (link), re-aim the cut (direction), delete. -->
	{#if secToolbar}
		<div class="section-toolbar" style="left:{secToolbar.x}px; top:{Math.max(2, secToolbar.y - 30)}px"
			onpointerdown={(e) => e.stopPropagation()} onclick={(e) => e.stopPropagation()}>
			<button class="st-btn" title="Drop this direction as a viewport on the sheet" onclick={() => editor.sections.dropDir(secToolbar.id, secToolbar.dir)}><Icon name="panels" size={13} /></button>
			<select class="st-dir" title="Primary sight direction (arrow on the plan)" value={secToolbar.dir} onchange={(e) => setSectionDir(secToolbar.id, (e.currentTarget as HTMLSelectElement).value as ElevDir)}>
				<option value="front">Front</option><option value="rear">Rear</option><option value="left">Left</option><option value="right">Right</option>
			</select>
			<button class="st-btn st-del" title="Delete this section" onclick={() => deleteSection(secToolbar.id)}><Icon name="trash" size={13} /></button>
		</div>
	{/if}
	<!-- the tool prompt + inline-edit help now render at the PANE bottom-centre (see +page), so they
	     stay put and readable when zoomed in -->
	{#if editText}
		{@const lines = (editText.value || ' ').split('\n')}
		{@const cols = Math.max(...lines.map(l => l.length), 3)}
		{@const w = cols * editText.fontPx * 0.62 + 14}
		{@const lh = editText.fontPx * 1.2}
		{@const left = editText.x - (editText.align === 'center' ? w / 2 : editText.align === 'right' ? w : 0)}
		{@const top = editText.y - editText.fontPx * 0.8 - (editText.valign === 'middle' ? ((lines.length - 1) * lh) / 2 : editText.valign === 'bottom' ? (lines.length - 1) * lh : 0)}
		<!-- Opaque, auto-sizing editor placed over the (hidden) text (in .vp-local px so it tracks the
		     text at any zoom). Enter = newline (keydown is stopped so the viewport's own Enter handler
		     can't preempt it); Ctrl/⌘-Enter or blur commits; Esc cancels. -->
		<textarea class="text-edit" bind:this={textInput} bind:value={editText.value} spellcheck="false" wrap="off"
			style="left:{left}px; top:{top}px; font-size:{editText.fontPx}px; line-height:{lh}px; width:{w}px; height:{lines.length * lh + 6}px; text-align:{editText.align}; transform-origin:{editText.cx - left}px {editText.cy - top}px; transform:rotate({editText.rot}deg)"
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
	/* B31: model space — AutoCAD-style dark background, edge to edge, no frame border/glow. `--vp-paper`
	   is the colour an opening's hole / an iso face is filled with to mask what's behind (Model3d). */
	.vp.model-space { --vp-paper:#212830; background:var(--vp-paper); border-width:0; box-shadow:none; }
	.vp.model-space .vp-svg.model { background:transparent; }
	/* Lineweights stay constant as the viewport zooms (like Kestrel / real CAD):
	   the view <g> scales the geometry, non-scaling-stroke keeps stroke thickness
	   fixed on screen. Fills and text still scale with the drawing. */
	.vp-svg :where(line, rect, circle, ellipse, polyline, polygon) { vector-effect: non-scaling-stroke; }
	.vp-svg text { font-family:'Inter','Segoe UI',system-ui,sans-serif; }
	/* Text annotations (monospace) are styled inside EntRender — entity paint lives there now. */
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
