import { toast } from 'svelte-sonner'
import { SurfaceEditor } from '../edit/surface.svelte'
import type { Point } from '$lib/ui/print/types'
import type { Annotation, AnnotationKind } from '../types'
import type { Box } from '../edit/transform'
import type { LayerDef } from '../layers/layers'
import { OUTLET_DEFAULTS } from './outlet'

export type AnnTool = 'select' | AnnotationKind

// Kinds placed by a single click (a default-sized box); the rest are dragged out.
const CLICK_KINDS = new Set<AnnotationKind>(['text', 'symbol'])
const BOX_DRAG = new Set<AnnotationKind>(['rect', 'ellipse', 'cloud', 'image'])
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

/** Default fields for a freshly created annotation of a given kind. */
function defaults(kind: AnnotationKind, symbol: string): Partial<Annotation> {
	switch (kind) {
		case 'text': return { text: 'Text', fontPt: 8, align: 'left' }
		case 'callout': return { text: 'Note', fontPt: 8, align: 'left', w: 4000, h: 1400, end: 'arrow', border: 'none' }
		case 'symbol': return symbol === 'outlet' ? { symbol, outlet: { ...OUTLET_DEFAULTS } } : { symbol }
		case 'rect': case 'ellipse': case 'cloud': return {}
		case 'image': return { src: '' }
		case 'line': return { start: 'none', end: 'none', dash: 'solid' }
		case 'arrow': return { start: 'none', end: 'arrow', dash: 'solid' }
		case 'dimension': return {}
		default: return {}
	}
}

