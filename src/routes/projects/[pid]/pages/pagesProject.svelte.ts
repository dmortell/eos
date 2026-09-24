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
import { floorplanPlacement, pdfSrc, PDF_SRC, parsePdfSrc, renderPdfPage, placementFromCalib, type PageCalib } from './ui/render/pdfRaster.svelte'
import { liveFileIds, followCalib } from './ui/floorplanLink'
import { startBlocks } from './blocks.svelte'
import { importOutletsInto, outletsDocIdFor, type OutletsDoc } from './store/outletsImport'
import { normFloors, findNodePath } from './projectTree'
import { ProjectSource } from './projectData.svelte'
import { PagesStore, type SheetRevisionDoc } from './store/pagesStore.svelte'
import { issueProblems, sheetModels, type ModelVersionDoc } from './store/versions'
import { storeyLevels, floorLabel, stackFloors, restack, storeyHeights, setStoreyHeights, type FloorHeights } from './store/risersImport'
import { parseFloor } from './store/placeProps'
import type { Storey } from './3dview/types'
import { LINK_TOOLS, sheetLinkUrl, type PagesSheetDoc, type SheetLink } from './store/schema'
import { buildPlaceTree } from './store/placeTree'
import { addPlace, updatePlace, movePlace, removePlace, ancestorsOf } from './store/places'
import { describePlace } from './store/placeProps'
import { fillTitleBlock, initialsOf, shownTitleBlock, type TbShown } from './titleBlock'
import type { DropZone } from './parts/treeDrag.svelte'
import { ProjectImports } from './projectImports.svelte'
import { isOutletEnt, outletRef, allocatedOutlets as allocatedIn, type OutletRef } from './store/allocate'

