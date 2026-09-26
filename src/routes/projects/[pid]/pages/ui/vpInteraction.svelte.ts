// The Viewport's pointer/keyboard STATE MACHINE (R1 close-out, review.md §R1): drafting (Kestrel-style
// click-to-place with a rubber band, or EOS press-drag), Select-tool picking + every press-drag gesture
// (entity move/grip/duplicate, model body/grip/branch, section move/resize, guide drag, iso orbit,
// marquee), in-place text editing, image calibration, and the prompt/status line. Reads the view through
// `v` (./vpView.svelte.ts); drags run on ui/gestures.ts `beginPointerDrag` through one DragRegistry, so a
// second finger (2-finger pan/zoom) cancels whatever is in flight.
//
// Svelte delegation gotchas kept from the Viewport: (a) `onDown`/`onClick` bail on `.section-arrow.pick`
// (delegated handlers ignore the arrow's own stopPropagation); (b) right-button presses never reach the
// delegated onpointerdown because panzoom stops them — hence the capture-phase `noteRightDown`.
import { tick, untrack } from 'svelte'
import { toast } from 'svelte-sonner'
import { PT_MM } from '../constants'
import { type Pt, type Ent, type View, STYLE_DEFAULTS, ELEV_BASIS, dist, elevU, elevUInv, isNote } from './geometry'
import { orbitShift, isoBounds, objBounds } from '../3dview/projection'
import { beginPointerDrag, DragRegistry } from './gestures'
import { drawPlane, buildEnt, sectionObj, sectionName, PRISM_TOOL, trimTail, polylineEnt, graphObj, prismObj, guideObj, imageWithOrigin, imageScaled, moveEnt } from './place'
import { addModelObj, insertGraphNode, branchNode, addGuide, addSection } from './modelEdit'
import { constrainGrip, snapAngle } from './grips'
import { rotateAbout, scaleAbout, cornerScale, barycentre, mirrorAbout } from './groupXf'
import { cmdBus, type VpCommandTarget, type Xf } from './cmdBus.svelte'
import { cptPick } from './cptPick.svelte'
import { explodeEnt } from './explode'
import { rackHeightMm } from '../store/racksImport'
import { uvAt, DEFAULT_CPTS } from '../3dview/connect'
import { auditGraph, fixGraph } from '../3dview/graphAudit'
import { coincidentNodes } from '../3dview/graphJoin'
import { commitConduit, translateObj, objSnapDelta, applyObjMoves, endObjMove, moveModelGrip, dropNodeJoin, type MGripDrag } from './vpModelEdit'
import { snapToGrid, snapDelta, findSnap, drawPoint } from './snap'
import { rotCenter, bbox, hitIsoFaces, marqueeSelect, marqueeModel, graphSegAt, viewMapOf, type GN } from './hit'
import { newId } from '../ids'
import { constrainPt, lineLabelAt } from './annotations'
import { textDialog } from './textDialog.svelte'
import { trunkSpecs, specProfile } from './trunkSpec.svelte'
import { openingSpec } from './openingSpec.svelte'
import { idsOfKind } from './selection'
import { pasteCopies, relabelCopies, pasteObjCopies } from './clipboard'
import { ItemEditor, type ItemSource } from './itemEdit.svelte'
import { insertLink } from './blocks'
import { isOutletBlock, newOutletFields, incLabel, walk, outletSticky, restoreLastLabel } from './outletPlace.svelte'
import { isOutletEnt } from '../store/allocate'
import { guideId, selectedPlanGuide } from '../guides.svelte'
import { imgEdit, clearImgMode } from '../imageEdit.svelte'
import { toolPrompt, imgModeText, statusLine } from './vpPrompt'
import type { VpView } from './vpView.svelte'
import type { Obj, Clip } from '../3dview/types'

export const DRAW = new Set(['Line', 'Rectangle', 'Ellipse', 'Dimension', 'Text', 'Wall', 'Furniture', 'Trunk', 'Pipe', 'Section', 'Opening', 'Guide', 'Block'])
/** Polyline-style tools (click points, Enter / dbl-click / right-click to finish). */
export const POLY = new Set(['Line', 'Wall', 'Trunk', 'Pipe'])
const MODEL_GRAPH = new Set(['Wall', 'Trunk', 'Pipe'])   // build a wall/conduit graph (plan or elevation)
const MODEL_TOOL = new Set(['Wall', 'Trunk', 'Pipe', 'Furniture', 'Section', 'Opening'])   // plan-only model tools (graphs also in elevation)
const uid = () => newId('e')

/** Entity move/grip drag. `bases` = what a body-move drags (the whole selection when the grabbed entity is in
 *  it); `base`/`gi` drive a grip drag. Kept on the instance too: Shift/ORTHO re-apply + hover read it. */
/** D13: a group-box drag — scale about `pivot` (the opposite corner) toward `corner`, or rotate about `pivot`
 *  (the barycentre) from the press angle `a0` (radians). */
type GroupDrag = { bases: Ent[]; pivot: Pt; corner?: Pt; a0?: number }
/** One editable DRAWING item: a 2D shape or a 3D model object (they select, move, copy and nudge together). */
type DItem = { k: 'ent'; e: Ent } | { k: 'obj'; o: Obj }
type SecDrag = { id: string; start: Pt; c0: Clip }
type SecResize = { id: string; apply: (p: Pt) => Clip }
/** `rel` = the drawing offset of the viewport's middle from the iso pivot at the start, `view0` the view then — the orbit
 *  pans so that point stays in the middle (orbit about what you're looking at). */
type OrbitDrag = { sx: number; sy: number; yaw0: number; pitch0: number; rel: [number, number] | null; view0: View }
export type TextEdit = { id: string; /** what's edited: a TEXT's text, a dimension's text override, a line's label */ field: 'text' | 'dim' | 'label'; placeholder?: string; x: number; y: number; fontPx: number; value: string; align: 'left' | 'center' | 'right'; valign: 'top' | 'middle' | 'bottom'; rot: number; cx: number; cy: number }

/** True when a keystroke is going into a form field — the viewport must not treat it as a canvas command. */
const isTypingTarget = (el: EventTarget | null) => { const n = el as HTMLElement | null; if (!n?.tagName) return false; const t = n.tagName; return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || n.isContentEditable }

