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
import { tick } from 'svelte'
import { toast } from 'svelte-sonner'
import { PT_MM } from '../constants'
import { type Pt, type Ent, STYLE_DEFAULTS, ELEV_BASIS, dist } from './geometry'
import { beginPointerDrag, DragRegistry } from './gestures'
import { drawPlane, buildEnt, sectionObj, sectionName, PRISM_TOOL, trimTail, polylineEnt, graphObj, prismObj, guideObj, imageWithOrigin, imageScaled, moveEnt } from './place'
import { addModelObj, insertGraphNode, branchNode, addGuide, addSection } from './modelEdit'
import { constrainGrip, snapAngle, type MGrip } from './grips'
import { rotateAbout, scaleAbout, cornerScale } from './groupXf'
import { coincidentNodes } from '../3dview/graphJoin'
import { commitConduit, moveModelItems, endModelMove, moveModelGrip, dropNodeJoin, type MDrag, type MGripDrag } from './vpModelEdit'
import { snapToGrid, snapDelta, findSnap, drawPoint } from './snap'
import { rotCenter, hitIsoFaces, marqueeSelect, type GN } from './hit'
import { newId } from '../ids'
import { constrainPt } from './annotations'
import { pasteCopies, relabelCopies } from './clipboard'
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
type EntDrag = { id: string; base: Ent; bases: Ent[]; kind: 'grip' | 'move'; gi: number; start: Pt; dup?: boolean; duplicated?: boolean }
/** D13: a group-box drag — scale about `pivot` (the opposite corner) toward `corner`, or rotate about `pivot`
 *  (the barycentre) from the press angle `a0` (radians). */
