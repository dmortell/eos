import type { SheetViewport } from './types'

export type InsertKind = 'viewport'
type Rect = { x: number; y: number; w: number; h: number }
type Pt = { x: number; y: number }

const MIN_VP = 20 // smallest viewport you can drag out (mm)

/**
 * Headless controller for a sheet's viewports. Owns the viewport list, selection /
 * active state, and the insert (drag-a-rect) and marquee (drag-a-box) gestures. DOM
 * wiring lives in SheetEditor / Viewport / SheetMenubar.
 *
 * Unlike the sample's ViewportEditor this does NOT own per-viewport trunk/shape editors —
 * a viewport's content is described declaratively by its `source` (text / outlets / racks /
 * risers) and rendered read-only by ViewportContent.
 */
export class ViewportEditor {
	viewports = $state<SheetViewport[]>([])
	selectedIds = $state<string[]>([])
	activeId = $state<string | null>(null)
	insertMode = $state<InsertKind | null>(null)
	draft = $state<Rect | null>(null)    // live insert-rect preview (paper mm)
	marquee = $state<Rect | null>(null)  // live selection box (paper mm)
	/** Context-specific status-bar hint set by the active tool editor (e.g. trunk-edit commands). */
	editHint = $state<string | null>(null)

	/** Called after a mutation that should be persisted (add / delete / geometry change). */
	onChange: (() => void) | null = null

	/** Paper-sheet element, set by SheetEditor; used to map client px → paper mm. */
	paper: HTMLElement | null = null
	#nextId = 0
	#anchor: Pt | null = null            // drag origin for insert/marquee

	uid = (p: string) => `${p}${Date.now().toString(36)}${this.#nextId++}`

	activeViewport = $derived(this.activeId ? (this.viewports.find(v => v.id === this.activeId) ?? null) : null)
	selectedViewport = $derived(this.selectedIds.length === 1 ? (this.viewports.find(v => v.id === this.selectedIds[0]) ?? null) : null)
	isSelected = (id: string) => this.selectedIds.includes(id)

	/** Notify the host that the model changed (debounced-save lives in SheetEditor). */
	notify() { this.onChange?.() }

	// ── client px → paper mm (paper child coords = mm; Canvas world unit = 1mm) ──
	toPaper(cx: number, cy: number): Pt | null {
		const el = this.paper; if (!el) return null
		const r = el.getBoundingClientRect()
		const ow = el.offsetWidth || r.width
		const s = ow ? r.width / ow : 1   // on-screen px per mm (the Canvas zoom)
		return { x: (cx - r.left) / s, y: (cy - r.top) / s }
	}

	// ── insert: pick a kind from the menu, then drag out the rect ──
	startInsert(kind: InsertKind) { this.insertMode = kind; this.clearSel(); this.activeId = null }
	cancelInsert() { this.insertMode = null; this.draft = null; this.#anchor = null }

	// ── selection ──
	select(id: string, additive = false) {
		if (additive) this.selectedIds = this.isSelected(id) ? this.selectedIds.filter(x => x !== id) : [...this.selectedIds, id]
		else this.selectedIds = [id]
	}
	clearSel() { this.selectedIds = [] }
	deleteSelected() {
		const gone = new Set(this.selectedIds)
		this.viewports = this.viewports.filter(v => !gone.has(v.id))
		if (this.activeId && gone.has(this.activeId)) this.activeId = null
		this.selectedIds = []
		this.notify()
	}

	// ── activation (one at a time) ──
	activate(id: string) { this.activeId = id; this.selectedIds = []; this.cancelInsert() }
	deactivate() { this.activeId = null }
	/** Topmost viewport containing a paper point (later in the list = drawn on top). */
	hitTest(p: Pt): SheetViewport | null {
		for (let i = this.viewports.length - 1; i >= 0; i--) {
			const v = this.viewports[i]
			if (p.x >= v.x && p.x <= v.x + v.w && p.y >= v.y && p.y <= v.y + v.h) return v
		}
		return null
	}

	// ── drag gesture shared by insert (draft) and marquee ──
	beginDrag(p: Pt) { this.#anchor = p }
	updateDrag(p: Pt): Rect | null {
		const a = this.#anchor; if (!a) return null
		const r = { x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), w: Math.abs(p.x - a.x), h: Math.abs(p.y - a.y) }
		if (this.insertMode) this.draft = r; else this.marquee = r
		return r
	}
	endDrag(p: Pt, additive = false) {
		const r = this.updateDrag(p)
		if (this.insertMode) {
			if (r && r.w >= MIN_VP && r.h >= MIN_VP) this.addViewport(r)
			this.cancelInsert()
		} else {
			this.commitMarquee(r, additive)
			this.marquee = null
		}
		this.#anchor = null
	}

	/** Mutate a viewport's geometry (called by Viewport during move/resize). Mutating here —
	 *  inside the editor that owns the state — avoids Svelte's prop-ownership warning. */
	setRect(id: string, r: Rect) {
		const v = this.viewports.find(x => x.id === id); if (!v) return
		v.x = r.x; v.y = r.y; v.w = r.w; v.h = r.h
	}
	/** Mutate a viewport's content view (active-viewport pan/zoom). */
	setContentView(id: string, scale: number, offset: { x: number; y: number }) {
		const v = this.viewports.find(x => x.id === id); if (!v) return
		v.scale = scale; v.contentOffsetMm = offset
	}
	/** Replace a viewport's annotations (persisted with the sheet). */
	setAnnotations(id: string, annotations: any[]) {
		const v = this.viewports.find(x => x.id === id); if (!v) return
		v.annotations = annotations
		this.notify()
	}
	/** Toggle a per-viewport layer override (hidden / locked). */
	setLayerOverride(id: string, layerId: string, patch: { hidden?: boolean; locked?: boolean }) {
		const v = this.viewports.find(x => x.id === id); if (!v) return
		const ov = { ...(v.layerOverrides ?? {}) }
		ov[layerId] = { ...(ov[layerId] ?? {}), ...patch }
		v.layerOverrides = ov
		this.notify()
	}

	addViewport(r: Rect) {
		// New viewports start as an (empty) text note — they show the "Empty — choose source"
		// placeholder until the user types or picks a real source from the Type dropdown.
		const v: SheetViewport = { id: this.uid('V'), ...r, source: { kind: 'text', content: '' }, border: 'thin', version: 2 }
		this.viewports.push(v)
		this.selectedIds = [v.id]
		this.notify()
	}
	/** Crossing selection: any viewport whose frame the box touches. A click (zero-area box) hits none → clears. */
	commitMarquee(box: Rect | null, additive: boolean) {
		const hits = box && (box.w > 0 || box.h > 0) ? this.viewports.filter(v => overlaps(box, v)).map(v => v.id) : []
		this.selectedIds = additive ? [...new Set([...this.selectedIds, ...hits])] : hits
	}
}

/** Crossing (AABB intersection) test. */
function overlaps(a: Rect, b: SheetViewport): boolean {
	return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}