export class VpInteraction {
	readonly v: VpView
	constructor(v: VpView) {
		this.v = v
		$effect(() => {   // pointer bookkeeping for the drag registry (a release anywhere)
			const up = (e: PointerEvent) => this.reg.noteUp(e)
			window.addEventListener('pointerup', up)
			window.addEventListener('pointercancel', up)
			return () => { window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up) }
		})
		$effect(() => () => { if (this.hoverRaf) cancelAnimationFrame(this.hoverRaf) })
		$effect(() => { if (this.v.focused) this.v.on.status?.(this.statusText) })   // only the focused pane drives the shared status
		$effect(() => { const cur = this.v.view; untrack(() => this.noteView(cur)) })   // ZOOM P history
		$effect(() => () => clearTimeout(this.viewTimer))
		$effect(() => { if (!this.myPick) this.pickCur = null })
	}

	// ── drafting ──
	draft = $state<Pt[]>([])
	cur = $state<Pt | null>(null)
	/** Snapped draw point under the cursor (drives the crosshair, even before the first click). */
	hoverPt = $state<Pt | null>(null)
	private lastRaw: Pt | null = null   // last UNconstrained pointer during a draft (for re-constraining on Shift)
	private endDraft() { this.draft = []; this.cur = null; this.v.snapMark = null }

	// ── gestures ──
	// SHAPES + 3D OBJECTS on the one editing engine (editing-merge-plan.md): move / grip / Ctrl-drag copy / marquee /
	// nudge / Ctrl+D run in ItemEditor through this ItemSource; this class keeps the tool-specific gestures (model grips,
	// node branch / split, sections, guides, orbit) and the pointer plumbing. Both kinds record on the MODEL timeline,
	// so a mixed move is one undo step.
	private movedObjs: string[] = []   // objects the open step moved (re-attached when it closes, F6)
	private readonly drawSource: ItemSource<DItem> = {
		kind: 'draw',
		get: (id) => {
			const e = this.v.entities.find((x) => x.id === id); if (e) return { k: 'ent', e }
			const o = this.v.mdl?.objects.find((x) => x.id === id)
			return o ? { k: 'obj', o: $state.snapshot(o) as Obj } : undefined   // a plain copy — the live one is written in place
		},
		id: (t) => (t.k === 'ent' ? t.e.id : t.o.id!),
		translate: (t, dx, dy) => (t.k === 'ent' ? { k: 'ent', e: moveEnt(this.v.ctx, t.e, dx, dy) } : { k: 'obj', o: translateObj(this.v, t.o, dx, dy) }),
		grips: (t) => (t.k === 'ent' ? this.v.gripsFor(t.e).map((g) => ({ x: g.x, y: g.y, apply: (p: Pt): DItem => ({ k: 'ent', e: g.apply(p) }) })) : []),   // model grips: their own path (onDown)
		gripPoint: (t, gi, p, shift) => {
			if (t.k !== 'ent') return p
			const v = this.v, cp = constrainGrip(v.ctx, t.e, gi, p, shift, v.gripOpts()); return v.snap ? snapToGrid(cp, v.snapStep) : cp
		},
		snapDelta: (dx, dy, base) => (base.k === 'ent' ? snapDelta(dx, dy, base.e, this.v.snap ? this.v.snapStep : 0) : objSnapDelta(this.v, base.o, dx, dy)),
		duplicate: (ts) => [
			...relabelCopies(pasteCopies(ts.flatMap((t) => (t.k === 'ent' ? [t.e] : [])), 0, uid), this.v.entities).map((e): DItem => ({ k: 'ent', e })),   // own ids + group ids; outlets get the next free label (E12)
			...pasteObjCopies(ts.flatMap((t) => (t.k === 'obj' ? [t.o] : [])), 0, newId).map((o): DItem => ({ k: 'obj', o })),
		],
		marquee: (a, b) => [...marqueeSelect(this.v.ctx, this.v.entities, a, b, this.v.pickable), ...marqueeModel(this.v.ctx, a, b, this.v.mlayers)],   // layer-gated
		expand: (ids) => this.v.expandGroup(ids),
		sel: {
			ids: () => [...this.v.sel, ...idsOfKind(this.v.selection, 'obj')],
			set: (ids) => { const ents = new Set(this.v.entities.map((e) => e.id)); this.v.editor.sel.only(ids.map((id) => ({ kind: ents.has(id) ? 'ent' : 'obj', id }))) },
		},
		commit: {
			begin: () => { this.movedObjs = []; this.v.editor.edit.begin() },
			update: (ts) => {
				const es = ts.flatMap((t) => (t.k === 'ent' ? [t.e] : [])), os = ts.flatMap((t) => (t.k === 'obj' ? [t.o] : []))
				if (es.length) this.v.editor.ents.updateMany(es)   // one array pass; DocEdit brings attached conduit ends along (F6)
				if (os.length) { applyObjMoves(this.v, os); this.movedObjs = os.map((o) => o.id!); this.v.editor.edit.mark() }
			},
			add: (ts) => {
				for (const t of ts) if (t.k === 'ent') this.v.editor.ents.add(t.e)
				const os = ts.flatMap((t) => (t.k === 'obj' ? [t.o] : []))
				if (os.length && this.v.mdl) { this.v.mdl.objects.push(...os); this.v.editor.edit.mark() }
			},
			end: (ms) => { endObjMove(this.v, this.movedObjs); this.movedObjs = []; this.v.editor.edit.end(ms) },
		},
	}
	readonly items = new ItemEditor<DItem>(this.drawSource, { ortho: () => this.v.ortho, gripSnap: (x, y, id) => (this.v.osnap ? this.findSnap(x, y, id) : null) })
	/** The selection box being dragged (VpOverlays draws it). */
	get marquee() { return this.items.marquee }
	private suppressClick = false   // swallow the click that ends a real drag (avoids re-select)
	private shiftPressId: string | null = null   // B25: the entity a Shift-press landed on (onClick toggles THIS id)
	private rDownPt: { x: number; y: number } | null = null   // where the RIGHT button went down (onContext: click vs pan-drag)
	private readonly reg = new DragRegistry()
	private closeEdit = () => this.v.editor.edit.end()   // onCancel for gestures that open an undo step at press

	// ── hover cursor: 'move' over something a press would grab (P2: the same pickAt cascade as a press, at
	// most once per animation frame) ──
	hoverBody = $state(false)
	cursorStyle = $derived.by(() => (!this.v.active ? 'pointer' : this.v.navMode === 'pan' ? 'grab' : this.v.navMode === 'orbit' && this.v.kind === 'iso' ? 'move' : this.myPick ? (this.myPick.kind === 'ent' ? 'pointer' : 'crosshair') : cptPick.obj && this.v.isPlan ? 'crosshair' : DRAW.has(this.v.tool) ? 'crosshair' : this.hoverBody ? 'move' : 'default'))
	private hoverRaf = 0
	private hoverAt: [number, number] | null = null
	private hoverIdle = () => this.v.active && this.v.tool === 'Select' && !this.items.drag && !this.reg.active && !this.draft.length && !this.marquee
	private scheduleHover(clientX: number, clientY: number) {
		this.hoverAt = [clientX, clientY]
		if (this.hoverRaf) return
		this.hoverRaf = requestAnimationFrame(() => {
			this.hoverRaf = 0
			const q = this.hoverAt; this.hoverAt = null
			if (!q || !this.hoverIdle()) { this.hoverBody = false; return }
			const lp = this.v.toModel(q[0], q[1])
			this.hoverBody = !!lp && this.v.pickAt(q[0], q[1], lp) !== null
		})
	}

	// ── alignment GUIDES: the Guide tool drops a full-view h/v line in this view's space; a selected PLAN guide
	// fixes the depth when drawing a conduit in an elevation ──
	guideCur = $state<{ orient: 'h' | 'v'; pos: number } | null>(null)   // hover preview
	private lastGuidePt: Pt | null = null   // so Shift can flip the preview instantly
	private updateGuidePreview(shift: boolean) {
		if (this.v.tool !== 'Guide' || !this.lastGuidePt) return
		const vert = this.v.guideIsVert(shift)
		this.guideCur = { orient: vert ? 'v' : 'h', pos: vert ? this.lastGuidePt[0] : this.lastGuidePt[1] }
	}

	// ── object snap (osnap, Kestrel-style) + the draw point: they RETURN the mark; the view shows it ──
	private findSnap(clientX: number, clientY: number, exclude?: string): Pt | null {
		const v = this.v, m = v.mapper()
		const hit = v.osnap && m ? findSnap(v.ctx, m, v.entities, clientX, clientY, { exclude, editingId: this.editText?.id, objs: v.mdl?.objects, ml: v.mlayers }) : null   // K5: model corners/nodes snap too
		v.snapMark = hit
		return hit ? hit.p : null
	}
	/** POLAR tracking: the 15° ray the last draw point slid onto (drawn dashed), else null. */
	polarTrack = $state<[Pt, Pt] | null>(null)
	/** O9 OTRACK: the dashed guides to the snap points the last draw point lined up with. */
	alignTracks = $state.raw<[Pt, Pt][]>([])
	/** The point a draw/place uses: object snap wins; else the Shift/ORTHO/POLAR-constrained, grid-snapped pointer. */
	private drawPoint(clientX: number, clientY: number, base?: Pt, shift = false): Pt | null {
		const v = this.v, m = v.mapper(); if (!m) { v.snapMark = null; return null }
		const r = drawPoint(v.ctx, m, { osnap: v.osnap, snap: v.snap, step: v.snapStep, ortho: v.ortho, polar: v.polar, otrack: v.otrack, tool: v.tool, ents: v.entities, editingId: this.editText?.id, objs: v.mdl?.objects, ml: v.mlayers }, clientX, clientY, base, shift)
		v.snapMark = r.mark
		this.polarTrack = r.track ?? null
		this.alignTracks = r.tracks ?? []
		return r.p
	}
	/** While drawing a Wall/Trunk/Pipe in an elevation: the segment the NEXT point snaps its depth onto. */
	depthSnapMark = $derived.by(() => {
		const v = this.v, t = v.tool
		if (!v.isElev || !v.active || !this.cur || !v.mdl || !(t === 'Wall' || t === 'Trunk' || t === 'Pipe')) return null
		return v.elevDepthSnap(this.cur)
	})

	// ── placing (builders in ui/place.ts; the side effects + tool dispatch stay here) ──
	private place(a: Pt, b: Pt) {
		const v = this.v, tool = v.tool
		const ent = buildEnt(v.ctx, tool, a, b, { centerDraw: v.centerDraw, uid })   // Line / Rectangle / Ellipse / Dimension
		if (ent) { v.editor.ents.add(ent); return }
		const ps = PRISM_TOOL[tool]   // Furniture / Opening → a MODEL prism footprint (plan only)
		if (ps && v.isPlan) { this.addModelObj(prismObj(v.ctx, a, b, ps.layer, ps.h, () => newId(ps.tag), tool === 'Opening' ? openingSpec.extra() : {})); return }   // an Opening takes the bar's type / height / sill
		if (tool === 'Section' && v.isPlan && v.mdl) {   // B5 — clip box on the plan → a section marker in the MODEL (one undo step), selected
			const sec = sectionObj(v.ctx, a, b, newId('sec'), sectionName(v.mdl.sections ?? [])); if (!sec) return
			addSection(v.mdl, v.editor.edit, sec)
			v.selectSection(sec.id)   // grips + toolbar; drop its elevations via the arrows
		}
	}
	/** AutoCAD-mode Line = a POLYLINE: keep clicking, Enter / dbl-click / right-click finishes (Esc cancels). */
	private finishPolyline() {
		const v = this.v
		if (v.tool === 'Line') { const pl = polylineEnt(v.ctx, this.draft, uid); if (pl) v.editor.ents.add(pl) }
		else if (MODEL_GRAPH.has(v.tool) && (v.isPlan || v.isElev)) this.placeGraph(trimTail(this.draft))
		this.endDraft()
	}
	private addModelObj(o: Obj) {
		const v = this.v; if (!v.mdl) return
		const id = addModelObj(v.mdl, v.editor.edit, o)
		if (id) v.selectObj(id)
	}
	/** A clicked run → a wall or conduit graph. In an ELEVATION the depth comes from the SELECTED plan guide,
	 *  else the depth-snap, else the plan centre — with a nudge to select a guide when there is none. */
	private placeGraph(pts: Pt[]) {
		const v = this.v
		if (!v.mdl || pts.length < 2) return
		const ax = v.isElev ? ELEV_BASIS[v.elevDir].axis : 0
		const guide = v.isElev ? selectedPlanGuide(v.mdl.guides ?? [], v.modelSel, ax === 0 ? 'h' : 'v') : null
		if (v.isElev && !guide) toast('No depth guide — points snap onto nearby walls where possible, else the model centre. Tip: select a plan guide to fix the depth.', { duration: 5000 })
		const o = graphObj(v.ctx, v.tool, pts, { guide, depthSnap: (p) => v.elevDepthSnap(p)?.off ?? null, uid: newId, profile: (() => { const s = trunkSpecs.of(v.tool); return s ? specProfile(s, v.mdl?.levels) : undefined })() })
		if (!o) return
		if (o.type !== 'conduit') return this.addModelObj(o)
		const into = commitConduit(v, o)   // F6 attach + F3 join (ui/vpModelEdit.ts)
		if (into?.id) v.selectObj(into.id)
	}
	/** Dbl-click a wall/conduit segment → split it with a new vertex (inherits the segment's z). */
	private insertGraphNode(p: Pt) {
		const v = this.v; if (!v.mdl) return
		const hitId = insertGraphNode(v.ctx, v.mdl, v.editor.edit, p, v.tolMm(6), v.mlayers, v.rndSnap, newId)
		if (hitId) v.selectObj(hitId)
	}
	private placeGuide(p: Pt, vert: boolean) {
		const v = this.v; if (!v.mdl) return
		const g = guideObj(v.ctx, p, vert, guideId()); if (!g) return   // null in iso (no drawing plane)
		addGuide(v.mdl, v.editor.edit, g)
	}

	// ── the COMMAND LINE's target (ui/cmdBus.svelte.ts): typed points / distances feed the tool like clicks ──
	private lastUser: Pt | null = null
	private lastPtr: Pt | null = null   // the pointer's last drawing position over this view (pasted text lands there)
	// ZOOM P: the views this viewport settled on (a wheel / pan burst counts once); `restoring` skips the jump back
	private viewHist: View[] = []
	private restoring = false
	private viewSettled: View | null = null
	private viewTimer: ReturnType<typeof setTimeout> | undefined
	private noteView(cur: View) {
		clearTimeout(this.viewTimer)
		this.viewTimer = setTimeout(() => {
			const prev = this.viewSettled; this.viewSettled = cur
			if (this.restoring) { this.restoring = false; return }
			if (prev && (prev.zoom !== cur.zoom || prev.x !== cur.x || prev.y !== cur.y)) { this.viewHist.push(prev); if (this.viewHist.length > 30) this.viewHist.shift() }
		}, 350)
	}
	// ── a command's PICK (cmdBus.pick): this viewport's clicks go to it; the cursor point drives the rubber band ──
	pickCur = $state<Pt | null>(null)   // drawing coords
	private get myPick() { return cmdBus.target === this.cmdTarget ? cmdBus.pick : null }
	pickBase = $derived.by(() => { const b = this.myPick?.base; return b ? this.toDraw(b) : null })
	pickBox = $derived(!!this.myPick?.box)
	ghosts = $derived.by(() => { const pk = this.myPick, c = this.pickCur; if (!pk?.ghost || !c) return []; const u = this.toUser(c); return u ? pk.ghost(u) : [] })
	private pickPoint(e: MouseEvent): Pt | null {
		const pk = this.myPick; if (!pk) return null
		return pk.kind === 'ent' ? this.v.toModel(e.clientX, e.clientY) : this.drawPoint(e.clientX, e.clientY, this.pickBase ?? undefined, e.shiftKey)
	}
	/** User coords (model mm, Y up) ↔ this view's drawing coords; null in 3D. */
	private toDraw(u: Pt): Pt | null {
		const v = this.v
		if (v.isPlan) return [u[0], -u[1]]
		if (v.isElev) return [elevU(v.elevDir, u[0], v.ctx.cx, v.ctx.cy), v.ctx.ground - u[1]]
		return null
	}
	private toUser(d: Pt): Pt | null {
		const v = this.v
		if (v.isPlan) return [d[0], -d[1]]
		if (v.isElev) return [elevUInv(v.elevDir, d[0], v.ctx.cx, v.ctx.cy), v.ctx.ground - d[1]]
		return null
	}
	private acceptDraw(d: Pt): string | null {
		const v = this.v, tool = v.tool
		if (tool === 'Select') return 'Pick a drawing command first (e.g. L for a line, REC for a rectangle)'
		if (MODEL_TOOL.has(tool) && !v.isPlan && !(MODEL_GRAPH.has(tool) && v.isElev)) return `${tool}: switch to the plan view`
		if (tool === 'Text') { v.editor.ents.add({ id: uid(), type: 'text', a: d, text: 'TEXT', plane: drawPlane(v.ctx) }); return null }
		if (tool === 'Block') { if (v.blockId) this.placeBlock(v.blockId, d); return null }
		if (tool === 'Guide') { this.placeGuide(d, v.guideIsVert(false)); return null }
		if (tool === 'Renumber') { this.walkClick(d); return null }
		if (POLY.has(tool)) { this.draft = [...this.draft, d]; this.cur = d; return null }
		if (!this.draft.length) { this.draft = [d]; this.cur = d; return null }
		this.place(this.draft[0], d); this.endDraft(); return null
	}
	readonly cmdTarget: VpCommandTarget = {
		drawing: () => this.v.tool !== 'Select',
		lastPoint: () => { const d = this.draft.at(-1); return d ? this.toUser(d) : this.lastUser },
		acceptPoint: (u) => {
			const d = this.toDraw(u); if (!d) return 'Type points in a plan or elevation view (not 3D)'
			const err = this.acceptDraw(d); if (!err) this.lastUser = u
			return err
		},
		distance: (n) => {
			const last = this.draft.at(-1); if (!last) return 'Type or click the first point, then a distance'
			const aim = this.cur && dist(this.cur, last) > 1e-6 ? this.cur : this.hoverPt && dist(this.hoverPt, last) > 1e-6 ? this.hoverPt : [last[0] + 1, last[1]] as Pt
			const L = dist(aim, last), d: Pt = [last[0] + ((aim[0] - last[0]) / L) * n, last[1] + ((aim[1] - last[1]) / L) * n]
			const err = this.acceptDraw(d); if (!err) this.lastUser = this.toUser(d)
			return err
		},
		finish: () => { if (POLY.has(this.v.tool) && this.draft.length >= 2) this.finishPolyline(); else this.endDraft() },
		cancel: () => this.endDraft(),
		close: () => { if (POLY.has(this.v.tool) && this.draft.length >= 3) { this.draft = [...this.draft, this.draft[0]]; this.finishPolyline() } },
		undoPoint: () => { this.draft = this.draft.slice(0, -1); this.cur = this.draft.at(-1) ?? null },
		selected: () => [...this.v.sel],
		ents: (ids) => ids.map((id) => this.v.entities.find((x) => x.id === id)).filter(Boolean).map((e) => $state.snapshot(e) as Ent),
		visibleEnts: () => this.v.entities.filter((e) => this.v.inThisView(e) && !this.v.isLayerHidden(e.layer)).map((e) => $state.snapshot(e) as Ent),
		pickableEnts: () => this.v.entities.filter((e) => this.v.pickable(e)).map((e) => $state.snapshot(e) as Ent),
		paperMm: () => this.v.paperMm,
		toDraw: (u) => this.toDraw(u),
		toUser: (d) => this.toUser(d),
		move: (dx, dy) => this.transformSel({ move: [dx, dy] }),
		rotate: (deg, base) => this.transformSel({ rotate: deg, base }),
		scale: (k, base) => (k > 0 ? this.transformSel({ scale: k, base }) : 'The scale factor must be positive'),
		preview: (op) => this.xfEnts(op) ?? [],
		copyBy: (dx, dy) => this.cmdTarget.copyMany([{ move: [dx, dy] }]),
		copyMany: (ops) => {
			const v = this.v, sel = v.sel; if (!sel.length) return 'Select shapes first'
			const src = this.cmdTarget.ents(sel), all = [...v.entities]
			v.editor.edit.begin()
			for (const op of ops) {
				// each copy gets its own ids / group ids and the next free outlet labels (E12)
				const copies = relabelCopies(pasteCopies(this.xfOf(src, op), 0, uid), all)
				copies.forEach((c) => { v.editor.ents.add(c); all.push(c) })
			}
			v.editor.edit.end()
			return null
		},
		transform: (op) => this.transformSel(op),
		explode: (ids) => {
			const v = this.v, es = this.cmdTarget.ents(ids), ed = v.editor
			const grouped = es.filter((e) => e.groupId), loose = es.filter((e) => !e.groupId)
			const parts = loose.map((e) => [e, explodeEnt(e, { centreOf: (x) => rotCenter(v.ctx, x), paperMm: v.paperMm, uid })] as const)
			const done = parts.filter(([, p]) => p?.length)
			ed.edit.begin()
			if (grouped.length) ed.ents.ungroup(grouped.map((e) => e.id))
			for (const [, p] of done) p!.forEach((x) => ed.ents.add(x))
			if (done.length) ed.ents.delete(done.map(([e]) => e.id))
			ed.edit.end()
			return { done: done.length + (grouped.length ? 1 : 0), skipped: loose.length - done.length }
		},
		bboxOf: (e) => bbox(this.v.ctx, e),
		apply: ({ update, add, remove }) => {
			const ed = this.v.editor; ed.edit.begin()
			if (update?.length) ed.ents.updateMany(update)
			add?.forEach((e) => ed.ents.add(e))
			if (remove?.length) ed.ents.delete(remove)
			ed.edit.end()
		},
		newEnt: (e) => ({ plane: drawPlane(this.v.ctx), ...e, id: uid() }) as Ent,
		selectAll: (keep) => this.v.selectEnts(this.v.entities.filter((e) => this.v.pickable(e) && (!keep || keep($state.snapshot(e) as Ent))).map((e) => e.id)),
		deselect: () => this.v.clearSel(),
		select: (ids) => this.v.selectEnts(ids),
		reorder: (ids, op) => this.v.editor.ents.reorder(ids, op),
		zoomSelection: () => {   // ZOOM Object / Z with a selection: frame the selected shapes + model objects
			const v = this.v, boxes: [number, number, number, number][] = v.entities.filter((e) => v.selSet.has(e.id)).map((e) => bbox(v.ctx, e))
			const objIds = new Set(idsOfKind(v.selection, 'obj'))
			if (objIds.size && v.mdl) {
				const ib = v.kind === 'iso' ? isoBounds(v.mdl.objects, v.yaw, v.pitch, v.cx, v.cy, v.mlayers.visible, v.persp) : null, vm = viewMapOf(v.ctx, ib)
				for (const o of v.mdl.objects) if (o.id && objIds.has(o.id)) {
					const b = objBounds(o), ps = [b.x0, b.x1].flatMap((x) => [b.y0, b.y1].flatMap((y) => [b.z0, b.z1].map((z) => vm.toDraw({ x, y, z }))))
					boxes.push([Math.min(...ps.map((p) => p[0])), Math.min(...ps.map((p) => p[1])), Math.max(...ps.map((p) => p[0])), Math.max(...ps.map((p) => p[1]))])
				}
			}
			if (!boxes.length) return 'Nothing selected to zoom to'
			const x0 = Math.min(...boxes.map((b) => b[0])), y0 = Math.min(...boxes.map((b) => b[1])), x1 = Math.max(...boxes.map((b) => b[2])), y1 = Math.max(...boxes.map((b) => b[3]))
			const pad = Math.max(x1 - x0, y1 - y0, 200) * 0.1
			v.zoomToBox(x0 - pad, y0 - pad, x1 + pad, y1 + pad)
			return null
		},
		cursor: () => this.lastPtr,
		layerAt: (u) => {
			const v = this.v, d = this.toDraw(u); if (!d) return null
			const eid = v.hit(d)[0], e = eid ? v.entities.find((x) => x.id === eid) : null
			if (e?.layer) return e.layer
			const oid = v.hitModel(d), o = oid ? v.mdl?.objects.find((x) => x.id === oid) : null
			return o?.layer ?? null
		},
		selObjLayer: () => { const ids = idsOfKind(this.v.selection, 'obj'); const o = ids.length === 1 ? this.v.mdl?.objects.find((x) => x.id === ids[0]) : null; return o?.layer ?? null },
		hasSelection: () => this.v.sel.length > 0 || idsOfKind(this.v.selection, 'obj').length > 0,
		zoomWindow: (a, b) => { const p = this.toDraw(a), q = this.toDraw(b); if (p && q) this.v.zoomToBox(Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])) },
		zoomPrev: () => { const pv = this.viewHist.pop(); if (!pv) return 'No previous view'; this.restoring = true; this.v.on.view?.(pv); return null },
		addRack: ({ u, w, d, at, rot }) => {
			const v = this.v; if (!v.isPlan || !v.mdl) return { err: 'Place racks in the plan view' }
			const c = this.toDraw(at)!, n = v.mdl.objects.filter((o) => o.type === 'prism' && o.rack).length
			let label = ''; for (let k = n + 1; ; k++) { label = 'R' + String(k).padStart(2, '0'); if (!v.mdl.objects.some((o) => o.label === label)) break }
			const o = prismObj(v.ctx, [c[0] - w / 2, c[1] - d / 2], [c[0] + w / 2, c[1] + d / 2], 'racks', rackHeightMm(u), () => newId('rk'), { rack: { u }, label, ...(rot ? { rot } : {}) })
			this.addModelObj(o)
			return { label }
		},
		placeText: (kind, text) => {
			const v = this.v; if (v.kind === 'iso') return 'Paste text in a plan or elevation view'
			let at = this.lastPtr
			if (!at && v.svg) { const r = v.svg.getBoundingClientRect(); at = v.toModel(r.left + r.width / 2, r.top + r.height / 2) }
			if (!at) return 'No view to paste into'
			const e: Ent = kind === 'note' ? { id: uid(), type: 'text', a: at, text, noteW: 110, noteBox: true, plane: drawPlane(v.ctx) } : { id: uid(), type: 'text', a: at, text, plane: drawPlane(v.ctx) }
			if (v.editor.ents.add(e) === false) return null
			v.selectEnts([e.id]); return null
		},
		viewState: () => ({ view: { ...this.v.view }, scale: this.v.scale }),
		restoreView: (s) => { if (s.scale !== this.v.scale) this.v.on.scale?.(s.scale); this.v.on.view?.({ ...s.view }) },
		svg: () => this.v.svg,
		drawPrompt: () => {
			const t = this.v.tool, n = this.draft.length
			if (t === 'Select' || t === 'Renumber') return null
			if (t === 'Text' || t === 'Block' || t === 'Guide') return { prompt: `${t === 'Block' ? 'Insert' : t}: specify the insertion point` }
			if (POLY.has(t)) return n ? { prompt: `${t}: specify next point  <Enter / right-click finishes>`, options: n >= 2 && t === 'Line' ? ['Close', 'Undo'] : ['Undo'] } : { prompt: `${t}: specify first point` }
			const corner = t === 'Rectangle' || t === 'Ellipse' || t === 'Furniture' || t === 'Section'
			return n ? { prompt: `${t}: specify ${corner ? 'opposite corner' : 'second point'}`, options: ['Undo'] } : { prompt: `${t}: specify ${corner ? 'first corner' : 'first point'}` }
		},
		graphAudit: (fix) => {
			const v = this.v, m = v.mdl; if (!m) return null
			const snap = { id: m.id, objects: $state.snapshot(m.objects) as Obj[], shapes: $state.snapshot(m.shapes ?? []) as Ent[] }
			const issues = auditGraph(snap)
			if (fix && issues.length) { v.editor.edit.begin(); m.objects = fixGraph(snap); v.editor.edit.mark('Audit: fix graph'); v.editor.edit.end() }
			return issues
		},
		entAt: (u) => { const d = this.toDraw(u); return d ? (this.v.hit(d)[0] ?? null) : null },
		erase: () => this.v.editor.sel.delete(),
		duplicate: () => {
			if (!this.items.duplicateSel(5 * this.v.paperMm).length) return 'Select shapes first'
			return null   // the same engine as Ctrl+D (shapes and 3D objects)
		},
		group: () => { const s = this.v.sel; if (s.length < 2) return 'Select two or more shapes'; this.v.editor.ents.group(s); return null },
		ungroup: () => { const s = this.v.sel; if (!s.length) return 'Select a group'; this.v.editor.ents.ungroup(s); return null },
	}
	/** The selected shapes transformed together about their barycentre — one undo step. */
	private transformSel(op: Xf): string | null {
		const out = this.xfEnts(op); if (!out) return 'Select shapes first'
		this.v.editor.ents.updateMany(out)
		return null
	}
	/** The selected shapes with `op` applied (user coords / CCW degrees → drawing coords), not committed; null = none. */
	private xfEnts(op: Xf): Ent[] | null {
		const v = this.v, bases = v.sel.map((id) => v.entities.find((x) => x.id === id)).filter(Boolean).map((e) => $state.snapshot(e) as Ent)
		return bases.length ? this.xfOf(bases, op) : null
	}
	/** `op` applied to these shapes (plain snapshots), user coords → drawing coords. */
	private xfOf(bases: Ent[], op: Xf): Ent[] {
		const v = this.v
		if ('mirror' in op) {
			const a = this.toDraw(op.mirror[0]), b = this.toDraw(op.mirror[1]); if (!a || !b) return bases
			return bases.map((e) => mirrorAbout(e, a, b, (x) => rotCenter(v.ctx, x)))
		}
		if ('move' in op) return bases.map((b) => moveEnt(v.ctx, b, op.move[0], -op.move[1]))   // user Y up → drawing Y down
		const pivot = (op.base && this.toDraw(op.base)) || barycentre(bases, (e) => rotCenter(v.ctx, e))
		if ('rotate' in op) return bases.map((b) => rotateAbout(b, pivot, -op.rotate, rotCenter(v.ctx, b)))   // CCW (CAD) → drawing CW
		return bases.map((b) => scaleAbout(b, pivot, op.scale))
	}

	// ── IMAGE calibration (Uploads-tool model): ORIGIN = a clicked normalized anchor; SCALE = a 2-point line +
	// the real distance → resize about the anchor. The entry box position + measurement derive from the points. ──
	scalePts = $state<Pt[]>([])
	scaleReal = $state<string | null>(null)   // the typed real distance (null = not entering)
	scaleGeom = $derived.by(() => {
		const v = this.v, pts = this.scalePts
		if (pts.length !== 2 || this.scaleReal === null || !v.svg || !v.editImgVisible) return null
		const m = v.toClient((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2); if (!m) return null
		const r = v.svg.getBoundingClientRect()
		return { x: m.x - r.left, y: m.y - r.top, d: dist(pts[0], pts[1]) }
	})
	private setImageOrigin(id: string, p: Pt) {
		const img = this.v.entities.find((x) => x.id === id); if (!img) return
		const next = imageWithOrigin(img, p); if (next === img) return   // not an image
		this.v.editor.ents.update(next)
		clearImgMode()
	}
	applyScale = () => {
		const d = this.scaleGeom?.d ?? 0, real = parseFloat(this.scaleReal ?? '')
		const img = imgEdit.id ? this.v.entities.find((x) => x.id === imgEdit.id) : null
		this.cancelScale()
		if (!img) return
		const next = imageScaled(img, d, real); if (next !== img) this.v.editor.ents.update(next)   // unchanged when not an image / bad inputs
	}
	cancelScale = () => { this.scaleReal = null; this.scalePts = []; clearImgMode() }
	private onScaleDragMove = (e: PointerEvent, i: number) => {
		const p = this.v.toModel(e.clientX, e.clientY); if (!p) return
		this.scalePts = this.scalePts.map((sp, j) => (j === i ? p : sp))
	}

	// ── edit text in place: position + font in .vp-LOCAL px (pre canvas-CSS-transform), so the canvas
	// transform scales the editor exactly like the SVG text at any zoom/pan ──
	editText = $state<TextEdit | null>(null)
	textInput = $state<HTMLTextAreaElement | undefined>()
	private startTextEdit(ent: Ent) {
		const v = this.v, { vpW, vpH, vbW, minX, minY, view, dscale, cx: CX, cy: CY } = v
		if (!vpW || !vpH) return
		const localPx = (q: Pt): Pt => { const vbx = view.x + view.zoom * (CX + dscale * (q[0] - CX)), vby = view.y + view.zoom * (CY + dscale * (q[1] - CY)); return [(vbx - minX) / vbW * vpW, (vby - minY) / v.vbH * vpH] }
		const [x, y] = localPx(ent.a!)
		const [cx, cy] = localPx(rotCenter(v.ctx, ent))   // B19: the SVG text rotates about its bbox centre — so does the editor
		const fontPx = (ent.fontPt ?? STYLE_DEFAULTS.fontPt) * PT_MM * view.zoom * (vpW / vbW)   // annotative: paperMm·dscale cancels (B3)
		this.editText = { id: ent.id, field: 'text', x, y, fontPx, value: ent.text ?? '', align: ent.align ?? 'left', valign: ent.valign ?? 'top', rot: ent.rot ?? 0, cx, cy }
		tick().then(() => { this.textInput?.focus(); this.textInput?.select() })
	}
	/** Edit a DIMENSION's text override (empty = the measured length; <> stands for it) or a line's LABEL in place:
	 *  a one-line editor centred on the drawn figure, turned with it. */
	private startFieldEdit(ent: Ent) {
		const v = this.v, { vpW, vpH, vbW, minX, minY, view, dscale, cx: CX, cy: CY, paperMm } = v
		if (!vpW || !vpH) return
		const localPx = (q: Pt): Pt => { const vbx = view.x + view.zoom * (CX + dscale * (q[0] - CX)), vby = view.y + view.zoom * (CY + dscale * (q[1] - CY)); return [(vbx - minX) / vbW * vpW, (vby - minY) / v.vbH * vpH] }
		let at: Pt, rot: number, align: 'left' | 'center' | 'right' = 'center'
		if (ent.type === 'dim') {
			const A = ent.a!, B = ent.b!, len = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, ux = (B[0] - A[0]) / len, uy = (B[1] - A[1]) / len
			const off = ent.dimOff ?? 2.5 * paperMm, t = ent.dimT ?? 0.5
			at = [A[0] + ux * len * t - uy * off, A[1] + uy * len * t + ux * off]
			const ang = (Math.atan2(uy, ux) * 180) / Math.PI; rot = ang > 90 || ang < -90 ? ang + 180 : ang
		} else {
			const lb = lineLabelAt(ent.pts ?? [], ent.textPos, 1.2 * paperMm); if (!lb) return
			at = lb.p; rot = lb.rot; align = lb.anchor === 'start' ? 'left' : lb.anchor === 'end' ? 'right' : 'center'
		}
		const [x, y] = localPx(at), fontPx = 2.5 * view.zoom * (vpW / vbW)   // the figure is 2.5 paper mm (annotative)
		this.editText = { id: ent.id, field: ent.type === 'dim' ? 'dim' : 'label', placeholder: ent.type === 'dim' ? '(the length)' : '(no label)',
			x, y, fontPx, value: ent.text ?? '', align, valign: 'bottom', rot, cx: x, cy: y }
		tick().then(() => { this.textInput?.focus(); this.textInput?.select() })
	}
	commitText = () => {
		const t = this.editText; if (!t) return
		const ent = this.v.entities.find((x) => x.id === t.id)
		const val = t.field === 'text' ? t.value : t.value.replace(/\n/g, ' ').trim() || undefined   // a dim / label is one line
		if (ent && val !== ent.text) this.v.editor.ents.update({ ...ent, text: val })
		this.editText = null
	}
	cancelText = () => { this.editText = null }

	// ── prompt / status ──
	prompt = $derived.by(() => {
		const v = this.v
		if (!v.active) return ''
		const g = this.guideCur, ref = g ? v.viewGuides.find((x) => v.modelSel.includes(x.id) && x.orient === g.orient) : null
		return toolPrompt({
			tool: v.tool, n: this.draft.length, isPlan: v.isPlan, isElev: v.isElev, guideSpace: !!v.viewSpace, guideVert: v.guideIsVert(false),
			guideDelta: g && ref ? Math.abs(ref.pos - g.pos) : null,
			graphSelected: !!v.mSelObj && (v.mSelObj.type === 'wall' || v.mSelObj.type === 'conduit'),
			depthGuide: v.isElev && !!selectedPlanGuide(v.mdl?.guides ?? [], v.modelSel, ELEV_BASIS[v.elevDir].axis === 0 ? 'h' : 'v'),
		})
	})
	statusText = $derived.by(() => statusLine({ editingText: !!this.editText, active: this.v.active, imgText: imgModeText(imgEdit.mode, this.scaleReal !== null, this.scalePts.length), sectionSelected: !!this.v.selSectionObj, tool: this.v.tool, prompt: this.prompt }))

	// ── click-cycle: what's under a plain Select click, top-most first — each entity (with its group), then the
	// model object. `lastClick.k` = which one the previous click at that spot picked. ──
	private lastClick: { x: number; y: number; k: number; sel: string } | null = null
	private selKey = () => [...this.v.sel, ...this.v.modelSel].join('|')
	/** A click selecting model object `id`: a wall / conduit that was ALREADY the selection (the run, or one of
	 *  its segments / nodes) → the segment under the click instead; otherwise the whole object. */
	private pickObj(id: string, p: Pt) {
		const v = this.v, o = v.mdl?.objects.find((x) => x.id === id)
		if (this.selAtPress === id && (o?.type === 'wall' || o?.type === 'conduit')) { const s = graphSegAt(v.ctx, o, p); if (s) return v.selectSeg(id, s) }
		v.selectObj(id)
	}
	private selAtPress = ''   // the selection just before the latest press (onDown)
	private clickCandidates(p: Pt): { ids?: string[]; obj?: string }[] {
		const v = this.v, out: { ids?: string[]; obj?: string }[] = [], seen = new Set<string>()
		for (const id of v.hitAll(p)) { if (seen.has(id)) continue; const g = v.expandGroup([id]); g.forEach((x) => seen.add(x)); out.push({ ids: g }) }
		const mid = v.hitModel(p); if (mid) out.push({ obj: mid })
		return out
	}

	// ── D5: place a library block (the 'Block' tool's click, or a block dragged in from the Blocks panel) ──
	private placeBlock(id: string, p: Pt) {
		const v = this.v
		// E1/E2: an outlet takes the sticky ports / type / layer and the next label
		const prevLabel = outletSticky.lastLabel
		const extra = isOutletBlock(id) ? newOutletFields(v.mdl?.shapes ?? v.entities, (v.mdl?.layers ?? []).map((l) => l.id)) : { attrs: {} }
		const e: Ent = { id: uid(), type: 'insert', block: id, a: p, plane: drawPlane(v.ctx), ...extra }
		if (!e.layer) delete e.layer
		if (v.editor.ents.add(e) === false) { restoreLastLabel(prevLabel); return }   // refused: the label wasn't used
		v.selectEnts([e.id])
	}
	// ── E3: walk renumber — each clicked outlet takes the label after the previous one ──
	private walkClick(p: Pt) {
		const v = this.v, last = walk.label; if (last === null) return
		const hit = v.hitAll(p).map((id) => v.entities.find((x) => x.id === id)).find((x) => x && isOutletEnt(x))
		if (!hit) { toast('Click an outlet — Esc stops renumbering', { id: 'walk' }); return }
		const next = incLabel(last); if (!next) return
		v.editor.ents.update({ ...hit, attrs: { ...(hit.attrs ?? {}), LABEL: next } })
		walk.label = next; v.selectEnts([hit.id])
	}
	onDragOver = (e: DragEvent) => { if (this.v.active && e.dataTransfer?.types.includes('application/x-pages-block')) e.preventDefault() }
	onDrop = (e: DragEvent) => {
		const id = e.dataTransfer?.getData('application/x-pages-block'); if (!id || !this.v.active) return
		e.preventDefault()
		const p = this.drawPoint(e.clientX, e.clientY); if (p) this.placeBlock(id, p)
	}

	// ══ pointer events ══
	onClick = (e: MouseEvent) => {
		const v = this.v, tool = v.tool
		e.stopPropagation()
		if ((e.target as Element)?.closest?.('.section-arrow.pick')) return   // handled by the arrow's pointerdown
		if (this.suppressClick) { this.suppressClick = false; return }   // this click just ended a drag
		if (v.navMode === 'pan') return   // latched Pan: the release of a pan drag is not a pick / draw click
		if (!v.active) return   // paper space: enter with a double-click
		const pk = this.myPick
		if (pk) {   // a running command wants a point / a shape
			const d = this.pickPoint(e); v.snapMark = null
			const u = d && this.toUser(d); if (!d || !u) return
			pk.resolve({ p: u, ent: pk.kind === 'ent' ? v.hit(d)[0] : undefined })
			return
		}
		// F6 Place… (Properties › CONNECTION POINTS): a click on the plan adds a point to that box
		if (cptPick.obj && v.isPlan) {
			const o = v.mdl?.objects.find((x) => x.id === cptPick.obj), p = this.drawPoint(e.clientX, e.clientY); v.snapMark = null
			if (!o || o.type !== 'prism' || !p) { cptPick.obj = null; return }
			const [u, vv] = uvAt(o, p[0], p[1]), base = o.cpts?.length ? o.cpts : DEFAULT_CPTS
			v.editor.edit.begin(); o.cpts = [...base, { id: newId('cp'), u, v: vv }]; v.editor.edit.mark('Add connection point'); v.editor.edit.end()
			return
		}
		// IMAGE calibration modes (Properties › Set scale / Set origin) intercept clicks.
		if (imgEdit.mode === 'origin' && imgEdit.id) { const p = v.toModel(e.clientX, e.clientY); if (p) this.setImageOrigin(imgEdit.id, p); return }
		if (imgEdit.mode === 'scale' && imgEdit.id && this.scaleReal === null) {
			const p = v.toModel(e.clientX, e.clientY); if (!p) return
			this.scalePts = [...this.scalePts, p]
			if (this.scalePts.length === 2) this.scaleReal = String(Math.round(dist(this.scalePts[0], this.scalePts[1])))   // pre-fill with the measurement
			return
		}
		if (tool === 'Select') {
			const p = v.toModel(e.clientX, e.clientY); if (!p) return
			if (v.kind === 'iso') { const mid = hitIsoFaces(v.isoFaces, p); if (mid) v.selectObj(mid); else v.clearSel(); return }   // 3D: select a shape (no in-view grips yet)
			// B25: a Shift-press toggles the entity that was PRESSED, not whatever sits under the release point.
			const g = v.expandGroup(this.shiftPressId ? [this.shiftPressId] : v.hit(p))   // + any group it belongs to
			this.shiftPressId = null
			if (e.shiftKey || e.ctrlKey || e.metaKey) {   // additive: toggle the whole group, else a model object (I4)
				if (g.length) v.toggleEnts(g); else { const mid = v.hitModel(p); if (mid) v.toggleObj(mid) }
				return
			}
			// entity wins; else a model object; else a section marker border; else a guide; else clear.
			// Clicking again on the same spot steps DOWN through everything under it (entities top-first, then the
			// model object), so a shape hidden under another can be reached.
			const cands = this.clickCandidates(p)
			if (cands.length > 1) {
				if (e.detail >= 2) return   // the 2nd click of a double-click keeps what the 1st picked (dblclick acts on it)
				// cycle on only while the selection is still what the last click here picked (else start at the top)
				const lc = this.lastClick
				const again = lc && Math.hypot(e.clientX - lc.x, e.clientY - lc.y) <= 4 && lc.sel === this.selAtPress   // the press may already have re-picked the top one
				const k = again ? (lc!.k + 1) % cands.length : 0
				const c = cands[k]
				if (c.obj) this.pickObj(c.obj, p); else v.selectEnts(c.ids!)
				this.lastClick = { x: e.clientX, y: e.clientY, k, sel: this.selKey() }
				return
			}
			this.lastClick = null
			if (g.length) return v.selectEnts(g)
			const mid = v.hitModel(p); if (mid) return this.pickObj(mid, p)
			const sid = v.hitSection(p); if (sid) return v.selectSection(sid)
			const gid = v.hitGuide(p); if (gid) return v.selectGuide(gid)
			return v.clearSel()
		}
		if (tool === 'Text') { const p = this.drawPoint(e.clientX, e.clientY); if (p) v.editor.ents.add({ id: uid(), type: 'text', a: p, text: 'TEXT', plane: drawPlane(v.ctx) }); v.snapMark = null; return }
		if (tool === 'Block') { const p = this.drawPoint(e.clientX, e.clientY); if (p && v.blockId) this.placeBlock(v.blockId, p); v.snapMark = null; return }   // D5
		if (tool === 'Renumber') { const p = v.toModel(e.clientX, e.clientY); if (p) this.walkClick(p); return }   // E3
		if (tool === 'Guide') { const p = v.toModel(e.clientX, e.clientY); if (p) this.placeGuide(p, v.guideIsVert(e.shiftKey)); return }
		// Model objects are placed in the plan — EXCEPT wall/trunk/pipe graphs, which can also be drawn in an elevation.
		if (MODEL_TOOL.has(tool) && !v.isPlan && !(MODEL_GRAPH.has(tool) && v.isElev)) return
		if (!v.acad) return   // EOS mode: shapes are drawn press-drag (onDown), not by clicking
		const sp = this.drawPoint(e.clientX, e.clientY, this.draft.at(-1), e.shiftKey); if (!sp) return
		if (POLY.has(tool)) { if (!this.draft.length || dist(this.draft.at(-1)!, sp) > 0.01) this.draft = [...this.draft, sp]; this.cur = sp; v.snapMark = null; return }   // accumulate (skip dup)
		// other tools: two clicks. Seed `cur` at the first corner so the rubber band starts zero-size.
		if (!this.draft.length) { this.draft = [sp]; this.cur = sp; v.snapMark = null; return }
		this.place(this.draft[0], sp)
		this.endDraft()
	}

	onMove = (e: PointerEvent) => {
		const v = this.v, tool = v.tool
		if (v.on.coords) { const wp = v.toModel(e.clientX, e.clientY); if (wp) v.on.coords(Math.round(wp[0]), Math.round(wp[1])) }   // status-bar coords
		if (v.active) this.lastPtr = v.toModel(e.clientX, e.clientY)   // where pasted text lands
		if (v.active && this.myPick) { const d = this.pickPoint(e); this.pickCur = d; cmdBus.hover = d && this.toUser(d); this.hoverBody = false; return }
		if (v.active && tool === 'Guide' && v.viewSpace) {
			const gp = v.toModel(e.clientX, e.clientY); this.lastGuidePt = gp
			const vert = v.guideIsVert(e.shiftKey); this.guideCur = gp ? { orient: vert ? 'v' : 'h', pos: vert ? gp[0] : gp[1] } : null
		} else if (this.guideCur) { this.guideCur = null; this.lastGuidePt = null }
		if (v.active && this.draft.length) { const sp = this.drawPoint(e.clientX, e.clientY, this.draft.at(-1), e.shiftKey); if (sp) { this.lastRaw = v.toModel(e.clientX, e.clientY); this.cur = sp; this.hoverPt = sp } }
		else if (v.active && DRAW.has(tool) && tool !== 'Guide') this.hoverPt = this.drawPoint(e.clientX, e.clientY, undefined, e.shiftKey)
		else this.hoverPt = null
		if (this.hoverIdle()) this.scheduleHover(e.clientX, e.clientY)
		else this.hoverBody = false
	}
	onLeave = () => { this.hoverPt = null }

	/** Double-click: enter an inactive viewport; finish a polyline; edit a TEXT in place; add a wall/conduit node. */
	onDblclick = (e: MouseEvent) => {
		const v = this.v
		e.stopPropagation()
		if (v.navMode === 'pan') return
		if (!v.active) { v.on.activate?.(); return }
		if (POLY.has(v.tool) && this.draft.length) { this.finishPolyline(); return }
		const p = v.toModel(e.clientX, e.clientY); if (!p) return
		const ent = v.entities.find((x) => x.id === v.hit(p)[0])
		// a wrapped text — or Shift+double-click on a plain one — opens the large editor dialog (+page renders it)
		if (ent?.type === 'text' && (isNote(ent) || e.shiftKey)) { const id = ent.id; textDialog.open({ text: ent.text ?? '', plain: !isNote(ent), width: ent.noteW, fontPt: ent.fontPt,
			apply: (t) => { const cur = this.v.entities.find((x) => x.id === id); if (cur) this.v.editor.ents.update({ ...cur, text: t }) } }); return }
		if (ent?.type === 'text') { this.startTextEdit(ent); return }
		if (ent?.type === 'dim' || (ent?.type === 'polyline' && ent.text)) { this.startFieldEdit(ent); return }
		if (ent && insertLink(ent) && insertLink(ent) !== '~url') { v.on.openLink?.(insertLink(ent)); return }   // D4: a linked symbol opens its target
		if (v.tool === 'Select' && v.modelEditable) this.insertGraphNode(p)
	}

	/** Right-click (CAD-style): ends a multi-point draft (= Enter); with a drawing tool and no draft it reverts
	 *  to Select (like Esc). A right-DRAG is a pan, so only a genuine click (≤ 5 px since right-down) reverts. */
	noteRightDown = (e: PointerEvent) => {
		// a field being edited elsewhere (a Properties input) commits NOW — its change event runs while the OLD shape is
		// still selected; left to the browser, the blur comes after this press re-selects and saves onto the new shape
		const f = document.activeElement as HTMLElement | null
		if (f && f !== document.body && !f.closest('.vp') && /^(INPUT|TEXTAREA|SELECT)$/.test(f.tagName) && !f.closest('.cmdline')) f.blur()
		if (e.button === 2) { this.rDownPt = { x: e.clientX, y: e.clientY }; this.rWheel = false }
	}
	/** A wheel turned while the right button is held (right + wheel = zoom): that release is a gesture, not a click. */
	noteWheel = (e: WheelEvent) => { if (e.buttons & 2) this.rWheel = true }
	private rWheel = false
	onContext = (e: MouseEvent) => {
		const v = this.v
		if (!v.active) return
		// a right-DRAG (pan) or right + wheel (zoom) is a gesture: it never finishes / cancels a draw or a command
		const gesture = this.rWheel || (this.rDownPt ? Math.hypot(e.clientX - this.rDownPt.x, e.clientY - this.rDownPt.y) > 5 : false)
		this.rDownPt = null; this.rWheel = false
		if (cmdBus.busy && cmdBus.target === this.cmdTarget) {   // right-click = Enter for a running command
			e.preventDefault(); e.stopPropagation()
			if (!gesture) cmdBus.signal?.('enter')
			return
		}
		if (gesture) { if (v.tool !== 'Select' || this.draft.length) { e.preventDefault(); e.stopPropagation() } return }
		if (POLY.has(v.tool) && this.draft.length) { e.preventDefault(); e.stopPropagation(); this.finishPolyline(); return }
		if (v.tool !== 'Select') { e.preventDefault(); e.stopPropagation(); this.endDraft(); v.on.tool?.('Select') }
	}

	/** Re-apply the Shift constraint the instant Shift changes — for a draw and for a move/grip drag. */
	private reconstrain(shift: boolean) {
		const v = this.v
		if (this.items.drag) this.items.reconstrain(shift)
		else if (v.active && this.draft.length && this.lastRaw) this.cur = constrainPt(v.tool, this.draft.at(-1)!, this.lastRaw, shift)   // Shift: square / 15°
	}

	// ══ keys: Esc ladder (exit image mode → cancel draft → back to Select → clear selection → exit viewport),
	// Enter finishes a polyline, clipboard / group / draw order, Delete, arrow nudges ══
	onKey = (e: KeyboardEvent) => {
		const v = this.v, sel = v.sel, ents = v.editor.ents
		if (!v.active || !v.focused || this.editText) return   // in split view only the focused pane handles keys
		if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return   // typing in a field → let it through
		if (e.key === 'Shift') { v.shiftDown = true; this.reconstrain(true); this.updateGuidePreview(true); return }
		if (cmdBus.busy && (e.key === 'Enter' || e.key === 'Escape')) { e.preventDefault(); cmdBus.signal?.(e.key === 'Escape' ? 'cancel' : 'enter'); return }
		if (e.key === 'Enter' && POLY.has(v.tool) && this.draft.length) { e.preventDefault(); this.finishPolyline(); return }
		const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase()
		if (mod && k === 'a') { e.preventDefault(); v.selectEnts(v.entities.map((x) => x.id)); return }
		const objSel = idsOfKind(v.selection, 'obj')   // walls / boxes / conduits edit alongside shapes (their own kind in the Selection)
		if (mod && k === 'd' && (sel.length || objSel.length)) {   // duplicate, offset 5 PAPER mm (B19: visible at any scale)
			e.preventDefault(); this.items.duplicateSel(5 * v.paperMm)
			return
		}
		if (mod) {   // draw order: Ctrl+] forward · Ctrl+[ backward · +Shift = to front / back; clipboard; grouping
			if ((e.key === ']' || e.key === '}') && sel.length) { e.preventDefault(); ents.reorder(sel, e.shiftKey ? 'front' : 'forward'); return }
			if ((e.key === '[' || e.key === '{') && sel.length) { e.preventDefault(); ents.reorder(sel, e.shiftKey ? 'back' : 'backward'); return }
			if (k === 'c' && (sel.length || objSel.length)) { e.preventDefault(); ents.copy(sel, objSel); return }
			if (k === 'x' && (sel.length || objSel.length)) { e.preventDefault(); ents.cut(sel, objSel); return }
			if (k === 'v') return   // the PASTE EVENT does it (+page onPaste — it can read the system clipboard)
			if (k === 'g' && sel.length) { e.preventDefault(); if (e.shiftKey) ents.ungroup(sel); else ents.group(sel); return }
		}
		// every selection kind deletes through ONE call (kinds are mutually exclusive in the Selection)
		if ((e.key === 'Delete' || e.key === 'Backspace') && (sel.length || v.modelSel.length || v.selSection) && !this.draft.length) { e.preventDefault(); v.editor.sel.delete(); return }
		if ((sel.length || objSel.length) && e.key.startsWith('Arrow')) {
			e.preventDefault()
			const s = e.shiftKey ? 10 : 1
			const dx = e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0, dy = e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0
			this.items.nudge(dx, dy)   // a nudge burst coalesces into one history step (closes 600 ms after the last)
			return
		}
		if (e.key !== 'Escape') return
		if (cptPick.obj) cptPick.obj = null
		else if (imgEdit.mode) { clearImgMode(); this.scalePts = []; this.scaleReal = null }
		else if (this.draft.length) this.endDraft()
		else if (v.tool !== 'Select') v.on.tool?.('Select')
		else if (v.selSection || sel.length || v.modelSel.length) v.clearSel()
		else v.on.deactivate?.()
	}
	onKeyUp = (e: KeyboardEvent) => {
		if (e.key !== 'Shift') return
		this.v.shiftDown = false
		if (this.v.active && this.v.focused) { this.reconstrain(false); this.updateGuidePreview(false) }
	}

	// ══ press: decide what the press grabs (VpView.pickAt) and start that gesture ══
	private cancelPointerDrag() {
		this.reg.cancelAll()
		if (this.draft.length) this.endDraft()   // abort an in-progress draw (press-drag or two-click)
	}
	onDown = (e: PointerEvent) => {
		const v = this.v, ed = v.editor.edit, reg = this.reg
		if (this.editText || !v.active || e.button !== 0) return
		if (this.myPick) return   // a command pick: the click (onClick) delivers the point — no drags
		if ((e.target as Element)?.closest?.('.section-arrow.pick')) return   // a section-arrow click drops a direction
		this.suppressClick = false   // clear any stale flag from a drag that never got its click
		this.shiftPressId = null
		this.selAtPress = this.selKey()
		v.demoteNodeToObj()          // a fresh press resets the node selection (re-set on a no-move node-grip click)
		if (reg.noteDown(e)) { this.cancelPointerDrag(); return }   // 2nd finger → hand off to pan/zoom
		// calibrating scale: a press near a placed endpoint drags it
		if (imgEdit.mode === 'scale' && this.scalePts.length === 2) {
			for (let i = 0; i < 2; i++) { const sp = v.toClient(this.scalePts[i][0], this.scalePts[i][1]); if (sp && Math.hypot(sp.x - e.clientX, sp.y - e.clientY) < 14) { beginPointerDrag<number>(e, i, { onMove: this.onScaleDragMove }, reg); return } }
		}
		if (imgEdit.mode === 'scale' || imgEdit.mode === 'origin') return   // pick modes: onClick places the point
		if (cptPick.obj && v.isPlan) return   // placing connection points: onClick adds one (no drag of the box)
		if (v.navMode === 'pan') return   // latched Pan: panzoom owns the drag (it only gets here when the pan target is disabled)
		if (v.kind === 'iso' && (v.tool === 'Select' || v.navMode === 'orbit')) {   // 3D: a plain drag (or any drag with Orbit latched) orbits
			const r = v.svg?.getBoundingClientRect(), mid = r ? v.toModel(r.left + r.width / 2, r.top + r.height / 2) : null
			beginPointerDrag<OrbitDrag>(e, { sx: e.clientX, sy: e.clientY, yaw0: v.yaw, pitch0: v.pitch, rel: mid ? [mid[0] - v.cx, mid[1] - v.cy] : null, view0: { ...v.view } }, { onMove: this.onOrbitMove, onUp: (_e, _s, moved) => { if (moved) this.suppressClick = true } }, reg)
			return
		}
		if (v.tool !== 'Select') {   // EOS mode: a shape is one press-drag-release
			if (v.acad || v.tool === 'Text' || v.tool === 'Guide' || v.tool === 'Block' || v.tool === 'Renumber') return   // AutoCAD two-click / text, guide, block, renumber single-click via onClick
			const dp = this.drawPoint(e.clientX, e.clientY); if (!dp) return
			this.draft = [dp]; this.cur = dp
			beginPointerDrag(e, null, { onMove: this.onDrawMove, onUp: this.onDrawUp, onCancel: () => this.endDraft() }, reg)
			return
		}
		const p = v.toModel(e.clientX, e.clientY); if (!p) return
		const pk = v.pickAt(e.clientX, e.clientY, p)
		if (pk?.kind === 'mgrip') {   // a selected model object's grip (prism corner / wall node) wins over everything
			const g = pk.grip
			ed.begin()   // one undo step for the whole reshape gesture
			// Ctrl/⌘-press on a wall/conduit node BRANCHES: sprout a new segment + drag the new node out.
			let grip = g, origin: Pt = [g.x, g.y], branch: (() => void) | undefined
			if ((e.ctrlKey || e.metaKey) && g.node && g.obj && (g.obj.type === 'wall' || g.obj.type === 'conduit')) {
				const obj = g.obj, nn = branchNode(obj, g.node, newId)
				const d = v.graphNodeDraw(nn); origin = [d[0], d[1]]
				grip = { x: d[0], y: d[1], node: nn, obj, apply: (q: Pt, o?: Pt) => v.graphNodeApply(nn, q, o) }
				branch = () => { obj.nodes = (obj.nodes as GN[]).filter((x) => x.id !== nn.id); obj.segments = (obj.segments as { id: string; a: string; b: string }[]).filter((s) => s.b !== nn.id && s.a !== nn.id) }
			}
			// F5: nodes of OTHER walls / conduits sitting on the dragged node move with it (a pipe meeting a trunk stays
			// joined); Alt-drag detaches it from them
			const peers = !branch && !e.altKey && g.node && g.obj ? coincidentNodes(v.mdl?.objects ?? [], g.obj, g.node) : []
			// …and INSIDE one run: Alt-drag on a node joining 2+ of its segments splits it (on the first move) — the
			// selected segment's end comes away, else the segment along the drag
			const ss = v.segSel, split = !branch && e.altKey && g.node && g.obj && (g.obj.type === 'wall' || g.obj.type === 'conduit')
				&& (g.obj.segments as { a: string; b: string }[]).filter((s) => s.a === g.node!.id || s.b === g.node!.id).length > 1
				? { segId: ss && ss.obj === g.obj.id ? ss.seg : undefined } : undefined
			beginPointerDrag<MGripDrag>(e, { grip, origin, branch, peers, split }, { onMove: this.onModelGripMove, onUp: this.onModelGripUp, onCancel: this.onModelGripCancel }, reg)
		} else if (pk?.kind === 'ggrip') {   // D13: the multi-selection's transform box — rotate / scale them all
			const gx = v.groupXf; if (!gx) return
			const bases = v.groupSel.map((x) => $state.snapshot(x) as Ent)
			const g: GroupDrag = pk.rot ? { bases, pivot: gx.pivot, a0: Math.atan2(p[1] - gx.pivot[1], p[0] - gx.pivot[0]) }
				: { bases, pivot: gx.corners[pk.corner!].opp, corner: gx.corners[pk.corner!].c }
			ed.begin()
			beginPointerDrag<GroupDrag>(e, g, { onMove: this.onGroupMove, onUp: (_e, _s, moved) => { if (moved) this.suppressClick = true; this.closeEdit() },
				onCancel: (s) => { v.editor.ents.updateMany(s.bases); this.closeEdit() } }, reg)
		} else if (pk?.kind === 'sgrip') {   // a corner grip of the SELECTED section resizes it
			ed.begin()
			beginPointerDrag<SecResize>(e, { ...pk.sg }, { onMove: this.onSecResizeMove, onUp: this.onSecResizeUp, onCancel: this.closeEdit }, reg)
		} else if (pk?.kind === 'guide') {   // a guide (a thin overlay grabbed in open space) → select + drag
			v.selectGuide(pk.id)
			ed.begin()
			beginPointerDrag<string>(e, pk.id, { onMove: this.onGuideDragMove, onUp: this.onGuideDragUp, onCancel: this.closeEdit }, reg)
		} else if (pk?.kind === 'section') {   // a section border → select + move (a no-move press just selects)
			const sm = v.sections.find((s) => s.id === pk.id); if (!sm) return
			if (v.selSection !== pk.id) v.selectSection(pk.id)
			ed.begin()
			beginPointerDrag<SecDrag>(e, { id: pk.id, start: p, c0: { ...sm.clip } }, { onMove: this.onSecDragMove, onUp: this.onSecDragUp, onCancel: this.closeEdit }, reg)
		} else if (pk?.kind === 'obj') {   // a MODEL object → select + move, on the same engine as shapes (Shift = toggle on release, Ctrl-drag = copy)
			if (e.shiftKey) { this.reg.forget(e); return }   // I4: a Shift press only toggles it (onClick)
			this.startEntDrag(e, p, 'move', pk.id, -1)
		} else if (!pk) {   // empty space → a Kestrel-style selection box (window / crossing); Shift/Ctrl = additive
			this.items.beginMarquee(p, e.shiftKey || e.ctrlKey || e.metaKey)
			beginPointerDrag(e, null, { onMove: this.onMarqueeMove, onUp: this.onMarqueeUp, onCancel: () => this.items.cancelMarquee() }, reg)
		} else this.startEntDrag(e, p, pk.kind === 'grip' ? 'grip' : 'move', pk.id, pk.kind === 'grip' ? pk.gi : -1)
	}

	// ── D13 group transform: every move re-applies to the press-time snapshots (no drift) ──
	private onGroupMove = (e: PointerEvent, s: GroupDrag) => {
		const v = this.v, p = v.toModel(e.clientX, e.clientY); if (!p) return
		if (s.corner) {
			const k = cornerScale(s.pivot, s.corner, p), f = e.shiftKey ? Math.round(k * 10) / 10 || 0.1 : k   // Shift → 0.1 steps
			v.editor.ents.updateMany(s.bases.map((b) => scaleAbout(b, s.pivot, f)))
		} else {
			const deg = snapAngle(Math.round(((Math.atan2(p[1] - s.pivot[1], p[0] - s.pivot[0]) - s.a0!) * 180) / Math.PI), e.shiftKey)   // Shift → 15° steps
			v.editor.ents.updateMany(s.bases.map((b) => rotateAbout(b, s.pivot, deg, rotCenter(v.ctx, b))))
		}
	}

	// ── shape / object move, shape grip, Ctrl-duplicate drag — the engine (ItemEditor) does the work; this is the pointer plumbing ──
	private startEntDrag(e: PointerEvent, p: Pt, kind: 'grip' | 'move', id: string, gi: number) {
		if (!this.v.entities.some((x) => x.id === id) && !this.v.mdl?.objects.some((o) => o.id === id)) return
		if (e.shiftKey && kind === 'move') { this.shiftPressId = id; this.reg.forget(e); return }   // Shift-press on a body is selection-only (toggles on release)
		// Ctrl/⌘-drag DUPLICATES (copies created on the first move); a Ctrl-CLICK toggles via onClick
		const mod = e.ctrlKey || e.metaKey
		if (!this.items.beginMove(id, p, kind, gi, { dup: mod, additive: mod })) return
		beginPointerDrag(e, null, { onMove: this.onDragMove, onUp: this.onDragUp, onCancel: this.onDragCancel }, this.reg, kind === 'move' ? { thresholdPx: 3 } : {})
	}
	private onDragMove = (e: PointerEvent) => {
		const p = this.v.toModel(e.clientX, e.clientY); if (!p) return
		this.items.moveTo(p, e.shiftKey, { x: e.clientX, y: e.clientY })
	}
	private onDragUp = (_e: PointerEvent, _s: null, moved: boolean) => {
		if (moved) this.suppressClick = true
		this.v.snapMark = null; this.items.endMove()
	}
	private onDragCancel = (_s: null, moved: boolean) => { this.v.snapMark = null; this.items.cancelMove(moved) }   // 2nd finger → revert any partial move/resize

	// ── EOS press-drag draw: press = first point, drag = preview, release = second point ──
	private onDrawMove = (e: PointerEvent) => {
		if (!this.draft.length) return
		const sp = this.drawPoint(e.clientX, e.clientY, this.draft[0], e.shiftKey); if (!sp) return
		this.lastRaw = this.v.toModel(e.clientX, e.clientY)
		this.cur = sp
	}
	private onDrawUp = (e: PointerEvent) => {
		const a = this.draft[0]; this.draft = []; this.cur = null
		const b = this.drawPoint(e.clientX, e.clientY, a, e.shiftKey); this.v.snapMark = null
		if (!a || !b || dist(a, b) < 2) return   // no drag → not a shape
		this.place(a, b)
		this.suppressClick = true
	}

	// ── selection marquee (Kestrel/AutoCAD): L→R = window (enclose), R→L = crossing (touch) ──
	private onMarqueeMove = (e: PointerEvent) => { const p = this.v.toModel(e.clientX, e.clientY); if (p) this.items.marqueeTo(p) }
	private onMarqueeUp = () => { if (this.items.endMarquee()) this.suppressClick = true }   // a tiny box is a click (onClick clears); Shift/Ctrl UNIONS

	// ── guide drag: one history gesture ('Move guide'); the guide is a live proxy in the model ──
	private onGuideDragMove = (e: PointerEvent, id: string) => {
		const p = this.v.toModel(e.clientX, e.clientY); if (!p) return
		const g = this.v.mdl?.guides?.find((x) => x.id === id); if (!g) return
		g.pos = Math.round(g.orient === 'h' ? p[1] : p[0])
	}
	private onGuideDragUp = (_e: PointerEvent, _id: string, moved: boolean) => {
		if (moved) { this.suppressClick = true; this.v.editor.edit.mark('Move guide') }
		this.v.editor.edit.end()
	}

	// ── model grips (body moves run on the engine, above) — the edits are ui/vpModelEdit.ts; here the undo step
	// (opened at press, marked per move, closed at release) and the trailing click ──
	private onModelGripMove = (e: PointerEvent, s: MGripDrag) => {
		const p = this.v.toModel(e.clientX, e.clientY); if (!p) return
		moveModelGrip(this.v, s, p)
		this.v.editor.edit.mark()
	}
	private onModelGripUp = (_e: PointerEvent, s: MGripDrag, moved: boolean) => {
		const g = s.grip
		if (moved) { this.suppressClick = true; dropNodeJoin(this.v, g); this.v.editor.edit.mark() }
		else if (s.branch) s.branch()   // a Ctrl-branch press with no drag: drop the stray zero-length segment
		else if (g.node && g.obj && (g.obj.type === 'wall' || g.obj.type === 'conduit')) {
			// B29: swallow the trailing click, else onClick re-selects the object's BODY and replaces the node pick
			this.suppressClick = true
			this.v.selectNode(g.obj.id!, g.node.id)   // no-move click on a node grip → select the node
		}
		this.onModelGripCancel()
	}
	private onModelGripCancel = () => { this.v.snapMark = null; this.v.editor.edit.end() }

	// ── section marker move (drag the border) / resize (drag a corner of the SELECTED one); the linked
	// elevation re-clips live. Each opens its undo step at press and ALWAYS closes it. ──
	private onSecDragMove = (e: PointerEvent, s: SecDrag) => {
		const p = this.v.toModel(e.clientX, e.clientY); if (!p) return
		const dx = p[0] - s.start[0], dy = p[1] - s.start[1], c = s.c0
		this.v.setSectionClip(s.id, { ...c, x0: Math.round(c.x0 + dx), x1: Math.round(c.x1 + dx), y0: Math.round(c.y0 + dy), y1: Math.round(c.y1 + dy) })
	}
	private onSecDragUp = (_e: PointerEvent, _s: SecDrag, moved: boolean) => {
		if (moved) { this.suppressClick = true; this.v.editor.edit.mark('Move section') }
		this.v.editor.edit.end()
	}
	private onSecResizeMove = (e: PointerEvent, s: SecResize) => {
		const p = this.v.toModel(e.clientX, e.clientY); if (!p) return
		this.v.setSectionClip(s.id, s.apply(p))
	}
	private onSecResizeUp = (_e: PointerEvent, _s: SecResize, moved: boolean) => {
		if (moved) { this.suppressClick = true; this.v.editor.edit.mark('Resize section') }
		this.v.editor.edit.end()
	}

	// ── 3D iso ORBIT: a drag turns into new yaw/pitch (pitch clamped to (0, 90°)); Shift snaps both to 15° ──
	private onOrbitMove = (e: PointerEvent, s: OrbitDrag) => {
		let ny = s.yaw0 + (e.clientX - s.sx) * 0.008
		let np = Math.max(0.06, Math.min(Math.PI / 2 - 0.02, s.pitch0 + (e.clientY - s.sy) * 0.006))
		if (e.shiftKey) {
			const S = Math.PI / 12
			ny = Math.round(ny / S) * S
			np = Math.max(S, Math.min(Math.PI / 2 - 0.02, Math.round(np / S) * S))
		}
		this.v.on.orbit?.(ny, np)
		if (s.rel) {   // keep the middle of the view where it was (the pivot itself stays put by construction)
			const [nx, nyy] = orbitShift(s.rel, s.yaw0, s.pitch0, ny, np), k = s.view0.zoom * (this.v.dscale || 1)
			this.v.on.view?.({ zoom: s.view0.zoom, x: s.view0.x + k * (s.rel[0] - nx), y: s.view0.y + k * (s.rel[1] - nyy) })
		}
	}
}
