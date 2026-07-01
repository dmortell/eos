import type { SheetViewport, AnnotationDefaults } from './types'
import { LAYERS, CUSTOM_LAYER_COLORS, layerCategory, type LayerDef } from './layers/layers'

export type InsertKind = 'viewport'
type Rect = { x: number; y: number; w: number; h: number }
type Pt = { x: number; y: number }

const MIN_VP = 20 // smallest viewport you can drag out (mm)

/**
 * Viewport numbering for references/labels: top-to-bottom, then left-to-right (reading order),
 * matching how a drawing is read. Viewports whose tops sit within `rowTol` mm count as one row
 * (so a row of side-by-side viewports numbers left→right, not by a 1mm top difference).
 * Returns a map of viewport id → number. Renumbers when viewports are moved.
 *
 * A viewport's manual `number` overrides its auto position. A sheet with fewer than 2 viewports
 * gets no numbers (a lone viewport needs no number) — the map is empty, so refs resolve to 0 (19e).
 */
export function numberViewports(viewports: SheetViewport[], rowTol = 15): Map<string, number> {
	const m = new Map<string, number>()
	if (viewports.length < 2) return m
	const byY = [...viewports].sort((a, b) => a.y - b.y)
	const rows: SheetViewport[][] = []
	for (const v of byY) {
		const row = rows[rows.length - 1]
		if (row && v.y - row[0].y <= rowTol) row.push(v)
		else rows.push([v])
	}
	let n = 0
	for (const row of rows) { row.sort((a, b) => a.x - b.x); for (const v of row) m.set(v.id, ++n) }
	// Manual numbers win over the auto position.
	for (const v of viewports) if (typeof v.number === 'number' && v.number > 0) m.set(v.id, v.number)
	return m
}

