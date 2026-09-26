// DOCUMENT EDITS — the page's mutating operations on a tab's model, moved out of +page.svelte: entity CRUD,
// the shape clipboard (ui/clipboard.ts), groups, draw order, the selected model object(s)' edits, deleting a
// layer with its items, and deleting whatever a viewport has selected. Every one records on the global undo
// timeline (history.svelte.ts). +page.svelte owns the session / docs / selection; it hands them in as a host.
import { toast } from 'svelte-sonner'
import { newId } from './ids'
import { modelById } from './3dview/models.svelte'
import { activeLayerIn, removeLayer } from './layers.svelte'
import { selStore } from './selStore.svelte'
import { selOnly, selClear, idsOfKind, singleOfKind } from './ui/selection'
import { deleteModelSel, deleteGraphNode, deleteGraphSeg, deleteSection } from './ui/modelEdit'
import { Clipboard, arrange, setGroup, relabelCopies, clipText, clipHtml, readable, resolvePastedLayer, type ArrangeOp, type ClipLayers } from './ui/clipboard'
import type { Ent, Pt } from './ui/geometry'
import { withDefaults, type DrawingDefaults } from './ui/drawingDefaults'
import { unlinkIfMoved } from './ui/floorplanLink'
import { followConnections } from './3dview/connect'
import type { ModelId, Obj } from './3dview/types'
import type { WorkspaceHistory } from './history.svelte'

export type EditScope = { begin(): void; mark(label?: string): void; end(debounceMs?: number): void }

export type DocEditHost = {
	timeline: WorkspaceHistory
	/** The model a tab's ACTIVE viewport edits. */
	modelIdOf: (tabId: string) => ModelId
	/** The focused pane's tab id / its active model / its active viewport (the selection key). */
	focusedTabId: () => string | undefined
	activeMid: () => ModelId
	activeSelViewId: () => string | undefined
	/** A tab's model's shapes (for fresh labels on paste). */
	entsOf: (tabId: string) => Ent[]
	/** Scale denominator of the viewport being edited (a paste steps 5 PAPER mm). */
	scaleN: () => number
	/** The Properties panel's selected model object(s). */
	selModelObj: () => Obj | null
	selModelObjs: () => Obj[]
	/** A sheet frame's own delete (records its own step). */
	deleteFrame: (tabId: string, frameId: string) => void
	/** D10: the project's drawing defaults (a freshly drawn shape starts with them). */
	drawingDefaults: () => DrawingDefaults | undefined
}

