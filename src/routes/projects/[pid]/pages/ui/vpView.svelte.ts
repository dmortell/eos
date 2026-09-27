// The Viewport's VIEW MODEL (R1 close-out, review.md §R1): everything a viewport knows about what it shows
// and where — props with their defaults, the viewBox ↔ screen mapping + pan/zoom, the ViewCtx, the layer
// predicates (model layers + VP Freeze), the per-viewport Selection, picking (entities, grips, model
// objects, guides, sections) and the derived grip / style bundles the render components read. The
// pointer/key state machine lives in ./vpInteraction.svelte.ts; Viewport.svelte is the shell + SVG skeleton.
// The pure geometry/hit/grip/snap logic stays in hit.ts / grips.ts / snap.ts / mapper.ts — this class only
// injects the view (`ctx`, tolerances, layer predicates) into them.
import { untrack } from 'svelte'
import { BASE, HANDLE_PX, PAPER_PX_PER_MM, clampViewZoom } from '../constants'
import { type Pt, type Ent, type View, type ElevDir, type ElevFrame, GROUND, PLAN_CX, PLAN_CY, frameOf, frameAxis, frameAngle, frameU, frameSpan, rectPts } from './geometry'
import { devObliqueFrame } from './devOblique'
import { makeMapper, type Mapper } from './mapper'
import { noopEditor, type Editor } from './editor'
import { idsOfKind, singleOfKind, type SelItem } from './selection'
import type { ViewCtx, MLayers } from './view'
import type { VpProps, VpKind } from './vpTypes'
import { pickSectionGrip, pickLineSectionGrip, pickElevGrip, modelGrips, pickModelGrip, gripsFor, type MGrip, type Grip, type GripOpts } from './grips'
import { SNAP_STEP, rndTo, snapNode, graphNodeApply, elevDepthSnap } from './snap'
import { barycentre, groupBox } from './groupXf'
import { connPoints, objPoints, type ConnPt } from '../3dview/connect'
import { inThisView, bbox, hitEnt, pickable, rotCenter, isFlatElev, graphNodeDraw, hitModel, isoPickFaces, viewMapOf, hitSection, hitGuide, type GN } from './hit'
import { hitIsoAnno } from './isoAnno'
import { isLayerHidden, isLayerLocked, layerColor, layerOrder } from '../layers.svelte'
import { MODEL_SPACE_INK, onDark } from './modelSpace'
import { models, modelById } from '../3dview/models.svelte'
import { setSectionDir, deleteSection, setSectionClip, patchSection, flipSection } from './modelEdit'
import { isLineSection, lineSectionDir, lineSectionGrips, lineSectionRegion, sectionTitle } from './sectionLine'
import { isElevMarker, elevMarkerDir, elevMarkerGrips, elevMarkerRegion, elevMarkerLine, ELEV_R } from './elevMarker'
import { imgEdit } from '../imageEdit.svelte'
import { DEFAULT_YAW, DEFAULT_PITCH, isoBounds, perspCam, objBounds, oclipOf, oclipFrame, type Persp } from '../3dview/projection'
import { BASIS, type Obj, type Clip, type OClip } from '../3dview/types'
import { storeyMap } from '../3dview/storeyMap'

export const INK = '#475569', SEL = '#0e7490'
const ELEV = new Set<string>(['front', 'rear', 'left', 'right'])
const DEFAULT_VIEW: View = { zoom: 1, x: 0, y: 0 }
const NONE: never[] = []
const CX = PLAN_CX, CY = PLAN_CY   // plan centre in mm (viewBox centre + scale pivot)

/** What a press grabs, in onDown's priority order (model grip → section grip → entity grip → entity body →
 *  guide → section border → model object → nothing/marquee). */
export type Pick =
	| { kind: 'mgrip'; grip: MGrip }
	| { kind: 'sgrip'; sg: { id: string; apply: (p: Pt) => SectionPatch } }
	| { kind: 'ggrip'; rot?: boolean; corner?: number }
	| { kind: 'grip'; id: string; gi: number }
	| { kind: 'ent'; id: string }
	| { kind: 'guide'; id: string }
	| { kind: 'section'; id: string }
	| { kind: 'obj'; id: string }
	| null

/** What a section grip / move drag writes: a box's clip, or a line section's ends / depth (modelEdit patchSection). */
export type SectionPatch = Record<string, unknown>

/** D13: the multi-selection's transform box (drawing units): its bbox, the barycentre pivot, the rotate
 *  handle and the four corners (each with the corner opposite it — the scale pivot). */
export type GroupXf = { box: [number, number, number, number]; pivot: Pt; rot: Pt; corners: { c: Pt; opp: Pt }[] }

export class VpView {
	/** The component's live $props() object (read lazily — every use below is inside a getter / $derived). */
	readonly p: VpProps
	constructor(p: VpProps) {
		this.p = p
		// MODEL SPACE zoom-to-extents: while the view is the untouched default (zoom 1, no pan — a fresh tab,
		// or after Fit) and the plan has background images (the floorplan), zoom + centre on their extents.
		$effect(() => {
			const e = this.backExtents, v = this.view, measured = !!this.boxW || this.vpW > 0   // wait until the pane size is known
			if (!this.modelSpace || this.kind !== 'plan' || !e || !measured || v.zoom !== 1 || v.x !== 0 || v.y !== 0) return
			untrack(() => this.zoomToBox(e.x0, e.y0, e.x1, e.y1, 0.92))
		})
	}
	/** Zoom + centre the content view on a drawing-coords box (ZOOM W, extents). */
	zoomToBox(x0: number, y0: number, x1: number, y1: number, margin = 1) {
		const ds = this.dscale, bw = (x1 - x0) * ds, bh = (y1 - y0) * ds
		if (!(bw > 0 && bh > 0) || !this.vbW || !this.vbH) return
		// the Viewport draws P at view + zoom·(C + dscale·(P − C)); centre the box's mid-point on C
		const zoom = clampViewZoom(Math.min(this.vbW / bw, this.vbH / bh) * margin)
		const mx = (x0 + x1) / 2, my = (y0 + y1) / 2
		this.on.view?.({ zoom, x: CX - zoom * (CX + ds * (mx - CX)), y: CY - zoom * (CY + ds * (my - CY)) })
	}

