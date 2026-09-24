// The Pages tool's PROJECT side (drawings-plan phases 2–6), moved out of +page.svelte: the project's live
// Firestore data (ProjectSource = the other tools' data, read-only; PagesStore = Pages' own places / sheets /
// models), the navigator tree built from it, and everything that acts on it —
//   places      seed / add / rename / move / delete, and the selected place's Properties
//   models      a place's model (created + stored on first open, a floorplan attached once), opening it,
//               archive / restore, the Outlets-tool import, and saving every stored model when it changes
//   sheets      load into the PageDoc store, save back, create / rename / move / archive, bulk edits
//   title block the project template filled per sheet (phase 5)
//   dialog      the drawing management dialog's state + handlers (phase 6)
// The workspace itself (tabs, panes, history, paper) stays in +page.svelte and reaches this class through
// `ProjectHost`. Construct it during component init: the constructor registers $effects.
import { untrack } from 'svelte'
import type { Firestore, Session as AuthSession } from '$lib'
import { newId } from './ids'
import { viewState } from './viewState.svelte'
import { docs, type PageDoc } from './doc.svelte'
import type { Kind, SheetFrame, Tab, WorkPane } from './types'
import type { Ent } from './ui/geometry'
import type { PaperSize } from './constants'
import { models, modelById, ensureFloorModel, upsertModel, removeModels, modelForPlace } from './3dview/models.svelte'
import type { Model, ModelId, ModelKind } from './3dview/types'
import { emptyFloor } from './mock/models'
import { docToModel, sheetToPage, pageToSheet } from './store/mappers'
import { floorplanPlacement, pdfSrc, PDF_SRC } from './ui/render/pdfRaster.svelte'
import { startBlocks } from './blocks.svelte'
import { importOutletsInto, outletsDocIdFor, type OutletsDoc } from './store/outletsImport'
import { normFloors, findNodePath } from './projectTree'
import { ProjectSource } from './projectData.svelte'
import { PagesStore } from './store/pagesStore.svelte'
import type { PagesSheetDoc } from './store/schema'
import { buildPlaceTree } from './store/placeTree'
import { addPlace, updatePlace, movePlace, removePlace, ancestorsOf } from './store/places'
import { describePlace } from './store/placeProps'
import { fillTitleBlock, initialsOf, DEFAULT_TITLE_BLOCK, type TbCell } from './titleBlock'
import type { DropZone } from './parts/treeDrag.svelte'

type TreeNodeSel = { id: string; label: string; kind: string; floorNumber?: number; building?: string }
/** The workspace state + actions this class needs from +page.svelte. */
export type ProjectHost = {
	db?: Firestore
	auth?: AuthSession
	/** The route's project id (read inside an effect: a change re-creates the stores). */
	pid: () => string | undefined
	/** The page's session object (tabs, panes, focused, tree selection) — never reassigned. */
	session: { tabs: Tab[]; panes: WorkPane[]; focused: number; treeNode: TreeNodeSel | null }
	openDrawing: (d: { title: string; kind: Kind; preview?: boolean; floor?: string; docId?: string; modelId?: ModelId }) => void
	closeTab: (id: string) => void
	toast: (msg: string) => void
	/** The tab id → its drawing id (`sheet:<id>`, `model:<id>`, …). */
	didOf: (tabId?: string) => string
	paperOf: (tabId?: string) => { size: PaperSize; landscape: boolean }
	framesOf: (tabId: string) => SheetFrame[]
	scaleOf: (tabId?: string) => string
	/** The mock revision code + date shown on a sheet that isn't stored yet (phase 7 replaces it). */
	revInfo: () => { rev: string; date: string }
	activeTabId: () => string | undefined
	// history (undo) hooks
	ensureHist: () => void
	pushStep: (tabId: string, label: string) => void
	addModelToHistory: (m: Model) => void
	addDocToHistory: (did: string) => void
}

