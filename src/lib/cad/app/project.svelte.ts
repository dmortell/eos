// One open project: the entity store, its Firestore sync, and reactive reads for the UI. Created by the route per
// project and destroyed with it (no module-level state — the Pages singletons leaked across projects).
import { DEFAULT_SHEET_CATEGORIES, type SheetCategory } from '../domain/sheetCategories'
import type { Firestore } from 'firebase/firestore'
import { EntityStore, settles, type UndoResult } from '../store/store'
import { Sync } from '../persist/sync'
import { FirestoreBackend } from '../persist/firestore'
import { PROJECT_SCOPE, levelScope, viewScope, sheetScope } from '../persist/docs'
import { untrack } from 'svelte'
import { ProjectIndex } from '../domain/project'
import { racksTouched, relengthCords } from '../domain/cords'
import { cableSettings } from '../domain/routing'
import { routeAll, type Routing } from '../domain/estimates'
import { fillBySegment } from '../domain/fill'
import { importLegacy, type ImportResult } from '../persist/import/legacy'
import { loadLegacy } from '../persist/import/load'
import { PdfCache } from './pdf.svelte'
import { RestoreNotices } from './restoreNotice.svelte'
import type { Id, Level, Link } from '../domain/types'
import { settingsOf } from '../domain/settings'
import type { Shape } from '../domain/shapes'
import { doc, getDoc, onSnapshot, setDoc, updateDoc, deleteField, FieldPath } from 'firebase/firestore'
import { BUILTIN_BLOCKS, blockFromShapes, blockProblem, paperBlockScale, elevationBlock, elevationProblem, explodeInsert, oneDrawing, is3d, type Block } from '../domain/blocks'
import { ensureLayer } from '../domain/layers'
import { newId } from '../domain/ids'
import type { ElevFrame } from '../domain/conventions'
import { spaceOf, type ViewSpec } from '../views/space'
import { sectionSpace } from '../views/section'
import { PLOT_SCALE } from '../views/display'
import { stripUndefined } from '../persist/docs'
import { BUILTIN_DEVICE_TEMPLATES, type DeviceTemplate } from '../domain/devices'
import { printedPanelsAffected, portRanges } from '../domain/ports'
import type { Entity } from '../domain/drawing'
import type { ProjectDetails, TitleBlockTemplate } from '../domain/titleBlock'

/** Who wrote a change, beyond the user: a per-tab id (kept for the tab's life in sessionStorage) + the browser, e.g.
 *  "k3Jd9 Chrome/Windows". Several tabs or sessions share one account, so this is what tells them apart in the data. */
function clientTag(): string {
	let id = ''
	try { id = sessionStorage.getItem('cad-client') ?? '' } catch { /* storage blocked */ }
	if (!id) { id = Math.random().toString(36).slice(2, 7); try { sessionStorage.setItem('cad-client', id) } catch { /* ignore */ } }
	const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
	const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'browser'
	const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /iPad|iPhone/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Linux/.test(ua) ? 'Linux' : ''
	return `${id} ${browser}${os ? `/${os}` : ''}`
}

/** The global block library doc (User, 2026-10-02: blocks are global only). */
const BLOCKS_DOC = ['settings', 'cadBlocks'] as const
const TEMPLATES_DOC = ['settings', 'cadDeviceTemplates'] as const
/** Sheet categories are GLOBAL (User, sheets-organising D1): one list for every project. */
const CATEGORIES_DOC = ['settings', 'cadSheetCategories'] as const
const DISCIPLINES_DOC = ['settings', 'cadDisciplines'] as const
/** The disciplines offered until someone edits the list (Settings › Sheets). */
export const DEFAULT_DISCIPLINES = ['ICT', 'Electrical', 'Mechanical', 'Architectural']

