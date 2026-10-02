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
import type { Level, ProjectSettings } from '../domain/types'

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

	#sync: Sync
	#watched = new Set<string>()
	#off: () => void

	constructor(readonly pid: string, readonly db: Firestore, user: string) {
		this.pdf = new PdfCache(db)
		this.#off = this.store.subscribe(() => { this.rev++; this.#watchLevels() })
		this.#sync = new Sync(this.store, new FirestoreBackend(db, pid), { user, onError: (e) => { this.error = `Saving failed: ${(e as Error).message ?? e}` } })
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

	get pendingWrites(): number { void this.rev; return this.#sync.pending }

	undo(): void { const r = this.store.undo(); if (r?.skipped.length) this.error = `Undo skipped ${r.skipped.length} item(s) someone else changed since` }
	redo(): void { this.store.redo() }

	/** Read the legacy tools' docs and build the import — nothing is written. */
	async previewImport(): Promise<ImportResult> {
		return importLegacy(await loadLegacy(this.db, this.pid))
	}

	/** Write an import into this project (one undo step). Refuses if the project already has cad data. */
	applyImport(res: ImportResult): void {
		if (this.store.ofType('level').length) throw new Error('This project already has cad data — import is only for an empty project')
		this.store.transact(`Import ${res.entities.length} items from the legacy tools`, (tx) => { for (const e of res.entities) tx.put(e) })
	}

	destroy(): void {
		this.#sync.stop()
		this.#off()
	}
}