type TreeNodeSel = { id: string; label: string; kind: string; floorNumber?: number; building?: string }
/** A Sheets-tool sheet as the drawings dialog's Import tab lists it. */
export type LegacySheetRow = { id: string; title: string; number: string; viewports: string[]; importedAs?: string; placeId: string | null }
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
	activeTabId: () => string | undefined
	// history (undo) hooks
	ensureHist: () => void
	pushStep: (tabId: string, label: string) => void
	addModelToHistory: (m: Model) => void
	/** An out-of-band model change (attached floorplan, live calibration) applied to every undo step too. */
	amendModelHistory: (id: string, fn: (m: Model) => Model) => void
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
const fmtDate = (iso?: string) => (iso ? new Date(iso) : new Date()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

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
	/** Phase 8 imports (Sheets sheets, register drawings, risers). */
	readonly imports: ProjectImports

	constructor(host: ProjectHost) {
		this.#h = host
		this.imports = new ProjectImports(this, host)
		// the GLOBAL block library (blocks/{id}): subscribed once per session; missing default blocks are seeded
		$effect(() => { const db = this.#h.db; if (db) untrack(() => startBlocks(db)) })
		// I6: live floorplans follow their file's Uploads calibration — one subscription per followed file. Only
		// shapes flagged `live` are touched, and only when the calibration actually moved them (idempotent).
		$effect(() => {
			const key = this.#liveFiles, db = this.#h.db
			if (!db || !key) return
			const stops = key.split('|').map((fid) => db.subscribeOne('files', fid, (d) => untrack(() => void this.#syncCalib(fid, d as { pages?: Record<string, PageCalib> }))))
			return () => stops.forEach((s) => s())
		})
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
		// History (phase 7): the active model's versions and the active sheet's revisions, live
		$effect(() => {
			const ps = this.store, mid = this.historyModel?.id
			untrack(() => (this.modelVersions = []))
			if (ps && mid) return ps.subscribeModelVersions(mid, (v) => (this.modelVersions = v))
		})
		$effect(() => {
			const ps = this.store, sid = this.historySheet?.id
			untrack(() => (this.sheetRevisions = []))
			if (ps && sid) return ps.subscribeRevisions(sid, (r) => (this.sheetRevisions = r))
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
		if (this.#isPlaceNode) return describePlace(this.store!.places, n.id, this.realTree ? findNodePath(this.realTree.tree, { id: n.id })?.node : undefined, this.projectStack())
		return this.src?.status === 'ready' ? this.src.describe(n.id) : null
	})
	setNodeField = async (key: string, value: string) => {
		const s = this.#h.session, n = s.treeNode, src = this.src; if (!n || !src) return
		if (this.#isPlaceNode && this.store && key.startsWith('floors')) { this.#setFloorStack(n.id, key, value); return }
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

	// ── a BUILDING's floor stack (place `floors`) → its building model's storeys ──
	/** The project's building extent (the Risers tool's From/To + nonexistent floors) — a building place's default.
	 *  Without the project's own list, GF (0) is nonexistent by default (B1F → 1F, the usual case here). */
	projectStack = (): { bottom: number; top: number; skipped?: number[] } | null => {
		const p = this.src?.project as { buildingFloors?: { bottom: number; top: number }; skippedFloors?: number[]; floors?: unknown } | null
		const skipped = p?.skippedFloors ?? [0]
		if (p?.buildingFloors) return { ...p.buildingFloors, skipped }
		const ns = normFloors(this.src?.project?.floors).map((f) => f.number)
		if (!ns.length) return null
		return { bottom: Math.min(...ns), top: Math.max(...ns), skipped }
	}
	/** The stack a building place uses: its own, else the project's. */
	stackOf = (placeId: string) => this.store?.places.find((p) => p.id === placeId)?.floors ?? this.projectStack()
	#setFloorStack(placeId: string, key: string, value: string) {
		const ps = this.store!, cur = this.stackOf(placeId)
		const next = { bottom: cur?.bottom ?? 1, top: cur?.top ?? 1, skipped: [...(cur?.skipped ?? [])] }
		if (key === 'floorsSkipped') {
			const parts = value.split(/[,\s]+/).filter(Boolean), nums = parts.map(parseFloor)
			if (nums.some((x) => x == null)) { this.#h.toast(`Couldn't read "${value}" — use floors like 4F, 13F, B1F`); return }
			next.skipped = [...new Set(nums as number[])].sort((a, b) => a - b)
		} else {
			const n = parseFloor(value); if (n == null) { this.#h.toast(`Couldn't read "${value}" as a floor — e.g. 33F or B2F`); return }
			if (key === 'floorsBottom') next.bottom = n; else next.top = n
		}
		if (next.bottom > next.top) [next.bottom, next.top] = [next.top, next.bottom]
		ps.savePlaces(updatePlace(ps.places, placeId, { floors: next }))
		this.#syncStoreys(placeId, stackFloors(next))
	}
	/** Re-stack the building model's storeys (created if needed) for `floors`, and point the floor models inside
	 *  the building at their storeys. One undo step. */
	#syncStoreys(placeId: string, floors: number[]) {
		const mid = this.ensurePlaceModel(placeId), m = mid ? modelById(mid) : undefined; if (!m) return
		this.#rebuildStoreys(placeId, m, restack(floors, $state.snapshot(m.storeys ?? []) as Storey[]), `Floors of ${m.name}`)
	}
	/** Give building `m` these storeys (one undo step): its imported riser geometry is re-applied ON them (so it
	 *  follows the heights; Pages-renamed labels kept) and its floor models re-linked. */
	#rebuildStoreys(placeId: string, m: Model, storeys: Storey[], label: string) {
		this.#h.ensureHist()
		m.kind = 'building'; m.storeys = storeys
		for (const d of this.imports.risersOf(m)) this.imports.applyRisers(d, m, placeId, true, storeys)
		this.linkFloorModels(m)
		this.#h.pushStep(this.#h.activeTabId() ?? '', label)
	}
	/** The selected BUILDING place's storeys with their heights, top floor first (Properties › HEIGHTS). */
	buildingHeights = $derived.by(() => {
		const n = this.#h.session.treeNode, p = n ? this.store?.places.find((x) => x.id === n.id) : undefined
		if (!p || p.kind !== 'building') return null
		const m = modelForPlace(p.id)
		return { placeId: p.id, rows: [...(m?.storeys ?? [])].sort((a, b) => b.z - a.z).map((s) => ({ id: s.id, name: s.name, z: s.z, ...storeyHeights(s) })) }
	})
	/** One height set for EVERY floor of a building (the heights dialog's "All floors"), one undo step. */
	setAllStoreyHeights = (placeId: string, key: keyof FloorHeights, value: number) => {
		const m = modelForPlace(placeId); if (!m?.storeys?.length || !(value >= 0)) return
		this.#rebuildStoreys(placeId, m, setStoreyHeights($state.snapshot(m.storeys) as Storey[], '*', { [key]: value }), `${m.name}: all floors' heights`)
	}
	/** One floor's height edited in the HEIGHTS table: the floors above re-stack, riser geometry follows. */
	setStoreyHeight = (placeId: string, storeyId: string, key: keyof FloorHeights, value: number) => {
		const m = modelForPlace(placeId); if (!m?.storeys || !(value >= 0)) return
		const cur = m.storeys.find((s) => s.id === storeyId); if (!cur || storeyHeights(cur)[key] === value) return
		this.#rebuildStoreys(placeId, m, setStoreyHeights($state.snapshot(m.storeys) as Storey[], storeyId, { [key]: value }), `${cur.name} heights`)
	}
	/** Every floor place inside the building model's place → levelRef + a cached copy of its storey's levels. */
	linkFloorModels(b: Model): number {
		const ps = this.store; if (!ps || !b.placeId) return 0
		let n = 0
		for (const fp of ps.places) {
			const l = fp.legacy
			if (l?.floor == null || l.area != null || l.room != null || l.row != null || !ancestorsOf(ps.places, fp.id).some((a) => a.id === b.placeId)) continue
			const fm = modelForPlace(fp.id), s = b.storeys?.find((x) => x.name === floorLabel(l.floor!)); if (!fm || !s) continue
			fm.levelRef = { modelId: b.id, storeyId: s.id }; fm.levels = storeyLevels(s); n++
		}
		return n
	}

	// ── models ──
	/** The model of a place: its stored one, else a new one created + stored now (callers check the store is
	 *  ready first). A floor place seeded from the old data also gets its floorplan (once); a zone its own plan. */
	ensurePlaceModel = (placeId: string): ModelId | undefined => {
		const ps = this.store, place = ps?.places.find((p) => p.id === placeId); if (!ps || !place || ps.status !== 'ready') return
		let m = modelForPlace(placeId)
		if (!m) {
			// a rack ROW is a rack-row model (G4: its front / rear elevations are the rack elevations)
			const kind: ModelKind = place.legacy?.row != null ? 'rack' : (MODEL_KINDS as string[]).includes(place.kind ?? '') ? (place.kind as ModelKind) : 'zone'
			const fresh: Model = { ...emptyFloor(newId('m'), place.name), placeId, kind }   // default layers (mock template until a project layer template exists)
			// a rack row gets its racks + devices from the Racks tool, once — BEFORE it is stored and put into the undo
			// history, so no step holds it empty (an undo would wipe the racks and save that)
			if (kind === 'rack') this.imports.seedRackRow(fresh, place)
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
	/** A riser leaf (`riser:<id>`): once imported, it opens the BUILDING model in front elevation (true); not
	 *  imported yet → a hint, and nothing opens (true — never the old mock riser tab). false = not a riser. */
	openRiser = (docId: string | undefined, preview: boolean): boolean => {
		if (!docId?.startsWith('riser:') || !this.hasPlaces) return false
		const b = this.imports.modelForRisers(docId.slice('riser:'.length))
		if (!b) { this.#h.toast('Not imported yet — open this row\'s action menu (⋮) and choose “Import into the building model”'); return true }
		this.#h.openDrawing({ title: `${b.name} · Model`, kind: 'model', preview, modelId: b.id, docId: `model:${b.id}` })
		const s = this.#h.session, p = s.panes[s.focused]
		if (p) viewState.setProj(p.id, this.#h.didOf(p.activeId), 'front')
		return true
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
	/** E8: the outlets a rack row's panels can serve — the outlet shapes of the STORED models on the same floor as the
	 *  row (floor + zone places), or of every stored model when the row has no floor. */
	outletsForRack = (rackModelId: string): (OutletRef & { modelName: string })[] => {
		const ps = this.store; if (!ps) return []
		const floorOf = new Map(ps.places.map((p) => [p.id, p.legacy?.floor])), stored = new Set(ps.models.map((m) => m.id))
		const floor = floorOf.get(modelById(rackModelId)?.placeId ?? '')
		return models.filter((m) => stored.has(m.id) && !m.archived && m.kind !== 'rack' && (floor == null || floorOf.get(m.placeId ?? '') === floor))
			.flatMap((m) => (m.shapes ?? []).filter(isOutletEnt).map((e) => ({ ...outletRef(e, m.id), modelName: m.name })))
	}
	/** E9: every allocated outlet → where it's allocated ("R01 · PP-01 : 3-4"), across the stored rack rows. */
	allocatedOutlets = $derived.by(() => { const ids = new Set(this.store?.models.map((m) => m.id) ?? []); return allocatedIn(models.filter((m) => ids.has(m.id) && m.kind === 'rack')) })
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
	#liveFiles = $derived(liveFileIds(models).join('|'))
	/** The last `files/{id}` doc seen per followed file — a shape switched to live snaps at once (no new callback). */
	#calibDocs = new Map<string, { pages?: Record<string, PageCalib> } | null>()
	async #syncCalib(fileId: string, d: { pages?: Record<string, PageCalib> } | null) {
		this.#calibDocs.set(fileId, d)
		const targets = models.flatMap((m) => (m.shapes ?? []).flatMap((e) => { const ps = e.live && e.src ? parsePdfSrc(e.src) : null; return ps?.fileId === fileId ? [{ mid: m.id, id: e.id, page: ps.page }] : [] }))
		for (const t of targets) {
			const r = await renderPdfPage(fileId, t.page).catch(() => null); if (!r) continue
			const pl = placementFromCalib(d?.pages?.[t.page], r.w, r.h)
			// re-read AFTER the render: an edit meanwhile (a move that unlinked it) wins
			const m = modelById(t.mid), cur = m?.shapes?.find((x) => x.id === t.id); if (!m || !cur?.live) continue
			const next = followCalib(cur, pl); if (!next) continue
			m.shapes = (m.shapes ?? []).map((x) => (x.id === t.id ? next : x))
			// …and in every undo step where it is still live, so an undo never puts back the old placement
			this.#h.amendModelHistory(t.mid, (sm) => { const s = sm.shapes?.find((x) => x.id === t.id); const n = s?.live ? followCalib(s, pl) : null; return n ? { ...sm, shapes: sm.shapes!.map((x) => (x.id === t.id ? n : x)) } : sm })
		}
	}
	/** A floorplan just switched to live (Properties): snap it to the calibration already seen. */
	resyncCalib = (src?: string) => {
		const ps = src ? parsePdfSrc(src) : null; if (!ps || !this.#calibDocs.has(ps.fileId)) return
		void this.#syncCalib(ps.fileId, this.#calibDocs.get(ps.fileId) ?? null)
	}
	async #addFloorplanShape(id: ModelId, fileId: string, page: number) {
		const place = await floorplanPlacement(fileId, page)
		const mm = modelById(id)
		if (!place || !mm || floorplanShapeOf(mm)) return
		// the floorplan goes on its OWN Background layer (first in the list = drawn underneath), so the Layers
		// panel shows / hides / locks / VP-freezes it like any other layer
		const shape: Ent = { id: newId('e'), type: 'image', a: place.a, b: place.b, src: pdfSrc(fileId, page), layer: FLOORPLAN_LAYER.id, opacity: 0.6, lockAspect: true, live: true }
		if (place.crop) shape.crop = place.crop
		const attach = (m: Model): Model => (floorplanShapeOf(m) ? m : {
			...m, shapes: [shape, ...(m.shapes ?? [])],
			layers: m.layers?.some((l) => l.id === FLOORPLAN_LAYER.id) ? m.layers : [{ ...FLOORPLAN_LAYER }, ...(m.layers ?? [])],
		})
		const next = attach(mm); mm.layers = next.layers; mm.shapes = next.shapes
		this.#h.amendModelHistory(id, attach)   // attached asynchronously: every undo step gets it too, so undo can't drop it
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
		// a frame's STORED view (e.g. an import's centring) seeds each pane's view of it, unless one is remembered
		for (const f of sh.frames) if (f.view) for (const p of this.#h.session.panes)
			if (!viewState.hasView(p.id, f.id, f.direction)) viewState.setView(p.id, f.id, f.direction, f.view)
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
	/** B1: a copy of a sheet, right after it — its paper, frames (new ids) and the shapes scoped to its frames
	 *  (copied onto the new frames, one undo step); "(copy)" title, no number, never issued. Opens it. */
	duplicateSheet = (id: string) => {
		const ps = this.store, cur = ps?.sheets.find((x) => x.id === id); if (!ps || !cur || ps.status !== 'ready') return
		const src = $state.snapshot(cur) as PagesSheetDoc
		const fid = new Map(src.frames.map((f) => [f.id, newId('vf')]))
		const d = ps.createSheet({ title: `${src.title} (copy)`, placeId: src.placeId })
		ps.saveSheet({ ...d, paper: src.paper, sheetSize: src.sheetSize, scale: src.scale, kind: src.kind, discipline: src.discipline, tags: [...(src.tags ?? [])], hideTitleBlock: src.hideTitleBlock,
			frames: src.frames.map((f) => ({ ...f, id: fid.get(f.id)! })) })
		// view-scoped shapes (`space: 'view:<frame>'`) follow their frame onto the copy
		let copied = 0
		for (const m of models) {
			const extra = (m.shapes ?? []).filter((e) => e.space?.startsWith('view:') && fid.has(e.space.slice(5)))
			if (!extra.length) continue
			if (!copied) this.#h.ensureHist()
			const gids = new Map<string, string>()
			m.shapes = [...(m.shapes ?? []), ...extra.map((e) => ({ ...($state.snapshot(e) as Ent), id: newId(), space: `view:${fid.get(e.space!.slice(5))}`,
				groupId: e.groupId ? (gids.get(e.groupId) ?? (gids.set(e.groupId, newId()), gids.get(e.groupId))) : undefined }))]
			copied += extra.length
		}
		if (copied) this.#h.pushStep(this.#h.activeTabId() ?? '', `Duplicate “${src.title}”`)
		const order = ps.sheetsIn(src.placeId).filter((x) => x.id !== d.id)
		ps.moveSheet(d.id, src.placeId, order.findIndex((x) => x.id === src.id) + 1)
		this.openSheetById(d.id)
		this.#h.toast(`Duplicated “${src.title}”${copied ? ` with ${copied} annotation${copied === 1 ? '' : 's'}` : ''}`)
	}
	/** B5: a link sheet under `placeId` → another tool at the place's floor / room. */
	addLinkSheet = (placeId: string, tool: SheetLink['tool']) => {
		const ps = this.store, pl = ps?.places.find((p) => p.id === placeId); if (!ps || !pl || ps.status !== 'ready') return
		const link: SheetLink = { tool, ...(pl.legacy?.floor != null ? { floor: pl.legacy.floor } : {}), ...(pl.legacy?.room ? { room: pl.legacy.room } : {}) }
		const d = ps.createSheet({ title: `${LINK_TOOLS[tool]} · ${pl.name}`, placeId })
		ps.saveSheet({ ...d, link, frames: [] })
		this.#h.toast(`Link sheet “${d.title}” — opens ${LINK_TOOLS[tool]}${link.floor != null ? ` at floor ${link.floor}` : ''}`)
	}
	/** B5: a link sheet's drawing id → open its tool in a new browser tab (true); anything else → false. */
	openLinkSheet = (docId?: string): boolean => {
		const sid = sheetIdOf(docId), sh = sid ? this.store?.sheets.find((x) => x.id === sid) : null
		if (!sh?.link || !this.store) return false
		window.open(sheetLinkUrl(this.store.pid, sh.link), '_blank', 'noopener')
		return true
	}
	openSheetById = (id: string) => {
		if (this.openLinkSheet(SHEET + id)) return
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
	/** The tab's title block as shown (`hidden` when its sheet hides it — Properties › PAGE › Title block). */
	titleBlockOf = (tabId: string): TbShown => {
		const ps = this.store, sh = this.storedSheetOfTab(tabId), tpl = ps?.project?.titleBlock, pap = this.#h.paperOf(tabId)
		if (sh?.hideTitleBlock) return { cells: [], border: !!tpl?.border, hidden: true }
		const pl = sh?.placeId && ps ? ps.places.find((p) => p.id === sh.placeId) : undefined
		return shownTitleBlock(tpl, fillTitleBlock(tpl, {
				project: this.src?.project?.name ?? '',
				title: sh?.title ?? this.#h.session.tabs.find((t) => t.id === tabId)?.title ?? '',
				place: pl && ps ? [...ancestorsOf(ps.places, pl.id), pl].map((p) => p.name).join(' › ') : '',
				number: sh?.drawingNumber ?? '',
				rev: sh?.latestRevisionCode ?? '',
				date: fmtDate(sh?.latestIssuedAt),   // the latest revision's issue date, else today
				scale: this.#h.framesOf(tabId)[0]?.scale ?? this.#h.scaleOf(tabId),
				size: `${pap.size} ${pap.landscape ? 'L' : 'P'}`,
				drawn: sh ? sh.drawnBy || this.#drawnDefault(sh) : '',
			}), (sh?.revLog?.length ? sh.revLog : sh?.latestRevisionCode ? [{ code: sh.latestRevisionCode, date: sh.latestIssuedAt ?? '' }] : [])
				.map((r) => ({ ...r, date: r.date ? fmtDate(r.date) : '' })))
	}
	/** The active tab's stored sheet: set its Drawing № / Drawn / title-block hide (Properties › PAGE). */
	setSheetField = <K extends 'drawingNumber' | 'drawnBy' | 'hideTitleBlock'>(key: K, value: PagesSheetDoc[K]) => {
		const id = this.#h.activeTabId(), sh = id ? this.storedSheetOfTab(id) : null; if (!sh || !this.store || sh[key] === value) return
		this.store.saveSheet({ ...sh, [key]: value })
	}
	activeSheetInfo = $derived.by(() => {
		const id = this.#h.activeTabId(), sh = id ? this.storedSheetOfTab(id) : null
		return sh ? { number: sh.drawingNumber ?? '', drawnBy: sh.drawnBy ?? '', drawnDefault: this.#drawnDefault(sh), hideTitleBlock: !!sh.hideTitleBlock } : null
	})

	// ── phase 7: HISTORY — model versions + sheet revisions for the ACTIVE tab (store/versions.ts) ──
	/** The stored model the active tab edits (a model tab), else null. */
	historyModel = $derived.by(() => {
		const tab = this.#h.session.tabs.find((t) => t.id === this.#h.activeTabId())
		if (tab?.kind !== 'model' || !tab.modelId || !this.store?.models.some((m) => m.id === tab.modelId)) return null
		return modelById(tab.modelId) ?? null
	})
	/** The stored sheet the active tab shows, else null. */
	historySheet = $derived.by(() => { const id = this.#h.activeTabId(); return id ? this.storedSheetOfTab(id) : null })
	/** Live lists for the History panel (re-subscribed by the constructor's effects when the active model / sheet
	 *  changes). */
	modelVersions = $state.raw<ModelVersionDoc[]>([])
	sheetRevisions = $state.raw<SheetRevisionDoc[]>([])
	/** Save the next version of a model (1.0 first; a major keeps a full copy), or `overwrite` its current one;
	 *  the version stamp goes on the registry model (undo keeps it — models.svelte.ts keepMeta). */
	saveModelVersion = async (mid: string, a: { major: boolean; note: string; overwrite?: boolean }) => {
		const m = modelById(mid), ps = this.store; if (!m || !ps) return
		try {
			const r = await ps.saveModelVersion($state.snapshot(m) as Model, a)
			const mm = modelById(mid); if (mm) { mm.version = r.version; mm.versionHash = r.hash }
			this.#h.toast(a.overwrite ? `${m.name}: version ${r.version} overwritten` : `${m.name}: saved version ${r.version}`)
		} catch (e) { this.#h.toast(`Couldn't save the version: ${(e as Error)?.message ?? e}`) }
	}
	/** Put a stored MAJOR version's content back into the model — one undo step; the model then counts as edited
	 *  unless it matches its current version. */
	restoreModelVersion = async (mid: string, version: string) => {
		const ps = this.store; if (!ps) return
		const copy = await ps.modelVersionCopy(mid, version), m = modelById(mid)
		if (!copy || !m) { this.#h.toast(`Version ${version} has no stored copy`); return }
		this.#h.ensureHist()
		for (const k of RESTORED_KEYS) { const v = (copy as Record<string, unknown>)[k]; if (v === undefined) delete (m as Record<string, unknown>)[k]; else (m as Record<string, unknown>)[k] = v }
		this.#h.pushStep(this.#h.activeTabId() ?? '', `Restore version ${version}`)
		this.#h.toast(`${m.name}: restored version ${version}`)
	}
	/** Why the active sheet can't be issued (every model it shows must be at an unedited major version). */
	issueProblems = $derived.by(() => (this.historySheet ? issueProblems(this.historySheet, models) : []))
	/** Issue the active sheet: the next revision, or `overwrite` the latest. */
	/** B6: edit / delete / make-current a revision of the History sheet. */
	editRevision = (code: string, patch: { description?: string; issuedAt?: string }) => { const ps = this.store, sh = this.historySheet; if (ps && sh) void ps.updateRevision(sh.id, code, patch) }
	deleteRevision = (code: string) => { const ps = this.store, sh = this.historySheet; if (ps && sh) void ps.deleteRevision(sh.id, code).then(() => this.#h.toast(`Revision ${code} deleted`)) }
	setCurrentRevision = (code: string, issuedAt: string) => { const ps = this.store, sh = this.historySheet; if (ps && sh) ps.setCurrentRevision(sh.id, code, issuedAt) }
	issueSheet = async (a: { note: string; overwrite: boolean; code?: string }) => {
		const ps = this.store, sh = this.historySheet; if (!ps || !sh) return
		if (this.issueProblems.length) { this.#h.toast('Save a major version of each model first'); return }
		try {
			const code = await ps.issueSheet(sh.id, { ...a, models: sheetModels(sh, models) })
			if (code) this.#h.toast(a.overwrite ? `${sh.title}: revision ${code} overwritten` : `${sh.title}: issued revision ${code}`)
		} catch (e) { this.#h.toast(`Couldn't issue: ${(e as Error)?.message ?? e}`) }
	}
	/** Open a model's tab with History showing (from a sheet's issue check). */
	openModelHistory = (mid: string) => { this.openModelById(mid) }

	// ── phase 8: IMPORTS — Sheets sheets, register drawings and risers (projectImports.svelte.ts) ──
	legacySheets = (): Promise<LegacySheetRow[]> => this.imports.legacySheets()
	importLegacySheet = (legacyId: string, placeId: string | null) => this.imports.importLegacySheet(legacyId, placeId)
	importRegisterDrawing = (leafId: string) => this.imports.importRegisterDrawing(leafId)
	importRisers = (riserId: string) => this.imports.importRisers(riserId)

	/** Drawings dialog: a DRAFT package of the selected sheets at their latest revisions (sheets never issued
	 *  are left out). Returns a message for the dialog. */
	saveAsPackage = async (ids: string[], name: string): Promise<string> => {
		const db = this.#h.db, ps = this.store, uid = this.#h.auth?.user?.uid; if (!db || !ps || !uid) return 'Not signed in'
		const picked = ids.map((id) => ps.sheets.find((s) => s.id === id)).filter((s): s is PagesSheetDoc => !!s)
		const issued = picked.filter((s) => s.latestRevisionCode)
		if (!issued.length) return 'None of the selected sheets has been issued yet'
		const { createPackage, updatePackageItems } = await import('$lib/versioning/service')
		const { packageId } = await createPackage(db, { projectId: ps.pid, name: name.trim() || 'Package', type: 'custom', uid })
		await updatePackageItems(db, ps.pid, packageId, issued.map((s, i) => ({ drawingId: s.id, revisionId: `r${s.latestRevisionCode}`, sheetOrder: i, include: true })))
		const skipped = picked.length - issued.length
		return `Package "${name.trim() || 'Package'}" created with ${issued.length} sheet${issued.length === 1 ? '' : 's'}${skipped ? ` (${skipped} not issued yet, left out)` : ''}`
	}
}
/** What a version restore puts back: the model's content (its id, name, place and stamps stay). */
const RESTORED_KEYS = ['objects', 'shapes', 'guides', 'sections', 'layers', 'underlays', 'levels', 'storeys', 'levelRef'] as const
