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
import { deleteModelSel, deleteGraphNode, deleteSection } from './ui/modelEdit'
import { Clipboard, arrange, setGroup, relabelCopies, type ArrangeOp } from './ui/clipboard'
import type { Ent } from './ui/geometry'
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
	 *  with a note. Returns whether it was added. */
	addEnt = (tabId: string, e: Ent): boolean => {
		const t = this.#h.timeline, mid = this.#h.modelIdOf(tabId), al = e.layer ? null : activeLayerIn(modelById(mid)?.layers ?? [])
		if (al && (!al.visible || al.locked)) { toast.warning(`The active layer “${al.name}” is ${al.locked ? 'locked' : 'hidden'} — pick another layer (or ${al.locked ? 'unlock' : 'show'} it) to draw`, { id: 'layer-refused' }); return false }
		t.ensure(tabId); const en = e.layer ? e : { ...e, layer: al?.id }; this.#setEnts(mid, [...this.#ents(mid), en]); t.record(tabId, 'Add ' + en.type)
		return true
	}
	updateEnt = (tabId: string, e: Ent) => {
		const t = this.#h.timeline, mid = this.#h.modelIdOf(tabId)
		t.ensure(tabId); this.#setEnts(mid, this.#ents(mid).map((x) => (x.id === e.id ? e : x))); t.record(tabId, 'Edit ' + e.type)
	}
	/** Pure CRUD — no selection side effects (the callers know the VIEWPORT id). */
	deleteEnts = (tabId: string, ids: string[]) => {
		if (!ids.length) return
		const t = this.#h.timeline, mid = this.#h.modelIdOf(tabId), rm = new Set(ids)
		t.ensure(tabId); this.#setEnts(mid, this.#ents(mid).filter((e) => !rm.has(e.id))); t.record(tabId, 'Delete')
	}

	// ── clipboard, groups, draw order (the logic is ui/clipboard.ts) ──
	copyEnts = (tabId: string, ids: string[]) => { const s = new Set(ids); this.clipboard.copy(this.#ents(this.#h.modelIdOf(tabId)).filter((e) => s.has(e.id)).map((e) => $state.snapshot(e) as Ent)) }
	cutEnts = (tabId: string, ids: string[]) => { this.copyEnts(tabId, ids); this.deleteEnts(tabId, ids) }
	/** The copies actually added (B19: 5 PAPER mm per paste, stacking; E12: copied outlets get free labels). */
	pasteEnts = (tabId?: string): Ent[] | undefined => {
		if (this.clipboard.empty || !tabId) return
		const t = this.#h.timeline, copies = relabelCopies(this.clipboard.paste(5 * this.#h.scaleN(), () => newId()), this.#h.entsOf(tabId))
		t.beginGesture(); const added = copies.filter((c) => this.addEnt(tabId, c)); t.endGesture()
		return added
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
		t.beginGesture(); Object.assign(o, patch); this.modelEdit(id); t.endGesture()
	}
	/** I4 / F8: several model objects — the patch per object (null = leave it), as ONE undo step. */
	updateModelObjs = (patchOf: (o: Obj) => Record<string, unknown> | null) => {
		const objs = this.#h.selModelObjs(), id = this.#h.focusedTabId(), t = this.#h.timeline; if (!id || !objs.length) return
		t.beginGesture(); for (const o of objs) { const p = patchOf(o); if (p) Object.assign(o, p) } this.modelEdit(id); t.endGesture()
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
		if (sectionItem) { const m = mdl(); if (m) deleteSection(m, edit, sectionItem.id); selStore.set(viewId, selClear()); return }
		if (frameItem) { this.#h.deleteFrame(tabId, frameItem.id); selStore.set(viewId, selClear()) }   // a frame records its own step
	}
}
