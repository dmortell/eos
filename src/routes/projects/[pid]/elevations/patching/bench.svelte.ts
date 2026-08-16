/**
 * Patch-bench editor (elevations-plan.md §13, P-1).
 *
 * Lean multi-room state for the Patching editor: subscribes every server
 * room's racks + patching docs on the active floor plus the floor's frames
 * doc, merges them into bench-wide deriveds (labels via the shared portmap
 * pipeline), and owns the bench (an ordered set of rack ids) plus the
 * connection mutations the patch list needs. Rendering is boards, not a
 * canvas — no view/zoom state here.
 */
import type { Firestore } from '$lib/db.svelte'
import type { PatchConnection, CustomCableType, PatchStatus } from '../../patching/parts/types'
import { HistoryStore } from '$lib/history/HistoryStore.svelte'
import { AutoSave } from '$lib/autosave/AutoSave.svelte'
import { buildPortInfoMap, type PortInfo } from '$lib/elevation/portmap'
import { buildPortConnectionMap } from '../../patching/parts/elevationUtils'

export const ROOMS = ['A', 'B', 'C', 'D'] as const

export class BenchEditor {
	pid = ''
	floor = $state(1)
	floorFormat = $state('L01')

	/** Per-room racks-doc data (racks + devices). Only rooms that exist. */
	roomData = $state<Record<string, { racks: any[]; devices: any[] }>>({})
	/** Per-room raw patching docs. */
	patchDocs = $state<Record<string, { connections?: PatchConnection[]; customCableTypes?: CustomCableType[] }>>({})
	framesDoc = $state<any>(null)

	/** Bench: ordered rack ids shown as boards. */
	bench = $state<string[]>([])
	selectedConnectionId = $state<string | null>(null)
	/** Device to highlight/scroll to after adding from the tree. */
	highlightDeviceId = $state<string | null>(null)

	readonly history = new HistoryStore()
	private autosaves = new Map<string, AutoSave>()

	constructor(private db: Firestore) {}

	// ── Doc ids ──
	roomDocId(room: string): string {
		return `${this.pid}_F${String(this.floor).padStart(2, '0')}_R${room}`
	}
	framesDocId(): string {
		return `${this.pid}_F${String(this.floor).padStart(2, '0')}`
	}

	// ── Sync (called from the page's subscriptions) ──
	syncRoom(room: string, doc: any) {
		if (!doc?.racks?.length && !doc?.devices?.length) {
			const { [room]: _drop, ...rest } = this.roomData
			this.roomData = rest
			return
		}
		this.roomData = { ...this.roomData, [room]: { racks: doc.racks ?? [], devices: doc.devices ?? [] } }
	}

	syncPatch(room: string, doc: any) {
		const comparable = {
			connections: doc?.connections ?? [],
			customCableTypes: doc?.customCableTypes ?? [],
		}
		if (!this.autosaveFor(room).shouldApplyRemote(comparable)) return
		this.patchDocs = { ...this.patchDocs, [room]: comparable }
	}

	syncFrames(doc: any) {
		this.framesDoc = doc ?? null
	}

	private autosaveFor(room: string): AutoSave {
		let a = this.autosaves.get(room)
		if (!a) {
			a = new AutoSave((payload: any) => {
				// merge:true — settings and other patching-doc fields stay intact
				this.db.save('patching', { id: this.roomDocId(room), ...payload })
			})
			this.autosaves.set(room, a)
		}
		return a
	}

	/** Aggregate save status for the titlebar. */
	get saveStatus(): string {
		for (const a of this.autosaves.values()) if (a.status !== 'saved') return 'Unsaved'
		return 'Saved'
	}

	// ── Merged deriveds ──
	rooms = $derived(Object.keys(this.roomData).sort())
	racks = $derived(Object.entries(this.roomData).flatMap(([room, d]) =>
		(d.racks ?? []).map(r => ({ ...r, _room: room }))))
	devices = $derived(Object.values(this.roomData).flatMap(d => d.devices ?? []))
	rackById = $derived(new Map(this.racks.map(r => [r.id, r])))

	connections = $derived(Object.values(this.patchDocs).flatMap(d => d.connections ?? []))
	customCableTypes = $derived.by(() => {
		const seen = new Map<string, CustomCableType>()
		for (const d of Object.values(this.patchDocs)) {
			for (const t of d.customCableTypes ?? []) if (!seen.has(t.id)) seen.set(t.id, t)
		}
		return [...seen.values()]
	})
	/** connection id → room letter (mutations route to the owning room's doc). */
	private roomByConnId = $derived.by(() => {
		const m = new Map<string, string>()
		for (const [room, d] of Object.entries(this.patchDocs)) {
			for (const c of d.connections ?? []) m.set(c.id, room)
		}
		return m
	})

	/** Canonical labels for every room's devices, merged (device ids are unique). */
	portInfo = $derived.by(() => {
		const merged = new Map<string, PortInfo>()
		for (const [room, d] of Object.entries(this.roomData)) {
			const map = buildPortInfoMap(this.framesDoc, room, d.devices ?? [], d.racks ?? [], this.floor, undefined, this.floorFormat)
			for (const [k, v] of map) merged.set(k, v)
		}
		// Free-form per-device overrides win (same rule as the elevations editor)
		for (const d of this.devices) {
			if (!d.portLabels) continue
			for (const [idx, label] of Object.entries(d.portLabels)) {
				if (!label) continue
				const key = `${d.id}:${idx}`
				merged.set(key, { label: label as string, locationType: merged.get(key)?.locationType ?? 'N/A', override: true })
			}
		}
		return merged
	})

