// One open project: the entity store, its Firestore sync, and reactive reads for the UI. Created by the route per
// project and destroyed with it (no module-level state — the Pages singletons leaked across projects).
import type { Firestore } from 'firebase/firestore'
import { EntityStore } from '../store/store'
import { Sync } from '../persist/sync'
import { FirestoreBackend } from '../persist/firestore'
import { PROJECT_SCOPE, levelScope } from '../persist/docs'
import { ProjectIndex } from '../domain/project'
import { importLegacy, type ImportResult } from '../persist/import/legacy'
import { loadLegacy } from '../persist/import/load'
import { PdfCache } from './pdf.svelte'
import type { Id, Level, Link, ProjectSettings } from '../domain/types'
import type { Shape } from '../domain/shapes'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { BUILTIN_BLOCKS, blockFromShapes, explodeInsert, type Block } from '../domain/blocks'
import { stripUndefined } from '../persist/docs'
import { BUILTIN_DEVICE_TEMPLATES, templateFromDevice, type DeviceTemplate } from '../domain/devices'
import { printedPanelsAffected, portRanges } from '../domain/ports'
import type { Entity } from '../domain/drawing'

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

/** The global block library doc (Dave, 2026-10-02: blocks are global only). */
const BLOCKS_DOC = ['settings', 'cadBlocks'] as const
const TEMPLATES_DOC = ['settings', 'cadDeviceTemplates'] as const

export class CadProject {
	readonly store = new EntityStore()
	readonly pdf: PdfCache
	/** Bumped on every store change; everything derived reads it. */
	rev = $state(0)
	loaded = $state(false)
	error = $state<string | null>(null)
	index = $derived.by(() => { void this.rev; return new ProjectIndex(this.store.all()) })
	levels = $derived.by((): Level[] => [...this.index.levels].sort((a, b) => a.order - b.order))
	settings = $derived.by(() => { void this.rev; return this.store.get('settings') as ProjectSettings | undefined })
	canUndo = $derived.by(() => { void this.rev; return this.store.canUndo })
	canRedo = $derived.by(() => { void this.rev; return this.store.canRedo })

	/** Blocks people made, from the global library doc; the built-ins are added in `blocks`. */
	globalBlocks = $state.raw<Record<Id, Block>>({})
	blocks = $derived(new Map<Id, Block>([...BUILTIN_BLOCKS, ...Object.values(this.globalBlocks)].map((b) => [b.id, b])))
	blockOf = (id: Id): Block | undefined => this.blocks.get(id)
	/** Device templates are GLOBAL too (Dave, Phase 3 §9): built-ins + `settings/cadDeviceTemplates`. */
	globalTemplates = $state.raw<Record<Id, DeviceTemplate>>({})
	deviceTemplates = $derived([...BUILTIN_DEVICE_TEMPLATES, ...Object.values(this.globalTemplates).sort((a, b) => a.name.localeCompare(b.name))])

	#sync: Sync
	#watched = new Set<string>()
	#off: () => void
	#offBlocks: () => void
	#offTemplates: () => void

	constructor(readonly pid: string, readonly db: Firestore, user: string) {
		this.pdf = new PdfCache(db)
		this.#offBlocks = onSnapshot(doc(db, ...BLOCKS_DOC), (s) => { this.globalBlocks = (s.data()?.blocks ?? {}) as Record<Id, Block> })
		this.#offTemplates = onSnapshot(doc(db, ...TEMPLATES_DOC), (s) => { this.globalTemplates = (s.data()?.templates ?? {}) as Record<Id, DeviceTemplate> })
		this.#off = this.store.subscribe(() => { this.rev++; this.#watchLevels() })
		this.#sync = new Sync(this.store, new FirestoreBackend(db, pid), {
			user, client: clientTag(), onPending: (n) => { this.pendingWrites = n },
			onError: (e) => { this.error = `Saving failed: ${(e as Error).message ?? e}` },
		})
		this.#watched.add(PROJECT_SCOPE)
		this.#sync.watch([PROJECT_SCOPE], () => { this.loaded = true })
	}

	/** A level's plan data loads with its level (ADR 0003 scopes). */
	#watchLevels(): void {
		for (const l of this.store.ofType('level')) {
			const s = levelScope(l.id)
			if (!this.#watched.has(s)) { this.#watched.add(s); this.#sync.watch([s]) }
		}
	}

	/** Writes not yet confirmed by the server (kept current by Sync — a write can finish with no store change). */
	pendingWrites = $state(0)

	undo(): void { const r = this.store.undo(); if (r?.skipped.length) this.error = `Undo skipped ${r.skipped.length} item(s) someone else changed since` }
	redo(): void { this.store.redo() }

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
		const { block, insert } = blockFromShapes(shapes, name.trim())
		await setDoc(doc(this.db, ...BLOCKS_DOC), { blocks: { [block.id]: stripUndefined(block) } }, { merge: true })
		this.store.transact(`Make block ${block.name}`, (tx) => { for (const s of shapes) tx.del(s.id); tx.put(insert) })
		return insert.id
	}

	/** An insert → ordinary shapes in place (the copied-block case). */
	explode(insertId: Id): Id[] {
		const ins = this.store.get(insertId)
		if (ins?.type !== 'shape' || ins.geom.kind !== 'insert') return []
		const b = this.blockOf(ins.geom.blockId)
		if (!b) return []
		const shapes = explodeInsert(ins, b)
		this.store.transact(`Explode ${b.name}`, (tx) => { tx.del(insertId); for (const s of shapes) tx.put(s) })
		return shapes.map((s) => s.id)
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

	/** Save a device's shape as a global template ("Save as template"). */
	async saveTemplate(deviceId: Id, name: string): Promise<DeviceTemplate | null> {
		const d = this.store.get(deviceId)
		if (d?.type !== 'device' || !name.trim()) return null
		const t = templateFromDevice(d, name.trim())
		await setDoc(doc(this.db, ...TEMPLATES_DOC), { templates: { [t.id]: stripUndefined(t) } }, { merge: true })
		return t
	}

	destroy(): void {
		this.#sync.stop()
		this.#off()
		this.#offBlocks()
		this.#offTemplates()
	}
}
