import { toast } from 'svelte-sonner'
import { SurfaceEditor } from '../edit/surface.svelte'
import type { Point } from '$lib/ui/print/types'
import type { Annotation, AnnotationKind, AnnotationDefaults } from '../types'
import type { Box } from '../edit/transform'
import type { LayerDef } from '../layers/layers'
import { OUTLET_DEFAULTS } from './outlet'
import { bounds } from './geometry'

export type AnnTool = 'select' | AnnotationKind

// Kinds placed by a single click (a default-sized box); the rest are dragged out.
const CLICK_KINDS = new Set<AnnotationKind>(['text', 'symbol'])
const BOX_DRAG = new Set<AnnotationKind>(['rect', 'ellipse', 'cloud', 'image', 'grid'])
// Minimum drawn size (world-mm) for box-drag kinds, so a click / tiny drag still yields a usable
// shape rather than a near-zero one.
const MIN_BOX: Partial<Record<AnnotationKind, number>> = { cloud: 500 }

/**
 * Normalise an annotation on load: the old 'leader' kind is folded into 'callout' (a callout with
 * no border), and the callout border is migrated from boolean to the 'none'|'underline'|'box' enum.
 */
function migrate(a: Annotation): Annotation {
	const b = a.border as unknown
	if ((a.kind as string) === 'leader') a.kind = 'callout'
	if (a.kind === 'callout') a.border = (b === true || b === 'box') ? 'box' : (b === 'underline' ? 'underline' : 'none')
	return a
}

// Module-level clipboard so annotations copy/paste between viewports (and sheets, same session).
let clipboard: Annotation[] = []

/** Default fields for a freshly created annotation of a given kind, overlaid with the
 *  project-wide annotation defaults (colour / font / heads / dash) where they apply. */
function defaults(kind: AnnotationKind, symbol: string, proj: AnnotationDefaults = {}): Partial<Annotation> {
	const base: Partial<Annotation> = (() => {
		switch (kind) {
			case 'text': return { text: 'Text', fontPt: 8, align: 'left' }
			case 'callout': return { text: 'Note', fontPt: 8, align: 'left', end: 'arrow', border: 'none' } // no w/h → auto-size to text
			case 'symbol': return symbol === 'outlet' ? { symbol, outlet: { ...OUTLET_DEFAULTS } } : { symbol }
			case 'rect': case 'ellipse': case 'cloud': return {}
			case 'grid': return { grid: { size: 500 } }
			case 'image': return { src: '' }
			case 'line': return { start: 'none', end: 'none', dash: 'solid' }
			case 'arrow': return { start: 'none', end: 'arrow', dash: 'solid' }
			case 'dimension': return {}
			default: return {}
		}
	})()
	const p: Partial<Annotation> = {}
	if (proj.color) p.color = proj.color
	if (proj.fontPt && (kind === 'text' || kind === 'callout')) p.fontPt = proj.fontPt
	if (proj.dash && (kind === 'line' || kind === 'arrow' || kind === 'rect' || kind === 'ellipse')) p.dash = proj.dash
	if (kind === 'line' || kind === 'arrow') { if (proj.lineStart) p.start = proj.lineStart; if (proj.lineEnd) p.end = proj.lineEnd }
	if (kind === 'dimension') { if (proj.dimStart) p.start = proj.dimStart; if (proj.dimEnd) p.end = proj.dimEnd }
	return { ...base, ...p }
}

