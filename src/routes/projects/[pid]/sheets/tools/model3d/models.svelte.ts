import type { Firestore } from '$lib/db.svelte'
import type { Model } from './types'
import { seedModels } from './data'

/**
 * Project-shared, reactive store of `model3d` models, synced to `models3d/{pid}`
 * → `{ models: Model[] }`. Models are shared across every sheet/viewport (like
 * outlets/racks docs), so one instance is cached per project and shared by all
 * model3d viewports + the properties window.
 *
 * Geometry editing (the edit layer) mutates `store.models` and calls `save()`;
 * saves are debounced + de-duped by JSON so remote loads don't echo back.
 */
export class ModelStore {
	models = $state<Model[]>([])
	loaded = $state(false)

	private last = ''
	private timer: ReturnType<typeof setTimeout> | null = null
	private seeded = false

	constructor(private db: Firestore, private pid: string) {
		// Seed once if the project has no models yet — server read guards against a
		// cache-race double-seed across viewports sharing this singleton.
		db.getOne('models3d', pid).then((d: any) => {
			if (this.seeded || this.last) return
			if (!d || !Array.isArray(d.models) || !d.models.length) {
				this.seeded = true
				this.models = structuredClone(seedModels)
				this.flush()
			}
		})
		db.subscribeOne('models3d', pid, (d: any) => {
			this.loaded = true
			const incoming = Array.isArray(d?.models) ? d.models : null
			if (!incoming) return
			const json = JSON.stringify(incoming)
			if (json === this.last) return // our own write echoed back
			this.last = json
			this.models = incoming
		})
	}

	get(id: number) { return this.models.find((m) => m.id === id) ?? null }

	/** Persist current models (debounced). Callers mutate `models` then call this. */
	save() {
		if (this.timer) clearTimeout(this.timer)
		this.timer = setTimeout(() => this.flush(), 500)
	}
	private flush() {
		const snap = $state.snapshot(this.models) as Model[]
		const json = JSON.stringify(snap)
		if (json === this.last) return
		this.last = json
		this.db.save('models3d', { id: this.pid, models: snap })
	}

	// ---- model-level CRUD ----
	add(name = 'New model'): Model {
		const id = Math.max(0, ...this.models.map((m) => m.id)) + 1
		const m: Model = {
			id, name, objects: [],
			layers: [{ id: 'default', name: 'Default', color: '#111827', visible: true, locked: false }],
		}
		this.models.push(m)
		this.save()
		return m
	}
	rename(id: number, name: string) { const m = this.get(id); if (m) { m.name = name; this.save() } }
	remove(id: number) { this.models = this.models.filter((m) => m.id !== id); this.save() }
}

// One store per project, shared by all model3d viewports + the properties window.
const cache = new Map<string, ModelStore>()
export function modelStore(db: Firestore, pid: string): ModelStore {
	let s = cache.get(pid)
	if (!s) { s = new ModelStore(db, pid); cache.set(pid, s) }
	return s
}