/** Editor for a viewport's model-space annotations. */
export class AnnotationEditor extends SurfaceEditor {
	protected selKind = 'ann'
	annotations = $state<Annotation[]>([])
	tool = $state<AnnTool>('select')
	symbol = $state('section')
	/** Called after an annotation is placed (host returns the unified tool to Select). */
	onPlaced: (() => void) | null = null
	/** Layer this viewport's new annotations land on (resolved from the active layer by the host). */
	nextLayerId: () => string = () => 'annotations'
	/** Per-viewport check: is a layer locked? (set by useAnnotations.) */
	isLayerLocked: (id: string) => boolean = () => false
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
		const a = this.push({ id: this.uid('a'), kind: t, x: p.x, y: p.y, layerId: layer, ...defaults(t, this.symbol) })
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
		const a = this.push({ id: this.uid('a'), kind: 'callout', x: p.x, y: p.y, x2: p.x, y2: p.y, layerId: layer, ...defaults('callout', this.symbol) })
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
		const a = this.push({ id: this.uid('a'), kind: t, x: p.x, y: p.y, layerId: layer, ...defaults(t, this.symbol), ...(boxDrag ? { w: 1, h: 1 } : { x2: p.x, y2: p.y }) })
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
	duplicateSelectionInPlace() { if (this.selAnns.length) this.duplicateMultiAnns() }
	move(a: Annotation, e0: MouseEvent, movePointer = true) {
		this.dragMovePointer = movePointer // single callout box-grab leaves the leader tip
		if (e0.ctrlKey || e0.metaKey) {
			// Ctrl-drag duplicates (single or whole multi) + drags the clones; ctrl-click toggles.
			this.driveCtrlDrag(e0, {
				duplicate: () => {
					if (this.selAnns.length > 1 && this.selAnns.includes(a.id)) this.duplicateMultiAnns()
					else this.select('ann', this.push({ ...a, id: this.uid('a') }).id)
				},
				snapshot: () => this.beginGroupTranslate(),
				apply: (dx, dy) => this.applyGroupTranslate(dx, dy),
				toggle: () => this.toggleAnnSel(a.id),
			})
			return
		}
		if (this.selAnns.includes(a.id)) { this.beginGroupDrag(e0); return } // marquee group (this + peer)
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
	/** Clone every marquee-selected annotation in place; selection moves to the clones. */
	duplicateMultiAnns() {
		const ids = new Set(this.selAnns)
		const copies = this.annotations.filter((a) => ids.has(a.id)).map((a) => ({ ...(structuredClone($state.snapshot(a)) as Annotation), id: this.uid('a') }))
		for (const c of copies) this.annotations.push(c)
		this.clearSel(); this.selAnns = copies.map((c) => c.id)
	}
	duplicateSel() {
		const a = this.selAnn; if (!a) return
		const copy: Annotation = { ...a, id: this.uid('a'), x: a.x + 500, y: a.y + 500 }
		if (a.x2 != null) copy.x2 = a.x2 + 500
		if (a.y2 != null) copy.y2 = a.y2 + 500
		this.annotations.push(copy); this.select('ann', copy.id); this.notify()
	}
	setSel(patch: Partial<Annotation>) { const a = this.selAnn; if (!a) return; Object.assign(a, patch); this.notify() }
	/** Move the selected annotation(s) to a layer — the marquee set if any, else the single selection. */
	setSelLayer(layerId: string) {
		const ids = new Set(this.selAnns.length ? this.selAnns : this.selAnn ? [this.selAnn.id] : [])
		if (!ids.size) return
		for (const a of this.annotations) if (ids.has(a.id)) a.layerId = layerId
		this.notify()
	}
	setLink(patch: Partial<NonNullable<Annotation['link']>>) { const a = this.selAnn; if (!a) return; a.link = { kind: 'drawing', ...(a.link ?? {}), ...patch } as any; this.notify() }
	deleteSel() { const a = this.selAnn; if (!a) return; this.annotations = this.annotations.filter(x => x.id !== a.id); this.clearSel(); this.notify() }

	/** Copy the current annotation selection (multi or single) to the shared clipboard. */
	copySel() {
		const ids = new Set(this.selAnns.length ? this.selAnns : this.selAnn ? [this.selAnn.id] : [])
		if (!ids.size) return
		clipboard = this.annotations.filter(a => ids.has(a.id)).map(a => structuredClone($state.snapshot(a)) as Annotation)
	}
	/** Paste the clipboard into this viewport (new ids, offset so the copies are visible). */
	paste() {
		if (!clipboard.length) return
		const D = 500
		const copies = clipboard.map(a => ({ ...structuredClone(a), id: this.uid('a'), x: a.x + D, y: a.y + D, x2: a.x2 != null ? a.x2 + D : undefined, y2: a.y2 != null ? a.y2 + D : undefined }))
		for (const c of copies) this.annotations.push(c)
		this.clearSel(); this.selAnns = copies.map(c => c.id)
		this.notify()
	}

	// ── marquee multi-selection (driven by the tool editor's marquee via the peer link) ──
	clearMulti() { this.selAnns = [] }
	/** Delete every marquee-selected annotation. Returns true if any were removed. */
	deleteMany() {
		if (!this.selAnns.length) return false
		const ids = new Set(this.selAnns)
		this.annotations = this.annotations.filter(a => !ids.has(a.id))
		this.clearMulti(); this.notify(); return true
	}
	hasMultiSel() { return this.selAnns.length > 0 }
	protected currentMulti() { return this.selAnns }
	protected setMulti(ids: string[]) { this.selAnns = ids }
	/** Delete whatever is selected — the marquee/ctrl-click multi-set if any, else the single. */
	deleteSelection() { if (this.selAnns.length) this.deleteMany(); else this.deleteSel() }
	/** Select annotations whose anchor or pointer endpoint falls inside the world-mm rect. */
	marqueeCollect(m: { x: number; y: number; w: number; h: number }) {
		const inR = (x: number, y: number) => x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h
		this.selAnns = this.annotations.filter(a => inR(a.x, a.y) || (a.x2 != null && inR(a.x2, a.y2 ?? a.y))).map(a => a.id)
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