/** Editor for a viewport's model-space annotations. */
export class AnnotationEditor extends SurfaceEditor {
	protected selKind = 'ann'
	annotations = $state<Annotation[]>([])
	tool = $state<AnnTool>('select')
	symbol = $state('section')
	/** Project-wide defaults new annotations inherit + the dimension unit (set by useAnnotations).
	 *  $state so the dimension label re-renders when the unit changes. */
	annoDefaults = $state<AnnotationDefaults>({})
	/** Called after an annotation is placed (host returns the unified tool to Select). */
	onPlaced: (() => void) | null = null
	/** Layer this viewport's new annotations land on (resolved from the active layer by the host). */
	nextLayerId: () => string = () => 'annotations'
	/** Per-viewport check: is a layer locked? (set by useAnnotations.) */
	isLayerLocked: (id: string) => boolean = () => false
	/** Per-viewport check: is a layer hidden? Hidden annotations aren't selectable. (set by useAnnotations.) */
	isLayerHidden: (id: string) => boolean = () => false
	/** The layer a new annotation lands on, or null + a toast if that layer is locked. */
	private targetLayerOrBlock(): string | null {
		const id = this.nextLayerId()
		if (this.isLayerLocked(id)) {
			const name = this.layers.find((l) => l.id === id)?.name ?? id
			toast.warning(`Layer “${name}” is locked — unlock it to add annotations`)
			return null
		}
		return id
	}
	/** All layers (defaults + custom), mirrored from the ViewportEditor for the props-panel picker. */
	layers = $state<LayerDef[]>([])
	/** Marquee multi-selection (annotation ids) + position snapshot for a group drag. */
	selAnns = $state<string[]>([])
	#gbAnns = new Map<string, { x: number; y: number; x2?: number; y2?: number }>()

	seed(a: Annotation[] | undefined) { this.annotations = (a ?? []).map(x => migrate({ ...x })) }
	/** Drop selection referencing annotations that no longer exist (e.g. after an undo
	 *  that removed ctrl-drag clones). Call OUTSIDE a tracking $effect (it writes the
	 *  selection it reads) — e.g. from the history seed path. */
	pruneSelection() {
		const ids = new Set(this.annotations.map(x => x.id))
		this.selAnns = this.selAnns.filter(id => ids.has(id))
		if (this.sel?.kind === 'ann' && !ids.has(this.sel.id)) this.sel = null
	}
	snapshot() { return $state.snapshot(this.annotations) as Annotation[] }
	selAnn = $derived(this.sel?.kind === 'ann' ? this.annotations.find(a => a.id === this.sel!.id) ?? null : null)

	/** Push a raw annotation and return the reactive proxy (so subsequent drags are tracked). */
	private push(a: Annotation): Annotation {
		this.annotations.push(a)
		return this.annotations[this.annotations.length - 1]
	}

	/** Click placement: a default box at p (text / symbol). */
	click(p: Point) {
		const t = this.tool; if (t === 'select') return
		const layer = this.targetLayerOrBlock(); if (layer === null) { this.tool = 'select'; this.onPlaced?.(); return }
		const a = this.push({ id: this.uid('a'), kind: t, x: p.x, y: p.y, layerId: layer, ...defaults(t, this.symbol, this.annoDefaults) })
		if (t === 'symbol') { a.w = 1000; a.h = 1000; a.x = p.x - 500; a.y = p.y - 500 } // centre the marker on the click
		this.select('ann', a.id); this.notify(); this.onPlaced?.()
	}
	/**
	 * Callout placement (item 16): press at the arrowhead, drag to where the text box goes. The
	 * pointer tip (x2,y2) stays at the press point; the box (x,y) follows the cursor. A bare click
	 * (no drag) drops the box at a default offset so the leader isn't zero-length.
	 */
	startCallout(p: Point) {
		const layer = this.targetLayerOrBlock(); if (layer === null) { this.tool = 'select'; this.onPlaced?.(); return }
		const a = this.push({ id: this.uid('a'), kind: 'callout', x: p.x, y: p.y, x2: p.x, y2: p.y, layerId: layer, ...defaults('callout', this.symbol, this.annoDefaults) })
		this.select('ann', a.id)
		this.startDrag(e => { const w = this.toWorld(e); if (!w) return; a.x = w.x; a.y = w.y }, () => {
			if (Math.abs(a.x - (a.x2 ?? a.x)) < 1 && Math.abs(a.y - (a.y2 ?? a.y)) < 1) { a.x = (a.x2 ?? a.x) + 1500; a.y = (a.y2 ?? a.y) - 1500 }
			this.tool = 'select'; this.notify(); this.onPlaced?.()
		})
	}
	/** Drag placement: box (rect/cloud → w,h) or line (line/arrow/dimension → x2,y2). */
	startShape(p: Point) {
		const t = this.tool; if (t === 'select') return
		const layer = this.targetLayerOrBlock(); if (layer === null) { this.tool = 'select'; this.onPlaced?.(); return }
		const boxDrag = BOX_DRAG.has(t)
		const a = this.push({ id: this.uid('a'), kind: t, x: p.x, y: p.y, layerId: layer, ...defaults(t, this.symbol, this.annoDefaults), ...(boxDrag ? { w: 1, h: 1 } : { x2: p.x, y2: p.y }) })
		this.select('ann', a.id)
		this.startDrag(e => {
			const w = this.toWorld(e); if (!w) return
			if (boxDrag) { a.x = Math.min(p.x, w.x); a.y = Math.min(p.y, w.y); a.w = Math.max(1, Math.abs(w.x - p.x)); a.h = Math.max(1, Math.abs(w.y - p.y)) }
			else { a.x2 = w.x; a.y2 = w.y }
		}, () => {
			const min = MIN_BOX[a.kind]
			if (min) { if ((a.w ?? 0) < min) a.w = min; if ((a.h ?? 0) < min) a.h = min }
			this.tool = 'select'; this.notify(); this.onPlaced?.()
		})
	}
	/** Route an add by the active tool (called from EditBackground). */
	place(p: Point) {
		if (this.tool === 'callout') this.startCallout(p)
		else if (CLICK_KINDS.has(this.tool as AnnotationKind)) this.click(p)
		else this.startShape(p)
	}