export class DocEdit {
	#h: DocEditHost
	readonly clipboard = new Clipboard()   // plain snapshots; persists across tabs
	constructor(host: DocEditHost) { this.#h = host }

	#ents = (mid: ModelId): Ent[] => modelById(mid)?.shapes ?? []
	#setEnts = (mid: ModelId, next: Ent[]) => { const m = modelById(mid); if (m) m.shapes = next }
	/** A 3D-model edit (the store was mutated in place) → one step on this doc's timeline, gesture-folded. */
	modelEdit = (tabId: string, label = 'Edit model') => this.#h.timeline.record(tabId, label)

	// ── entities (R5: a new one lands on the active layer if this model has it — activeLayerIn) ──
	/** J5: a NEW shape never lands on a hidden or locked active layer (it would vanish / be uneditable) — refused
	 *  with a note. Returns whether it was added. `fresh` (a NEW drawing, not a paste) → D10 drawing defaults fill its unset style. */
	addEnt = (tabId: string, e: Ent, fresh = true): boolean => {
		const t = this.#h.timeline, mid = this.#h.modelIdOf(tabId), al = e.layer ? null : activeLayerIn(modelById(mid)?.layers ?? [])
		if (al && (!al.visible || al.locked)) { toast.warning(`The active layer “${al.name}” is ${al.locked ? 'locked' : 'hidden'} — pick another layer (or ${al.locked ? 'unlock' : 'show'} it) to draw`, { id: 'layer-refused' }); return false }
		if (fresh) e = withDefaults(e, this.#h.drawingDefaults())
		t.ensure(tabId); const en = e.layer ? e : { ...e, layer: al?.id }; this.#setEnts(mid, [...this.#ents(mid), en]); t.record(tabId, 'Add ' + en.type)
		return true
	}
	/** F6: conduit ends attached to these shapes / objects move onto their points — BEFORE the step is recorded, so
	 *  every way of moving them (drag, nudge, Properties, group transform) carries its conduits in the same step. */
	#follow = (mid: ModelId, ids: string[]) => { const m = modelById(mid); if (m) followConnections(m, new Set(ids)) }
	updateEnt = (tabId: string, e: Ent) => {
		const t = this.#h.timeline, mid = this.#h.modelIdOf(tabId)
		t.ensure(tabId); this.#setEnts(mid, this.#ents(mid).map((x) => (x.id === e.id ? unlinkIfMoved(x, e) : x))); this.#follow(mid, [e.id]); t.record(tabId, 'Edit ' + e.type)
	}
	/** Several shapes edited together (a multi-selection's style / move / auto-number) — ONE undo step. */
	updateEnts = (tabId: string, es: Ent[]) => {
		if (!es.length) return
		const t = this.#h.timeline, mid = this.#h.modelIdOf(tabId), by = new Map(es.map((e) => [e.id, e]))
		t.ensure(tabId); this.#setEnts(mid, this.#ents(mid).map((x) => { const n = by.get(x.id); return n ? unlinkIfMoved(x, n) : x })); this.#follow(mid, es.map((e) => e.id))
		t.record(tabId, es.length > 1 ? `Edit ${es.length} shapes` : 'Edit ' + es[0].type)
	}
	/** Pure CRUD — no selection side effects (the callers know the VIEWPORT id). */
	deleteEnts = (tabId: string, ids: string[]) => {
		if (!ids.length) return
		const t = this.#h.timeline, mid = this.#h.modelIdOf(tabId), rm = new Set(ids)
		t.ensure(tabId); this.#setEnts(mid, this.#ents(mid).filter((e) => !rm.has(e.id))); t.record(tabId, 'Delete')
	}

	// ── clipboard, groups, draw order (the logic is ui/clipboard.ts) ──
	/** Copy shapes and / or 3D model objects (`objIds`: walls, boxes, conduits — a selection holds one kind or the other). */
	copyEnts = (tabId: string, ids: string[], objIds: string[] = []) => {
		const mid = this.#h.modelIdOf(tabId), m = modelById(mid)
		const s = new Set(ids), items = this.#ents(mid).filter((e) => s.has(e.id)).map((e) => $state.snapshot(e) as Ent)
		const os = new Set(objIds), objs = (m?.objects ?? []).filter((o) => o.id && os.has(o.id)).map((o) => $state.snapshot(o) as Obj)
		const layers: ClipLayers = {}; for (const o of objs) { const l = o.layer && m?.layers?.find((x) => x.id === o.layer); if (l) layers[l.id] = l.name }
		this.clipboard.copy(items, objs, layers, mid)
		// …and to the SYSTEM clipboard, so another tab / project can paste them (writing needs no permission)
		// as readable text + HTML (Word / Notepad / Excel get the words / cells), our shapes hidden in the HTML
		if (items.length || objs.length) {
			const r = readable(items), data = clipText(items, objs, layers), plain = r.plain || data
			const write = typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write
				? navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([plain], { type: 'text/plain' }), 'text/html': new Blob([clipHtml(items, objs, layers)], { type: 'text/html' }) })])
				: navigator.clipboard?.writeText(data)
			write?.catch(() => navigator.clipboard?.writeText(data).catch(() => {}))
		}
	}
	cutEnts = (tabId: string, ids: string[], objIds: string[] = []) => {
		this.copyEnts(tabId, ids, objIds)
		if (ids.length) this.deleteEnts(tabId, ids)
		const m = modelById(this.#h.modelIdOf(tabId)), rm = new Set(objIds), t = this.#h.timeline
		if (m && rm.size) { t.beginGesture(); m.objects = m.objects.filter((o) => !o.id || !rm.has(o.id)); this.modelEdit(tabId, 'Cut'); t.endGesture() }
	}
	/** The copies actually added (B19: 5 PAPER mm per paste, stacking; E12: copied outlets get free labels) — shapes
	 *  and 3D objects, in ONE undo step; a pasted object's layer is matched in this model by id, then by name. */
	pasteEnts = (tabId?: string, at?: Pt): { ents: Ent[]; objs: Obj[] } | undefined => {
		if (this.clipboard.empty || !tabId) return
		const t = this.#h.timeline, p = this.clipboard.pasteAll(5 * this.#h.scaleN(), () => newId(), this.#h.modelIdOf(tabId), at)
		const copies = relabelCopies(p.ents, this.#h.entsOf(tabId)), m = modelById(this.#h.modelIdOf(tabId))
		t.beginGesture()
		const ents = copies.filter((c) => this.addEnt(tabId, c, false))
		const objs = m ? p.objs.map((o) => ({ ...o, layer: resolvePastedLayer(o.layer, p.layers, m.layers ?? []) }) as Obj) : []
		if (m && objs.length) { m.objects = [...m.objects, ...objs]; this.modelEdit(tabId, objs.length > 1 ? `Paste ${objs.length} objects` : 'Paste object') }
		t.endGesture()
		return { ents, objs }
	}
	groupEnts = (tabId: string, ids: string[]) => {
		if (ids.length < 2) return
		const t = this.#h.timeline, mid = this.#h.modelIdOf(tabId)
		t.ensure(tabId); this.#setEnts(mid, setGroup(this.#ents(mid), ids, newId())); t.record(tabId, 'Group')
	}
	ungroupEnts = (tabId: string, ids: string[]) => {
		const t = this.#h.timeline, mid = this.#h.modelIdOf(tabId)
		t.ensure(tabId); this.#setEnts(mid, setGroup(this.#ents(mid), ids, undefined)); t.record(tabId, 'Ungroup')
	}
	reorderEnts = (tabId: string, ids: string[], op: ArrangeOp) => {
		const t = this.#h.timeline, mid = this.#h.modelIdOf(tabId), next = arrange(this.#ents(mid), ids, op); if (!next) return
		t.ensure(tabId); this.#setEnts(mid, next); t.record(tabId, 'Reorder')
	}

	// ── the Properties panel's model object(s) — edited straight on the store, one undo step each ──
	updateModelObj = (patch: Record<string, unknown>) => {
		const o = this.#h.selModelObj(), id = this.#h.focusedTabId(), t = this.#h.timeline; if (!o || !id) return
		t.beginGesture(); Object.assign(o, patch); if (o.id) this.#follow(this.#h.activeMid(), [o.id]); this.modelEdit(id); t.endGesture()
	}
	/** I4 / F8: several model objects — the patch per object (null = leave it), as ONE undo step. */
	updateModelObjs = (patchOf: (o: Obj) => Record<string, unknown> | null) => {
		const objs = this.#h.selModelObjs(), id = this.#h.focusedTabId(), t = this.#h.timeline; if (!id || !objs.length) return
		t.beginGesture(); for (const o of objs) { const p = patchOf(o); if (p) Object.assign(o, p) }
		this.#follow(this.#h.activeMid(), objs.flatMap((o) => (o.id ? [o.id] : []))); this.modelEdit(id); t.endGesture()
	}
	/** Add a model object to the focused model (e.g. a rack's "+ Device") — one undo step. */
	addModelObj = (o: Obj) => {
		const m = modelById(this.#h.activeMid()), id = this.#h.focusedTabId(), t = this.#h.timeline; if (!m || !id) return
		t.beginGesture(); m.objects = [...m.objects, o]; this.modelEdit(id, 'Add ' + (o.label ?? o.type)); t.endGesture()
	}
	deleteModelObj = () => {
		const o = this.#h.selModelObj(), id = this.#h.focusedTabId(), m = modelById(this.#h.activeMid()), t = this.#h.timeline; if (!o || !m || !id) return
		t.beginGesture(); m.objects = m.objects.filter((x) => x.id !== o.id); this.modelEdit(id); t.endGesture()
		selStore.set(this.#h.activeSelViewId(), selClear())
	}
	/** A wall / conduit segment's own override. */
	updateModelSeg = (segIdx: number, patch: Record<string, unknown>) => {
		const o = this.#h.selModelObj() as { segments?: Record<string, unknown>[] } | null, id = this.#h.focusedTabId(), t = this.#h.timeline
		if (!o?.segments?.[segIdx] || !id) return
		t.beginGesture(); Object.assign(o.segments[segIdx], patch); this.modelEdit(id); t.endGesture()
	}

	// ── J2: a layer of the focused model, deleted together with everything on it ──
	layerItemCount = (layerId: string) => {
		const mid = this.#h.activeMid()
		return (modelById(mid)?.objects.filter((o) => o.layer === layerId).length ?? 0) + this.#ents(mid).filter((e) => e.layer === layerId).length
	}
	deleteLayerWithItems = (layerId: string) => {
		const tab = this.#h.focusedTabId(), mid = this.#h.activeMid(), m = modelById(mid), t = this.#h.timeline; if (!tab || !m) return
		t.beginGesture()
		m.objects = m.objects.filter((o) => o.layer !== layerId)
		this.#setEnts(mid, this.#ents(mid).filter((e) => e.layer !== layerId))
		if (m.layers) removeLayer(m.layers, layerId)
		this.modelEdit(tab, 'Delete layer'); t.endGesture()
	}

	/** Delete whatever's selected at `viewId` — ents, obj/guide, a wall/conduit node (degree-based join / prune), a
	 *  section marker or a sheet frame (kinds are mutually exclusive, so one branch runs), each recording its own
	 *  label. Shared by a Viewport's own Delete key (`editor.sel.delete()`) and the Edit menu / global keys. */
	deleteSelAt = (tabId: string, viewId: string, edit: EditScope) => {
		const s = selStore.of(viewId)
		const entIds = idsOfKind(s, 'ent'), objGuideIds = [...idsOfKind(s, 'obj'), ...idsOfKind(s, 'guide')]
		const nodeItem = singleOfKind(s, 'node'), sectionItem = singleOfKind(s, 'section'), frameItem = singleOfKind(s, 'frame')
		const mdl = () => modelById(this.#h.modelIdOf(tabId))
		if (entIds.length) { this.deleteEnts(tabId, entIds); selStore.set(viewId, selClear()); return }
		if (objGuideIds.length) { const m = mdl(); if (m) deleteModelSel(m, edit, objGuideIds); selStore.set(viewId, selClear()); return }
		if (nodeItem) {
			const m = mdl()
			const removedObject = m ? deleteGraphNode(m, edit, { obj: nodeItem.id, node: nodeItem.sub! }, newId).removedObject : true
			// a node delete that only joins / prunes segments (the object survives) leaves the PARENT selected
			selStore.set(viewId, removedObject ? selClear() : selOnly([{ kind: 'obj', id: nodeItem.id }]))
			return
		}
		const segItem = singleOfKind(s, 'seg')
		if (segItem) {   // one segment of a run; the rest of the run stays selected
			const m = mdl(), removedObject = m ? deleteGraphSeg(m, edit, { obj: segItem.id, seg: segItem.sub! }).removedObject : true
			selStore.set(viewId, removedObject ? selClear() : selOnly([{ kind: 'obj', id: segItem.id }]))
			return
		}
		if (sectionItem) { const m = mdl(); if (m) deleteSection(m, edit, sectionItem.id); selStore.set(viewId, selClear()); return }
		const frameIds = idsOfKind(s, 'frame')
		if (frameIds.length) { for (const id of frameIds) this.#h.deleteFrame(tabId, id); selStore.set(viewId, selClear()) }   // each frame records its own step
	}
}