// The viewport clipboard is persisted to localStorage (not just a module var) so a copy
// survives a full reload / a fresh tab — cross-project paste usually means opening the
// target project separately. Carries the source project + any referenced model3d model
// payloads so a model3d viewport can be pasted into ANOTHER project (its model is
// auto-imported there — see pasteClipboard).
type VpClipboard = { viewports: SheetViewport[]; projectId: string; models: Record<number, any> }
const CLIP_KEY = 'eos.sheets.vpClipboard'
function writeClipboard(c: VpClipboard) {
	try { localStorage.setItem(CLIP_KEY, JSON.stringify(c)) } catch { /* ignore quota/SSR */ }
}
function readClipboard(): VpClipboard {
	try { const c = JSON.parse(localStorage.getItem(CLIP_KEY) || 'null'); if (c?.viewports) return c } catch { /* ignore */ }
	return { viewports: [], projectId: '', models: {} }
}

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

	// ── Layers ── user-defined layers (project-wide; loaded/persisted by SheetEditor) plus the
	// active layer that new objects are created on.
	customLayers = $state<LayerDef[]>([])
	activeLayerId = $state<string>('annotations')
	allLayers = $derived<LayerDef[]>([...LAYERS, ...this.customLayers])

	/** Project-wide annotation defaults (new annotations inherit; dimension unit). */
	annoDefaults = $state<AnnotationDefaults>({})
	setDefaults(patch: Partial<AnnotationDefaults>) { this.annoDefaults = { ...this.annoDefaults, ...patch }; this.onDefaultsChange?.() }

	/** Called after a mutation that should be persisted (add / delete / geometry change). */
	onChange: (() => void) | null = null
	/** Called after the custom-layer list changes (SheetEditor persists it to the project doc). */
	onLayersChange: (() => void) | null = null
	/** Called after the annotation defaults change (SheetEditor persists to the project doc). */
	onDefaultsChange: (() => void) | null = null

	// ── model3d cross-project copy bridge (set by SheetEditor, which owns db + pid) ──
	/** Current project id — lets paste detect a cross-project source. */
	projectId = ''
	/** Snapshot a model3d model payload by id (for the clipboard at copy time). */
	captureModel: ((modelId: number) => any | null) | null = null
	/** Import a model payload into THIS project's store; returns its new local id. */
	importModel: ((model: any) => number) | null = null

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

	// ── sheet-level undo/redo for viewport geometry + add/delete/paste/duplicate ──
	// (the per-viewport tool history handles content edits inside an ACTIVE viewport instead).
	#undo: string[] = []
	#redo: string[] = []
	#vpSnap() { return JSON.stringify($state.snapshot(this.viewports)) }
	/** Snapshot the current viewports BEFORE a mutation (move/resize/add/delete/…). */
	checkpoint() { this.#undo.push(this.#vpSnap()); if (this.#undo.length > 80) this.#undo.shift(); this.#redo = [] }
	/** Undo a checkpoint that turned out to be a no-op (e.g. a click that didn't drag). */
	cancelCheckpoint() { this.#undo.pop() }
	canUndo() { return this.#undo.length > 0 }
	canRedo() { return this.#redo.length > 0 }
	undo() { if (!this.#undo.length) return; this.#redo.push(this.#vpSnap()); this.#applyVpSnap(this.#undo.pop()!) }
	redo() { if (!this.#redo.length) return; this.#undo.push(this.#vpSnap()); this.#applyVpSnap(this.#redo.pop()!) }
	#applyVpSnap(json: string) {
		this.viewports = JSON.parse(json)
		this.activeId = null
		this.selectedIds = this.selectedIds.filter((id) => this.viewports.some((v) => v.id === id))
		this.notify(); this.notifyLayers?.()
	}

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
		if (!this.selectedIds.length) return
		this.checkpoint()
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
	/** Set a viewport's paper scale (0 = Fit). Used by the frame toolbar's scale picker. */
	setScale(id: string, scale: number) {
		const v = this.viewports.find(x => x.id === id); if (!v) return
		this.checkpoint()
		v.scale = scale || 0
		this.notify()
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

	// ── custom-layer CRUD (persisted project-wide via onLayersChange) ──
	notifyLayers() { this.onLayersChange?.() }
	setActiveLayer(id: string) { this.activeLayerId = id }
	/** Create a custom layer filed under a default layer (`base`). Defaults to the active layer's
	 *  category, so a new layer lands in the group you're working in (not always Annotations). */
	addCustomLayer(base = layerCategory(this.activeLayerId, this.allLayers), name = 'New layer'): string {
		const id = this.uid('L')
		const color = CUSTOM_LAYER_COLORS[this.customLayers.length % CUSTOM_LAYER_COLORS.length]
		this.customLayers = [...this.customLayers, { id, name, color, base, custom: true }]
		this.activeLayerId = id
		this.notifyLayers()
		return id
	}
	renameLayer(id: string, name: string) {
		this.customLayers = this.customLayers.map(l => l.id === id ? { ...l, name } : l)
		this.notifyLayers()
	}
	setLayerColor(id: string, color: string) {
		this.customLayers = this.customLayers.map(l => l.id === id ? { ...l, color } : l)
		this.notifyLayers()
	}
	/** Re-file a custom layer under a different default layer. */
	setLayerBase(id: string, base: string) {
		this.customLayers = this.customLayers.map(l => l.id === id ? { ...l, base } : l)
		this.notifyLayers()
	}
	/** Delete a custom layer. Objects still referencing it fall back to its base category at render. */
	deleteLayer(id: string) {
		this.customLayers = this.customLayers.filter(l => l.id !== id)
		if (this.activeLayerId === id) this.activeLayerId = 'annotations'
		this.notifyLayers()
	}

	// ── copy / cut / paste / duplicate (clipboard is module-level, so it survives sheet navigation) ──
	copySelected() {
		const viewports = this.viewports.filter(v => this.selectedIds.includes(v.id)).map(v => structuredClone($state.snapshot(v)) as SheetViewport)
		// Stash the referenced model3d models so the viewport can paste into another project.
		const models: Record<number, any> = {}
		for (const v of viewports) {
			if (v.source?.kind === 'model3d' && this.captureModel) {
				const m = this.captureModel(v.source.modelId)
				if (m) models[v.source.modelId] = m
			}
		}
		writeClipboard({ viewports, projectId: this.projectId, models })
	}
	cutSelected() { this.copySelected(); this.deleteSelected() }
	/** Paste the clipboard viewports into this sheet (new ids, nudged so they're visible). When the
	 *  clipboard came from a DIFFERENT project, any model3d model is imported into this project and
	 *  the pasted viewport is repointed at the new local id. */
	pasteClipboard() {
		const clip = readClipboard()
		if (!clip.viewports.length) return
		this.checkpoint()
		const D = 10
		const crossProject = clip.projectId !== this.projectId
		const idMap = new Map<number, number>() // old modelId → new local id (dedupe multi-refs)
		const copies = clip.viewports.map(v => {
			const c = { ...structuredClone(v), id: this.uid('V'), x: v.x + D, y: v.y + D } as SheetViewport
			if (crossProject && c.source?.kind === 'model3d' && this.importModel) {
				const oldId = c.source.modelId
				let newId = idMap.get(oldId)
				if (newId == null) {
					const payload = clip.models[oldId]
					if (payload) { newId = this.importModel(payload); idMap.set(oldId, newId) }
				}
				if (newId != null) c.source = { ...c.source, modelId: newId }
			}
			return c
		})
		this.viewports.push(...copies)
		this.selectedIds = copies.map(c => c.id); this.activeId = null
		this.notify()
	}
	/** Duplicate the selected viewports in place (offset), without touching the clipboard. */
	duplicateSelected() {
		const sel = this.viewports.filter(v => this.selectedIds.includes(v.id))
		if (!sel.length) return
		this.checkpoint()
		const D = 10
		const copies = sel.map(v => ({ ...structuredClone($state.snapshot(v)) as SheetViewport, id: this.uid('V'), x: v.x + D, y: v.y + D }))
		this.viewports.push(...copies)
		this.selectedIds = copies.map(c => c.id); this.activeId = null
		this.notify()
	}

	addViewport(r: Rect) {
		this.checkpoint()
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
