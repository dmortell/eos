// The Pages Firestore store (drawings-plan §2, phase 1) — loads and saves a project's Pages data:
//   projects/{pid}.pages            → `project`  (places, title block, settings)
//   projects/{pid}/drawings (toolType 'pages') → `sheets`
//   projects/{pid}/models           → `models`   (stored docs; phase 3 feeds them to the editor's registry)
// Local edits apply immediately and are saved debounced (./saver.ts); remote snapshots are applied in the
// SUBSCRIPTION CALLBACKS (never a $effect), skipping our own echoes and any doc with a pending local edit.
// Last write wins. Not wired to the UI yet (phases 2–4 do that).
import type { DocWithId } from '$lib/db.svelte'
import { newId } from '../ids'
import { DocSaver } from './saver'
import { seedPlaces as buildSeed, childrenOf } from './places'
import { newSheetDoc, normSheet, modelToDoc } from './mappers'
import type { TreeInput } from '../projectTree'
import type { Model, ModelKind } from '../3dview/types'
import type { ModelDoc, PagesProject, PagesSheetDoc, Place } from './schema'

/** The slice of `$lib/db.svelte` Firestore the store uses (a fake implements it in tests). */
export type StoreDb = {
	subscribeOne(table: string, id: string, cb: (d: DocWithId) => void): () => void
	subscribeWhere(path: string, field: string, value: unknown, cb: (d: DocWithId[]) => void): () => void
	subscribeMany(path: string, cb: (d: DocWithId[]) => void): () => void
	saveFields(path: string, data: DocWithId): Promise<void>
	/** Overwrite the whole doc (no merge) — models: a field the model no longer has must be removed. */
	replace(path: string, data: DocWithId): Promise<void>
	delete(path: string, id: string): Promise<void>
}

const PROJECT_KEY = 'pages'
const now = () => new Date().toISOString()
const emptyProject = (): PagesProject => ({ places: [] })

export class PagesStore {
	status = $state<'idle' | 'loading' | 'ready'>('idle')
	/** `projects/{pid}.pages`; null until loaded, or when the project has no Pages data yet. */
	project = $state.raw<PagesProject | null>(null)
	sheets = $state.raw<PagesSheetDoc[]>([])
	models = $state.raw<ModelDoc[]>([])
	/** The last save error (shown by the UI later). */
	error = $state<string | null>(null)

	readonly #db: StoreDb
	readonly pid: string
	readonly #user: string
	#subs: (() => void)[] = []
	#loaded = { project: false, sheets: false, models: false }
	readonly #onError = (key: string, err: unknown) => { this.error = `Couldn't save ${key}: ${err instanceof Error ? err.message : String(err)}` }
	readonly #projectSaver: DocSaver<PagesProject>
	readonly #sheetSaver: DocSaver<PagesSheetDoc>
	readonly #modelSaver: DocSaver<ModelDoc>

	/** Called from the models subscription with the stored docs that CHANGED remotely (not our own echoes, not
	 *  docs with a pending local edit) and the ids deleted remotely — the page applies them to the editor's model
	 *  registry there, in the callback (never a $effect). */
	#onModels?: (changed: ModelDoc[], removed: string[]) => void
	/** The same for sheets: remote content changes the page applies to open sheet docs. */
	#onSheets?: (changed: PagesSheetDoc[], removed: string[]) => void