	/**
	 * Drag-move an annotation. `movePointer` controls the callout/leader pointer target:
	 *   true  → move the whole thing (box + pointer tip) — used when grabbing the line.
	 *   false → move only the box, leaving the arrow tip anchored — used when grabbing the box.
	 * For line kinds (line/arrow/dimension) x2,y2 are the far end, so they always travel.
	 */
	// Ctrl/⌘-click toggles an annotation in/out of the selection; 1 left → single select.
	toggleAnnSel(id: string) {
		this.applyToggle(this.selAnns, this.selAnn?.id ?? null, id, (sel, multi) => { this.sel = sel; this.selAnns = multi })
		this.notify()
	}
	// (duplicateSelectionInPlace is inherited from SurfaceEditor — cloneItems(selAnns) → select clones)
	move(a: Annotation, e0: MouseEvent, movePointer = true) {
		this.dragMovePointer = movePointer // single callout box-grab leaves the leader tip
		if (e0.ctrlKey || e0.metaKey) {
			// Ctrl-drag duplicates (single or whole multi) + drags the clones; ctrl-click toggles.
			this.driveCtrlDrag(e0, {
				duplicate: () => {
					if (this.selAnns.length > 1 && this.selAnns.includes(a.id)) this.duplicateSelectionInPlace()
					else this.select('ann', this.push({ ...a, id: this.uid('a') }).id)
				},
				snapshot: () => this.beginGroupTranslate(),
				apply: (dx, dy) => this.applyGroupTranslate(dx, dy),
				toggle: () => this.toggleAnnSel(a.id),
			})
			return
		}
		if (this.selAnns.includes(a.id)) { this.beginGroupDrag(e0); return } // marquee group (this + peer)
		if (this.selectGroup(a.id)) { this.beginGroupDrag(e0); return } // grouped → select + drag whole group
		this.clearMulti(); this.peer?.clearMulti()
		this.select('ann', a.id)
		this.beginItemDrag(e0) // single: snapshot + shift-constrained translate (honours dragMovePointer)
	}

	/** The selected annotations (multi set, else the single selection). */
	selectedAnnList(): Annotation[] {
		const ids = new Set(this.selAnns.length ? this.selAnns : this.selAnn ? [this.selAnn.id] : [])
		return this.annotations.filter((a) => ids.has(a.id))
	}
	/** Apply an outlet-prop patch to every selected outlet symbol (multi-edit). */
	/** Apply a property patch to every selected annotation (multi common-prop edit). */
	setSelAll(patch: Partial<Annotation>) { for (const a of this.selectedAnnList()) Object.assign(a, patch); this.notify() }
	setOutletAll(patch: Record<string, unknown>) {
		for (const a of this.selectedAnnList()) if (a.symbol === 'outlet') a.outlet = { ...(a.outlet ?? {}), ...patch }
		this.notify()
	}