export const SHEET = 'sheet:'
export const sheetIdOf = (docId?: string) => (docId?.startsWith(SHEET) ? docId.slice(SHEET.length) : null)
// drawings-plan phase 3: the kinds of place that get a model of that kind (anything else → a zone model)
const MODEL_KINDS: ModelKind[] = ['floor', 'zone', 'room', 'building']
// A floor's FLOORPLAN is an image SHAPE (src `pdf:<fileId>#<page>`) on the model's Background "Floorplan" layer
// — selectable / croppable / recalibratable like any image. Its placement is computed ONCE from the Outlets /
// Uploads calibration of the page; later changes in Pages aren't synced back (drawings-plan). Locked by
// default: clicking the plan mustn't grab it — unlock the layer to move / crop / recalibrate it.
const FLOORPLAN_LAYER = { id: 'floorplan', name: 'Floorplan', group: 'Background', color: '#94a3b8', swatch: 'color' as const, visible: true, locked: true }
const floorplanShapeOf = (m: Model) => m.shapes?.find((e) => e.type === 'image' && e.src?.startsWith(PDF_SRC))

export class PagesProject {
	#h: ProjectHost
	/** The other tools' data for this project (read-only) — the old tree, floorplans, Properties of old nodes. */
	src = $state<ProjectSource | null>(null)
	/** Pages' own data: places, sheets, models. */
	store = $state<PagesStore | null>(null)
	/** An open asked for before the store has loaded its models (the tree-item restore, a quick click) WAITS
	 *  for them — otherwise modelForPlace finds nothing yet and a duplicate model would be created and stored. */
	#pendingPlaceOpen = $state<{ placeId: string; preview: boolean } | null>(null)
	#attaching = new Set<ModelId>()
	/** The drawing management dialog is open (phase 6). */
	drawingsOpen = $state(false)