	constructor(db: StoreDb, pid: string, user = '', opts: { delayMs?: number; onModels?: (changed: ModelDoc[], removed: string[]) => void; onSheets?: (changed: PagesSheetDoc[], removed: string[]) => void } = {}) {
		this.#db = db; this.pid = pid; this.#user = user; this.#onModels = opts.onModels; this.#onSheets = opts.onSheets
		const o = { delayMs: opts.delayMs, onError: this.#onError }
		this.#projectSaver = new DocSaver((_k, p) => db.saveFields('projects', { id: pid, pages: p }), o)
		this.#sheetSaver = new DocSaver((_k, d) => db.saveFields(this.#sheetsPath, d), o)
		this.#modelSaver = new DocSaver((_k, d) => db.replace(this.#modelsPath, d), o)   // whole-doc: Pages owns model docs
	}

	get #sheetsPath() { return `projects/${this.pid}/drawings` }
	get #modelsPath() { return `projects/${this.pid}/models` }
	get places(): Place[] { return this.project?.places ?? [] }

	start() {
		if (this.#subs.length) return
		this.status = 'loading'
		this.#subs.push(this.#db.subscribeOne('projects', this.pid, (d) => {
			const p = (d?.pages as PagesProject | undefined) ?? null
			if (this.#projectSaver.remote(PROJECT_KEY, p)) this.project = p ? { ...emptyProject(), ...p } : null
			this.#mark('project')
		}))
		this.#subs.push(this.#db.subscribeWhere(this.#sheetsPath, 'toolType', 'pages', (docs) => {
			const r = this.#merge(this.sheets, docs.map((d) => normSheet(d as PagesSheetDoc)), this.#sheetSaver)
			this.sheets = r.list
			if (r.applied.length || r.removed.length) this.#onSheets?.(r.applied, r.removed)
			this.#mark('sheets')
		}))
		this.#subs.push(this.#db.subscribeMany(this.#modelsPath, (docs) => {
			const r = this.#merge(this.models, docs as ModelDoc[], this.#modelSaver)
			this.models = r.list
			if (r.applied.length || r.removed.length) this.#onModels?.(r.applied, r.removed)
			this.#mark('models')
		}))
	}

	/** Unsubscribe and write anything still pending. */
	async stop() {
		for (const u of this.#subs) u()
		this.#subs = []
		await this.flush()
		this.status = 'idle'
	}

	flush() { return Promise.all([this.#projectSaver.flush(), this.#sheetSaver.flush(), this.#modelSaver.flush()]) }

	// ── project / places ──
	saveProject(p: PagesProject) { this.project = p; this.#projectSaver.queue(PROJECT_KEY, p) }
	savePlaces(places: Place[]) { this.saveProject({ ...(this.project ?? emptyProject()), places }) }
	/** Seed the places ONCE from the old tools' data (drawings-plan §2.1). Returns false (and changes nothing)
	 *  when the project already has places. The caller must have the user's OK for a real project. */
	seedPlaces(input: TreeInput): boolean {
		if (this.places.length) return false
		this.saveProject({ ...(this.project ?? emptyProject()), places: buildSeed(input, () => newId('pl')), seededAt: now() })
		return true
	}

	// ── sheets ──
	/** A new, empty sheet at the end of its place's list. */
	createSheet(a: { title: string; placeId: string | null; id?: string }): PagesSheetDoc {
		const inPlace = this.sheets.filter((s) => s.placeId === a.placeId)
		const d = newSheetDoc({ pid: this.pid, id: a.id ?? newId('sh'), title: a.title, placeId: a.placeId, user: this.#user, now: now(),
			sortOrder: inPlace.reduce((m, s) => Math.max(m, s.sortOrder), -1) + 1, paper: this.project?.settings?.paperSize ? { size: this.project.settings.paperSize } : undefined })
		this.saveSheet(d)
		return d
	}
	saveSheet(d: PagesSheetDoc) {
		const next = { ...d, updatedAt: now() }
		this.sheets = upsert(this.sheets, next)
		this.#sheetSaver.queue(d.id, next)
	}
	/** Move a sheet to a place (null = project level) at a position among that place's live sheets; renumbers
	 *  the sortOrder of every sheet in the place (manual drag order, drawings-plan §4). */
	moveSheet(id: string, placeId: string | null, index: number) {
		const me = this.sheets.find((s) => s.id === id); if (!me) return
		const rest = this.sheetsIn(placeId).filter((s) => s.id !== id)
		rest.splice(Math.max(0, Math.min(index, rest.length)), 0, { ...me, placeId })
		rest.forEach((s, i) => { if (s.id === id || s.sortOrder !== i) this.saveSheet({ ...s, placeId, sortOrder: i }) })
	}
	setSheetStatus(id: string, status: PagesSheetDoc['status']) { const s = this.sheets.find((x) => x.id === id); if (s && s.status !== status) this.saveSheet({ ...s, status }) }
	/** Hard delete — only an ARCHIVED sheet (drawings-plan §5). */
	async hardDeleteSheet(id: string): Promise<boolean> {
		const s = this.sheets.find((x) => x.id === id)
		if (!s || s.status !== 'archived') return false
		this.#sheetSaver.cancel(id)
		this.sheets = this.sheets.filter((x) => x.id !== id)
		await this.#db.delete(this.#sheetsPath, id)
		return true
	}

	// ── models ──
	/** Save a model (pass PLAIN data — `$state.snapshot` it first). */
	saveModel(m: Model) {
		const d = modelToDoc(m, now())
		this.models = upsert(this.models, d)
		this.#modelSaver.queue(d.id, d)
	}
	createModel(a: { name: string; placeId: string | null; kind: ModelKind; id?: string }): ModelDoc {
		const d = modelToDoc({ id: a.id ?? newId('m'), name: a.name, objects: [], placeId: a.placeId ?? undefined, kind: a.kind }, now())   // no version until History's first save (1.0)
		this.saveModel(d)
		return d
	}
	setModelArchived(id: string, archived: boolean) { const m = this.models.find((x) => x.id === id); if (m && !!m.archived !== archived) this.saveModel({ ...m, archived }) }

	/** Sheets filed under a place, in their manual order (archived ones only when asked). */
	sheetsIn(placeId: string | null, withArchived = false) {
		return this.sheets.filter((s) => s.placeId === placeId && (withArchived || s.status !== 'archived')).sort((a, b) => a.sortOrder - b.sortOrder)
	}
	childPlaces(parentId: string | null) { return childrenOf(this.places, parentId) }

	#mark(k: 'project' | 'sheets' | 'models') {
		this.#loaded[k] = true
		if (this.#loaded.project && this.#loaded.sheets && this.#loaded.models) this.status = 'ready'
	}

	/** Apply a collection snapshot: take each remote doc the saver says to apply, keep the local copy of any
	 *  doc with a pending edit (or an unchanged echo), and drop docs deleted remotely unless one is pending. */
	#merge<T extends { id: string }>(local: T[], remote: T[], saver: DocSaver<T>): { list: T[]; applied: T[]; removed: string[] } {
		const byId = new Map(local.map((d) => [d.id, d]))
		const list: T[] = [], applied: T[] = [], removed: string[] = []
		for (const r of remote) { if (saver.remote(r.id, r)) { list.push(r); applied.push(r) } else list.push(byId.get(r.id) ?? r) }
		const seen = new Set(remote.map((r) => r.id))
		for (const l of local) if (!seen.has(l.id)) { if (saver.isPending(l.id)) list.push(l); else { removed.push(l.id); saver.cancel(l.id) } }
		return { list, applied, removed }
	}
}

const upsert = <T extends { id: string }>(list: T[], d: T): T[] => (list.some((x) => x.id === d.id) ? list.map((x) => (x.id === d.id ? d : x)) : [...list, d])
