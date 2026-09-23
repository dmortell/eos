// Live Firestore source for the Pages project tree (projectTree.ts builds the nodes). Subscribes to the
// project doc, its risers (`where projectId == pid`), its drawings registry, and one racks doc per floor ×
// server room — re-subscribing those when the floor list changes. Read-only apart from `setFloorBuilding`.
// See docs/firestore-structure.md for the shapes.
import type { Firestore } from '$lib'
import { buildProjectTree, normFloors, racksDocId, OTHER_BUILDING, type ProjectDoc, type RackDoc, type RiserDoc, type DrawingDoc } from './projectTree'
import type { NavNode } from './mock/data'
import { describeNode, fieldPatch, type NodeInfo, type ProjectFull } from './projectProps'

type Unsub = (() => void) | undefined

export class ProjectSource {
	/** 'loading' → 'ready', or 'missing' when the project doc has no data (e.g. a mock / demo pid). */
	status = $state<'loading' | 'ready' | 'missing'>('loading')
	project = $state<ProjectDoc | null>(null)
	racks = $state<Record<string, RackDoc | undefined>>({})
	risers = $state<RiserDoc[]>([])
	drawings = $state<DrawingDoc[]>([])
	#subs: Unsub[] = []
	#rackSubs = new Map<string, Unsub>()

	constructor(private db: Firestore, readonly pid: string) {}

	/** The tree, or null until the project doc has loaded (and when it doesn't exist). */
	get tree(): { project: { id: string; label: string }; tree: NavNode[] } | null {
		if (!this.project) return null
		return buildProjectTree({ project: this.project, racks: this.racks, risers: this.risers, drawings: this.drawings })
	}

	start(): () => void {
		this.#subs.push(this.db.subscribeOne('projects', this.pid, (data) => {
			// subscribeOne always yields {id}; a real project has at least a name or floors
			const d = data as ProjectDoc & { deleted?: boolean }
			if (!d || (!d.name && !d.floors)) { this.project = null; this.status = 'missing'; return }
			this.project = d; this.status = 'ready'
			this.#syncRacks()
		}))
		this.#subs.push(this.db.subscribeWhere('risers', 'projectId', this.pid, (list) => { this.risers = list as unknown as RiserDoc[] }))
		this.#subs.push(this.db.subscribeMany(`projects/${this.pid}/drawings`, (list) => { this.drawings = list as unknown as DrawingDoc[] }))
		return () => this.stop()
	}

	stop() {
		for (const u of this.#subs) u?.()
		for (const u of this.#rackSubs.values()) u?.()
		this.#subs = []; this.#rackSubs.clear()
	}

	// one racks-doc subscription per floor × server room (A.. up to serverRoomCount); drop the rest
	#syncRacks() {
		const want = new Set<string>()
		for (const f of normFloors(this.project?.floors)) for (const r of ['A', 'B', 'C', 'D'].slice(0, Math.max(1, Math.min(4, f.serverRoomCount ?? 1)))) want.add(racksDocId(this.pid, f.number, r))
		for (const [id, u] of this.#rackSubs) if (!want.has(id)) { u?.(); this.#rackSubs.delete(id) }
		for (const id of want) if (!this.#rackSubs.has(id)) {
			this.#rackSubs.set(id, this.db.subscribeOne('racks', id, (doc) => { this.racks = { ...this.racks, [id]: doc as unknown as RackDoc } }))
		}
	}

	/** The floor's FLOORPLAN — the calibrated PDF page the outlets tool shows for it: `selectedFileId` /
	 *  `selectedPage` on `outlets/{pid}_F{NN}` (the legacy area's doc), else on any tenant-area doc. */
	async floorplanOf(floorNumber: number): Promise<{ fileId: string; pageNum: number } | null> {
		const f = normFloors(this.project?.floors).find((x) => x.number === floorNumber)
		const base = `${this.pid}_F${String(floorNumber).padStart(2, '0')}`
		const ids = [base, ...(f?.areas ?? []).filter((a) => !a.legacy).map((a) => `${base}__${a.id}`)]
		for (const id of ids) {
			const d = (await this.db.getOne('outlets', id)) as { selectedFileId?: string; selectedPage?: number } | null
			if (d?.selectedFileId) return { fileId: d.selectedFileId, pageNum: d.selectedPage ?? 1 }
		}
		return null
	}

	/** Properties for a tree node (projectProps.ts); null until loaded / for an unknown id. */
	describe(id: string): NodeInfo | null {
		if (!this.project) return null
		return describeNode({ project: this.project as ProjectFull, racks: this.racks, risers: this.risers, drawings: this.drawings }, id)
	}
	/** Save a Properties edit. Resolves false when there's nothing to save (read-only / refused, e.g. a
	 *  building renamed to an empty or taken name). */
	async setField(id: string, key: string, value: string): Promise<boolean> {
		if (!this.project) return false
		const patch = fieldPatch({ project: this.project as ProjectFull, racks: this.racks, risers: this.risers, drawings: this.drawings }, id, key, value)
		if (!patch) return false
		await this.db.save('projects', { id: this.pid, ...patch })
		return true
	}

	/** The building names in their current tree order (saved `buildings` + the derived ones) — minus the
	 *  derived "Other building" catch-all, which is never saved as a real building. */
	buildingOrder(): string[] {
		return (this.tree?.tree ?? []).filter((n) => n.folder === 'building' && n.label !== OTHER_BUILDING).map((n) => n.label)
	}

	/** "New building": append a name to `projects.buildings` (seeded with the current order, so the existing
	 *  buildings keep their places). Returns false if the name is empty or already used. */
	async addBuilding(name: string): Promise<boolean> {
		const n = name.trim(), cur = this.buildingOrder()
		if (!n || cur.includes(n)) return false
		await this.db.save('projects', { id: this.pid, buildings: [...cur, n] })
		return true
	}

	/** Drag a building onto another: reorder `projects.buildings` (before / after the target). */
	async moveBuilding(name: string, target: string, after: boolean) {
		const cur = this.buildingOrder().filter((b) => b !== name)
		const i = cur.indexOf(target); if (i < 0) return
		cur.splice(after ? i + 1 : i, 0, name)
		await this.db.save('projects', { id: this.pid, buildings: cur })
	}

	/** Drag a floor into a building: saves `FloorConfig.building` AND makes sure the building is listed in
	 *  `projects.buildings` (so it keeps its place in the tree). */
	async moveFloor(floorNumber: number, building: string) {
		const cur = this.buildingOrder()
		if (!cur.includes(building)) await this.db.save('projects', { id: this.pid, buildings: [...cur, building] })
		else if (!this.project?.buildings?.length) await this.db.save('projects', { id: this.pid, buildings: cur })   // pin the derived order once
		await this.setFloorBuilding(floorNumber, building)
	}

	/** Set (or clear, with '') the building a floor is in — `FloorConfig.building` on the project doc.
	 *  A user edit from the floor's Properties; merges the whole `floors` array back. */
	async setFloorBuilding(floorNumber: number, building: string) {
		if (!this.project) return
		const floors = normFloors(this.project.floors).map((f) => {
			if (f.number !== floorNumber) return f
			const { building: _old, ...rest } = f
			return building.trim() ? { ...rest, building: building.trim() } : rest
		})
		await this.db.save('projects', { id: this.pid, floors })
	}
}