type GroupDrag = { bases: Ent[]; pivot: Pt; corner?: Pt; a0?: number }
type SecDrag = { id: string; start: Pt; c0: Clip }
type SecResize = { id: string; apply: (p: Pt) => Clip }
type OrbitDrag = { sx: number; sy: number; yaw0: number; pitch0: number }
export type TextEdit = { id: string; x: number; y: number; fontPx: number; value: string; align: 'left' | 'center' | 'right'; valign: 'top' | 'middle' | 'bottom'; rot: number; cx: number; cy: number }

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
	}

	// ── drafting ──
	draft = $state<Pt[]>([])
	cur = $state<Pt | null>(null)
	/** Snapped draw point under the cursor (drives the crosshair, even before the first click). */
	hoverPt = $state<Pt | null>(null)
	private lastRaw: Pt | null = null   // last UNconstrained pointer during a draft (for re-constraining on Shift)
	private endDraft() { this.draft = []; this.cur = null; this.v.snapMark = null }

	// ── gestures ──
	marquee = $state<{ a: Pt; b: Pt; add?: boolean } | null>(null)
	private drag: EntDrag | null = null
	private lastDragRaw: Pt | null = null
	private suppressClick = false   // swallow the click that ends a real drag (avoids re-select)
	private shiftPressId: string | null = null   // B25: the entity a Shift-press landed on (onClick toggles THIS id)
	private rDownPt: { x: number; y: number } | null = null   // where the RIGHT button went down (onContext: click vs pan-drag)
	private readonly reg = new DragRegistry()
	private closeEdit = () => this.v.editor.edit.end()   // onCancel for gestures that open an undo step at press

	// ── hover cursor: 'move' over something a press would grab (P2: the same pickAt cascade as a press, at
	// most once per animation frame) ──
	hoverBody = $state(false)
	cursorStyle = $derived.by(() => (!this.v.active ? 'pointer' : this.v.navMode === 'pan' ? 'grab' : this.v.navMode === 'orbit' && this.v.kind === 'iso' ? 'move' : DRAW.has(this.v.tool) ? 'crosshair' : this.hoverBody ? 'move' : 'default'))
	private hoverRaf = 0
	private hoverAt: [number, number] | null = null
	private hoverIdle = () => this.v.active && this.v.tool === 'Select' && !this.drag && !this.reg.active && !this.draft.length && !this.marquee
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
	/** The point a draw/place uses: object snap wins; else the Shift/ORTHO-constrained, grid-snapped pointer. */
	private drawPoint(clientX: number, clientY: number, base?: Pt, shift = false): Pt | null {
		const v = this.v, m = v.mapper(); if (!m) { v.snapMark = null; return null }
		const r = drawPoint(v.ctx, m, { osnap: v.osnap, snap: v.snap, step: v.snapStep, ortho: v.ortho, tool: v.tool, ents: v.entities, editingId: this.editText?.id, objs: v.mdl?.objects, ml: v.mlayers }, clientX, clientY, base, shift)
		v.snapMark = r.mark
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
		if (ps && v.isPlan) { this.addModelObj(prismObj(v.ctx, a, b, ps.layer, ps.h, () => newId(ps.tag))); return }
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
		const o = graphObj(v.ctx, v.tool, pts, { guide, depthSnap: (p) => v.elevDepthSnap(p)?.off ?? null, uid: newId })
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
		this.editText = { id: ent.id, x, y, fontPx, value: ent.text ?? '', align: ent.align ?? 'left', valign: ent.valign ?? 'top', rot: ent.rot ?? 0, cx, cy }
		tick().then(() => { this.textInput?.focus(); this.textInput?.select() })
	}
	commitText = () => {
		const t = this.editText; if (!t) return
		const ent = this.v.entities.find((x) => x.id === t.id)
		if (ent) this.v.editor.ents.update({ ...ent, text: t.value })
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
				if (c.obj) v.selectObj(c.obj); else v.selectEnts(c.ids!)
				this.lastClick = { x: e.clientX, y: e.clientY, k, sel: this.selKey() }
				return
			}
			this.lastClick = null
			if (g.length) return v.selectEnts(g)
			const mid = v.hitModel(p); if (mid) return v.selectObj(mid)
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
		if (ent?.type === 'text') { this.startTextEdit(ent); return }
		if (ent && insertLink(ent) && insertLink(ent) !== '~url') { v.on.openLink?.(insertLink(ent)); return }   // D4: a linked symbol opens its target
		if (v.tool === 'Select' && v.modelEditable) this.insertGraphNode(p)
	}

	/** Right-click (CAD-style): ends a multi-point draft (= Enter); with a drawing tool and no draft it reverts
	 *  to Select (like Esc). A right-DRAG is a pan, so only a genuine click (≤ 5 px since right-down) reverts. */
	noteRightDown = (e: PointerEvent) => { if (e.button === 2) this.rDownPt = { x: e.clientX, y: e.clientY } }
	onContext = (e: MouseEvent) => {
		const v = this.v
		if (!v.active) return
		if (POLY.has(v.tool) && this.draft.length) { e.preventDefault(); e.stopPropagation(); this.finishPolyline(); return }
		const moved = this.rDownPt ? Math.hypot(e.clientX - this.rDownPt.x, e.clientY - this.rDownPt.y) > 5 : false
		this.rDownPt = null
		if (!moved && v.tool !== 'Select') { e.preventDefault(); e.stopPropagation(); this.endDraft(); v.on.tool?.('Select') }
	}

	/** Re-apply the Shift constraint the instant Shift changes — for a draw and for a move/grip drag. */
	private reconstrain(shift: boolean) {
		const v = this.v, drag = this.drag
		if (drag && this.lastDragRaw) {
			if (drag.kind === 'grip') v.editor.ents.update(this.applyDrag(drag, this.lastDragRaw, shift))
			else {
				let dx = this.lastDragRaw[0] - drag.start[0], dy = this.lastDragRaw[1] - drag.start[1]
				if (shift !== v.ortho) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0 }
				v.editor.ents.updateMany(drag.bases.map((b) => moveEnt(v.ctx, b, dx, dy)))
			}
		} else if (v.active && this.draft.length && this.lastRaw) this.cur = constrainPt(v.tool, this.draft.at(-1)!, this.lastRaw, shift)   // Shift: square / 15°
	}

	// ══ keys: Esc ladder (exit image mode → cancel draft → back to Select → clear selection → exit viewport),
	// Enter finishes a polyline, clipboard / group / draw order, Delete, arrow nudges ══
	onKey = (e: KeyboardEvent) => {
		const v = this.v, sel = v.sel, ents = v.editor.ents
		if (!v.active || !v.focused || this.editText) return   // in split view only the focused pane handles keys
		if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return   // typing in a field → let it through
		if (e.key === 'Shift') { v.shiftDown = true; this.reconstrain(true); this.updateGuidePreview(true); return }
		if (e.key === 'Enter' && POLY.has(v.tool) && this.draft.length) { e.preventDefault(); this.finishPolyline(); return }
		const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase()
		if (mod && k === 'a') { e.preventDefault(); v.selectEnts(v.entities.map((x) => x.id)); return }
		if (mod && k === 'd' && sel.length) {   // duplicate, offset 5 PAPER mm (B19: visible at any scale)
			e.preventDefault()
			const off = 5 * v.paperMm, copies = relabelCopies(pasteCopies(sel.map((id) => v.entities.find((x) => x.id === id)).filter(Boolean) as Ent[], off, uid), v.entities)
			copies.forEach((c) => ents.add(c)); v.selectEnts(copies.map((c) => c.id))
			return
		}
		if (mod) {   // draw order: Ctrl+] forward · Ctrl+[ backward · +Shift = to front / back; clipboard; grouping
			if ((e.key === ']' || e.key === '}') && sel.length) { e.preventDefault(); ents.reorder(sel, e.shiftKey ? 'front' : 'forward'); return }
			if ((e.key === '[' || e.key === '{') && sel.length) { e.preventDefault(); ents.reorder(sel, e.shiftKey ? 'back' : 'backward'); return }
			if (k === 'c' && sel.length) { e.preventDefault(); ents.copy(sel); return }
			if (k === 'x' && sel.length) { e.preventDefault(); ents.cut(sel); return }
			if (k === 'v') { e.preventDefault(); ents.paste(); return }
			if (k === 'g' && sel.length) { e.preventDefault(); if (e.shiftKey) ents.ungroup(sel); else ents.group(sel); return }
		}
		// every selection kind deletes through ONE call (kinds are mutually exclusive in the Selection)
		if ((e.key === 'Delete' || e.key === 'Backspace') && (sel.length || v.modelSel.length || v.selSection) && !this.draft.length) { e.preventDefault(); v.editor.sel.delete(); return }
		if (sel.length && e.key.startsWith('Arrow')) {
			e.preventDefault()
			const s = e.shiftKey ? 10 : 1
			const dx = e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0, dy = e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0
			v.editor.edit.begin()   // coalesce a nudge burst into one history step (closes 600ms after the last)
			ents.updateMany(sel.flatMap((id) => { const en = v.entities.find((x) => x.id === id); return en ? [moveEnt(v.ctx, en, dx, dy)] : [] }))
			v.editor.edit.end(600)
			return
		}
		if (e.key !== 'Escape') return
		if (imgEdit.mode) { clearImgMode(); this.scalePts = []; this.scaleReal = null }
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
		if (v.navMode === 'pan') return   // latched Pan: panzoom owns the drag (it only gets here when the pan target is disabled)
		if (v.kind === 'iso' && (v.tool === 'Select' || v.navMode === 'orbit')) {   // 3D: a plain drag (or any drag with Orbit latched) orbits
			beginPointerDrag<OrbitDrag>(e, { sx: e.clientX, sy: e.clientY, yaw0: v.yaw, pitch0: v.pitch }, { onMove: this.onOrbitMove, onUp: (_e, _s, moved) => { if (moved) this.suppressClick = true } }, reg)
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
			beginPointerDrag<MGripDrag>(e, { grip, origin, branch, peers }, { onMove: this.onModelGripMove, onUp: this.onModelGripUp, onCancel: this.onModelGripCancel }, reg)
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
		} else if (pk?.kind === 'obj') {   // a MODEL object → select + move
			const mo = v.mdl?.objects.find((o) => o.id === pk.id); if (!mo) return
			if (e.shiftKey || e.ctrlKey || e.metaKey) return   // I4: a modifier press only toggles it (onClick)
			// pressing one of several selected objects keeps the selection and drags them all
			const multi = v.modelSel.length > 1 && v.modelSel.includes(mo.id!)
			if (!multi) v.selectObj(mo.id!)
			const objs = multi ? v.mdl!.objects.filter((o) => v.modelSel.includes(o.id!)) : [mo]
			ed.begin()
			beginPointerDrag<MDrag>(e, { start: p, items: objs.map((o) => ({ id: o.id!,
				o0: o.type === 'prism' ? { x: o.x, y: o.y, z: o.z } : undefined,
				n0: (o.type === 'wall' || o.type === 'conduit') ? (o.nodes as GN[]).map((n) => ({ id: n.id, x: n.x, y: n.y, z: n.z })) : undefined,
			})) }, { onMove: this.onModelDragMove, onUp: this.onModelDragUp, onCancel: this.closeEdit }, reg)
		} else if (!pk) {   // empty space → a Kestrel-style selection box (window / crossing); Shift/Ctrl = additive
			this.marquee = { a: p, b: p, add: e.shiftKey || e.ctrlKey || e.metaKey }
			beginPointerDrag(e, null, { onMove: this.onMarqueeMove, onUp: this.onMarqueeUp, onCancel: () => { this.marquee = null } }, reg)
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

	// ── entity move / grip / Ctrl-duplicate drag ──
	private startEntDrag(e: PointerEvent, p: Pt, kind: 'grip' | 'move', id: string, gi: number) {
		const v = this.v
		const base = v.entities.find((x) => x.id === id); if (!base) return
		if (e.shiftKey && kind === 'move') { this.shiftPressId = id; this.reg.forget(e); return }   // Shift-press on a body is selection-only (toggles on release)
		if (!(e.ctrlKey || e.metaKey) && !v.selSet.has(id)) v.selectEnts(v.expandGroup([id]))   // plain press on an unselected entity → select it (+ its group)
		const moveIds = kind === 'move' ? (v.selSet.has(id) ? v.sel : v.expandGroup([id])) : [id]
		const bases = moveIds.map((i) => v.entities.find((x) => x.id === i)).filter(Boolean) as Ent[]
		// Ctrl/⌘-drag DUPLICATES (copies created on the first move); a Ctrl-CLICK toggles via onClick
		this.drag = { id, base, bases, kind, gi, start: p, dup: (e.ctrlKey || e.metaKey) && kind === 'move', duplicated: false }
		v.editor.edit.begin()   // one history step for the whole drag
		beginPointerDrag<EntDrag>(e, this.drag, { onMove: this.onDragMove, onUp: this.onDragUp, onCancel: this.onDragCancel }, this.reg)
	}
	private applyDrag(drag: EntDrag, p: Pt, shift: boolean): Ent {
		const v = this.v
		if (drag.kind === 'grip') { const cp = constrainGrip(v.ctx, drag.base, drag.gi, p, shift, v.gripOpts()); return v.gripsFor(drag.base)[drag.gi].apply(v.snap ? snapToGrid(cp, v.snapStep) : cp) }
		let dx = p[0] - drag.start[0], dy = p[1] - drag.start[1]
		if (shift !== v.ortho) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0 }   // ortho / axis-lock
		const [sdx, sdy] = snapDelta(dx, dy, drag.base, v.snap ? v.snapStep : 0)
		return moveEnt(v.ctx, drag.base, sdx, sdy)
	}
	private onDragMove = (e: PointerEvent) => {
		const v = this.v, drag = this.drag; if (!drag) return
		const p = v.toModel(e.clientX, e.clientY); if (!p) return
		this.lastDragRaw = p
		if (drag.kind === 'grip') {
			const s = v.osnap ? this.findSnap(e.clientX, e.clientY, drag.id) : null
			v.editor.ents.update(s ? v.gripsFor(drag.base)[drag.gi].apply(s) : this.applyDrag(drag, p, e.shiftKey))
			return
		}
		if (drag.dup && !drag.duplicated) {   // Ctrl-drag: on the first real move, drop copies and drag them
			const copies = relabelCopies(pasteCopies(drag.bases, 0, uid), v.entities)   // own ids + group ids; outlets get the next free label (E12)
			copies.forEach((c) => v.editor.ents.add(c)); v.selectEnts(copies.map((c) => c.id))
			drag.bases = copies; drag.duplicated = true
		}
		let dx = p[0] - drag.start[0], dy = p[1] - drag.start[1]
		if (e.shiftKey !== v.ortho) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0 }   // ortho / axis-lock (Shift toggles)
		const [gdx, gdy] = snapDelta(dx, dy, drag.bases[0], v.snap ? v.snapStep : 0)   // grid-snap the group by its first member (stays rigid)
		v.editor.ents.updateMany(drag.bases.map((b) => moveEnt(v.ctx, b, gdx, gdy)))   // one array pass per move; DocEdit brings attached conduit ends along (F6)
	}
	private onDragUp = (_e: PointerEvent, _s: EntDrag, moved: boolean) => {
		if (moved) this.suppressClick = true
		this.drag = null; this.v.snapMark = null; this.v.editor.edit.end()
	}
	private onDragCancel = (s: EntDrag, moved: boolean) => {   // 2nd finger → revert any partial move/resize
		if (moved) this.v.editor.ents.updateMany(s.bases)
		this.drag = null; this.v.snapMark = null; this.v.editor.edit.end()
	}

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
	private onMarqueeMove = (e: PointerEvent) => {
		const m = this.marquee; if (!m) return
		const p = this.v.toModel(e.clientX, e.clientY); if (!p) return
		this.marquee = { a: m.a, b: p, add: m.add }
	}
	private onMarqueeUp = () => {
		const v = this.v, m = this.marquee; this.marquee = null
		if (!m) return
		if (Math.abs(m.b[0] - m.a[0]) < 2 && Math.abs(m.b[1] - m.a[1]) < 2) return   // tiny → a click (let onClick clear)
		const g = v.expandGroup(marqueeSelect(v.ctx, v.entities, m.a, m.b, v.pickable))   // layer-gated; whole groups
		v.selectEnts(m.add ? [...new Set([...v.sel, ...g])] : g)   // Shift/Ctrl marquee UNIONS (not a toggle)
		this.suppressClick = true
	}

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

	// ── model body move (absolute from the press) + model grips — the edits are ui/vpModelEdit.ts; here the undo
	// step (opened at press, marked per move, closed at release) and the trailing click ──
	private onModelDragMove = (e: PointerEvent, s: MDrag) => {
		const p = this.v.toModel(e.clientX, e.clientY); if (!p) return
		moveModelItems(this.v, s, p)
		this.v.editor.edit.mark()   // fold this move into the open undo step
	}
	private onModelDragUp = (_e: PointerEvent, s: MDrag, moved: boolean) => {
		if (moved) { this.suppressClick = true; endModelMove(this.v, s) }
		this.v.editor.edit.end()
	}
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
	}
}