	/** Selected annotation's text edit focus signal — bumped to ask the props panel to focus. */
	textFocusNonce = $state(0)
	requestTextFocus(a: Annotation) { this.select('ann', a.id); this.textFocusNonce++ }
	setBox(a: Annotation, b: Box) { a.x = b.x; a.y = b.y; a.w = b.w; a.h = b.h; this.notify() }
	setRotation(a: Annotation, deg: number) { a.rotation = ((deg % 360) + 360) % 360; this.notify() }
	/** Move a line endpoint (0 = start, 1 = end / pointer target). */
	movePoint(a: Annotation, i: number, x: number, y: number) {
		if (i === 0) { a.x = x; a.y = y } else { a.x2 = x; a.y2 = y }
		this.notify()
	}
	nudge(dx: number, dy: number) {
		const a = this.selAnn; if (!a) return
		a.x += dx; a.y += dy
		if (a.x2 != null) a.x2 += dx
		if (a.y2 != null) a.y2 += dy
		this.notify()
	}
	duplicateSel() { this.duplicateSelection(500) } // Ctrl+D / panel: offset copy of the selection
	setSel(patch: Partial<Annotation>) { const a = this.selAnn; if (!a) return; Object.assign(a, patch); this.notify() }
	/** Merge-patch the selected grid annotation's tile settings (size / offsets). */
	setGrid(patch: Partial<{ size: number; ox: number; oy: number }>) {
		const a = this.selAnn; if (!a) return
		a.grid = { size: 500, ...a.grid, ...patch }
		this.notify()
	}
	/** Set a line/dimension's length (mm), keeping its start point + angle. */
	setSelLength(len: number) {
		const a = this.selAnn; if (!a || a.x2 == null) return
		const ang = Math.atan2((a.y2 ?? a.y) - a.y, a.x2 - a.x)
		a.x2 = Math.round(a.x + len * Math.cos(ang)); a.y2 = Math.round(a.y + len * Math.sin(ang))
		this.notify()
	}
	/** Move the selected annotation(s) to a layer — the marquee set if any, else the single selection. */
	setSelLayer(layerId: string) {
		const ids = new Set(this.selAnns.length ? this.selAnns : this.selAnn ? [this.selAnn.id] : [])
		if (!ids.size) return
		for (const a of this.annotations) if (ids.has(a.id)) a.layerId = layerId
		this.notify()
	}
	setLink(patch: Partial<NonNullable<Annotation['link']>>) { const a = this.selAnn; if (!a) return; a.link = { kind: 'drawing', ...(a.link ?? {}), ...patch } as any; this.notify() }
	deleteSel() { this.deleteSelection() } // alias — delete works on the selection set (1 or many)