	constructor(host: ProjectHost) {
		this.#h = host
		// the GLOBAL block library (blocks/{id}): subscribed once per session; missing default blocks are seeded
		$effect(() => { const db = this.#h.db; if (db) untrack(() => startBlocks(db)) })
		// One live ProjectSource + PagesStore per project id (re-created when Open Project navigates to another pid)
		$effect(() => {
			const pid = this.#h.pid(), db = this.#h.db
			if (!db || !pid) return
			const src = new ProjectSource(db, pid)
			const stop = src.start()
			// stored models go into the editor's model registry from the SUBSCRIPTION callback (remote changes only)
			const ps = new PagesStore(db, pid, untrack(() => this.#h.auth?.user?.email ?? ''), {
				onModels: (changed, removed) => {
					for (const d of changed) {
						const isNew = !modelById(d.id), m = docToModel(d)
						upsertModel(m); if (isNew) this.#h.addModelToHistory(m); if (m.underlays?.length) this.#convertUnderlays(m.id)
					}
					removeModels(removed)
				},
				// a stored sheet changed elsewhere: refresh its open page doc + tab titles (echoes / pending edits never arrive here)
				onSheets: (changed) => {
					for (const sh of changed) {
						const did = SHEET + sh.id
						if (docs.has(did)) docs.seed(did, sheetToPage(sh))
						for (const t of this.#h.session.tabs) if (t.docId === did && t.title !== sh.title) t.title = sh.title
					}
				},
			})
			ps.start()
			untrack(() => { this.src = src; this.store = ps })
			return () => {
				stop()
				const ids = ps.models.map((m) => m.id)
				void ps.stop().then(() => removeModels(ids))   // save pending edits, then drop this project's models
				untrack(() => { if (this.src === src) this.src = null; if (this.store === ps) this.store = null })
			}
		})
		$effect(() => {
			const want = this.#pendingPlaceOpen; if (!want || this.store?.status !== 'ready') return
			untrack(() => { this.#pendingPlaceOpen = null; this.openPlaceModel(want.placeId, want.preview) })
		})
		// Save every open stored SHEET's page doc back onto its registry entry. Depends on the WHOLE doc map (a sheet
		// loaded later must re-run this); the store's sheet list is read untracked — saveSheet replaces it.
		$effect(() => {
			const ps = this.store; if (!ps) return
			const all = docs.all()
			const list = untrack(() => ps.sheets)
			for (const sh of list) {
				const d = all[SHEET + sh.id]; if (!d) continue
				const snap = $state.snapshot(d) as PageDoc
				untrack(() => { const cur = ps.sheets.find((x) => x.id === sh.id); if (cur) ps.saveSheet(pageToSheet(cur, snap)) })
			}
		})
		// Save every STORED model when it changes (edits, undo/redo, floorplan attach). The saver debounces and skips
		// content it already has, so re-queueing unchanged models (or a remote change just applied) writes nothing.
		// The stored-id set is read untracked: saveModel updates the store's list, which must not re-run this.
		$effect(() => {
			const ps = this.store; if (!ps) return
			const stored = untrack(() => new Set(ps.models.map((m) => m.id)))
			for (const m of models) if (stored.has(m.id)) { const snap = $state.snapshot(m) as Model; untrack(() => ps.saveModel(snap)) }
		})
	}

	// ── the tree ──
	/** Once the project HAS Pages places, the navigator shows them (with the old tools' drawings hung on them by
	 *  their legacy links); until then it shows the tree derived from the other tools' data, plus "Set up places". */
	hasPlaces = $derived.by(() => !!this.store && this.store.places.length > 0)
	realTree = $derived.by(() => {
		const src = this.src; if (src?.status !== 'ready') return null
		const t = src.tree; if (!t) return null
		if (!this.hasPlaces) return t
		return { project: t.project, tree: buildPlaceTree({ pid: src.pid, places: this.store!.places, drawings: src.drawings, risers: src.risers, floors: src.project?.floors, sheets: this.store!.sheets,
			modelPlaces: new Set(models.filter((m) => m.placeId && !m.archived).map((m) => m.placeId!)) }) }
	})
	canSeedPlaces = $derived.by(() => this.store?.status === 'ready' && !this.hasPlaces && this.src?.status === 'ready')
	navStatus = $derived.by(() => (this.src?.status === 'loading' ? 'Loading project…' : this.src?.status === 'missing' ? 'Not a Firestore project — showing the demo tree' : ''))

	// ── places ──
	seedPlaces = () => {
		const src = this.src, ps = this.store; if (!src?.project || !ps) return
		if (ps.seedPlaces({ project: src.project, racks: src.racks, risers: src.risers, drawings: [] })) this.#h.toast(`Places created (${ps.places.length}). The tree now shows them.`)
	}
	onPlaceAdd = (parentId: string | null): string | undefined => {
		const ps = this.store; if (!ps) return
		const id = newId('pl')
		ps.savePlaces(addPlace(ps.places, { id, name: 'New place', parentId }))
		return id
	}
	onPlaceRename = (id: string, name: string) => { const ps = this.store; if (ps) ps.savePlaces(updatePlace(ps.places, id, { name })) }
	onPlaceMove = (id: string, targetId: string, zone: DropZone) => {
		const ps = this.store; if (!ps) return
		if (id.startsWith('s:')) { this.#moveSheetRow(id.slice(2), targetId, zone); return }
		if (targetId.startsWith('s:')) return   // a place can't go under a sheet
		const next = movePlace(ps.places, id, targetId, zone)
		if (next) ps.savePlaces(next); else this.#h.toast("A place can't move into itself")
	}
	/** Delete only an EMPTY place (drawings-plan §4): no child places, sheets, models or hung drawings. */
	onPlaceDelete = (id: string): string | null => {
		const ps = this.store; if (!ps) return null
		const node = this.realTree ? findNodePath(this.realTree.tree, { id })?.node : undefined
		const drawings = (node?.children ?? []).filter((c) => c.drawing).length
		if (ps.sheetsIn(id, true).length) return 'It has sheets — move or archive them first'
		if (ps.models.some((m) => m.placeId === id)) return 'It has a model — move or archive it first'
		if (drawings) return `It holds ${drawings} drawing${drawings === 1 ? '' : 's'} from the other tools`
		const next = removePlace(ps.places, id)
		if (!next) return 'It has places inside — move or delete them first'
		ps.savePlaces(next)
		if (this.#h.session.treeNode?.id === id) this.#h.session.treeNode = null
		return null
	}
	// The selected tree node's properties: a Pages place (placeProps.ts), else an old-tree node (projectProps.ts).
	// A renamed building's node id changes (`b:<name>`), so the selection follows it.
	#isPlaceNode = $derived.by(() => { const n = this.#h.session.treeNode; return !!n && this.hasPlaces && !!this.store?.places.some((p) => p.id === n.id) })
	nodeInfo = $derived.by(() => {
		const n = this.#h.session.treeNode; if (!n) return null
		if (this.#isPlaceNode) return describePlace(this.store!.places, n.id, this.realTree ? findNodePath(this.realTree.tree, { id: n.id })?.node : undefined)
		return this.src?.status === 'ready' ? this.src.describe(n.id) : null
	})
	setNodeField = async (key: string, value: string) => {
		const s = this.#h.session, n = s.treeNode, src = this.src; if (!n || !src) return
		if (this.#isPlaceNode && this.store) {   // a Pages place: name / icon kind
			if (key !== 'name' && key !== 'kind') return
			if (key === 'name' && !value.trim()) { this.#h.toast('A place needs a name'); return }
			this.store.savePlaces(updatePlace(this.store.places, n.id, { [key]: value }))
			if (key === 'name') s.treeNode = { ...n, label: value.trim() }
			return
		}
		try {
			const ok = await src.setField(n.id, key, value)
			if (!ok) { this.#h.toast(key === 'name' && n.id.startsWith('b:') ? 'That building name is empty or already used' : 'Nothing to save'); return }
			if (n.id.startsWith('b:') && key === 'name') s.treeNode = { ...n, id: `b:${value.trim()}`, label: value.trim() }
		} catch (e) { this.#h.toast(`Couldn't save: ${(e as Error)?.message ?? e}`) }
	}

	// ── models ──
	/** The model of a place: its stored one, else a new one created + stored now (callers check the store is
	 *  ready first). A floor place seeded from the old data also gets its floorplan (once); a zone its own plan. */
	ensurePlaceModel = (placeId: string): ModelId | undefined => {
		const ps = this.store, place = ps?.places.find((p) => p.id === placeId); if (!ps || !place || ps.status !== 'ready') return
		let m = modelForPlace(placeId)
		if (!m) {
			const kind = (MODEL_KINDS as string[]).includes(place.kind ?? '') ? (place.kind as ModelKind) : 'zone'
			const fresh: Model = { ...emptyFloor(newId('m'), place.name), placeId, kind }   // default layers (mock template until a project layer template exists)
			ps.saveModel(fresh)
			upsertModel(docToModel(fresh))
			this.#h.addModelToHistory(fresh)
			m = modelById(fresh.id)
		}
		if (!m) return
		const l = place.legacy
		if (l?.floor != null && l.area == null && l.room == null && l.row == null) this.#attachFloorplan(m.id, l.floor)
		else if (l?.area) { const od = outletsDocIdFor(ps.pid, l, normFloors(this.src?.project?.floors)); if (od) this.#attachFloorplanFromDoc(m.id, od) }   // a zone: ITS plan
		return m.id
	}
	/** A place's model tab (drawings-plan phase 3); waits for the store when it isn't loaded yet. */
	openPlaceModel = (placeId: string, preview: boolean) => {
		const ps = this.store, place = ps?.places.find((p) => p.id === placeId); if (!ps || !place) return
		if (ps.status !== 'ready') { this.#pendingPlaceOpen = { placeId, preview }; return }
		const mid = this.ensurePlaceModel(placeId); if (!mid) return
		const m = modelById(mid); if (!m) return
		this.#h.openDrawing({ title: `${place.name} · Model`, kind: 'model', preview, modelId: m.id, docId: `model:${m.id}` })
		this.#planIfUnset()
	}
	openModelById = (id: string) => {
		const m = modelById(id); if (!m) return
		this.drawingsOpen = false
		this.#h.openDrawing({ title: `${m.name} · Model`, kind: 'model', preview: false, modelId: m.id, docId: `model:${m.id}` })
	}
	/** A model tab opens in plan the first time (the ViewCube switches to 3D / elevations). */
	#planIfUnset() {
		const s = this.#h.session, p = s.panes[s.focused]
		if (p && !viewState.getProj(p.id, this.#h.didOf(p.activeId))) viewState.setProj(p.id, this.#h.didOf(p.activeId), 'plan')
	}
	/** A REAL floor of the OLD tree (no places yet): its own model (named "33F — <project>", so it never picks up
	 *  the demo 33F model) with the floor's calibrated floorplan, attached once. */
	realFloorModelId = (floor: string): ModelId => {
		const src = this.src!, id = ensureFloorModel(`${floor} — ${src.project?.name ?? src.pid}`)
		const n = parseInt(floor, 10)
		if (!isNaN(n)) this.#attachFloorplan(id, n)
		return id
	}
	/** Archive / restore a stored model: flag it in the registry (the save effect stores it); frames showing it
	 *  then show "Missing model" until it's restored. */
	setModelArchived = (id: string, archived: boolean) => {
		const m = modelById(id); if (!m) return
		if (archived) m.archived = true; else delete m.archived
		this.#h.toast(archived ? `Model ${m.name} archived` : `Model ${m.name} restored`)
	}
	/** The models the drawings dialog lists: the STORED ones, read from the editor registry (the source of truth). */
	storedModelInfo = $derived.by(() => {
		const ids = new Set(this.store?.models.map((m) => m.id) ?? [])
		return models.filter((m) => ids.has(m.id)).map((m) => ({ id: m.id, name: m.name, placeId: m.placeId, kind: m.kind, version: m.version, archived: m.archived }))
	})
	/** Import a place's outlets (block inserts) + trunks (conduits) from the Outlets tool into its model — one
	 *  undo step; importing again updates what was imported (drawings-plan §6). */
	importPlaceOutlets = async (placeId: string) => {
		const ps = this.store, place = ps?.places.find((p) => p.id === placeId), db = this.#h.db; if (!ps || !place || !db) return
		if (ps.status !== 'ready') { this.#h.toast('Still loading — try again in a moment'); return }
		const docId = outletsDocIdFor(ps.pid, place.legacy, normFloors(this.src?.project?.floors)); if (!docId) return
		const doc = (await db.getOne('outlets', docId)) as OutletsDoc | null
		if (!doc || (!doc.outlets?.length && !doc.trunks?.length)) { this.#h.toast(`Nothing to import from outlets/${docId}`); return }
		const mid = this.ensurePlaceModel(placeId); const m = mid ? modelById(mid) : undefined; if (!m) return
		this.#h.ensureHist()
		const r = importOutletsInto($state.snapshot(m) as Model, doc)
		m.shapes = r.model.shapes; m.objects = r.model.objects; m.layers = r.model.layers
		const s = this.#h.session
		this.#h.pushStep(s.panes[s.focused]?.activeId ?? '', 'Import from Outlets tool')
		this.openPlaceModel(placeId, false)
		this.#h.toast(`Imported into ${place.name}: ${r.added} new outlet${r.added === 1 ? '' : 's'}${r.updated ? `, ${r.updated} updated` : ''}, ${r.trunks} trunk${r.trunks === 1 ? '' : 's'}`)
	}

	// ── floorplans ──
	/** Give a model its floor's floorplan shape, once (no-op when it already has one). */
	#attachFloorplan(id: ModelId, n: number) {
		const src = this.src, m = modelById(id)
		if (!src || !m || floorplanShapeOf(m) || m.underlays?.length || this.#attaching.has(id)) return
		this.#attaching.add(id)
		src.floorplanOf(n).then((fp) => (fp ? this.#addFloorplanShape(id, fp.fileId, fp.pageNum) : undefined))
			.catch(() => { /* no floorplan — the model stays empty */ }).finally(() => this.#attaching.delete(id))
	}
	/** A zone model's floorplan: the file its own Outlets-tool doc shows. */
	#attachFloorplanFromDoc(id: ModelId, docId: string) {
		const m = modelById(id), db = this.#h.db; if (!db || !m || floorplanShapeOf(m) || this.#attaching.has(id)) return
		this.#attaching.add(id)
		db.getOne('outlets', docId).then((d) => { const od = d as OutletsDoc | null; return od?.selectedFileId ? this.#addFloorplanShape(id, od.selectedFileId, od.selectedPage ?? 1) : undefined })
			.catch(() => {}).finally(() => this.#attaching.delete(id))
	}
	async #addFloorplanShape(id: ModelId, fileId: string, page: number) {
		const place = await floorplanPlacement(fileId, page)
		const mm = modelById(id)
		if (!place || !mm || floorplanShapeOf(mm)) return
		// the floorplan goes on its OWN Background layer (first in the list = drawn underneath), so the Layers
		// panel shows / hides / locks / VP-freezes it like any other layer
		if (!mm.layers?.some((l) => l.id === FLOORPLAN_LAYER.id)) mm.layers = [{ ...FLOORPLAN_LAYER }, ...(mm.layers ?? [])]
		const shape: Ent = { id: newId('e'), type: 'image', a: place.a, b: place.b, src: pdfSrc(fileId, page), layer: FLOORPLAN_LAYER.id, opacity: 0.6, lockAspect: true }
		if (place.crop) shape.crop = place.crop
		mm.shapes = [shape, ...(mm.shapes ?? [])]
	}
	/** A stored model from before floorplans were shapes: turn its plan underlays into floorplan shapes (once). */
	#convertUnderlays(id: ModelId) {
		const m = modelById(id), us = (m?.underlays ?? []).filter((u) => u.dir === 'plan' && u.fileId)
		if (!m || !us.length || this.#attaching.has(id)) return
		this.#attaching.add(id)
		Promise.all(us.map((u) => this.#addFloorplanShape(id, u.fileId, u.pageNum ?? 1))).then(() => {
			const mm = modelById(id); if (!mm) return
			mm.underlays = []
			const l = mm.layers?.find((x) => x.id === FLOORPLAN_LAYER.id); if (l) l.locked = true
		}).catch(() => {}).finally(() => this.#attaching.delete(id))
	}

	// ── sheets (drawings-plan phase 4): a stored sheet opens as drawing id `sheet:<id>`; its paper / scale /
	// frames load into the PageDoc store once, and every change there is folded back into the stored doc ──
	storedSheetOfTab = (tabId: string): PagesSheetDoc | null => {
		const id = sheetIdOf(this.#h.didOf(tabId)); return id ? this.store?.sheets.find((x) => x.id === id) ?? null : null
	}
	loadSheet = (id: string) => {
		const sh = this.store?.sheets.find((x) => x.id === id), did = SHEET + id
		if (!sh || docs.has(did)) return
		docs.seed(did, sheetToPage(sh))
		this.#h.addDocToHistory(did)
	}
	/** The model a NEW frame on this tab's sheet shows: the sheet's place model (created if needed). */
	newFrameModel = (tabId: string): ModelId | undefined => { const sh = this.storedSheetOfTab(tabId); return sh?.placeId ? this.ensurePlaceModel(sh.placeId) : undefined }
	onSheetAdd = (placeId: string): string | undefined => {
		const ps = this.store; if (!ps || ps.status !== 'ready') return
		const sh = ps.createSheet({ title: 'New sheet', placeId })
		this.loadSheet(sh.id)
		this.#h.session.treeNode = null   // Properties → the new sheet's PAGE (title, number, title block)
		this.#h.openDrawing({ title: sh.title, kind: 'sheet', preview: false, docId: SHEET + sh.id })
		return `s:${sh.id}`
	}
	openSheetById = (id: string) => {
		const sh = this.store?.sheets.find((x) => x.id === id); if (!sh) return
		this.loadSheet(id); this.#h.session.treeNode = null; this.drawingsOpen = false
		this.#h.openDrawing({ title: sh.title, kind: 'sheet', preview: false, docId: SHEET + id })
	}
	renameSheet = (id: string, title: string) => {
		const ps = this.store, sh = ps?.sheets.find((x) => x.id === id); if (!ps || !sh || !title.trim()) return
		ps.saveSheet({ ...sh, title: title.trim() })
		this.#retitleTabs(id, title.trim())
	}
	updateSheets = (patches: { id: string; patch: Partial<PagesSheetDoc> }[]) => {
		const ps = this.store; if (!ps) return
		for (const { id, patch } of patches) {
			const sh = ps.sheets.find((x) => x.id === id); if (!sh) continue
			ps.saveSheet({ ...sh, ...patch })
			if (patch.title) this.#retitleTabs(id, patch.title)
		}
	}
	archiveSheet = (id: string) => {
		if (!this.store) return
		this.#archive(id)
		this.#h.toast('Sheet archived — it will be in the drawing manager\'s archived list')
	}
	archiveSheets = (ids: string[]) => {
		if (!this.store) return
		ids.forEach((id) => this.#archive(id))
		this.#h.toast(`${ids.length} sheet${ids.length === 1 ? '' : 's'} archived`)
	}
	restoreSheets = (ids: string[]) => { for (const id of ids) this.store?.setSheetStatus(id, 'active') }
	deleteSheet = (id: string) => { void this.store?.hardDeleteSheet(id).then((ok) => { if (ok) this.#h.toast('Sheet deleted') }) }
	#archive(id: string) {
		this.store!.setSheetStatus(id, 'archived')
		for (const t of [...this.#h.session.tabs]) if (t.docId === SHEET + id) this.#h.closeTab(t.id)
	}
	#retitleTabs(id: string, title: string) { for (const t of this.#h.session.tabs) if (t.docId === SHEET + id) t.title = title }
	/** A sheet dropped on the tree: onto a place = into it (last); before / after another sheet = beside it. */
	#moveSheetRow(sheetId: string, targetId: string, zone: DropZone) {
		const ps = this.store; if (!ps) return
		if (targetId.startsWith('s:')) {
			const target = ps.sheets.find((x) => x.id === targetId.slice(2)); if (!target) return
			const order = ps.sheetsIn(target.placeId).filter((x) => x.id !== sheetId)
			const i = order.findIndex((x) => x.id === target.id)
			ps.moveSheet(sheetId, target.placeId, zone === 'before' ? i : i + 1)
		} else if (ps.places.some((p) => p.id === targetId)) ps.moveSheet(sheetId, targetId, ps.sheetsIn(targetId).length)
	}

	// ── phase 5: the TITLE BLOCK — the project's one template (pages.titleBlock), filled per sheet from the
	// project + the sheet's registry entry (a tab that isn't a stored sheet fills what it can) ──
	#drawnDefault = (sh: PagesSheetDoc) => {
		const u = this.#h.auth?.user
		return initialsOf(sh.createdBy && sh.createdBy === u?.email ? u?.displayName || sh.createdBy : sh.createdBy)
	}
	titleBlockOf = (tabId: string): { logo?: string; cells: TbCell[] } => {
		const ps = this.store, sh = this.storedSheetOfTab(tabId), tpl = ps?.project?.titleBlock, pap = this.#h.paperOf(tabId)
		const pl = sh?.placeId && ps ? ps.places.find((p) => p.id === sh.placeId) : undefined
		const mock = this.#h.revInfo()
		return {
			logo: tpl ? tpl.logo : DEFAULT_TITLE_BLOCK.logo,
			cells: fillTitleBlock(tpl, {
				project: this.src?.project?.name ?? '',
				title: sh?.title ?? this.#h.session.tabs.find((t) => t.id === tabId)?.title ?? '',
				place: pl && ps ? [...ancestorsOf(ps.places, pl.id), pl].map((p) => p.name).join(' › ') : '',
				number: sh?.drawingNumber ?? '',
				rev: sh ? sh.latestRevisionCode ?? '' : mock.rev,
				date: mock.date,
				scale: this.#h.framesOf(tabId)[0]?.scale ?? this.#h.scaleOf(tabId),
				size: `${pap.size} ${pap.landscape ? 'L' : 'P'}`,
				drawn: sh ? sh.drawnBy || this.#drawnDefault(sh) : '',
			}),
		}
	}
	/** The active tab's stored sheet: set its Drawing № / Drawn (Properties › PAGE). */
	setSheetField = (key: 'drawingNumber' | 'drawnBy', value: string) => {
		const id = this.#h.activeTabId(), sh = id ? this.storedSheetOfTab(id) : null; if (!sh || !this.store || sh[key] === value) return
		this.store.saveSheet({ ...sh, [key]: value })
	}
	activeSheetInfo = $derived.by(() => {
		const id = this.#h.activeTabId(), sh = id ? this.storedSheetOfTab(id) : null
		return sh ? { number: sh.drawingNumber ?? '', drawnBy: sh.drawnBy ?? '', drawnDefault: this.#drawnDefault(sh) } : null
	})
}