export class CadProject {
	readonly store = new EntityStore()
	/** The project's display name (title blocks, export file names); set by the shell. */
	name = $state('')
	/** The projects page's Project details the title block falls back on (client, address, author, company); set by
	 *  the shell. */
	details = $state<ProjectDetails | undefined>()
	/** What every sheet's title block is drawn with: the name, the template, the Project details. */
	get sheetBase(): { projectName: string; template?: TitleBlockTemplate; details?: ProjectDetails } {
		return { projectName: this.name, template: this.settings?.titleBlock, details: this.details }
	}
	/** The project's owner (`projects/{pid}.ownerId`; set by the shell): only they restore a backup (ADR 0008 §4). */
	ownerId = $state<string | undefined>()
	/** The signed-in user's name, for who made a backup. */
	userName = $state('')
	/** This browser tab (see clientTag): tells a restore notice it wrote from one another tab wrote. */
	readonly client = clientTag()
	readonly pdf: PdfCache
	/** Bumped on every store change; everything derived reads it. */
	rev = $state(0)
	/** Bumped on FINAL changes only (a commit, an undo, a remote edit, a rollback) — not on each frame of a drag. For
	 *  readers that don't need the live drag (Navigator, tables, counts): read `dataIndex` / this, not `rev` / `index`. */
	dataRev = $state(0)
	loaded = $state(false)
	error = $state<string | null>(null)
	index = $derived.by(() => { void this.rev; return new ProjectIndex(this.store.all()) })
	/** The index as of the last final change: it holds still while a drag runs. */
	dataIndex = $derived.by((): ProjectIndex => { void this.dataRev; return untrack(() => this.index) })
	levels = $derived.by((): Level[] => [...this.index.levels].sort((a, b) => a.order - b.order))
	settings = $derived.by(() => { void this.rev; return settingsOf((id) => this.store.get(id)) })
	/** Every link's cable route and length over the drawn containment (Phase 5), recomputed with the data — but not on
	 *  each frame of a drag (the whole project re-routed per pointer move): the last routes hold until it ends. */
	#routingHeld: Routing | null = null
	/** The links' routes and the unlinked outlet ports' ESTIMATED cables, from one routing pass over one graph. */
	routing = $derived.by((): Routing => {
		const ix = this.index
		if (this.store.busy && this.#routingHeld) return this.#routingHeld
		return (this.#routingHeld = routeAll(ix, cableSettings(ix)))
	})
	routes = $derived(this.routing.routes)
	/** Estimated cables: every outlet port with no link yet, routed to its server room (domain/estimates.ts). */
	estimates = $derived(this.routing.estimates)
	/** How full each run segment is from those routes and estimates (Phase 5.3). */
	#fillsHeld: ReturnType<typeof fillBySegment> | null = null
	fills = $derived.by(() => {
		const ix = this.index, routes = this.routes, estimates = this.estimates
		if (this.store.busy && this.#fillsHeld) return this.#fillsHeld   // like the routes: held during a drag
		return (this.#fillsHeld = fillBySegment(ix, routes, undefined, estimates))
	})
	canUndo = $derived.by(() => { void this.rev; return this.store.canUndo })
	canRedo = $derived.by(() => { void this.rev; return this.store.canRedo })

	/** Blocks people made, from the global library doc; the built-ins are added in `blocks`. */
	globalBlocks = $state.raw<Record<Id, Block>>({})
	blocks = $derived(new Map<Id, Block>([...BUILTIN_BLOCKS, ...Object.values(this.globalBlocks).map(oneDrawing)].map((b) => [b.id, b])))
	blockOf = (id: Id): Block | undefined => this.blocks.get(id)
	/** Device templates are GLOBAL too (User, Phase 3 §9): built-ins + `settings/cadDeviceTemplates`. */
	globalTemplates = $state.raw<Record<Id, DeviceTemplate>>({})
	deviceTemplates = $derived([...BUILTIN_DEVICE_TEMPLATES, ...Object.values(this.globalTemplates).sort((a, b) => a.name.localeCompare(b.name))])
	/** The global sheet category list (`settings/cadSheetCategories`); the built-in one while that doc is empty. */
	globalSheetCategories = $state.raw<SheetCategory[] | null>(null)
	sheetCategories = $derived(this.globalSheetCategories?.length ? this.globalSheetCategories : DEFAULT_SHEET_CATEGORIES)
	/** The global DISCIPLINE list (`settings/cadDisciplines`, User D2: "a fixed list"); the defaults while it's empty. */
	globalDisciplines = $state.raw<string[] | null>(null)
	disciplines = $derived(this.globalDisciplines?.length ? this.globalDisciplines : DEFAULT_DISCIPLINES)

	#sync: Sync
	#watched = new Set<string>()
	#off: () => void
	#offBlocks: () => void
	#offTemplates: () => void
	#offCategories: () => void
	#offDisciplines: () => void

	constructor(readonly pid: string, readonly db: Firestore, readonly user: string) {
		this.pdf = new PdfCache(db)
		this.#offBlocks = onSnapshot(doc(db, ...BLOCKS_DOC), (s) => { this.globalBlocks = (s.data()?.blocks ?? {}) as Record<Id, Block> }, this.#listenFailed('the block library'))
		this.#offTemplates = onSnapshot(doc(db, ...TEMPLATES_DOC), (s) => { this.globalTemplates = (s.data()?.templates ?? {}) as Record<Id, DeviceTemplate> }, this.#listenFailed('the device templates'))
		this.#offCategories = onSnapshot(doc(db, ...CATEGORIES_DOC), (s) => { this.globalSheetCategories = (s.data()?.categories ?? null) as SheetCategory[] | null }, this.#listenFailed('the sheet categories'))
		this.#offDisciplines = onSnapshot(doc(db, ...DISCIPLINES_DOC), (s) => { const l = s.data()?.list; this.globalDisciplines = Array.isArray(l) ? (l as string[]) : null }, this.#listenFailed('the discipline list'))
		this.#off = this.store.subscribe((c) => { this.rev++; if (settles(c, this.store.busy)) this.dataRev++; this.#watchLevels() })
		// an edit that changes racks or devices re-estimates the planned cords through them, in the same undo step
		// (User 2026-10-18: a manager added at R01 U35 left the cords' lengths stale; installed cords are left alone)
		this.store.derive = (tx, ops) => {
			const racks = racksTouched(ops)
			if (!racks.size) return
			for (const c of relengthCords(new ProjectIndex(this.store.all()), racks)) tx.put(c)
		}
		this.#sync = new Sync(this.store, new FirestoreBackend(db, pid), {
			user, client: this.client, onPending: (n) => this.#pending(n),
			onError: (e) => { this.#failed = true; this.error = `Saving failed: ${(e as Error).message ?? e}` },
			onListenError: (e, scopes) => this.#listenFailed(scopes.includes(PROJECT_SCOPE) ? 'the project' : 'part of the drawing')(e),
		})
		this.#watched.add(PROJECT_SCOPE)
		// a failed first listener ends "Loading…" too (with the error shown), instead of a blank drawing for ever
		this.#sync.watch([PROJECT_SCOPE], () => { this.loaded = true }, () => { this.loaded = true })
		this.notices = new RestoreNotices(this)
	}

	/** Restores announced to everyone in the project (ADR 0008 §6). */
	readonly notices: RestoreNotices

	/** A listener failed (a permission error stops it for good): say so, where "Saved" is. */
	#listenFailed(what: string): (e: unknown) => void {
		return (e) => { this.error = `Lost the live connection to ${what}: ${(e as Error)?.message ?? e} — reload the page, and check you can open this project` }
	}

	/** Scopes whose first snapshot has arrived (a plan waits for its level's before fitting the view). */
	loadedScopes = $state<Record<string, true>>({})
	levelLoaded = (levelId: Id) => !!this.loadedScopes[levelScope(levelId)]

	/** A level's plan data loads with its level, a sheet's paper notes with its sheet (ADR 0003 scopes). */
	#watchLevels(): void {
		// …and a saved view's own shapes with the view (they were never loaded or confirmed: "Saving…" stayed on)
		const scopes = [...this.store.ofType('level').map((l) => levelScope(l.id)), ...this.store.ofType('sheet').map((s) => sheetScope(s.id)), ...this.store.ofType('view').map((v) => viewScope(v.id))]
		for (const s of scopes) if (!this.#watched.has(s)) { this.#watched.add(s); this.#sync.watch([s], () => { this.loadedScopes[s] = true }, () => { this.loadedScopes[s] = true }) }
	}

	/** Writes not yet confirmed by the server (kept current by Sync — a write can finish with no store change). */
	pendingWrites = $state(0)
	/** A write failed since the writes last started (Review 2 Q29: "Saving failed" stayed for good). */
	#failed = false
	#pending(n: number): void {
		if (n > 0 && this.pendingWrites === 0) this.#failed = false
		this.pendingWrites = n
		// every write since went through: a saving error is over
		if (n === 0 && !this.#failed && this.error?.startsWith('Saving failed')) this.error = null
	}

	/** Undo / redo return what they brought back or changed (still there afterwards), for the caller to select. */
	undo(): Id[] { const r = this.store.undo(); if (r?.skipped.length) this.error = `Undo skipped ${r.skipped.length} item(s) someone else changed since`; return this.#touched(r) }
	redo(): Id[] { return this.#touched(this.store.redo()) }
	#touched(r: UndoResult | null): Id[] {
		const keep = (e: Entity | undefined) => !!e && e.type !== 'settings' && e.type !== 'level' && e.type !== 'building'
		const ids = (r?.applied ?? []).map((op) => op.id).filter((id) => keep(this.store.get(id)))
		// nothing it touched is left (an undone paste / copy): the selection from before it
		return ids.length ? ids : (r?.sel ?? []).filter((id) => keep(this.store.get(id)))
	}

	/** Read the legacy tools' docs and build the import — nothing is written. */
	async previewImport(): Promise<ImportResult> {
		return importLegacy(await loadLegacy(this.db, this.pid))
	}

	/** Write an import into this project (one undo step). Refuses if the project already has cad data. */
	applyImport(res: ImportResult): void {
		if (this.store.ofType('level').length) throw new Error('This project already has cad data — import is only for an empty project')
		// the import's "things to check" are kept on the settings record (right sidebar → Import notes)
		const keep = (e: Entity): Entity => (e.type === 'settings' && res.issues.length ? { ...e, importNotes: { at: Date.now(), notes: res.issues.map((i) => ({ ...i })) } } : e)
		this.store.transact(`Import ${res.entities.length} items from the legacy tools`, (tx) => { for (const e of res.entities) tx.put(keep(e)) })
	}

	/** Make a global block from shapes and put ONE insert in their place (one undo step for the drawing; the block
	 *  itself stays in the library). */
	async makeBlock(ids: Id[], name: string): Promise<Id | null> {
		const shapes = ids.map((id) => this.store.get(id)).filter((e): e is Shape => e?.type === 'shape' && e.geom.kind !== 'insert')
		if (!shapes.length || !name.trim()) return null
		// shapes drawn in an elevation / section: the block is made from them as seen there, and its insert stays in that view
		const made = elevationProblem(shapes) === null ? elevationBlock(shapes, name.trim()) : blockProblem(shapes) ? null : (() => {
			const sheet = shapes[0].sheetId ? this.store.get(shapes[0].sheetId) : undefined
			return blockFromShapes(shapes, name.trim(), paperBlockScale(shapes, sheet?.type === 'sheet' ? sheet : undefined))
		})()
		if (!made) return null
		const { block, insert } = made
		// furniture (User 2026-10-14): drawn on no layer of its own, the insert goes on "Furniture" (made if need be)
		const furn = is3d(block) && !insert.layerId && insert.levelId ? ensureLayer('Furniture', this.index.layers, this.store.ofType('sheet'), newId) : null
		if (furn) insert.layerId = furn.id
		await setDoc(doc(this.db, ...BLOCKS_DOC), { blocks: { [block.id]: stripUndefined(block) } }, { merge: true })
		this.store.transact(`Make block ${block.name}`, (tx) => { for (const s of shapes) tx.del(s.id); for (const e of furn?.puts ?? []) tx.put(e); tx.put(insert) })
		return insert.id
	}

	/** Rename one of your blocks in the GLOBAL library (every project's list shows the new name; inserts keep drawing it —
	 *  they name it by id). Built-ins can't be renamed. Not undoable (it isn't project data). */
	async renameBlock(id: Id, name: string): Promise<void> {
		if (this.blocks.get(id)?.builtin || !name.trim()) return
		await setDoc(doc(this.db, ...BLOCKS_DOC), { blocks: { [id]: { name: name.trim() } } }, { merge: true })
	}
	/** A block's spec sheet (backlog "Catalogue … links to product specs"), in the GLOBAL library; '' clears it. */
	async setBlockUrl(id: Id, url: string): Promise<void> {
		if (this.blocks.get(id)?.builtin) return
		await updateDoc(doc(this.db, ...BLOCKS_DOC), new FieldPath('blocks', id, 'productUrl'), url.trim() ? url.trim() : deleteField())
	}

	/** Delete a block from the GLOBAL library (User: retire, not erase): hidden from pickers, while every insert /
	 *  outlet already using it keeps drawing it. Built-ins can't be retired. Not undoable (it isn't project data). */
	async retireBlock(id: Id): Promise<void> {
		if (this.blocks.get(id)?.builtin) return
		await setDoc(doc(this.db, ...BLOCKS_DOC), { blocks: { [id]: { retired: true } } }, { merge: true })
	}

	/** An insert → ordinary shapes in place (the copied-block case), as the view shows it: `spec` = the active pane's view
	 *  (an elevation / section explodes a level's insert onto that view's plane). */
	explode(insertId: Id, spec?: ViewSpec): Id[] {
		const ins = this.store.get(insertId)
		if (ins?.type !== 'shape' || ins.geom.kind !== 'insert') return []
		const b = this.blockOf(ins.geom.blockId)
		if (!b) return []
		const shapes = explodeInsert(ins, b, ...this.#explodeAs(ins, ins.geom, spec))
		this.store.transact(`Explode ${b.name}`, (tx) => { tx.del(insertId); for (const s of shapes) tx.put(s) })
		return shapes.map((s) => s.id)
	}

	/** Where an insert is exploded: the drawing scale its annotative block is drawn at — a note in a viewport as that
	 *  viewport draws it, paper at 1, a level's insert at the plot scale, onto its own elevation (or the elevation /
	 *  section it is exploded in, when it shows there). */
	#explodeAs(ins: Shape, g: Extract<Shape['geom'], { kind: 'insert' }>, spec?: ViewSpec): [number, { frame?: ElevFrame }] {
		if (ins.sheetId) {
			const sheet = this.store.get(ins.sheetId), vp = ins.vpId && sheet?.type === 'sheet' ? sheet.viewports.find((v) => v.id === ins.vpId) : undefined
			return vp ? [vp.scale, {}] : [1, {}]
		}
		if (!ins.levelId) return [PLOT_SCALE, {}]
		if (g.frame) return [PLOT_SCALE, { frame: g.frame }]
		const sec = spec?.kind === 'section' ? this.store.get(spec.sectionId) : undefined
		const frame = !g.inElevations ? undefined : sec?.type === 'section' ? sectionSpace(sec).frame : spec?.kind === 'elevation' ? spaceOf(spec).frame : undefined
		return [PLOT_SCALE, frame ? { frame } : {}]
	}

	/**
	 * Write label edits as one undo step, but ASK FIRST if they would change labels already printed on a panel
	 * (ADR 0002). `ask` shows the question with a yes button; nothing is written unless it's pressed.
	 */
	relabel(label: string, edits: Entity[], ask: (msg: string, yes: string, apply: () => void) => void): void {
		const apply = () => this.store.transact(label, (tx) => { for (const e of edits) tx.put(e) })
		const hit = printedPanelsAffected(this.index, edits)
		if (!hit.length) { apply(); return }
		const which = hit.map((h) => `${h.device.name} port${h.ports.length > 1 ? 's' : ''} ${portRanges(h.ports)}`).join('; ')
		ask(`Already printed: ${which} would change — reprint them after.`, 'Change anyway', apply)
	}

	/** Write an allocation (or a hand assignment) as ONE undo step: the links it drops, then the ones it adds. */
	applyLinks(label: string, add: Link[], remove: Id[]): void {
		if (!add.length && !remove.length) return
		this.store.transact(label, (tx) => { for (const id of remove) tx.del(id); for (const l of add) tx.put(l) })
	}

	/** Save the whole global discipline list (replaces it). */
	async saveDisciplines(list: string[]): Promise<void> {
		await setDoc(doc(this.db, ...DISCIPLINES_DOC), { list })
	}
	/** Save the whole global sheet category list (replaces the doc: a removed field must not survive a merge). */
	async saveSheetCategories(list: SheetCategory[]): Promise<void> {
		await setDoc(doc(this.db, ...CATEGORIES_DOC), { categories: list.map((c) => stripUndefined(c)) })
	}

	/** Add blocks a restored backup draws that the global library no longer has (never overwrites one it has). */
	async addMissingBlocks(blocks: Block[]): Promise<number> {
		const missing = blocks.filter((b) => !this.blocks.has(b.id) && !b.builtin)
		if (missing.length) await setDoc(doc(this.db, ...BLOCKS_DOC), { blocks: Object.fromEntries(missing.map((b) => [b.id, stripUndefined(b)])) }, { merge: true })
		return missing.length
	}

	/** Add or replace a global template (Device library › New / edit, backlog "Device library builder") — written
	 *  whole, so a field cleared in the form goes (a merge would keep it). Global: every project sees it. */
	async putTemplate(t: DeviceTemplate): Promise<void> {
		const ref = doc(this.db, ...TEMPLATES_DOC)
		await setDoc(ref, {}, { merge: true })
		await updateDoc(ref, new FieldPath('templates', t.id), stripUndefined({ ...t, builtin: undefined }))
	}
	/** Set a floorplan page's calibration field in its FILE (`files/{id}.pages[page].origin | scale | crop`, the Uploads
	 *  format — so Uploads, Pages and every project using the file agree; backlog "Calibrate an image in place").
	 *  Returns what it was, for its "Undo" (the file isn't in the drawing's undo). */
	async setPageCalib(fileId: string, page: number, field: 'origin' | 'scale' | 'crop', value: unknown): Promise<unknown> {
		const ref = doc(this.db, 'files', fileId), fd = (await getDoc(ref)).data()
		const was = (fd?.pages?.[page] ?? fd?.pages?.[String(page)])?.[field]
		await updateDoc(ref, new FieldPath('pages', String(page), field), value === undefined ? deleteField() : stripUndefined(value))
		return was
	}
	/** A new revision of a floorplan (W4): give file `toId` the look of `fromId` — each page's calibration and masks
	 *  (`pages[n]`), its hidden PDF layers and markups — where `toId` has none of its own (a page with a scale already,
	 *  or layers already hidden, stay as they are). Returns the pages copied. */
	async copyFileLook(fromId: string, toId: string): Promise<string[]> {
		const from = (await getDoc(doc(this.db, 'files', fromId))).data(), ref = doc(this.db, 'files', toId), to = (await getDoc(ref)).data()
		if (!from || !to) throw new Error(`${from ? toId : fromId} is not in Uploads`)
		const pages = Object.entries((from.pages ?? {}) as Record<string, { scale?: { scale?: number } }>).filter(([n]) => !Number(to.pages?.[n]?.scale?.scale)).map(([n]) => n)
		const args: unknown[] = []
		for (const n of pages) args.push(new FieldPath('pages', n), from.pages[n])
		if (Array.isArray(from.hiddenLayers) && from.hiddenLayers.length && !(Array.isArray(to.hiddenLayers) && to.hiddenLayers.length)) args.push(new FieldPath('hiddenLayers'), from.hiddenLayers)
		if (from.hideMarkups && to.hideMarkups === undefined) args.push(new FieldPath('hideMarkups'), true)
		if (args.length) await (updateDoc as (r: typeof ref, ...a: unknown[]) => Promise<void>)(ref, ...args)
		return pages
	}
	/** The projects a file is used by (`files/{id}.projectIds`, else its `projectId`). */
	async fileProjects(fileId: string): Promise<string[]> {
		const fd = (await getDoc(doc(this.db, 'files', fileId))).data()
		return (fd?.projectIds as string[] | undefined) ?? (fd?.projectId ? [fd.projectId as string] : [])
	}
	/** Delete a global template (not a built-in). Placed devices keep their own copy of everything. */
	async deleteTemplate(id: Id): Promise<void> {
		await updateDoc(doc(this.db, ...TEMPLATES_DOC), new FieldPath('templates', id), deleteField())
	}

	destroy(): void {
		this.#sync.stop()
		this.#off()
		this.#offBlocks()
		this.#offTemplates()
		this.#offCategories()
		this.#offDisciplines()
		this.pdf.destroy()
		this.notices.destroy()
	}
}