	/** Copy the current annotation selection (multi or single) to the shared clipboard. */
	copySel() {
		const ids = new Set(this.selectedIds())
		if (!ids.size) return
		clipboard = this.annotations.filter(a => ids.has(a.id)).map(a => structuredClone($state.snapshot(a)) as Annotation)
	}
	clearClipboard() { clipboard = [] }
	hasClipboard() { return clipboard.length > 0 }
	// grouping (H12)
	groupOf(id: string) { return this.annotations.find((a) => a.id === id)?.groupId }
	idsInGroup(gid: string) { return this.annotations.filter((a) => a.groupId === gid).map((a) => a.id) }
	setGroup(ids: string[], gid: string | undefined) { const s = new Set(ids); for (const a of this.annotations) if (s.has(a.id)) a.groupId = gid; this.notify() }
	nudgeSelection(dx: number, dy: number) {
		for (const a of this.selectedAnnList()) { a.x += dx; a.y += dy; if (a.x2 != null) a.x2 += dx; if (a.y2 != null) a.y2 += dy }
		this.notify()
	}
	resizeSelection(dw: number, dh: number) {
		for (const a of this.selectedAnnList()) { if (a.w != null) a.w = Math.max(1, a.w + dw); if (a.h != null) a.h = Math.max(1, a.h + dh) }
		this.notify()
	}
	// ── group transform (H9) — annotations live in SVG world already ──
	selWorldBounds() {
		const list = this.selectedAnnList(); if (!list.length) return null
		let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
		for (const a of list) { const b = bounds(a, 1); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h) }
		return { x0, y0, x1, y1 }
	}
	selWorldPoints() {
		const pts: { x: number; y: number }[] = []
		for (const a of this.selectedAnnList()) {
			if (a.kind === 'line' || a.kind === 'arrow' || a.kind === 'dimension') { pts.push({ x: a.x, y: a.y }, { x: a.x2 ?? a.x, y: a.y2 ?? a.y }); continue }
			const b = bounds(a, 1), cx = b.x + b.w / 2, cy = b.y + b.h / 2, r = (a.rotation ?? 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r)
			for (const [lx, ly] of [[-b.w / 2, -b.h / 2], [b.w / 2, -b.h / 2], [b.w / 2, b.h / 2], [-b.w / 2, b.h / 2]] as [number, number][])
				pts.push({ x: cx + lx * c - ly * s, y: cy + lx * s + ly * c })
		}
		return pts
	}
	rotateSelection(deg: number, cx: number, cy: number) {
		const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r)
		const rot = (px: number, py: number) => { const dx = px - cx, dy = py - cy; return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c } }
		for (const a of this.selectedAnnList()) {
			const isLine = a.kind === 'line' || a.kind === 'arrow' || a.kind === 'dimension'
			if (isLine) { const p1 = rot(a.x, a.y), p2 = rot(a.x2 ?? a.x, a.y2 ?? a.y); a.x = p1.x; a.y = p1.y; a.x2 = p2.x; a.y2 = p2.y }
			else {
				const b = bounds(a, 1), nc = rot(b.x + b.w / 2, b.y + b.h / 2)
				a.x += nc.x - (b.x + b.w / 2); a.y += nc.y - (b.y + b.h / 2)
				a.rotation = (a.rotation ?? 0) + deg
				if (a.x2 != null) { const p = rot(a.x2, a.y2 ?? a.y); a.x2 = p.x; a.y2 = p.y } // callout pointer
			}
		}
		this.notify()
	}
	/** Oriented box of a single selected box-kind annotation (for the unified transform box). */
	singleBox() {
		const list = this.selectedAnnList(); if (list.length !== 1) return null
		const a = list[0]
		if (a.kind === 'line' || a.kind === 'arrow' || a.kind === 'dimension') return null // lines use endpoints
		const b = bounds(a, 1)
		return { cx: b.x + b.w / 2, cy: b.y + b.h / 2, hw: b.w / 2, hh: b.h / 2, angle: a.rotation ?? 0 }
	}
	scaleSelection(sx: number, sy: number, ax: number, ay: number, angle = 0) {
		const r = (-angle * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r), rr = (angle * Math.PI) / 180, rc = Math.cos(rr), rs = Math.sin(rr)
		const sp = (px: number, py: number) => { // scale a point about (ax,ay) in the frame rotated by `angle`
			const dx = px - ax, dy = py - ay, lx = dx * c - dy * s, ly = dx * s + dy * c, qx = lx * sx, qy = ly * sy
			return { x: ax + qx * rc - qy * rs, y: ay + qx * rs + qy * rc }
		}
		for (const a of this.selectedAnnList()) {
			const isLine = a.kind === 'line' || a.kind === 'arrow' || a.kind === 'dimension'
			if (isLine) { const p1 = sp(a.x, a.y); a.x = p1.x; a.y = p1.y; if (a.x2 != null) { const p2 = sp(a.x2, a.y2 ?? a.y); a.x2 = p2.x; a.y2 = p2.y } }
			else {
				const b = bounds(a, 1), nc = sp(b.x + b.w / 2, b.y + b.h / 2)
				a.x += nc.x - (b.x + b.w / 2); a.y += nc.y - (b.y + b.h / 2)
				if (a.w != null) a.w = Math.max(1, a.w * sx); if (a.h != null) a.h = Math.max(1, a.h * sy)
				if (a.x2 != null) { const p = sp(a.x2, a.y2 ?? a.y); a.x2 = p.x; a.y2 = p.y } // callout pointer
			}
		}
		this.notify()
	}
	/** Paste the clipboard into this viewport (new ids, offset so the copies are visible). */
	paste() {
		if (!clipboard.length) return
		// Bbox of the clipboard; if it's off-screen (e.g. pasted into another view) centre it.
		let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
		for (const a of clipboard) {
			for (const x of [a.x, a.x2].filter((v): v is number => v != null)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x) }
			for (const y of [a.y, a.y2].filter((v): v is number => v != null)) { y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
			if (a.w) x1 = Math.max(x1, a.x + a.w); if (a.h) y1 = Math.max(y1, a.y + a.h)
		}
		const { dx, dy } = this.pasteShift({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, 500)
		const copies = clipboard.map(a => ({ ...structuredClone(a), id: this.uid('a'), x: a.x + dx, y: a.y + dy, x2: a.x2 != null ? a.x2 + dx : undefined, y2: a.y2 != null ? a.y2 + dy : undefined }))
		for (const c of copies) this.annotations.push(c)
		this.clearSel(); this.selAnns = copies.map(c => c.id)
		this.notify()
	}

	// ── marquee multi-selection (driven by the tool editor's marquee via the peer link) ──
	clearMulti() { this.selAnns = [] }
	deleteMany() { const had = this.selAnns.length > 0; this.deleteSelection(); return had } // alias
	hasMultiSel() { return this.selAnns.length > 0 }
	protected currentMulti() { return this.selAnns }
	protected setMulti(ids: string[]) { this.selAnns = ids }
	// Item primitives (by id) — the base's generic deleteSelection/duplicate* run over these.
	removeItems(ids: string[]) { const s = new Set(ids); this.annotations = this.annotations.filter(a => !s.has(a.id)) }
	cloneItems(ids: string[], d = 0): string[] {
		const s = new Set(ids)
		const copies = this.annotations.filter(a => s.has(a.id)).map(a => {
			const c = { ...(structuredClone($state.snapshot(a)) as Annotation), id: this.uid('a'), x: a.x + d, y: a.y + d }
			if (a.x2 != null) c.x2 = a.x2 + d; if (a.y2 != null) c.y2 = a.y2 + d
			return c
		})
		this.annotations.push(...copies); return copies.map(c => c.id)
	}
	/** Select annotations whose anchor or pointer endpoint falls inside the world-mm rect. */
	marqueeCollect(m: { x: number; y: number; w: number; h: number }) {
		// Crossing selection (like objects): the annotation's visual bbox just has to TOUCH the
		// marquee. Uses bounds() so symbols (no explicit w/h) get their real box, not a zero-size
		// point at the offset anchor; outlets use a tight core box (matching their click hit).
		const hits = (a: Annotation) => {
			const lyr = a.layerId ?? 'annotations'
			if (this.isLayerHidden(lyr) || this.isLayerLocked(lyr)) return false // hidden/locked aren't selectable
			let bx = bounds(a, 1)
			if (a.kind === 'symbol' && a.symbol === 'outlet') {
				const r = (Math.min(bx.w, bx.h) / 2) * 0.66
				bx = { x: bx.x + bx.w / 2 - r, y: bx.y + bx.h / 2 - r, w: 2 * r, h: 2 * r }
			}
			return bx.x <= m.x + m.w && bx.x + bx.w >= m.x && bx.y <= m.y + m.h && bx.y + bx.h >= m.y
		}
		this.selAnns = this.annotations.filter(hits).map(a => a.id)
	}
	// The set being dragged: the marquee multi-selection if any, else the single selection —
	// so one snapshot/translate path serves both single and group drags.
	private dragAnnIds(): string[] { return this.selAnns.length ? this.selAnns : this.selAnn ? [this.selAnn.id] : [] }
	/** For a single callout/leader BOX grab, false leaves the pointer tip (x2,y2) anchored. */
	dragMovePointer = true
	beginGroupTranslate() {
		this.#gbAnns.clear()
		const ids = new Set(this.dragAnnIds())
		for (const a of this.annotations) if (ids.has(a.id)) this.#gbAnns.set(a.id, { x: a.x, y: a.y, x2: a.x2, y2: a.y2 })
	}
	applyGroupTranslate(dx: number, dy: number) {
		const single = this.#gbAnns.size === 1 // honour dragMovePointer only for a single grab
		for (const a of this.annotations) {
			const b = this.#gbAnns.get(a.id); if (!b) continue
			a.x = b.x + dx; a.y = b.y + dy
			if (b.x2 != null && (!single || this.dragMovePointer)) { a.x2 = b.x2 + dx; a.y2 = (b.y2 ?? 0) + dy }
		}
	}
}