	activeConnections = $derived(this.connections.filter(c => c.status !== 'remove'))
	removedCount = $derived(this.connections.filter(c => c.status === 'remove').length)
	portConnMap = $derived(buildPortConnectionMap(this.activeConnections))
	orphanedIds = $derived.by(() => {
		const rackIds = new Set(this.racks.map(r => r.id))
		const deviceIds = new Set(this.devices.map(d => d.id))
		const orphaned = (ref: any) => (!!ref?.rackId && !rackIds.has(ref.rackId)) || (!!ref?.deviceId && !deviceIds.has(ref.deviceId))
		return new Set(this.connections.filter(c => orphaned(c.fromPortRef) || orphaned(c.toPortRef)).map(c => c.id))
	})

	// ── Bench (persisted per pid+floor) ──
	private benchKey(): string {
		return `patchbench:${this.pid}:F${this.floor}`
	}
	loadBench() {
		try {
			const raw = localStorage.getItem(this.benchKey())
			this.bench = raw ? JSON.parse(raw) : []
		} catch { this.bench = [] }
	}
	private persistBench() {
		try { localStorage.setItem(this.benchKey(), JSON.stringify($state.snapshot(this.bench))) } catch {}
	}
	addToBench(rackId: string) {
		if (!this.bench.includes(rackId)) {
			this.bench = [...this.bench, rackId]
			this.persistBench()
		}
	}
	removeFromBench(rackId: string) {
		this.bench = this.bench.filter(id => id !== rackId)
		this.persistBench()
	}
	moveBench(rackId: string, dir: -1 | 1) {
		const i = this.bench.indexOf(rackId)
		const j = i + dir
		if (i < 0 || j < 0 || j >= this.bench.length) return
		const next = [...this.bench]
		;[next[i], next[j]] = [next[j], next[i]]
		this.bench = next
		this.persistBench()
	}
	/** Add a device's rack and flag the device for highlight/scroll. */
	showDevice(device: { id: string; rackId: string }) {
		this.addToBench(device.rackId)
		this.highlightDeviceId = device.id
	}

	// ── Connection mutations (routed to the owning room's doc, undoable) ──
	selectConnection(id: string | null) {
		this.selectedConnectionId = id
	}

	private mutateRoom(room: string, label: string, fn: (conns: PatchConnection[]) => PatchConnection[]) {
		const before = $state.snapshot(this.patchDocs[room]?.connections ?? []) as PatchConnection[]
		const after = fn(before.map(c => ({ ...c })))
		const apply = (conns: PatchConnection[]) => {
			this.patchDocs = { ...this.patchDocs, [room]: { ...this.patchDocs[room], connections: conns } }
			this.autosaveFor(room).schedule(() => ({
				connections: $state.snapshot(this.patchDocs[room]?.connections ?? []),
				customCableTypes: $state.snapshot(this.patchDocs[room]?.customCableTypes ?? []),
			}))
		}
		apply(after)
		this.history.record({ label, undo: () => apply(before), redo: () => apply(after) })
	}

	/** Group ids by owning room and run one undoable mutation per room. */
	private mutateByIds(ids: string[], label: string, fn: (c: PatchConnection) => PatchConnection | null) {
		const byRoom = new Map<string, Set<string>>()
		for (const id of ids) {
			const room = this.roomByConnId.get(id)
			if (!room) continue
			if (!byRoom.has(room)) byRoom.set(room, new Set())
			byRoom.get(room)!.add(id)
		}
		for (const [room, idSet] of byRoom) {
			this.mutateRoom(room, label, conns =>
				conns.map(c => idSet.has(c.id) ? (fn(c) ?? c) : c).filter((c): c is PatchConnection => c !== null))
		}
	}

	setConnectionStatus(ids: string[], status: PatchStatus) {
		this.mutateByIds(ids, `status → ${status}`, c => ({ ...c, status }))
	}
	updateConnection(id: string, updates: Partial<PatchConnection>) {
		this.mutateByIds([id], 'update cord', c => ({ ...c, ...updates }))
	}
	/** Soft delete: target-state remove for installed cords, hard remove otherwise (same rule as elevations). */
	deleteConnections(ids: string[]) {
		const byId = new Map(this.connections.map(c => [c.id, c]))
		const soft = ids.filter(id => byId.get(id)?.status === 'installed' || byId.get(id)?.status === 'change')
		const hard = new Set(ids.filter(id => !soft.includes(id)))
		if (soft.length) this.mutateByIds(soft, 'remove cord(s)', c => ({ ...c, status: 'remove' }))
		if (hard.size) {
			// hard-remove per room
			const byRoom = new Map<string, Set<string>>()
			for (const id of hard) {
				const room = this.roomByConnId.get(id)
				if (!room) continue
				if (!byRoom.has(room)) byRoom.set(room, new Set())
				byRoom.get(room)!.add(id)
			}
			for (const [room, idSet] of byRoom) {
				this.mutateRoom(room, 'delete cord(s)', conns => conns.filter(c => !idSet.has(c.id)))
			}
		}
		if (this.selectedConnectionId && ids.includes(this.selectedConnectionId)) this.selectedConnectionId = null
	}
	restoreConnections(ids: string[]) {
		this.mutateByIds(ids, 'restore cord(s)', c => ({ ...c, status: 'installed' }))
	}
	purgeRemoved() {
		for (const room of Object.keys(this.patchDocs)) {
			if ((this.patchDocs[room]?.connections ?? []).some(c => c.status === 'remove')) {
				this.mutateRoom(room, 'purge removed', conns => conns.filter(c => c.status !== 'remove'))
			}
		}
	}
}
