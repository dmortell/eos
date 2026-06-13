import { SurfaceEditor } from '../edit/surface.svelte'
import type { Point } from '$lib/ui/print/types'
import type { Annotation, AnnotationKind } from '../types'
import type { Box } from '../edit/transform'
import type { LayerDef } from '../layers/layers'

export type AnnTool = 'select' | AnnotationKind

// Kinds placed by a single click (a default-sized box); the rest are dragged out.
const CLICK_KINDS = new Set<AnnotationKind>(['text', 'symbol', 'callout', 'leader'])
const BOX_DRAG = new Set<AnnotationKind>(['rect', 'ellipse', 'cloud'])

// Module-level clipboard so annotations copy/paste between viewports (and sheets, same session).
let clipboard: Annotation[] = []

/** Default fields for a freshly created annotation of a given kind. */
function defaults(kind: AnnotationKind, symbol: string): Partial<Annotation> {
	switch (kind) {
		case 'text': return { text: 'Text', fontPt: 8, align: 'left' }
		case 'callout': return { text: 'Note', fontPt: 8, align: 'left', w: 4000, h: 1400, end: 'arrow', border: true }
		case 'symbol': return { symbol }
		case 'rect': case 'ellipse': case 'cloud': return {}
		case 'line': return { start: 'none', end: 'none', dash: 'solid' }
		case 'arrow': return { start: 'none', end: 'arrow', dash: 'solid' }
		case 'leader': return { text: 'Note', fontPt: 8, end: 'arrow', dash: 'solid', w: 3000, h: 1200 }
		case 'dimension': return {}
		default: return {}
	}
}

/** Editor for a viewport's model-space annotations. */
export class AnnotationEditor extends SurfaceEditor {
	annotations = $state<Annotation[]>([])
	tool = $state<AnnTool>('select')
	symbol = $state('section')
	/** Called after an annotation is placed (host returns the unified tool to Select). */
	onPlaced: (() => void) | null = null
	/** Layer this viewport's new annotations land on (resolved from the active layer by the host). */
	nextLayerId: () => string = () => 'annotations'
	/** All layers (defaults + custom), mirrored from the ViewportEditor for the props-panel picker. */
	layers = $state<LayerDef[]>([])
	/** Marquee multi-selection (annotation ids) + position snapshot for a group drag. */
	selAnns = $state<string[]>([])
	#gbAnns = new Map<string, { x: number; y: number; x2?: number; y2?: number }>()

	seed(a: Annotation[] | undefined) { this.annotations = (a ?? []).map(x => ({ ...x })) }
	snapshot() { return $state.snapshot(this.annotations) as Annotation[] }
	selAnn = $derived(this.sel?.kind === 'ann' ? this.annotations.find(a => a.id === this.sel!.id) ?? null : null)

	/** Push a raw annotation and return the reactive proxy (so subsequent drags are tracked). */
	private push(a: Annotation): Annotation {
		this.annotations.push(a)
		return this.annotations[this.annotations.length - 1]
	}

	/** Click placement: a default box at p (text/symbol/callout/leader). */
	click(p: Point) {
		const t = this.tool; if (t === 'select') return
		const a = this.push({ id: this.uid('a'), kind: t, x: p.x, y: p.y, layerId: this.nextLayerId(), ...defaults(t, this.symbol) })
		if (t === 'symbol') { a.w = 1000; a.h = 1000; a.x = p.x - 500; a.y = p.y - 500 } // centre the marker on the click
		if (t === 'callout' || t === 'leader') { a.x2 = p.x + (a.w ?? 3000) + 1500; a.y2 = p.y - 1500 } // pointer target
		this.select('ann', a.id); this.notify(); this.onPlaced?.()
	}
	/** Drag placement: box (rect/cloud → w,h) or line (line/arrow/dimension → x2,y2). */
	startShape(p: Point) {
		const t = this.tool; if (t === 'select') return
		const boxDrag = BOX_DRAG.has(t)
		const a = this.push({ id: this.uid('a'), kind: t, x: p.x, y: p.y, layerId: this.nextLayerId(), ...defaults(t, this.symbol), ...(boxDrag ? { w: 1, h: 1 } : { x2: p.x, y2: p.y }) })
		this.select('ann', a.id)
		this.startDrag(e => {
			const w = this.toWorld(e); if (!w) return
			if (boxDrag) { a.x = Math.min(p.x, w.x); a.y = Math.min(p.y, w.y); a.w = Math.max(1, Math.abs(w.x - p.x)); a.h = Math.max(1, Math.abs(w.y - p.y)) }
			else { a.x2 = w.x; a.y2 = w.y }
		}, () => { this.tool = 'select'; this.notify(); this.onPlaced?.() })
	}
	/** Route an add by the active tool (called from EditBackground). */
	place(p: Point) { if (CLICK_KINDS.has(this.tool as AnnotationKind)) this.click(p); else this.startShape(p) }

	/**
	 * Drag-move an annotation. `movePointer` controls the callout/leader pointer target:
	 *   true  → move the whole thing (box + pointer tip) — used when grabbing the line.
	 *   false → move only the box, leaving the arrow tip anchored — used when grabbing the box.
	 * For line kinds (line/arrow/dimension) x2,y2 are the far end, so they always travel.
	 */
	move(a: Annotation, e0: MouseEvent, movePointer = true) {
		if (e0.ctrlKey || e0.metaKey) a = this.push({ ...a, id: this.uid('a') }) // duplicate the proxy
		else if (this.selAnns.includes(a.id)) { this.beginGroupDrag(e0); return } // part of a marquee → move whole group
		else { this.clearMulti(); this.peer?.clearMulti() }
		this.select('ann', a.id)
		const w0 = this.toWorld(e0); if (!w0) return
		const o = { x: a.x, y: a.y, x2: a.x2, y2: a.y2 }
		this.startDrag(e => {
			const w = this.toWorld(e); if (!w) return
			const dx = w.x - w0.x, dy = w.y - w0.y
			a.x = o.x + dx; a.y = o.y + dy
			if (movePointer && o.x2 != null) { a.x2 = o.x2 + dx; a.y2 = (o.y2 ?? 0) + dy }
		}, () => this.notify())
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
	/** Select annotations whose anchor or pointer endpoint falls inside the world-mm rect. */
	marqueeCollect(m: { x: number; y: number; w: number; h: number }) {
		const inR = (x: number, y: number) => x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h
		this.selAnns = this.annotations.filter(a => inR(a.x, a.y) || (a.x2 != null && inR(a.x2, a.y2 ?? a.y))).map(a => a.id)
	}
	beginGroupTranslate() {
		this.#gbAnns.clear()
		const ids = new Set(this.selAnns)
		for (const a of this.annotations) if (ids.has(a.id)) this.#gbAnns.set(a.id, { x: a.x, y: a.y, x2: a.x2, y2: a.y2 })
	}
	applyGroupTranslate(dx: number, dy: number) {
		for (const a of this.annotations) {
			const b = this.#gbAnns.get(a.id); if (!b) continue
			a.x = b.x + dx; a.y = b.y + dy
			if (b.x2 != null) { a.x2 = b.x2 + dx; a.y2 = (b.y2 ?? 0) + dy }
		}
	}
}