	// ── props (with their defaults) ──
	get label() { return this.p.label ?? 'Viewport' }
	get scale() { return this.p.scale ?? '1:1' }
	get kind(): VpKind { return this.p.kind ?? 'plan' }
	get active() { return this.p.active ?? false }
	get modelSpace() { return this.p.modelSpace ?? false }
	get frozen() { return this.p.frozen ?? NONE }
	get vpLocked() { return this.p.vpLocked ?? NONE }   // J1: layers locked in this viewport only
	get focused() { return this.p.focused ?? true }
	get tool() { return this.p.tool ?? 'Select' }
	get border() { return this.p.border ?? 'dashed' }
	get on() { return this.p.on ?? {} }
	/** The document editor — in a collapsed riser frame, shapes written back go through `#uncollapse` (real heights). */
	get editor(): Editor {
		const ed = this.p.editor ?? noopEditor; if (!this.collapse) return ed
		const un = (e: Ent) => this.#uncollapse(e)
		return { ...ed, ents: { ...ed.ents, add: (e) => ed.ents.add(un(e)), update: (e) => ed.ents.update(un(e)), updateMany: (es) => ed.ents.updateMany(es.map(un)) } }
	}
	/** The shapes as this view DRAWS them: in a riser frame with collapsed floors their heights are remapped
	 *  (`#collapsed`), so picking / grips / drags all work in drawn space — and `editor` maps writes back. */
	entities = $derived.by((): Ent[] => this.#collapsed(this.p.entities ?? NONE))
	get view(): View { return this.p.view ?? DEFAULT_VIEW }
	get clip() { return this.p.clip ?? null }
	get yaw() { return this.p.yaw ?? DEFAULT_YAW }
	get pitch() { return this.p.pitch ?? DEFAULT_PITCH }
	/** Phase 2 (elevation-section-plan.md): an elevation's EXPLICIT view frame — the `frame` prop, else the `oclip` prop's
	 *  cut-line frame (a section line / elevation marker hands these in, phases 3–4), else a DEV console angle
	 *  (ui/devOblique.ts); about the plan centre. null = the `kind` dir's own frame (every existing view). */
	obFrame = $derived.by((): ElevFrame | null => {
		if (!ELEV.has(this.kind)) return null
		if (this.p.frame) return this.p.frame
		if (this.p.oclip) return oclipFrame(this.p.oclip, [CX, CY])
		return devObliqueFrame(this.frameId)
	})
	/** Its ORIENTED clip: the `oclip` prop, else — an explicit frame over a section's box — the frame-aligned OClip
	 *  covering `clip` (projection oclipOf). null without an explicit frame (the axis `clip` path, unchanged). */
	oclip = $derived.by((): OClip | null => (!this.obFrame ? null : this.p.oclip ?? (this.clip ? oclipOf(this.clip, this.obFrame) : null)))
	/** The elevation's view frame: its explicit one, else the dir's about the plan centre (= ctxFrame(ctx)). */
	elevFrame = $derived.by(() => this.obFrame ?? frameOf(this.elevDir, CX, CY))
	/** An OBLIQUE view (a frame off the four axes): 3D objects are read-only in it until phase 5 (no grips / moves /
	 *  graph drawing; picking still selects). */
	oblique = $derived(!!this.obFrame && frameAxis(this.obFrame) === null)
	/** The elevation's name on its ground line: the `viewTitle` prop (a section line's "SECTION A–A′"), else the dir, or
	 *  an explicit frame's look angle. */
	elevLabel = $derived.by(() => this.p.viewTitle ?? (this.obFrame ? `${Math.round(frameAngle(this.obFrame) * 10) / 10}°` : this.elevDir.toUpperCase()))
	/** An elevation's GROUND LINE span (drawing u): the section clip along the view's axis (an oriented clip: its cut
	 *  line), else the visible model's extent (+ a margin), else a default — so a section's elevation doesn't draw a
	 *  ground line across the whole sheet. */
	groundSpan = $derived.by((): [number, number] => {
		if (this.kind === 'plan' || this.kind === 'iso') return [0, 0]
		const f = this.elevFrame, c = this.clip, oc = this.oclip, pts: Pt[] = []
		if (oc) { const a = frameU(f, oc.a), b = frameU(f, oc.b); return [Math.min(a, b), Math.max(a, b)] }
		if (c) pts.push(...rectPts(c.x0, c.y0, c.x1, c.y1))
		else for (const o of this.mdl?.objects ?? []) { if (!this.mlayers.visible(o)) continue; const b = objBounds(o); pts.push(...rectPts(b.x0, b.y0, b.x1, b.y1)) }
		const [a, b] = frameSpan(f, pts), pad = c ? 0 : 500
		if (!isFinite(a)) return [PLAN_CX - 20000, PLAN_CX + 20000]
		return [a - pad, b + pad]
	})
	/** The perspective camera (iso only), aimed at the model's visible content. */
	persp = $derived.by((): Persp => (this.p.persp && this.kind === 'iso' && this.mdl ? perspCam(this.mdl.objects, this.mlayers.visible) : null))
	get boxW() { return this.p.boxW }
	get boxH() { return this.p.boxH }
	get frameId() { return this.p.frameId }
	get modelId() { return this.p.modelId }
	// drafting flags (`env`)
	get acad() { return this.p.env?.acad ?? true }
	get navContent() { return this.p.env?.navContent ?? false }
	get navMode() { return this.p.env?.navMode ?? null }               // the nav bar's latched Pan / Orbit
	get blockId() { return this.p.env?.blockId }                       // D5: the block the 'Block' tool places
	get lwt() { return this.p.env?.lwt ?? true }
	get osnap() { return this.p.env?.osnap ?? true }
	get snap() { return this.p.env?.snap ?? false }                  // SNAP: round points to the grid step
	get snapStep() { return this.p.env?.snapStep || SNAP_STEP }       // the grid step (mm) — editable in the status bar
	get ortho() { return this.p.env?.ortho ?? false }                // ORTHO: constrain line-draw + move to H/V
	get polar() { return this.p.env?.polar ?? false }                // POLAR: snap the rubber band to 15° rays
	get otrack() { return this.p.env?.otrack ?? false }              // O9 OTRACK: line up with nearby snap points
	get wire2d() { return this.p.env?.wire ?? false }                 // WIRE: boxes pick by their outline only (plan / elevation)
	get centerDraw() { return this.p.env?.cen ?? false }             // CEN: draw rect/ellipse centre-out
	get canvasZoom() { return this.p.env?.canvasZoom ?? 1 }
	get mono() { return !!this.p.mono }                               // I2: a black-and-white viewport
	/** Guide orientation: the Guide tool's H/V pop-out (for touch) XOR Shift (mouse). true = vertical. */
	guideIsVert = (shift: boolean) => (this.p.env?.guideVert ?? false) !== shift

	// ── what this viewport shows ──
	isElev = $derived(ELEV.has(this.kind))
	elevDir = $derived((this.isElev ? this.kind : 'front') as ElevDir)
	isPlan = $derived(this.kind === 'plan')
	// iso (oblique) editing deferred to the 3D camera; a riser frame with collapsed floors (`storeys`) is view-only
	// — its picking / grips would sit at the uncollapsed heights (edit in the model tab)
	// — and an OBLIQUE elevation is read-only for 3D objects until phase 5 (its grips would edit x / w or y / d)
	modelEditable = $derived.by(() => (this.isPlan || this.isElev) && !this.p.storeys && !this.oblique)
	/** Guide lines belong to a drawable VIEW space (plan or an elevation); iso has none — nor has an oblique view (a
	 *  guide's `plane` is an ElevDir; its drawn position means nothing through another frame). */
	viewSpace = $derived(this.kind === 'plan' ? 'plan' : this.isElev && !this.oblique ? this.elevDir : null)
	/** The model the `modelId` prop asks for is ARCHIVED or unknown (drawings-plan §2.3): the viewport shows a
	 *  "Missing model" placeholder instead of quietly falling back to another model. */
	missing = $derived.by((): { name: string | null; unmapped?: string } | null => {
		if (this.p.unmapped) return { name: null, unmapped: this.p.unmapped }   // an imported frame with no Pages model yet
		const id = this.modelId; if (id == null) return null
		const m = modelById(id)
		return !m ? { name: null } : m.archived ? { name: m.name } : null
	})
	mdl = $derived(this.missing ? undefined : (modelById(this.modelId) ?? models[0]))   // the model this viewport renders/edits (§5 registry)

	// ── layers: ONE list per model files both its objects and its entities (R5). Hidden = the model's layer
	// is off, OR it is frozen in this viewport (VP Freeze) — everything that hides (paint, grips, picking,
	// snapping, Model3d) goes through this. ──
	mls = $derived(this.mdl?.layers ?? [])
	frozenSet = $derived(new Set(this.frozen))
	isLayerHidden = (id?: string) => isLayerHidden(this.mls, id) || (!!id && this.frozenSet.has(id))
	// J1 VP Lock: locked in the model OR in this viewport only (picking / grips / snapping all ask this)
	vpLockedSet = $derived(new Set(this.vpLocked))
	isLayerLocked = (id?: string) => isLayerLocked(this.mls, id) || (!!id && this.vpLockedSet.has(id))
	layerColor = (id?: string) => layerColor(this.mls, id)
	layerDash = (id?: string) => (id ? this.mls.find((l) => l.id === id)?.dash : undefined)   // XP32 ByLayer line type
	layerPreds = { hidden: this.isLayerHidden, locked: this.isLayerLocked }
	/** Model-object predicates: a hidden layer's objects don't show, a locked one's can't be picked (B16). */
	mlayers: MLayers = { visible: (o: Obj) => !this.isLayerHidden(o.layer), locked: (o: Obj) => this.isLayerLocked(o.layer) }
	viewGuides = $derived(this.viewSpace ? (this.mdl?.guides ?? []).filter((g) => g.plane === this.viewSpace) : [])

	// ── the per-VIEWPORT Selection (R3): every kind comes from `editor.sel`. `modelSel` carries obj + guide +
	// node ids together (a node's `.id` is its PARENT object's id) so grips/Model3d highlighting keep working
	// when a node is selected. ──
	selection = $derived(this.editor.sel.get())
	sel = $derived(idsOfKind(this.selection, 'ent'))
	selSet = $derived(new Set(this.sel))
	modelSel = $derived([...idsOfKind(this.selection, 'obj'), ...idsOfKind(this.selection, 'guide'), ...idsOfKind(this.selection, 'node'), ...idsOfKind(this.selection, 'seg')])
	selSection = $derived(singleOfKind(this.selection, 'section')?.id ?? null)
	selectEnts = (ids: string[]) => this.editor.sel.only(ids.map((id): SelItem => ({ kind: 'ent', id })))
	toggleEnts = (ids: string[]) => this.editor.sel.toggle(ids.map((id): SelItem => ({ kind: 'ent', id })))
	selectObj = (id: string) => this.editor.sel.only([{ kind: 'obj', id }])
	toggleObj = (id: string) => this.editor.sel.toggle([{ kind: 'obj', id }])   // I4: Ctrl/Shift-click adds a model object
	selectGuide = (id: string) => this.editor.sel.only([{ kind: 'guide', id }])
	selectSection = (id: string) => this.editor.sel.only([{ kind: 'section', id }])
	selectNode = (objId: string, nodeId: string) => this.editor.sel.only([{ kind: 'node', id: objId, sub: nodeId }])
	/** One segment of a wall / conduit (its parent is already selected — the second click on the run). */
	selectSeg = (objId: string, segId: string) => this.editor.sel.only([{ kind: 'seg', id: objId, sub: segId }])
	/** The selected segment, drawn highlighted: its two ends in drawing coords. */
	segSel = $derived.by((): { obj: string; seg: string; a: Pt; b: Pt } | null => {
		const it = singleOfKind(this.selection, 'seg'), o = it && this.mdl?.objects.find((x) => x.id === it.id)
		if (!it || !o || (o.type !== 'wall' && o.type !== 'conduit')) return null
		const s = (o.segments as { id: string; a: string; b: string }[]).find((x) => x.id === it.sub), nm = new Map((o.nodes as GN[]).map((n) => [n.id, n]))
		const a = s && nm.get(s.a), b = s && nm.get(s.b); if (!a || !b) return null
		return { obj: it.id, seg: it.sub!, a: graphNodeDraw(this.ctx, a), b: graphNodeDraw(this.ctx, b) }
	})
	clearSel = () => this.editor.sel.clear()
	/** A fresh press "forgets" a specific NODE pick, falling back to the (still selected) object it belongs to. */
	demoteNodeToObj = () => { const n = singleOfKind(this.selection, 'node'); if (n) this.selectObj(n.id) }

	// ── viewBox ↔ screen. A viewport is a fixed-SCALE window into model space (like an AutoCAD viewport):
	// pxPerUnit px on screen = 1 model unit at zoom 1, whatever the frame size — resizing the frame reveals/
	// crops more model. The viewBox is sized to the container and centred on the plan (CX,CY); the parent
	// passes boxW/boxH when it owns the size (a paper frame), else Viewport measures via bind:clientWidth.
	// Mapping uses getBoundingClientRect, NOT getScreenCTM (which ignores CSS transforms on HTML ancestors,
	// i.e. the zoomed canvas). ──
	svg = $state<SVGSVGElement | undefined>()
	vpW = $state(0)
	vpH = $state(0)
	/** Drawing SCALE 1:N scales the content about the plan centre. */
	dscale = $derived(1 / (parseInt((this.scale || '1:1').split(':')[1] || '1') || 1))
	/** A PAPER frame uses PAPER_PX_PER_MM so 1 model unit = 1 paper mm at 1:1 → true 1:N (B2); a standalone
	 *  viewport keeps the arbitrary on-screen BASE. */
	pxPerUnit = $derived(this.boxW ? PAPER_PX_PER_MM : BASE)
	vbW = $derived(((this.boxW ?? this.vpW) || 400) / this.pxPerUnit)
	vbH = $derived(((this.boxH ?? this.vpH) || 250) / this.pxPerUnit)
	minX = $derived(CX - this.vbW / 2)
	minY = $derived(CY - this.vbH / 2)
	readonly cx = CX
	readonly cy = CY
	/** Per-instance namespace for <clipPath> ids (a sheet renders the same image in several viewports). */
	readonly clipNs = 'ic' + Math.floor(Math.random() * 1e9).toString(36)
	/** Point ↔ screen math (ui/mapper.ts) from ONE layout read — a hit/snap loop builds it once per pass (P1). */
	mapper(): Mapper | null {
		if (!this.svg) return null
		return makeMapper({ rect: this.svg.getBoundingClientRect(), vbW: this.vbW, minX: this.minX, minY: this.minY, cx: CX, cy: CY, view: this.view, dscale: this.dscale })
	}
	/** Client px → model coords. */
	toModel(clientX: number, clientY: number): Pt | null { const m = this.mapper(); return m ? m.toModel(clientX, clientY) : null }
	/** Model coords → client px. */
	toClient(x: number, y: number): { x: number; y: number } | null { const m = this.mapper(); return m ? m.toClient(x, y) : null }
	/** Pick tolerance in MODEL mm for `px` screen pixels (B9) — one helper for every hit + snap test. */
	tolMm = (px: number) => { const m = this.mapper(); return m ? m.tolMm(px) : px / (this.dscale || 1) }
	private vbMap(): { scale: number; left: number; top: number } | null {
		if (!this.svg) return null
		const r = this.svg.getBoundingClientRect()
		return { scale: r.width / this.vbW, left: r.left, top: r.top }   // px per viewBox unit (incl. canvas zoom)
	}
	/** Pan/zoom the viewport content (the SVG group transform, in viewBox units). */
	onPan = (dx: number, dy: number) => {
		const m = this.vbMap(); if (!m) return
		const v = this.view
		this.on.view?.({ zoom: v.zoom, x: v.x + dx / m.scale, y: v.y + dy / m.scale })
	}
	/** Wheel-zoom FREE-zooms this viewport's own content view (keyed per pane+tab), so zooming one split pane
	 *  never touches the other; the drawing scale changes only via the scale selector. */
	onZoom = (f: number, clientX: number, clientY: number) => {
		const m = this.vbMap(); if (!m) return
		const vx = this.minX + (clientX - m.left) / m.scale, vy = this.minY + (clientY - m.top) / m.scale   // cursor in viewBox coords
		const v = this.view, nz = clampViewZoom(v.zoom * f), r = nz / v.zoom
		this.on.view?.({ zoom: nz, x: vx - (vx - v.x) * r, y: vy - (vy - v.y) * r })
	}

	// ── BACKGROUND shapes: shapes on a layer in the 'Background' group (a floor's calibrated floorplan PDF is an
	// image shape there) paint UNDER the 3D model, like an xref; everything else paints over it. Their visible
	// rect (crop window) is the model-space zoom-to-extents box. ──
	isBackLayer = (id?: string) => !!id && this.mls.find((l) => l.id === id)?.group === 'Background'
	backEnts = $derived.by(() => this.paintEnts.filter((e) => this.isBackLayer(e.layer)))
	frontEnts = $derived.by(() => this.paintEnts.filter((e) => !this.isBackLayer(e.layer)))
	backExtents = $derived.by(() => {
		if (this.kind !== 'plan') return null
		const rs = this.backEnts.filter((e) => e.type === 'image' && e.a && e.b && !this.isLayerHidden(e.layer) && this.inThisView(e)).map((e) => {
			const x = Math.min(e.a![0], e.b![0]), y = Math.min(e.a![1], e.b![1]), w = Math.abs(e.b![0] - e.a![0]), h = Math.abs(e.b![1] - e.a![1])
			const c = e.crop ?? { x: 0, y: 0, w: 1, h: 1 }
			return { x: x + c.x * w, y: y + c.y * h, w: c.w * w, h: c.h * h }
		})
		if (!rs.length) return null
		const x0 = Math.min(...rs.map((r) => r.x)), y0 = Math.min(...rs.map((r) => r.y))
		return { x0, y0, x1: Math.max(...rs.map((r) => r.x + r.w)), y1: Math.max(...rs.map((r) => r.y + r.h)) }
	})

	// ── the view context every hit/grip/snap/place function takes (ui/view.ts) ──
	/** Model mm per paper mm — ANNOTATIVE sizes (dim text/arrows, cloud bumps, text, section labels) are a
	 *  fixed size ON PAPER (B3), unlike gripSize which is screen-constant. */
	paperMm = $derived(1 / (this.dscale || 1))
	ctx = $derived<ViewCtx>({ dir: this.kind, isPlan: this.isPlan, isElev: this.isElev, isIso: this.kind === 'iso', elevDir: this.elevDir, cx: CX, cy: CY, ground: GROUND, frameId: this.frameId, paperMm: this.paperMm, mdl: this.mdl, yaw: this.yaw, pitch: this.pitch, persp: this.persp,
		...(this.obFrame ? { frame: this.obFrame, oclip: this.oclip ?? undefined } : {}) })   // an explicit (oblique) view frame — ctxFrame / ctxProj
	inThisView = (e: Ent) => inThisView(this.ctx, e)
	bbox = (e: Ent) => bbox(this.ctx, e)
	/** A hidden or locked layer's entities can't be picked; nor can entities that don't belong to this view. */
	// (a riser frame with collapsed floors: shapes are picked in drawn space — `entities` — and written back unmapped)
	pickable = (e: Ent) => pickable(this.ctx, e, this.layerPreds)
	/** Grips are a CONSTANT screen size (HANDLE_PX) whatever the view/canvas zoom or drawing scale. */
	gripSize = $derived(HANDLE_PX / this.pxPerUnit / this.view.zoom / (this.canvasZoom || 1) / (this.dscale || 1))
	/** Everything EntRender reads, built ONCE so every entity gets the same reference. B31: on dark model
	 *  space the ByLayer ink is light and too-dark colours are lifted (ui/modelSpace.ts). */
	entStyle = $derived(this.modelSpace
		? { lwt: this.lwt, canvasZoom: this.canvasZoom, paperMm: this.paperMm, gripSize: this.gripSize, ink: MODEL_SPACE_INK, sel: SEL, layerColor: this.layerColor, layerDash: this.layerDash, adapt: onDark, mono: this.mono }
		: { lwt: this.lwt, canvasZoom: this.canvasZoom, paperMm: this.paperMm, gripSize: this.gripSize, ink: INK, sel: SEL, layerColor: this.layerColor, layerDash: this.layerDash, mono: this.mono })

	/** PAINT ORDER = layer order first (earlier layer = underneath), then array position within a layer; no
	 *  layer / unknown → on top. P6: an O(n) check skips the sort when already in order (the common case). */
	paintEnts = $derived.by(() => {
		const ents = this.entities   // already collapsed (a riser frame)
		const ord = (e: Ent) => { const lo = layerOrder(this.mls, e.layer); return lo < 0 ? 1e9 : lo }
		let sorted = true
		for (let i = 1; i < ents.length && sorted; i++) if (ord(ents[i]) < ord(ents[i - 1])) sorted = false
		if (sorted) return ents
		return ents.map((e, i) => ({ e, i, o: ord(e) })).sort((a, b) => a.o - b.o || a.i - b.i).map((x) => x.e)
	})
	/** A riser drawing (a building elevation showing only some floors — the frame's `storeys`): the storey collapse
	 *  (3dview/storeyMap.ts) Model3d applies to objects, here for shapes drawn in THIS elevation (drawing y =
	 *  GROUND − z): their heights are remapped. null = no collapse. */
	collapse = $derived.by(() => {
		const st = this.mdl?.storeys
		return this.isElev && this.p.storeys && st?.length ? storeyMap(st, this.p.storeys) : null
	})
	#collapsed(ents: Ent[]): Ent[] {
		const sm = this.collapse; if (!sm) return ents
		const vs = BASIS[this.elevDir].vs
		const y = (v: number) => GROUND - vs * sm.map(vs * (GROUND - v))
		const pt = (p: Pt): Pt => [p[0], y(p[1])]
		return ents.map((e) => (e.plane !== this.kind ? e : { ...e, a: e.a && pt(e.a), b: e.b && pt(e.b), pts: e.pts?.map(pt), leader: e.leader && pt(e.leader) }))
	}
	/** The inverse of `#collapsed` for one shape (drawn heights → real ones). */
	#uncollapse(e: Ent): Ent {
		const sm = this.collapse; if (!sm || e.plane !== this.kind) return e
		const vs = BASIS[this.elevDir].vs
		const pt = (p: Pt): Pt => [p[0], GROUND - vs * sm.unmap(vs * (GROUND - p[1]))]
		const out: Ent = { ...e, a: e.a && pt(e.a), b: e.b && pt(e.b), pts: e.pts?.map(pt), leader: e.leader && pt(e.leader) }
		for (const k of ['a', 'b', 'pts', 'leader'] as const) if (out[k] === undefined) delete out[k]
		return out
	}
	/** The top-most pickable entity at p (≈3.5 screen px of slack either side of a line), scanning in PAINT
	 *  order (B7) so what's drawn on top wins. */
	hit(p: Pt): string[] {
		const thr = this.tolMm(3.5), pe = this.paintEnts
		for (let i = pe.length - 1; i >= 0; i--) if (this.pickable(pe[i]) && hitEnt(this.ctx, pe[i], p, thr)) return [pe[i].id]
		return []
	}
	/** EVERY pickable entity at p, top-most first (the click-cycle's candidates). */
	hitAll(p: Pt): string[] {
		const thr = this.tolMm(3.5), pe = this.paintEnts, out: string[] = []
		for (let i = pe.length - 1; i >= 0; i--) if (this.pickable(pe[i]) && hitEnt(this.ctx, pe[i], p, thr)) out.push(pe[i].id)
		return out
	}
	/** Expand ids to every member of any group they touch (a group selects as one). */
	expandGroup(ids: string[]): string[] {
		const gids = new Set(ids.map((id) => this.entities.find((e) => e.id === id)?.groupId).filter(Boolean) as string[])
		if (!gids.size) return ids
		const out = new Set(ids)
		for (const e of this.entities) if (e.groupId && gids.has(e.groupId)) out.add(e.id)
		return [...out]
	}

	// ── 3D MODEL objects (walls / prisms / conduits) — picked and edited in the plan + the four elevations
	// through the same projection Model3d draws with. ──
	graphNodeDraw = (n: GN) => graphNodeDraw(this.ctx, n)
	rndSnap = (v: number) => rndTo(v, this.snap ? this.snapStep : 0)   // grid-round when SNAP is on
	/** The object-snap marker (□ end · △ mid · ○ centre · ◇ quadrant), set by whatever snapped last. */
	snapMark = $state<{ p: Pt; type: string } | null>(null)
	/** Live Shift state (aspect lock / 15° steps read it mid-drag). */
	shiftDown = $state(false)
	/** Move a wall/conduit node to p (node-snap ~10 px, pull-apart ~8 px around the drag origin). */
	graphNodeApply = (n: GN, p: Pt, origin?: Pt) => {
		this.snapMark = graphNodeApply(this.ctx, n, p, { snapNode: (q, ex, o) => snapNode(this.ctx, q, ex, this.tolMm(10), this.tolMm(8), this.mlayers, o), rnd: this.rndSnap }, origin)
	}
	hitModel = (p: Pt) => hitModel(this.ctx, p, this.tolMm(4), this.mlayers, this.wire2d)
	/** Elevation depth-snap: the wall/conduit segment a drawn point snaps its DEPTH onto (~12 px). */
	elevDepthSnap = (p: Pt) => elevDepthSnap(this.ctx, p, this.tolMm(12), this.mlayers)
	/** P4: the iso pick faces, projected once per model / orbit / layer change. */
	isoFaces = $derived(this.kind === 'iso' ? isoPickFaces(this.ctx, this.mlayers) : [])
	/** Plan (x,y,z) → iso drawing coords (Model3d's mapping, R7), to lay plan 2D shapes on the ground (or at their z). */
	isoGround = $derived.by(() => {
		if (this.kind !== 'iso' || !this.mdl) return null
		const b = isoBounds(this.mdl.objects, this.yaw, this.pitch, CX, CY, this.mlayers.visible, this.persp); if (!b) return null
		const vm = viewMapOf(this.ctx, b)
		return (x: number, y: number, z = 0): Pt => vm.toDraw({ x, y, z })   // a shape's height above the floor (Ent.z) lifts it
	})
	/** ISO: the screen-facing callout / legend under p (ui/isoAnno.ts), on a shown + unlocked layer. `back` = the
	 *  background-layer ones, drawn UNDER the model (so the click tries them after its faces); else the front ones,
	 *  drawn over it (tried first). */
	hitIsoAnno = (p: Pt, back = false) => hitIsoAnno(this.ctx, back ? this.backEnts : this.frontEnts, this.isoGround, p, this.tolMm(3.5),
		(e) => !this.isLayerHidden(e.layer) && !this.isLayerLocked(e.layer))

	// ── section markers (B5: they live in the MODEL; edits mutate it in place, bracketed on its history) ──
	sections = $derived(this.isPlan ? (this.mdl?.sections ?? []) : [])
	/** The building STRUCTURE in an elevation, from the storeys: each floor's slab (a band) + raised floor (a line) on
	 *  layer A-FLOR, its ceiling (a line) on A-CLNG — only while those layers are on. Spans the model's footprint
	 *  along this view's axis; a riser frame's collapsed floors are skipped / remapped like everything else. */
	structure = $derived.by(() => {
		const m = this.mdl, st = m?.storeys
		if (!m || !this.isElev || !st?.length) return null
		const has = (id: string) => this.mls.some((l) => l.id === id) && !this.isLayerHidden(id)
		const showF = has('a-flor'), showC = has('a-clng'); if (!showF && !showC) return null
		const pts: Pt[] = []
		for (const o of m.objects) {
			if (o.type === 'prism') pts.push(...rectPts(o.x, o.y, o.x + o.w, o.y + o.d))
			else if (o.type === 'wall' || o.type === 'conduit') for (const n of o.nodes as GN[]) pts.push([n.x, n.y])
		}
		if (!pts.length) return null
		const [ua, ub] = frameSpan(this.elevFrame, pts)
		const x0 = ua - 500, x1 = ub + 500
		const sm = this.collapse, vs = BASIS[this.elevDir].vs, y = (z: number) => GROUND - vs * (sm ? sm.map(z) : z)
		const slabs: { y0: number; y1: number }[] = [], floors: number[] = [], ceilings: number[] = []
		for (const s of st) {
			if (sm?.hidden(s.z, s.z + (s.ceilingSlab ?? 3000))) continue
			if (showF && s.slab) { const a = y(s.z - s.slab), b = y(s.z); slabs.push({ y0: Math.min(a, b), y1: Math.max(a, b) }) }
			if (showF && s.raisedFloor) floors.push(y(s.z + s.raisedFloor))
			if (showC && s.ceilingTile) ceilings.push(y(s.z + s.ceilingTile))
		}
		return { x0, x1, slabs, floors, ceilings, floorColor: this.layerColor('a-flor') }   // (lines: fixed darker tones, VpMarks)
	})
	selSectionObj = $derived(this.isPlan && this.selSection ? this.sections.find((s) => s.id === this.selSection) ?? null : null)
	setSectionClip = (id: string, clip: Clip) => { if (this.mdl) setSectionClip(this.mdl, id, clip) }   // inside a drag gesture (the caller records the step)
	/** A section drag's patch (a box's clip, a line's ends / depth) — inside the gesture, which records the step. */
	patchSection = (id: string, patch: SectionPatch) => { if (this.mdl) patchSection(this.mdl, id, patch) }
	setSectionDir = (id: string, dir: ElevDir) => { if (this.mdl) setSectionDir(this.mdl, this.editor.edit, id, dir) }
	/** A LINE section looks the other way (its end arrows / toolbar / Properties), an elevation marker turns round —
	 *  one undo step. */
	flipSection = (id: string) => { if (this.mdl) flipSection(this.mdl, this.editor.edit, id) }
	/** The plan marks' annotative unit (drawing mm per paper mm) — section-line arrows, elevation-marker callouts — never
	 *  smaller on screen than a clickable ~4 px; their hit-test and grips use the same, so what's drawn is what's hit. */
	markU = $derived(Math.max(this.paperMm, this.tolMm(4)))
	/** Delete a section — unless it still drives sheet viewports: then the page ASKS (keep them as plain elevations /
	 *  delete them too) and does the delete itself (editor.sections.askDelete). */
	deleteSection = (id: string) => {
		if (this.editor.sections.askDelete(id)) return
		if (this.mdl && deleteSection(this.mdl, this.editor.edit, id) && this.selSection === id) this.clearSel()
	}
	hitSection = (p: Pt) => hitSection(this.ctx, this.sections, p, this.tolMm(6), this.markU)
	hitGuide = (p: Pt) => hitGuide(this.viewGuides, p, this.tolMm(6))
	/** The selected section's floating toolbar position (.vp-local px), tracking pan/zoom/resize — at a box's top-left, a
	 *  line's top-left bounds, a marker's callout + region bounds — plus what it shows: a box's sight dir, a line's flip / a
	 *  marker's turn, and the viewports it drives. */
	secToolbar = $derived.by(() => {
		void this.view; void this.canvasZoom; void this.vpW; void this.vpH   // deps: reposition on pan/zoom/resize
		const s = this.selSectionObj, svg = this.svg
		if (!this.active || !s || !svg) return null
		const R = ELEV_R * this.markU, mb = isElevMarker(s) ? [...elevMarkerRegion(s), [s.at[0] - R, s.at[1] - R] as Pt] : null
		const at: Pt = isLineSection(s) ? [Math.min(s.a[0], s.b[0]), Math.min(s.a[1], s.b[1])]
			: mb ? [Math.min(...mb.map((q) => q[0])), Math.min(...mb.map((q) => q[1]))]
			: s.kind === 'elev' ? s.at : [Math.min(s.clip.x0, s.clip.x1), Math.min(s.clip.y0, s.clip.y1)]
		const sp = this.toClient(at[0], at[1]); if (!sp) return null
		const r = svg.getBoundingClientRect()
		// client px → .vp-LOCAL px: on a zoomed sheet the viewport is CSS-scaled, so divide by its on-screen scale (else the
		// toolbar lands far from the box — Dave, Zone 3303 elevations)
		const k = this.vpW ? r.width / this.vpW : 1
		// `line`: ONE view (a line section or an elevation marker — drop again = another linked viewport; flip / turn)
		return { x: (sp.x - r.left) / (k || 1), y: (sp.y - r.top) / (k || 1), id: s.id, line: s.kind === 'line' || s.kind === 'elev', elev: s.kind === 'elev',
			dir: isLineSection(s) ? lineSectionDir(s) : s.kind === 'elev' ? elevMarkerDir(s) : s.dir,
			title: sectionTitle(s), links: this.editor.sections.links(s.id) }
	})
	/** The selected LINE section's grips (ends + depth handle) and its cut region, for VpMarks. */
	lineSecSel = $derived.by(() => { const s = this.selSectionObj; return s && isLineSection(s) ? { grips: lineSectionGrips(s), region: lineSectionRegion(s) } : null })
	/** The selected ELEVATION MARKER's grips (turn · band ends · depth), the region it sees and its cut line, for VpMarks. */
	elevSecSel = $derived.by(() => {
		const s = this.selSectionObj; if (!s || !isElevMarker(s)) return null
		const ln = elevMarkerLine(s)
		return { grips: elevMarkerGrips(s, this.markU), region: elevMarkerRegion(s), cut: [ln.a, ln.b] as [Pt, Pt] }
	})

	// ── grips ──
	/** The single selected model object (drives model-grip render + pick). */
	mSelObj = $derived.by(() => (this.modelEditable && this.modelSel.length === 1 ? this.mdl?.objects.find((x) => x.id === this.modelSel[0]) ?? null : null))
	/** A single wall/conduit NODE selected (clicked, not dragged) — only valid while its parent is selected. */
	nodeSelValid = $derived.by(() => {
		const it = singleOfKind(this.selection, 'node'), o = this.mSelObj as { id?: string; nodes?: GN[] } | null
		return it && o?.id === it.id && o.nodes?.some((n) => n.id === it.sub) ? { obj: it.id, node: it.sub! } : null
	})
	/** P6: the selected model object's grips, once per object / view change — shared by render and pick. */
	mGrips = $derived(this.mSelObj ? modelGrips(this.ctx, this.mSelObj, { rnd: this.rndSnap, applyNode: this.graphNodeApply, shift: () => this.shiftDown, gripMm: this.gripSize }) : [])
	gripOpts = (): GripOpts => ({ gripMm: this.gripSize, shift: () => this.shiftDown, imgCropId: imgEdit.mode === 'crop' ? imgEdit.id : null })
	gripsFor = (e: Ent): Grip[] => gripsFor(this.ctx, e, this.gripOpts())
	/** F6: the connection points to show as × (plan): all of them while drawing a trunk / pipe or with a conduit
	 *  selected (to drop its nodes on); a selected box's own. */
	connMarks = $derived.by((): ConnPt[] => {
		const m = this.mdl; if (!m || !this.active || !this.isPlan) return []
		const sel = this.mSelObj
		if (this.tool === 'Trunk' || this.tool === 'Pipe' || (this.tool === 'Select' && sel?.type === 'conduit')) return connPoints(m, sel?.type === 'conduit' ? sel.id : undefined)
		return this.tool === 'Select' && (sel?.type === 'prism' || sel?.type === 'wall') ? objPoints(sel) : []
	})
	/** D13: two or more editable shapes selected (Select tool) → ONE group transform box replaces their own grips:
	 *  corner handles scale all about the opposite corner, the top handle rotates all about the barycentre. */
	groupSel = $derived.by((): Ent[] => {
		if (!this.active || this.tool !== 'Select' || this.sel.length < 2 || this.ctx.isIso) return []
		const es = this.entities.filter((e) => this.selSet.has(e.id))
		return es.length >= 2 && es.every((e) => this.inThisView(e) && !this.isLayerHidden(e.layer) && !this.isLayerLocked(e.layer) && !isFlatElev(this.ctx, e)) ? es : []
	})
	groupXf = $derived.by((): GroupXf | null => {
		const es = this.groupSel; if (!es.length) return null
		const box = groupBox(es, this.bbox), [x0, y0, x1, y1] = box
		const corners: Pt[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
		return { box, pivot: barycentre(es, (e) => rotCenter(this.ctx, e)), rot: [(x0 + x1) / 2, y0 - this.gripSize * 6],
			corners: corners.map((c, i) => ({ c, opp: corners[(i + 2) % 4] })) }
	})
	/** P6: the SELECTED entities' grips, shared by the grip render and `pickAt` (none while the group box shows). */
	selGrips = $derived(this.groupXf ? new Map<string, Grip[]>() : new Map(this.sel.flatMap((id) => { const e = this.entities.find((x) => x.id === id); return e ? [[id, this.gripsFor(e)] as const] : [] })))

	/** What a press at these client coords grabs (`p` = the same point in model coords), in priority order.
	 *  One mapper (one layout read) serves every grip test (P1). Hover asks the same question (P2). */
	pickAt(clientX: number, clientY: number, p: Pt): Pick {
		const m = this.mapper(); if (!m) return null
		if (this.mSelObj) { const g = pickModelGrip(m, this.mGrips, clientX, clientY); if (g) return { kind: 'mgrip', grip: g } }
		const ss = this.selSectionObj
		if (ss && isLineSection(ss)) { const sg = pickLineSectionGrip(m, ss, clientX, clientY, () => this.shiftDown); if (sg) return { kind: 'sgrip', sg } }
		else if (ss && isElevMarker(ss)) { const sg = pickElevGrip(m, ss, clientX, clientY, this.markU, () => this.shiftDown); if (sg) return { kind: 'sgrip', sg } }
		else if (ss) { const sg = pickSectionGrip(m, ss, clientX, clientY); if (sg) return { kind: 'sgrip', sg: { id: sg.id, apply: (p: Pt) => ({ clip: sg.apply(p) }) } } }
		const gx = this.groupXf
		if (gx) {
			const near = (q: Pt) => { const sp = m.toClient(q[0], q[1]); return Math.hypot(sp.x - clientX, sp.y - clientY) < 14 }
			if (near(gx.rot)) return { kind: 'ggrip', rot: true }
			const k = gx.corners.findIndex((c) => near(c.c)); if (k >= 0) return { kind: 'ggrip', corner: k }
		}
		for (const id of this.sel) {
			const gs = this.selGrips.get(id) ?? []
			for (let i = 0; i < gs.length; i++) { const sp = m.toClient(gs[i].x, gs[i].y); if (Math.hypot(sp.x - clientX, sp.y - clientY) < 14) return { kind: 'grip', id, gi: i } }
		}
		const ids = this.hit(m.toModel(clientX, clientY)); if (ids.length) return { kind: 'ent', id: ids[0] }
		const gid = this.hitGuide(p); if (gid) return { kind: 'guide', id: gid }
		const sid = this.hitSection(p); if (sid) return { kind: 'section', id: sid }
		const mid = this.hitModel(p); if (mid) return { kind: 'obj', id: mid }
		return null
	}

	// ── image calibration marks ──
	/** The image being calibrated is only shown here if its layer is visible AND it belongs to this view. */
	editImgVisible = $derived.by(() => {
		if (!imgEdit.id) return false
		const img = this.entities.find((e) => e.id === imgEdit.id)
		return !!img && !this.isLayerHidden(img.layer) && this.inThisView(img)
	})
	/** The origin anchor of the selected / being-edited image (null when hidden or not in this view). */
	originMark = $derived.by(() => {
		const img = this.entities.find((e) => e.type === 'image' && e.origin && !this.isLayerHidden(e.layer) && this.inThisView(e) && (this.selSet.has(e.id) || imgEdit.id === e.id))
		if (!img?.origin) return null
		const rx = Math.min(img.a![0], img.b![0]), ry = Math.min(img.a![1], img.b![1]), rw = Math.abs(img.b![0] - img.a![0]), rh = Math.abs(img.b![1] - img.a![1])
		return [rx + img.origin.x * rw, ry + img.origin.y * rh] as Pt
	})
}
