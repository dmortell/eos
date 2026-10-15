<!-- One view surface: a plan or an elevation of the open level (switch with the buttons at the top left). It generates
     the view's display list, draws it, and routes input — left button → the active tool (points in VIEW mm; the view
     space turns them into model points), right / middle drag → pan, a right CLICK → the same as Esc (on a thing: its menu; a long-press on
     touch too), wheel → zoom (EOS input mode: pan; press-drag draws, editor/pressDrag.ts).
     With a second pane open, each shows the other's work plane (ADR 0006): the plan shows the elevation's work depth
     as a dashed line, an elevation shows the work height. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import { toolWorksIn, ANNOTATION_TOOLS, type Workspace } from '../app/workspace.svelte'
	import type { ToolCtx, PointerIn, PortSel } from '../editor/tools'
	import type { Bounds, Prim } from '../views/display'
	import type { Pt } from '../domain/types'
	import type { InsertLink } from '../domain/links'
	import { TOL_PX } from '../editor/tools'
	import { planDisplayList } from '../views/plan'
	import { elevationDisplayList } from '../views/elevation'
	import { untrack } from 'svelte'
	import { rackRowDisplayList, rowHit, type RowSpec } from '../views/rackRow'
	import { sheetDisplayList, onPaper, paperSize } from '../views/sheet'
	import { viewportFrame, inWindow } from '../views/vpFrame'
	import ViewportChip from './ViewportChip.svelte'
	import { applyLayers, layerMap } from '../views/layers'
	import { Nudge } from '../editor/nudge'
	import { toolBlock } from '../domain/layers'
	import { riserDisplayList } from '../views/riser'
	import { paperDisplayList } from '../views/paper'
	import { sectionDisplayList, sectionSpace, sectionsOn } from '../views/section'
	import type { SectionCut } from '../domain/drawing'
	import type { Sheet, Entity } from '../domain/drawing'
	import { similarTo } from '../domain/similar'
	import { pickAt } from '../editor/pick'
	import { primBounds, unionBounds, PLOT_SCALE as PLOT } from '../views/display'
	import { transformItems } from '../editor/transformTool'
	import { spaceOf, specKey, specLabel, isPaperSpec, type ViewSpec, type WorkPlane } from '../views/space'
	import { snapAt, snapToPrims, snapDragged } from '../editor/snap'
	import { guideSnap } from '../domain/guides'
	import { snapThroughViewport, pasteTextNote } from '../editor/noteTool'
	import { typeInto } from '../editor/input'
	import { toModel, zoomAt, panBy, fit, visibleArea, reveal, ZoomHistory, type Camera } from '../editor/camera'
	import { wheelAction } from '../editor/inputMode'
	import { PressDragInput, PRESS_DRAG_TOOLS } from '../editor/pressDrag'
	import { TouchNav, pinchContent, settleScale, type ContentGesture } from '../editor/touch'
	import { LONG_PRESS_SLOP } from './longPress'
	import { PathTool } from '../editor/pathTool'
	import { gridLines as gridLines_, readoutText, CameraMemory, ClickCounter, RESTORED } from './canvasInfo'
	import { viewToSheet } from '../app/sheetActions'
	import { enterViewport, leaveViewport as leaveVp, rescaleViewport, libraryDrop, dropTakes } from './viewportEdit'
	import { activeSheets } from '../app/shellActions'
	import TextEditBox from './TextEditBox.svelte'
	import PortTip from './PortTip.svelte'
	import OutletTip from './OutletTip.svelte'
	import { applyAlign, type AlignHow } from '../editor/align'
	import ViewStrip, { type PaneNav } from './ViewStrip.svelte'
	import Prims from './Prims.svelte'
	import { frozenNow } from '../app/issue'
	import { primChanges, changeOverlay } from '../domain/issue'
	import { TOOL_GROUPS } from './toolGroups'
	import { portCells, outletPortCells, circuitOf, fillBands, routesOf, allRoutesOf, workPlaneOf, workPlaneGrip, workPlaneAt, viewportHighlight, pickableIn } from '../views/overlays'
	import { fieldCtx, withFields } from '../domain/fields'

	let { project, ws, levelId, spec, other, active = true, onspec, onfocus, nav }: {
		project: CadProject; ws: Workspace; levelId: string; spec: ViewSpec
		/** Back / forward through this pane's views (UX12). */
		nav?: PaneNav
		/** The other pane's view, when split — to show its work plane here. */
		other?: ViewSpec
		active?: boolean
		onspec: (s: ViewSpec) => void
		onfocus?: () => void
	} = $props()

	const PLOT_SCALE = PLOT
	/** Screen mm per CSS px (96 dpi): zoom 100% = the drawing at its printed size (1:100, or the paper itself). */
	const PX_MM = 25.4 / 96

	let svg: SVGSVGElement | undefined = $state()
	let w = $state(800), h = $state(600)
	let cam = $state<Camera>({ x: 0, y: 0, k: 0.05 })
	let marquee = $state<Bounds | null>(null)
	/** The selection box as drawn: inside an edited viewport the tool works in the viewport's view mm, so it goes onto
	 *  the paper (User: "the select marquee is not visible" — it was drawn off the page). */
	const mq = $derived.by((): Bounds | null => {
		if (!marquee || !vpe) return marquee
		const a = vpe.toPaper({ x: marquee.x0, y: marquee.y0 }), b = vpe.toPaper({ x: marquee.x1, y: marquee.y1 })
		return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) }
	})
	/** The box is dragged right → left: a crossing selection (dashed green, like other CAD). */
	let crossing = $state(false)
	/** Bumped after every tool event, so the preview (which reads the tool's own fields) is recomputed. */
	let tick = $state(0)
	/** How many points the run / line being drawn has (0 = none): the shell shows its Finish / Cancel chips on touch. */
	$effect(() => { void tick; if (active) ws.pathPending = ws.tool instanceof PathTool ? ws.tool.pts.length : 0 })
	let fittedFor: string | null = null

	const section = $derived(spec.kind === 'section' ? (project.index.get(spec.sectionId) as SectionCut | undefined) : undefined)
	const space = $derived(section ? sectionSpace(section) : spaceOf(spec))
	const sections = $derived(sectionsOn(project.index, levelId))
	const sheet = $derived(spec.kind === 'sheet' ? (project.index.get(spec.sheetId) as Sheet | undefined) : undefined)
	const sheetOpts = $derived({ underlay: project.pdf.placement, blocks: project.blockOf, ...project.sheetBase, routes: project.routes, fills: project.fills, cords: project.settings?.cordRoute, gray: !!project.settings?.grayFloorplans })   // a sheet's own look wins (sheetLook)
	/** Editing the model inside one of this sheet's viewports (UX review S5): its view's space, prims and paper maps. */
	const vpe = $derived(sheet && ws.vpEdit?.sheetId === sheet.id ? viewportFrame(project.index, sheet, ws.vpEdit.vpId, sheetOpts) : null)
	/** What the tools work in: the edited viewport's view, else this pane's. */
	const toolKind = $derived(vpe ? vpe.vp.view.spec.kind : spec.kind)
	/** The middle of the level's content in plan — the default work depth of an elevation (ADR 0006). */
	const centre = $derived.by((): Pt => {
		// from the level's outlets, racks and drawn points (not a whole plan display list, rebuilt per change)
		const ix = project.index, pts: Pt[] = []
		for (const o of ix.outlets) if (o.levelId === levelId && o.at) pts.push(o.at)
		for (const r of ix.racks) if (r.levelId === levelId && r.at) pts.push(r.at)
		for (const sh of ix.shapes) if (sh.levelId === levelId && sh.geom.kind === 'path') for (const n of sh.geom.nodes) pts.push(n)
		if (!pts.length) return { x: 0, y: 0 }
		let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
		for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y) }
		return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }
	})
	const work = $derived.by((): WorkPlane => ({ z: ws.opts.z, depth: ws.depth ?? depthAt(spec.kind === 'plan' ? other : spec) }))
	function depthAt(s?: ViewSpec): number { return s && s.kind === 'elevation' ? spaceOf(s).depthOf({ ...centre, z: 0 }) : 0 }
	const drawn = $derived(spec.kind === 'plan'
		? planDisplayList(project.index, levelId, { scale: PLOT_SCALE, underlay: project.pdf.placement, blocks: project.blockOf, gray: ws.screen.gray, byUsage: ws.screen.byUsage, compare: ws.compareOn ? ws.compareFile : undefined })
		: spec.kind === 'row'
			? rackRowDisplayList(project.index, spec, { cords: ws.screen.cordChannels ? 'channels' : 'straight' })
			: spec.kind === 'sheet'
				? (sheet ? sheetDisplayList(project.index, sheet, sheetOpts) : [])
				: isPaperSpec(spec)
					? paperDisplayList(project.index, spec, { fills: project.fills })
				: spec.kind === 'riser'
					? riserDisplayList(project.index, { scale: PLOT_SCALE, routes: project.routes, fills: project.fills, hideEmpty: spec.hideEmpty })
					: spec.kind === 'section'
						? (section ? sectionDisplayList(project.index, section, { scale: PLOT_SCALE, blocks: project.blockOf }) : [])
						: elevationDisplayList(project.index, levelId, space, { scale: PLOT_SCALE, blocks: project.blockOf, ...(ws.band.on ? { band: { near: work.depth + ws.band.front, far: work.depth - ws.band.back } } : {}) }))
	// text fields ({PROJECT}, {LEVEL}, {COUNT:…}, domain/fields.ts) — a sheet fills its own (per viewport)
	const raw = $derived(spec.kind === 'sheet' || spec.kind === 'row' || isPaperSpec(spec) ? drawn
		: withFields(drawn, fieldCtx(project.index, { project: project.name, blocks: project.blockOf, ...(spec.kind === 'riser' ? {} : { levels: [levelId] }) })))
	// the user's eye / lock (a sheet has its own stored layers and its viewports', applied inside sheetDisplayList: it shows as it prints)
	// (its notes and viewport content are layered inside sheetDisplayList; here only the lock keeps a locked layer's items unpicked)
	const layered = $derived(spec.kind === 'sheet' ? { draw: raw, pick: ws.layers.locked.size ? applyLayers(raw, project.index, { locked: ws.layers.locked }).pick : raw } : applyLayers(raw, project.index, { hidden: ws.layers.hidden, locked: ws.layers.locked, sort: spec.kind === 'plan' }))
	const prims = $derived(layered.draw)
	// on a sheet the paper and its windows share the sheet's id, so that isn't highlighted (the picked VIEWPORT is, below);
	// what's drawn on the paper (lines, notes, shapes) is, like in a view (User: a selected line on a sheet showed nothing)
	const selected = $derived(new Set(spec.kind === 'sheet' ? ws.selection.filter((id) => id !== spec.sheetId) : ws.selection))
	// the picked viewport: its frame and (unlocked) corner grips, a constant size on screen
	const vpHighlight = $derived(spec.kind !== 'sheet' || !ws.viewportId || !ws.selection.includes(spec.sheetId) ? []
		: ws.pickedViewports.flatMap((id) => viewportHighlight(prims, id, !!sheet?.viewports.find((v) => v.id === id)?.locked, 4 / cam.k)))
	/** Overlays over the drawing (views/overlays.ts): selected ports, a cord's circuit, fill bands, routes, the other
	 *  pane's work plane. */
	const portHighlight = $derived(spec.kind === 'row' ? [...outletPortCells(project.index, prims, ws.selection), ...portCells(prims, ws.portSel)] : [])   // + the ports of outlets picked in the list
	const traceHighlight = $derived(spec.kind === 'row' ? circuitOf(project.index, prims, ws.selection, ws.portSel) : [])
	const fillOverlay = $derived(spec.kind === 'plan' && ws.showFill ? fillBands(project.index, project.fills, levelId, PLOT_SCALE) : [])
	const routeHighlight = $derived(spec.kind === 'plan' && (ws.selection.length || ws.portSel) ? routesOf(project.index, project.routes, levelId, ws.selection, ws.portSel, project.estimates) : [])   // routes read only when there's something to show
	// the Routes toggle: every cable's route, colored by server room (backlog "Show all routes")
	const allRoutes = $derived(spec.kind === 'plan' && ws.showRoutes ? allRoutesOf(project.index, project.routes, levelId, project.estimates) : null)
	const linked = $derived(other && prims.length ? workPlaneOf(spec, other, prims, ws.depth ?? depthAt(other), ws.opts.z, ws.band.on ? ws.band : undefined) : [])
	/** The work plane's grip and its value (views/overlays.ts): drag it (Select tool) to set the elevation's work depth /
	 *  the plan's Z, 10 mm steps (Alt: free); double-click it in the plan → auto depth again. */
	const wGrip = $derived(other && prims.length ? workPlaneGrip(spec, other, prims, ws.depth ?? depthAt(other), ws.opts.z) : null)
	let wDrag = $state(false)
	const onWGrip = (p: Pt | null) => !!wGrip && !!p && Math.hypot(p.x - wGrip.at.x, p.y - wGrip.at.y) <= 7 / cam.k
	const wGripPrims = $derived.by((): Prim[] => {
		if (!wGrip) return []
		const g = wGrip.at, r = 4 / cam.k, auto = wGrip.what === 'depth' && ws.depth == null
		const text = wGrip.what === 'depth' ? `Work depth ${Math.round(ws.depth ?? depthAt(other))}${auto ? ' (auto)' : ''}` : `Work Z ${ws.opts.z > 0 ? '+' : ''}${ws.opts.z}`
		return [{ k: 'line', pts: [{ x: g.x - r, y: g.y - r }, { x: g.x + r, y: g.y - r }, { x: g.x + r, y: g.y + r }, { x: g.x - r, y: g.y + r }], closed: true, fill: true, cls: 'grip workplane-grip' },
			{ k: 'text', at: { x: g.x + 8 / cam.k, y: g.y - 6 / cam.k }, text, size: 11 / cam.k, cls: 'workplane-label' }]
	})
	const preview = $derived.by((): Prim[] => {
		void tick; void ws.selection; void project.rev; void cam.k
		const raw = active ? (ws.tool.preview?.(ctx()) ?? []) : []
		return vpe ? onPaper(raw, vpe.vp) : raw
	})
	/** Show changes (W23): on this sheet, what is new or changed since its last issue and what has gone — worked out
	 *  again as it's edited (the sheet frozen now vs the issued copy); on screen only. */
	const changePrims = $derived.by((): Prim[] => {
		const c = ws.sheetChanges
		if (spec.kind !== 'sheet' || !sheet || c?.sheetId !== sheet.id) return []
		void project.rev
		return changeOverlay(primChanges(c.issued, frozenNow(project, sheet)))
	})
	/** GUIDES (the Guide tool): this view's — inside an edited viewport, its view's — drawn across the view, on screen
	 *  only (never on a sheet's print); points snap onto them (`ctx().snap`). */
	const guideKey = $derived(vpe ? `${vpe.levelId}|${specKey(vpe.vp.view.spec)}` : `${levelId}|${specKey(spec)}`)
	const viewGuides = $derived(ws.guidesOf(guideKey))
	$effect(() => { if (active) ws.activeGuideKey = guideKey })   // the tool bar's Clear takes the active pane's
	const guidePrims = $derived.by((): Prim[] => {
		const L = 1e6, raw = viewGuides.map((g): Prim => ({ k: 'line', pts: g.axis === 'v' ? [{ x: g.at, y: -L }, { x: g.at, y: L }] : [{ x: -L, y: g.at }, { x: L, y: g.at }], cls: 'guide' }))
		return vpe ? onPaper(raw, vpe.vp) : raw
	})
	/** Inside an edited viewport: the selected things, drawn over the paper. */
	const vpSelected = $derived.by((): Prim[] => {
		if (!vpe || !ws.selection.length) return []
		const sel = new Set(ws.selection)
		return onPaper(vpe.prims.filter((p) => p.src && sel.has(p.src)), vpe.vp)
	})
	const selSet = $derived(new Set(ws.selection))

	/** Each view (level + plan / elevation / rack row) keeps its own pan and zoom: switching away and back restores it;
	 *  the view the pane opened with gets its saved camera back after a refresh (ui/canvasInfo.ts). */
	// svelte-ignore state_referenced_locally
	const cams = new CameraMemory(project.pid, `${levelId}:${specKey(spec)}`)
	let hiddenUntilFit = $state(false)
	let viewKey = ''
	$effect(() => { const c = cam; untrack(() => { if (viewKey && !hiddenUntilFit) cams.save(viewKey, c) }) })

	/** Zoom previous (Z P, User 2026-10-14): every zoom or pan is remembered once it has paused for a moment. */
	const zooms = new ZoomHistory()
	let settling: ReturnType<typeof setTimeout> | undefined
	const settleNow = () => { clearTimeout(settling); settling = undefined; if (viewKey && !hiddenUntilFit) zooms.settle(viewKey, cam) }
	$effect(() => { void cam; untrack(() => { clearTimeout(settling); settling = setTimeout(settleNow, 400) }) })
	$effect(() => () => clearTimeout(settling))
	/** Back to where this view was before the last zoom or pan; false = nothing to go back to. */
	export function zoomPrevious(): boolean {
		if (settling) settleNow()
		const c = viewKey ? zooms.back(viewKey) : null
		if (c) cam = c
		return !!c
	}
	/** Zoom window (Z W): two clicks in ACAD input, a press-drag in EOS (User) — corners in screen px. */
	let zwin = $state<{ a: Pt | null; b: Pt | null } | null>(null)
	export function zoomWindow(): void {
		zwin = { a: null, b: null }
		ws.say(ws.inputMode === 'eos' ? 'Zoom window: drag a box round what to see · Esc cancels' : 'Zoom window: click one corner, then the other · Esc cancels')
	}
	/** Esc while picking the zoom window: drop it. */
	export function cancelZoomWindow(): boolean { const was = !!zwin; zwin = null; return was }
	function zoomTo(a: Pt, b: Pt): void {
		zwin = null
		if (Math.abs(a.x - b.x) < 4 || Math.abs(a.y - b.y) < 4) { ws.say('Zoom window: too small — try again with Z W'); return }
		const p = toModel(cam, a), q = toModel(cam, b)
		cam = fit({ x0: Math.min(p.x, q.x), y0: Math.min(p.y, q.y), x1: Math.max(p.x, q.x), y1: Math.max(p.y, q.y) }, w, h, 0)
	}

	/** A plan whose floorplan is still rendering: its first fit waits for it (User: fitting to the outlets first and
	 *  again when the PDF arrived made the view jump). A floorplan that fails to load doesn't hold it up. */
	const floorplanPending = $derived(spec.kind === 'plan' && (!project.levelLoaded(levelId) ||
		project.dataIndex.ofType('underlay').some((u) => u.levelId === levelId && !project.pdf.placement(u) && !project.pdf.problems[`${u.fileId}#${u.page ?? 1}`])))

	/** Fit a view the first time it has something to show — again when the floorplan image arrives, and when the
	 *  pane changes size a lot (split / unsplit). A view seen before gets its own camera back instead. */
	$effect(() => {
		void ws.focus   // a focus asked for after the view switched (Find a device) fits it too
		void ws.centreOn
		const ps = prims, vk = `${levelId}:${specKey(spec)}`, key = `${vk}:${ps.some((p) => p.k === 'image')}:${Math.round(w / 200)}`
		// a view not fitted yet stays hidden until its floorplan is in, then fits once
		const seen = untrack(() => cams.has(vk) || (viewKey === vk && fittedFor !== null))
		if (floorplanPending && !seen) { hiddenUntilFit = true; return }
		hiddenUntilFit = false
		untrack(() => {
			if (vk !== viewKey) {
				if (viewKey) cams.set(viewKey, cam, fittedFor)
				viewKey = vk
				const saved = cams.get(vk)
				// a view with no camera of its own starts unfitted — not with the last view's flag (a new sheet opened from a
				// plan whose camera was RESTORED kept that flag, never fitted, and showed the paper as a speck)
				if (saved) { cam = saved.cam; fittedFor = saved.fitted }
				else fittedFor = null
			}
			// no fit before the pane has BOTH sizes: a fit into a 0-high pane clamps to the smallest zoom (a new sheet
			// came up as a speck in the corner, and that camera was then saved and restored)
			// asked to show one thing (a `?rack=` link): fit to it instead, once it's drawn here
			const want = ws.focus, fb = want && w && h ? unionBounds(ps.filter((p) => p.src === want).map(primBounds)) : null
			if (fb) { cam = fit(fb, w, h); fittedFor = RESTORED; ws.focus = null; return }   // RESTORED: no re-fit over it
			// asked to centre on a point (a riser carrying on, W27): the active view, its zoom kept
			const c = ws.centreOn
			if (c && active && w && h) { cam = { ...cam, x: w / 2 - c.x * cam.k, y: h / 2 - c.y * cam.k }; fittedFor = RESTORED; ws.centreOn = null; return }
			if (!ps.length || !w || !h) return
			// the content's bounds only when they're needed (not on every change, e.g. each frame of a drag)
			const check = fittedFor === RESTORED && cams.firstCheck(vk)
			if (!check && (fittedFor === key || fittedFor === RESTORED)) return
			const b = contentBounds(ps)
			// a restored camera that shows none of the content (UX13: a rack view opened cut off) fits once instead
			if (check && b) {
				const v = visibleArea(cam, w, h)
				if (v.x1 < b.x0 || v.x0 > b.x1 || v.y1 < b.y0 || v.y0 > b.y1) { cam = fit(b, w, h); return }
			}
			if (fittedFor === key || fittedFor === RESTORED) return
			if (b) { cam = fit(b, w, h); fittedFor = key }
		})
	})

	/** The project's sheets, for "To sheet…". */
	const sheetsList = $derived(activeSheets(project))
	/** Put this view on a sheet (app/sheetActions.ts): it opens in this pane with the new viewport picked. */
	export function toSheet(target: string): void {
		if (!target || spec.kind === 'sheet' || !w || !h) return
		const r = viewToSheet(project, ws, { levelId, spec: $state.snapshot(spec) as Exclude<ViewSpec, { kind: 'sheet' }> }, visibleArea(cam, w, h), target)   // plain data: the store freezes it
		if (!r) return
		onspec({ kind: 'sheet', sheetId: r.sheet.id })
		ws.selectViewport(r.vpId)
		ws.say(`${specLabel(spec)} on ${r.sheet.number}${isPaperSpec(spec) ? '' : ` at 1:${r.scale}`} — drag the viewport into place, resize it by a corner`)
	}

	/** Double-click a rack in a rack view: fit it; off a rack: the whole row. */
	function focusRack(p: Pt): void {
		const racks = prims.filter((x) => x.k === 'line' && x.cls === 'rack')
		const id = pickAt(racks, p, TOL_PX / cam.k)
		const b = id ? unionBounds(prims.filter((x) => x.src === id).map(primBounds)) : null
		if (b) cam = fit(b, w, h)
		else zoomExtents()
	}

	/** R / Shift+R and the ↻ ↺ buttons (User 2026-10-15): the selection turned 90° right (clockwise as seen) or left, about
	 *  the middle of what this view draws of it — one undo step, as the Rotate tool (runs ending on it follow). Null = done,
	 *  else why not. */
	export function turn90(dir: 1 | -1): string | null {
		if (!toolWorksIn('rotate', toolKind)) return 'Turning works on a plan or a sheet'
		const ids = [...ws.selection], sel = new Set(ids)
		const b = unionBounds((vpe ? vpe.prims : prims).filter((p) => p.src && sel.has(p.src)).map(primBounds))
		if (!ids.length || !b) return 'Select what to turn in this view first'
		// view y runs down, so +90 turns clockwise as seen
		transformItems(project.store, ids, { kind: 'rotate', c: { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }, deg: 90 * dir }, `Turn 90° ${dir > 0 ? 'right' : 'left'}`)
		tick++
		return null
	}
	/** Zoom to the selection (UX review V3; Shift+Home): what this view draws of it, with a margin. False = none here. */
	export function zoomToSelection(): boolean {
		const sel = new Set(ws.selection), src = vpe ? onPaper(vpe.prims, vpe.vp) : prims
		const b = unionBounds(src.filter((p) => p.src && sel.has(p.src)).map(primBounds))
		if (!b) return false
		const m = Math.max(b.x1 - b.x0, b.y1 - b.y0, 1) * 0.25
		cam = fit({ x0: b.x0 - m, y0: b.y0 - m, x1: b.x1 + m, y1: b.y1 + m }, w, h)
		return true
	}
	/** A row picked in a table (R52): what this view draws of the selection, panned into view if it's off-screen
	 *  (zoomed out only when it can't fit). False = nothing of it here. */
	export function revealSelection(): boolean {
		const sel = new Set(ws.selection), src = vpe ? onPaper(vpe.prims, vpe.vp) : prims
		const b = unionBounds(src.filter((p) => p.src && sel.has(p.src)).map(primBounds))
		if (!b || !w || !h) return false
		const next = reveal(cam, b, w, h)
		if (next) cam = next
		return true
	}
	export function zoomExtents(): void {
		const b = contentBounds(prims)
		if (b) cam = fit(b, w, h)
	}
	/** What Fit fits (UX13): the content, not the storey datum lines — a rack view / elevation shrank to fit the slab,
	 *  ceiling and slab (FSL / CSL) lines drawn wide either side. */
	function contentBounds(ps: Prim[]): Bounds | undefined {
		const core = ps.filter((p) => p.k === 'image' || !p.cls.startsWith('datum'))
		return unionBounds((core.length ? core : ps).map(primBounds))
	}
	/** Does this view draw `id`? (The selection follows the view, UX09.) */
	export function draws(id: string): boolean {
		return id === (spec.kind === 'sheet' ? spec.sheetId : '') || layered.pick.some((p) => p.src === id) || !!vpe?.prims.some((p) => p.src === id)
	}

	/** Where a paste goes (domain/clipboard): a plan takes plan items, a sheet notes, a rack row devices (into the rack
	 *  under the mouse). Null = this view takes none (or no rack under the mouse). */
	export function pasteTarget(): { kind: 'level' | 'sheet' | 'rack'; id: string } | null {
		if (spec.kind === 'row') { const r = cursor && rowHit(project.index, spec, cursor)?.rack; return r ? { kind: 'rack', id: r.id } : null }
		if (vpe) return toolKind === 'plan' ? { kind: 'level', id: vpe.levelId } : null
		return spec.kind === 'plan' ? { kind: 'level', id: levelId } : spec.kind === 'sheet' ? { kind: 'sheet', id: spec.sheetId } : null
	}
	/** Text pasted from another app (Ctrl+V): a text shape at the pointer, else the middle of the view. False = this view takes no notes. */
	export function pasteNote(t: { text: string; markdown: boolean }): boolean {
		const mid = toModel(cam, { x: w / 2, y: h / 2 }), p = cursor ?? (vpe ? vpe.fromPaper(mid) : mid)
		return !!pasteTextNote(ctx(), p, t)
	}
	/** The pointer, in the paste target's points (a viewport being edited: its view mm) — Ctrl+Shift+V. */
	export const pasteCursor = (): Pt | null => cursor
	/** What this view shows that can be picked (visible, unlocked layers) — devices in a rack row, notes on a sheet (not
	 *  the sheet itself). */
	const pickable = (): Entity[] => pickableIn(project.index, vpe ? vpe.prims : layered.pick, toolKind)
	/** Ctrl+A: everything this view shows that can be picked. */
	export function selectAll(): void { ws.select(pickable().map((e) => e.id)) }
	/** Select similar: what this view shows of the same kind as the selection (domain/similar.ts). */
	export function selectSimilar(): void {
		const ids = similarTo(ws.selection.map((id) => project.index.get(id)).filter((e): e is Entity => !!e), pickable())
		if (!ids.length) { ws.say('Nothing like the selection in this view'); return }
		ws.select(ids)
		ws.say(`Selected ${ids.length} similar item${ids.length === 1 ? '' : 's'} in this view`)
	}
	const nudger = new Nudge()
	/** An arrow key: the selection moves 50 mm (`big`: 500 mm; User: 1 mm was too small) in this view; on a sheet's
	 *  paper 1 / 10 mm; a rack row moves devices 1 U. */
	export function nudge(dx: number, dy: number, big: boolean): void {
		// editing inside a viewport: the model view's own step and directions (an elevation's up is z), not the paper's
		const step = toolKind === 'row' ? 1 : toolKind === 'sheet' ? (big ? 10 : 1) : big ? 500 : 50
		// a viewport picked on the sheet: its window moves (1 / 10 paper mm)
		const why = spec.kind === 'sheet' && ws.viewportId && !ws.vpEdit && ws.selection.length === 1 && ws.selection[0] === spec.sheetId
			? nudger.pressViewport(project.store, spec.sheetId, ws.pickedViewports, { x: dx * step, y: dy * step })
			: nudger.press(project.store, ws.selection, { x: dx * step, y: dy * step }, vpe ? vpe.space : space)
		if (why) ws.say(why)
	}
	export function endNudge(): void { nudger.end() }
	/** Align / distribute the selection as this view draws it (backlog "Align / distribute"). */
	export function align(how: AlignHow): void {
		if (vpe || spec.kind === 'row' || spec.kind === 'riser') { ws.say('Align works in a plan, an elevation, a section or on a sheet’s paper'); return }
		ws.say(applyAlign(project.store, ws.selection, layered.pick, how, space))
	}

	function ctx(): ToolCtx {
		// inside an edited viewport the tools work in its view: its space, level and prims; tolerances in its view mm
		const f = vpe, tol = (TOL_PX / cam.k) * (f ? f.vp.scale : 1), kind = toolKind
		const sp = f ? f.space : space, lv = f ? f.levelId : levelId, pick = f ? f.prims : layered.pick
		const wk = f ? { z: ws.opts.z, depth: ws.depth ?? depthAt(f.vp.view.spec) } : work
		return {
			store: project.store, index: project.index, levelId: lv, settings: project.settings, details: project.details, opts: ws.opts, space: sp, work: wk,
			// the current layer for new lines: a project layer that exists, or a system one other than Drawing (their default)
			layerId: ws.layers.current && ws.layers.current !== 'sys:drawing' && (ws.layers.current.startsWith('sys:') || project.index.get(ws.layers.current)?.type === 'layer') ? ws.layers.current : null,
			prims: () => pick, tol: () => tol,
			snap: (p, alt, skip, dragged) => {
				const d = ws.drafting, o = { skip, noGrid: alt || !d.snap, grid: d.grid, noObjects: !d.osnap }
				let sn = kind === 'plan' ? snapAt(project.index, lv, p, tol * 1.5, o) : snapToPrims(f ? f.prims : prims, p, tol * 1.5, o)
				// onto a guide or a crossing of two (OSNAP), unless an object snap is nearer
				const gp = !alt && d.osnap && viewGuides.length ? guideSnap(viewGuides, p, tol * 1.5) : null
				if (gp && (sn.kind === 'grid' || Math.hypot(gp.x - p.x, gp.y - p.y) < Math.hypot(sn.p.x - p.x, sn.p.y - p.y))) sn = { p: gp, kind: 'guide' }
				// nodes being dragged snap onto the skipped runs' OTHER nodes too (dropped there, they join them); the dragged
				// nodes themselves, and the midpoints of segments they move, would snap to the cursor
				return dragged && skip ? snapDragged(sn, p, tol * 1.5, project.index, skip, dragged, (q) => sp.fromWorld(q)) : sn
			},
			...(kind === 'sheet' && !f && sheet ? { sheetSnap: (p: Pt, alt: boolean) => (alt || !ws.drafting.osnap ? null : snapThroughViewport(project.index, sheet, p, tol * 1.5)) } : {}),
			guides: { list: () => ws.guidesOf(guideKey), set: (gs) => ws.setGuides(guideKey, gs), axis: () => ws.guideAxis },
			grid: ws.drafting.snap ? ws.drafting.grid : 0,
			selection: ws.selection, select: ws.select, setMarquee: (b, x) => { marquee = b; crossing = !!x }, ask: ws.ask, askText: ws.askText, say: ws.say,
			...(kind === 'sheet' ? { selectViewport: ws.selectViewport, selectViewports: ws.selectViewports, viewportId: () => ws.viewportId, viewportIds: () => ws.pickedViewports, enterViewport: enterVp, contentNav: () => ws.vpContentNav } : {}),
			openLevel: (id: string, at?: Pt) => { ws.openLevel(id); if (at) ws.centreOn = at },
			openLink: (l: InsertLink) => { if (l.kind === 'sheet' && project.index.get(l.sheetId)?.type !== 'sheet') ws.say('The linked sheet is gone'); else ws.openLink(l) },
			selectOpening: ws.selectOpening, openingId: () => ws.openingSel?.openingId ?? null,
			pathSel: () => ws.pathSel, selectPath: ws.selectPath, editText: ws.editText,   // inside a viewport too: the box maps onto the paper
			...(kind === 'row' ? { rowHit: (p: Pt) => rowHit(project.index, (f ? f.vp.view.spec : spec) as RowSpec, p), portSel: () => ws.portSel, selectPorts: ws.selectPorts, armPorts: (s: PortSel, k: 'cord' | 'link') => (k === 'link' ? ws.interconnectFrom(s) : ws.patchFrom(s)) } : {}),
		}
	}

	function local(e: PointerEvent | WheelEvent | MouseEvent) {
		const r = svg!.getBoundingClientRect()
		return { x: e.clientX - r.left, y: e.clientY - r.top }
	}
	/** The pointer on this view's drawing (a sheet: paper mm). */
	const paperAt = (e: PointerEvent | MouseEvent | WheelEvent) => toModel(cam, local(e))
	/** The pointer for the tools: inside an edited viewport, in its view mm. */
	const input = (e: PointerEvent | MouseEvent, count = 1): PointerIn => {
		const q = paperAt(e)
		return { p: vpe ? vpe.fromPaper(q) : q, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey, count }
	}
	/** Enter / leave a viewport (UX review S5): its level opens, the selection starts empty; leaving picks the viewport. */
	function enterVp(id: string): void { if (sheet && sheet.viewports.some((v) => v.id === id)) { ws.tool.cancel(ctx()); enterViewport(ws, sheet, id); tick++ } }
	function exitVp(): void { leaveVp(ws, sheet); tick++ }
	/** A drag that pans the edited viewport's view (Pan / zoom content on): the viewport at the press, the gesture. */
	let vpPan: { at: Pt; vp: Sheet['viewports'][number]; g: ReturnType<typeof project.store.begin> | null } | null = null
	/** The viewport a right / middle drag pans with Pan / zoom content on: the edited one, else the selected one (alone, not
	 *  locked) — when the press is inside it. */
	function contentVpAt(e: PointerEvent): Sheet['viewports'][number] | undefined {
		if (!sheet || !ws.vpContentNav) return undefined
		const q = paperAt(e)
		if (vpe) return inWindow(vpe, q) ? vpe.vp : undefined
		const v = !ws.vpMore.length && ws.selection.includes(sheet.id) ? sheet.viewports.find((x) => x.id === ws.viewportId) : undefined
		return v && !v.locked && q.x > v.rect.x && q.x < v.rect.x + v.rect.w && q.y > v.rect.y && q.y < v.rect.y + v.rect.h ? v : undefined
	}

	/** Click counting (a pointerdown's `detail` is always 0): ui/canvasInfo.ts. */
	const TOUCH_DOUBLE_TAP_PX = 24
	const clicks = new ClickCounter()
	const pressCount = (e: PointerEvent): number => clicks.press(local(e), e.timeStamp, e.pointerType === 'touch' ? TOUCH_DOUBLE_TAP_PX : 5)   // a double-tap finishes a run / line

	let panning = $state<{ x: number; y: number; moved: boolean; button: number } | null>(null)
	/** The last pointer position in view mm — where a typed distance points, and the readout in the corner. */
	let cursor = $state<Pt | null>(null)
	let toolDown = $state(false)
	/** EOS input: a press-drag with a click tool (line, run, dimension) → the clicks it takes (editor/pressDrag.ts). One
	 *  place for it: the tools never know. `pdActive` = this press went through it (so its move / release do too). */
	const pdrag = new PressDragInput((e) => { ws.tool.down(e, ctx()); ws.tool.up(e, ctx()) })
	let pdActive = false
	/** The tool's cursor for what's under the pointer (Select: crosshair on a grip, move on what moves). */
	const cursorCss = $derived.by(() => { void tick; return ws.tool.cursorNow?.() ?? ws.tool.cursor })
	/** Length · angle · Δ in the status bar while drawing a run / line (from its last point) or dragging (from where the
	 *  drag started) — backlog "Length / angle readout" (User: in the status bar, not at the cursor). */
	const readout = $derived.by(() => {
		void tick
		const t = ws.tool, from = t.dragFrom?.() ?? (['line', 'trunk', 'conduit', 'wall'].includes(ws.toolId) ? t.lastPoint?.(ctx()) : null)
		return cursor && from ? readoutText(cursor, from, toolKind) : null
	})

	// the status bar's readout (UX05): the active pane reports the cursor in its own terms (plan / sheet x, y with y down;
	// elevations, sections and rack rows x, z up), the length · angle while drawing, the scale and the zoom
	$effect(() => {
		if (!active) return
		const up = toolKind === 'elevation' || toolKind === 'section' || toolKind === 'row'
		// with SNAP on, the point a click would take on the grid (User 2026-10-15: the readout ignored the grid)
		const g = ws.drafting.snap && spec.kind !== 'sheet' ? ws.drafting.grid : 0, r = (v: number) => (g ? Math.round(v / g) * g : Math.round(v))
		ws.viewInfo = {
			loading: floorplanPending,
			xy: cursor ? `X ${r(cursor.x)} · ${up ? 'Z' : 'Y'} ${r(up ? -cursor.y : cursor.y)}` : null,
			readout, scale: spec.kind === 'sheet' ? 'paper mm' : `1:${PLOT_SCALE}`,
			zoom: Math.round(cam.k * PX_MM * (spec.kind === 'sheet' ? 1 : PLOT_SCALE) * 100), mmPerPx: Math.round(1 / cam.k),
			...(vpe ? { extra: `editing ${specLabel(vpe.vp.view.spec)} at 1:${vpe.vp.scale}` } : spec.kind === 'elevation' ? { extra: `work depth ${Math.round(work.depth)}` } : {}),
		}
	})
	/** The drawn grid (GRID, UX05): lines every grid step, coarsened ×10 until they're at least 8 px apart; every 5th
	 *  darker. Model views only (a sheet's paper has its margins; a rack view its Us). */
	const gridLines = $derived(!ws.drafting.showGrid || spec.kind === 'sheet' || spec.kind === 'row' || !w || !h ? [] : gridLines_(cam, w, h, ws.drafting.grid))

	// a device template dragged from the Device library onto a rack view (ui/viewportEdit.ts)
	// svelte-ignore state_referenced_locally
	const lib = libraryDrop({ ws, ok: () => dropTakes(ws.dragArm, spec.kind, !!vpe), input: (e) => input(e), ctx, surface: () => svg, changed: () => tick++, focus: () => onfocus?.() })
	// touch (editor/touch.ts): two fingers pan / pinch anywhere; one finger on empty space pans with Select, a tap clears
	/** Two fingers inside the viewport being edited (or the one picked, with Pan / zoom content on): its VIEW pans and
	 *  scales, not the camera (backlog "Viewport handling" 7). One undo step; the scale settles on a standard 1:N. */
	function contentGesture(mid: Pt): ContentGesture | null {
		const sh = sheet
		if (!sh || spec.kind !== 'sheet') return null
		const id = vpe?.vp.id ?? (ws.vpContentNav && !ws.vpMore.length && ws.selection.includes(sh.id) ? ws.viewportId : null)
		const vp = id ? sh.viewports.find((v) => v.id === id) : undefined, p = toModel(cam, mid)
		if (!vp || vp.locked || p.x < vp.rect.x || p.x > vp.rect.x + vp.rect.w || p.y < vp.rect.y || p.y > vp.rect.y + vp.rect.h) return null
		const c0 = cam
		let g: ReturnType<typeof project.store.begin> | null = null
		const put = (centre: Pt, scale: number) => { g ??= project.store.begin('Pan / scale viewport'); g.update((tx) => tx.put({ ...sh, viewports: sh.viewports.map((v) => (v.id === vp.id ? { ...v, centre, scale } : v)) })) }
		let last: { centre: Pt; scale: number } | null = null
		return {
			update: (a0, b0, a1, b1) => { last = pinchContent(vp, toModel(c0, a0), toModel(c0, b0), toModel(c0, a1), toModel(c0, b1)); put(last.centre, last.scale) },
			end: () => {
				if (!g || !last) return
				const scale = settleScale(last.scale)
				if (scale !== last.scale) put(last.centre, scale)
				g.commit(ws.selection); ws.say(`Viewport view at 1:${scale}`)
			},
		}
	}
	const touch = new TouchNav({ cam: () => cam, setCam: (c) => { cam = c }, content: contentGesture, cancel: () => { if (toolDown) { ws.tool.cancel(ctx()); toolDown = false } }, tap: () => ws.select([]),
		emptyAt: (s) => { if (ws.toolId !== 'select') return false; const id = pickAt(vpe ? onPaper(vpe.prims, vpe.vp) : layered.pick, toModel(cam, s), TOL_PX / cam.k); return !id || (spec.kind === 'sheet' && id === spec.sheetId) } })
	/** A finger / pen press given to the tool: its moves wait until it has gone further than a long-press allows, so a
	 *  finger held still (a long-press = right-click, ui/longPress.ts) never starts a drag or a marquee first. */
	let held: { id: number; at: Pt } | null = null
	/** A right-click / long-press ON something (Select tool, a sheet's paper aside): it's selected first if it wasn't,
	 *  and its menu opens (UX21; R55). False = nothing there. */
	function menuAt(e: MouseEvent): boolean {
		if (ws.toolId !== 'select') return false
		const c = ctx(), hit = pickAt(c.prims(), input(e).p, c.tol())
		if (!hit || (spec.kind === 'sheet' && hit === spec.sheetId)) return false
		if (!ws.selection.includes(hit)) ws.select([hit])
		ws.contextMenu = { x: e.clientX, y: e.clientY }
		return true
	}
	/** `contextmenu`: a mouse's menu opens on the right button's release (onUp); a long-press's (touch, pen) here — what
	 *  the press began for the tool is dropped first, so it doesn't also drag or draw a box. */
	function onMenu(e: MouseEvent) {
		e.preventDefault()
		const by = (e as PointerEvent).pointerType
		if ((by !== 'touch' && by !== 'pen') || ws.toolId !== 'select') return
		if (toolDown) { ws.tool.cancel(ctx()); toolDown = false; held = null; tick++ }
		menuAt(e)
	}
	function onDown(e: PointerEvent) {
		onfocus?.()
		ws.touchInput = e.pointerType === 'touch'   // the options row then offers Finish / Cancel while a run is being drawn
		try { svg!.setPointerCapture(e.pointerId) } catch { /* a synthetic pointer (tests, automation) has none */ }
		held = null
		if (e.pointerType === 'touch' && touch.down(e.pointerId, local(e))) return
		if (e.button === 1 || e.button === 2) {
			// Pan / zoom content on: a right / middle drag inside the edited or selected viewport pans ITS view, not the sheet
			// (User 2026-10-15); a right click there is still a right click
			const cv = contentVpAt(e)
			if (cv) vpPan = { at: paperAt(e), vp: cv, g: null }
			panning = { ...local(e), moved: false, button: e.button }; return
		}
		if (e.button !== 0) return
		// picking a zoom window: the first press is one corner, the next press (or, in EOS, the release of a drag) the other
		if (zwin) { const s = local(e); if (!zwin.a) zwin = { a: s, b: s }; else zoomTo(zwin.a, s); return }
		const count = pressCount(e)
		if (count >= 2) e.preventDefault()   // no word selection / focus change from a double-click (it closed the in-place edit box)
		// the work plane's grip (Select tool): drag it; a double-click on the plan's sets the depth back to auto
		if (ws.toolId === 'select' && onWGrip(input(e).p)) {
			if (count >= 2 && wGrip?.what === 'depth') { ws.depth = null; ws.say('Work depth: auto (the middle of the floor)') }
			else wDrag = true
			return
		}
		if (vpe) {
			const q = paperAt(e)
			// outside the edited viewport nothing is picked (the frame only); a double-click there leaves it
			if (!inWindow(vpe, q)) { if (count >= 2) exitVp(); return }
			if (ws.vpContentNav) { vpPan = { at: q, vp: vpe.vp, g: null }; return }
			// annotations go on the VIEW, never into the model from a sheet (User 2026-10-07): an annotation tool leaves the
			// viewport first, and the note is tied to it as when it isn't being edited
			if (ANNOTATION_TOOLS.has(ws.toolId)) { exitVp(); ws.say('Left the viewport: annotations go on the sheet, tied to the view') }
		}
		// a tool that doesn't belong in this view does nothing here (split view: both panes share the tool)
		if (!toolWorksIn(ws.toolId, toolKind)) { ws.say(`The ${TOOL_GROUPS.flatMap((g) => g.tools).find((t) => t.id === ws.toolId)?.label.replace(/ \(.*\)$/, '') ?? ws.toolId} tool doesn’t work in this view`); return }
		// Rack rows: double-click a rack to focus it (fit), double-click empty space to see the whole row again
		if (spec.kind === 'row' && count >= 2 && ws.toolId === 'select') { focusRack(input(e).p); return }
		// inside a viewport, what's hidden is the viewport's own (its layers are apart from the model's eye)
		const why = toolKind === 'sheet' ? null : toolBlock(ws.toolId, vpe ? { current: ws.layers.current, hidden: new Set(vpe.vp.frozen ?? []), locked: ws.layers.locked } : ws.layers, ws.opts.z, layerMap(project.index))
		if (why) { ws.say(why); return }
		toolDown = true
		if (e.pointerType !== 'mouse') held = { id: e.pointerId, at: local(e) }
		if (ws.inputMode === 'eos' && PRESS_DRAG_TOOLS.has(ws.toolId) && e.pointerType !== 'touch') {
			pdActive = true
			pdrag.down(input(e, count), local(e), !!ws.tool.lastPoint?.(ctx())); tick++
			return
		}
		pdActive = false
		ws.tool.down(input(e, count), ctx()); tick++
	}
	function onMove(e: PointerEvent) {
		if (e.pointerType === 'touch' && touch.move(e.pointerId, local(e))) return
		if (panning) {
			const s = local(e)
			if (!vpPan) {
				if (panning.moved || Math.hypot(s.x - panning.x, s.y - panning.y) > 3) { cam = panBy(cam, s.x - panning.x, s.y - panning.y); panning = { ...panning, ...s, moved: true } }
				return
			}
			// the viewport's view (below), once the drag is more than a click
			if (!panning.moved && Math.hypot(s.x - panning.x, s.y - panning.y) <= 3) return
			if (!panning.moved) panning = { ...panning, moved: true }
		}
		if (vpPan && sheet) {
			// pan the edited viewport's view by the drag (paper mm × its scale), one undo step
			const q = paperAt(e), v0 = vpPan.vp, d = { x: q.x - vpPan.at.x, y: q.y - vpPan.at.y }, sh = sheet
			vpPan.g ??= project.store.begin('Pan viewport')
			vpPan.g.update((tx) => tx.put({ ...sh, viewports: sh.viewports.map((v) => (v.id === v0.id ? { ...v, centre: { x: v0.centre.x - d.x * v0.scale, y: v0.centre.y - d.y * v0.scale } } : v)) }))
			return
		}
		if (wDrag && other) {
			const v = workPlaneAt(spec, other, input(e).p)
			if (v != null) { const r = e.altKey ? Math.round(v) : Math.round(v / 10) * 10; if (wGrip?.what === 'depth') ws.depth = r; else ws.opts.z = r }
			return
		}
		if (zwin) { if (zwin.a) zwin = { ...zwin, b: local(e) }; return }
		cursor = input(e).p
		if (!active) return
		if (held && held.id === e.pointerId) {
			const s = local(e)
			if (Math.hypot(s.x - held.at.x, s.y - held.at.y) <= LONG_PRESS_SLOP) return
			held = null
		}
		if (pdActive) pdrag.move(local(e))
		if (toolDown) ws.tool.move(input(e), ctx())
		else ws.tool.hover?.(input(e), ctx())
		tick++
	}
	function onUp(e: PointerEvent) {
		held = null
		if (e.pointerType === 'touch' && touch.up(e.pointerId)) return
		if (panning) {
			if (vpPan) { if (panning.moved) vpPan.g?.commit(ws.selection); else vpPan.g?.rollback(); vpPan = null }
			const click = !panning.moved && panning.button === 2
			panning = null
			// a right CLICK (no drag) = Esc (User): the first ends what's being drawn (a run with 2+ points is kept, a
			// half-made one dropped, an armed bulk patch / interconnect let go) and stays in the tool; the next, with
			// nothing in progress, goes back to Select; in Select it clears the selection
			// a right-click ON something (Select tool, nothing in progress) opens its menu (UX21); one not selected is
			// selected first (User 2026-10-12: it cleared the selection instead)
			if (click && menuAt(e)) return
			if (click) {
				const handled = ws.tool.key?.({ key: 'Escape' } as KeyboardEvent, ctx()) ?? false
				if (!handled) {
					if (ws.toolId === 'select') ws.select([])
					else { ws.tool.cancel(ctx()); ws.toolId = 'select' }
				}
				tick++
			}
			return
		}
		if (zwin) {
			const { a, b } = zwin
			if (ws.inputMode === 'eos' && a && b && Math.hypot(b.x - a.x, b.y - a.y) > 3) zoomTo(a, b)   // a press without a drag waits for a second press
			return
		}
		if (vpPan) { vpPan.g?.commit(ws.selection); vpPan = null; return }
		if (wDrag) { wDrag = false; ws.say(wGrip?.what === 'depth' ? `Work depth ${ws.depth} — what you draw in the elevation goes there · double-click the grip: auto` : `Work Z ${ws.opts.z} — what you draw in the plan goes at this height`); return }
		if (pdActive) { pdActive = false; toolDown = false; pdrag.up(input(e), local(e)); tick++; return }
		if (toolDown) { toolDown = false; ws.tool.up(input(e), ctx()); tick++ }
	}

	const rescale = (dir: 1 | -1, p: Pt) => rescaleViewport(project, ws, sheet, vpe?.vp.id, dir, p)
	/** The wheel needs a non-passive listener to stop the page scrolling. */
	$effect(() => {
		const el = svg
		if (!el) return
		const onWheel = (e: WheelEvent) => {
			e.preventDefault()
			// ACAD: the wheel zooms. EOS: it pans; Ctrl / Alt / Meta (or the right button held) + wheel zooms (editor/inputMode.ts)
			const a = wheelAction(ws.inputMode, e, panning?.button === 2)
			if (a.kind === 'pan') { cam = panBy(cam, a.dx, a.dy); return }
			if (!((e.altKey || ws.vpContentNav) && rescale(e.deltaY < 0 ? -1 : 1, paperAt(e)))) cam = zoomAt(cam, local(e), a.factor)
		}
		el.addEventListener('wheel', onWheel, { passive: false })
		return () => el.removeEventListener('wheel', onWheel)
	})

	/** Keys for the active tool (Enter, Backspace, R …); true = handled. */
	export function key(e: KeyboardEvent): boolean {
		const done = ws.tool.key?.(e, ctx()) ?? false
		if (done) tick++
		return done
	}
	/** A typed point for the active tool (x,y · @dx,dy · @d<a · distance towards the cursor). Returns an error to show. */
	export function typed(text: string): string | null {
		const err = typeInto(ws.tool, text, ctx(), cursor, toolKind === 'elevation' || toolKind === 'section')   // y = height, as the readout shows
		tick++
		return err
	}
	export const takesTyping = () => !!ws.tool.typed
	/** The typing box's prompt for the active tool (null = the point prompt). */
	export const typingLabel = () => ws.tool.typedLabel?.() ?? null

	/** Page Up / Down: one screen up or down (sideways = left / right), with a little overlap. */
	export function page(dir: 1 | -1, sideways: boolean): void {
		cam = sideways ? panBy(cam, -dir * w * 0.9, 0) : panBy(cam, 0, -dir * h * 0.9)
	}
	/** Esc with nothing selected, while editing inside a viewport: leave it. */
	export function leaveViewport(): void { exitVp() }
	/** Finish / Cancel chips for a run or line drawn by touch (the options row): same as Enter / Esc. */
	export function finishPath(): void { const t = ws.tool; if (t instanceof PathTool) { t.finish(ctx()); tick++ } }
	export function cancelPath(): void { ws.tool.cancel(ctx()); tick++ }
	/** Esc / a cancelled pointer: whatever the press started goes back (a tool's drag, a viewport pan, the work grip). */
	export function cancel(): void { pdrag.cancel(); pdActive = false; vpPan?.g?.rollback(); vpPan = null; wDrag = false; panning = null; ws.tool.cancel(ctx()); toolDown = false; tick++ }
	/** The pointer was taken away (pointercancel: a palm / system gesture; lost capture with no pointerup): put back what
	 *  it was doing rather than commit it where it was. Nothing pressed (after a normal pointerup) = nothing to do. */
	function onCancel(e: PointerEvent) {
		held = null
		if (e.pointerType === 'touch' && touch.up(e.pointerId)) return
		if (toolDown || vpPan || wDrag || panning) cancel()
	}
	export function refresh(): void { tick++ }
	/** What's on screen, in view mm (the print ▾'s "on screen", User 2026-10-15). */
	export function visibleBounds(): { x0: number; y0: number; x1: number; y1: number } { const a = toModel(cam, { x: 0, y: 0 }), b = toModel(cam, { x: w, y: h }); return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) } }
	/** The view as on screen, onto the clipboard as a PNG (decision T160, View › Copy view as picture). The SVG is
	 *  drawn by the browser from a copy carrying its computed styles (the component's CSS doesn't travel with it) and its
	 *  pictures as data urls (an SVG drawn as an image loads nothing from outside). */
	export async function copyPicture(): Promise<string> {
		if (!svg) return 'Nothing to copy'
		try {
			const r = svg.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1)
			const copy = svg.cloneNode(true) as SVGSVGElement
			const from = svg.querySelectorAll('*'), to = copy.querySelectorAll('*')
			const PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-size', 'font-family', 'font-weight', 'text-anchor', 'dominant-baseline', 'visibility', 'display', 'paint-order', 'filter']
			from.forEach((el, i) => { const cs = getComputedStyle(el); (to[i] as SVGElement).setAttribute('style', PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';')) })
			for (const im of copy.querySelectorAll('image')) {
				const href = im.getAttribute('href') ?? im.getAttribute('xlink:href')
				if (!href || href.startsWith('data:')) continue
				const blob = await (await fetch(href)).blob()
				im.setAttribute('href', await new Promise<string>((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.readAsDataURL(blob) }))
			}
			copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
			copy.setAttribute('width', String(r.width)); copy.setAttribute('height', String(r.height))
			const img = new Image()
			img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`
			await img.decode()
			const cv = document.createElement('canvas')
			cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr)
			const g = cv.getContext('2d')!
			g.fillStyle = '#ffffff'; g.fillRect(0, 0, cv.width, cv.height)
			g.scale(dpr, dpr); g.drawImage(img, 0, 0, r.width, r.height)
			const png = await new Promise<Blob | null>((ok) => cv.toBlob(ok, 'image/png'))
			if (!png) return 'Copy failed: no picture'
			await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
			return `Copied the view as a picture (${cv.width} × ${cv.height} px)`
		} catch (e) { return `Copy failed: ${(e as Error).message}` }
	}
	export const isElevation = () => spec.kind === 'elevation'
</script>

<div class="surface" class:active bind:clientWidth={w} bind:clientHeight={h}>
	<svg bind:this={svg} width={w} height={h} role="application" aria-label={specLabel(spec)}
		style:cursor={zwin ? 'crosshair' : panning?.moved || wDrag ? 'grabbing' : ws.toolId === 'select' && onWGrip(cursor) ? 'grab' : cursorCss}
		onpointerdown={onDown} onpointermove={onMove} onpointerup={onUp} onpointercancel={onCancel} onlostpointercapture={onCancel} onpointerleave={() => { ws.tool.unhover?.(); cursor = null; tick++ }}
		oncontextmenu={onMenu} ondragover={lib.over} ondrop={lib.drop} ondragleave={lib.leave}>
		<g transform="translate({cam.x} {cam.y}) scale({cam.k})" visibility={hiddenUntilFit ? 'hidden' : undefined}>
			{#each gridLines as g, i (i)}<line class="gridline" class:major={g.major} x1={g.a.x} y1={g.a.y} x2={g.b.x} y2={g.b.y} vector-effect="non-scaling-stroke" />{/each}
			<Prims {prims} {selected} k={cam.k} />
			<Prims prims={linked} selected={new Set()} />
			<Prims prims={wGripPrims} selected={new Set()} k={cam.k} />
			<Prims prims={traceHighlight} selected={new Set()} k={cam.k} />
			<Prims prims={fillOverlay} selected={new Set()} />
			{#if allRoutes}<Prims prims={allRoutes.prims} selected={new Set()} />{/if}
			<Prims prims={routeHighlight} selected={new Set()} />
			<Prims prims={vpHighlight} selected={new Set()} />
			{#if vpe && sheet}
				{@const ps = paperSize(sheet)}{@const r = vpe.window}
				<!-- editing inside a viewport: the paper dims round it, its frame in the selection color -->
				<path class="vp-dim" fill-rule="evenodd" d="M0 0H{ps.w}V{ps.h}H0Z M{r.x0} {r.y0}H{r.x1}V{r.y1}H{r.x0}Z" />
				<rect class="vp-edit" x={r.x0} y={r.y0} width={r.x1 - r.x0} height={r.y1 - r.y0} vector-effect="non-scaling-stroke" />
				<Prims prims={vpSelected} selected={selSet} />
			{/if}
			<Prims prims={portHighlight} selected={new Set()} k={cam.k} />
			{#if changePrims.length}<Prims prims={changePrims} selected={new Set()} k={cam.k} />{/if}
			{#if guidePrims.length}<Prims prims={guidePrims} selected={new Set()} k={cam.k} />{/if}
			<Prims prims={preview} selected={new Set()} k={cam.k} />
			{#if mq}
				<rect x={mq.x0} y={mq.y0} width={mq.x1 - mq.x0} height={mq.y1 - mq.y0}
					class="marquee" class:crossing vector-effect="non-scaling-stroke" />
			{/if}
		</g>
		{#if zwin?.a && zwin.b}
			<rect class="marquee" x={Math.min(zwin.a.x, zwin.b.x)} y={Math.min(zwin.a.y, zwin.b.y)} width={Math.abs(zwin.b.x - zwin.a.x)} height={Math.abs(zwin.b.y - zwin.a.y)} />
		{/if}
	</svg>
	<ViewStrip {project} {ws} {spec} {levelId} {sections} {section} {sheet} {sheetsList} {onspec} {onfocus} {toSheet} {nav} routeKey={allRoutes?.rooms} />
	{#if sheet && active}
		{@const chipVp = vpe?.vp ?? (ws.selection.includes(sheet.id) && !ws.vpMore.length ? sheet.viewports.find((v) => v.id === ws.viewportId) : undefined)}
		{#if chipVp}<ViewportChip {project} {ws} {sheet} vp={chipVp} editing={!!vpe} {cam} onenter={() => enterVp(chipVp.id)} onexit={exitVp} />{/if}
	{/if}
	{#if hiddenUntilFit}<div class="loading">Loading floorplan…</div>{/if}
	{#if spec.kind === 'row'}<PortTip ix={project.index} {prims} {cursor} {cam} face={spec.face} dragging={toolDown || !!panning} />{/if}
	{#if spec.kind === 'plan' && ws.toolId === 'select'}<OutletTip ix={project.index} {prims} {cursor} {cam} dragging={toolDown || !!panning} />{/if}
	{#if ws.textEdit && active}{#key ws.textEdit}<TextEditBox {project} {ws} {space} {cam} {prims} frame={vpe ? { space: vpe.space, prims: vpe.prims, toPaper: vpe.toPaper } : undefined} />{/key}{/if}
</div>

<style>
	.surface { position: relative; width: 100%; height: 100%; overflow: hidden; background: white; }
	/* the drawing's words aren't page text: a double-click mustn't select them (it took the focus from the in-place edit box) */
	/* touch gestures are ours (editor/touch.ts): the browser must not scroll / zoom the page instead */
	.surface svg { user-select: none; -webkit-user-select: none; touch-action: none; }
	.surface.active { box-shadow: inset 0 0 0 1px #93c5fd; }
	.loading { position: absolute; top: 45%; left: 0; right: 0; text-align: center; font-size: 12px; color: #a1a1aa; pointer-events: none; }
	.vp-dim { fill: #ffffff; fill-opacity: 0.6; pointer-events: none; }
	.vp-edit { fill: none; stroke: #2563eb; stroke-width: 2.5; pointer-events: none; }
	.gridline { stroke: #e4e4e7; stroke-width: 0.5; }
	.gridline.major { stroke: #d4d4d8; stroke-width: 0.8; }
	.marquee { fill: rgba(59, 130, 246, 0.12); stroke: #2563eb; stroke-width: 1.5px; }
	.marquee.crossing { fill: rgba(16, 185, 129, 0.12); stroke: #059669; stroke-dasharray: 5 3; }
</style>
