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
import type { PatchConnection, CustomCableType, PatchStatus, PortRef } from '../../patching/parts/types'
import { HistoryStore } from '$lib/history/HistoryStore.svelte'
import { AutoSave } from '$lib/autosave/AutoSave.svelte'
import { buildPortInfoMap, fallbackPortLabel, type PortInfo } from '$lib/elevation/portmap'
import { buildPortConnectionMap } from '../../patching/parts/elevationUtils'
import { getCableType } from '../../patching/parts/constants'
import { calculateCableLength } from '../../patching/parts/cableUtils'
import { walkCircuit, type Circuit, type TraceNode } from '$lib/elevation/trace'
import { repairLocationIds } from '$lib/elevation/portmap'
import { bootstrapLinks } from '$lib/elevation/links'

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

	// ── Circuit trace (§13 P-4): cords + structured links, walked by id ──
	/** Structured links from the frames doc, plus the same deterministic
	 *  bootstrap the Frames tab applies — so traces resolve outlet runs even
	 *  before any link edit has persisted the bootstrapped records. */
	links = $derived(bootstrapLinks(this.framesDoc?.bakedLabels, this.framesDoc?.structuredLinks, this.devices).links)
	private locationRefById = $derived.by(() => {
		const zl = repairLocationIds(this.framesDoc?.zoneLocations).zoneLocations
		const m = new Map<string, { zone: string; locationNumber: number }>()
		for (const [zone, locs] of Object.entries(zl)) {
			for (const l of locs ?? []) if (l.id) m.set(l.id, { zone, locationNumber: l.locationNumber })
		}
		return m
	})
	/** Full circuit through the selected cord (null when nothing selected or trivial). */
	circuit = $derived.by<Circuit | null>(() => {
		const conn = this.selectedConnectionId
			? this.connections.find(c => c.id === this.selectedConnectionId) : null
		const start = conn?.fromPortRef
		if (!start?.deviceId) return null
		const c = walkCircuit({ deviceId: start.deviceId, portIndex: start.portIndex }, this.activeConnections, this.links)
		return c.nodes.length > 1 ? c : null
	})
	traceNodeLabel(n: TraceNode): string {
		if (n.type === 'location') {
			const loc = this.locationRefById.get(n.locationId)
			return loc ? `${loc.zone}-${String(loc.locationNumber).padStart(3, '0')} · p${n.port}` : `${n.locationId} · p${n.port}`
		}
		return this.labelOf(n.deviceId, n.portIndex)
	}
	traceNodeContext(n: TraceNode): string {
		if (n.type === 'location') return 'location'
		const d = this.devices.find(x => x.id === n.deviceId)
		const r = d ? this.rackById.get(d.rackId) : null
		return d ? `${r?.label ?? ''} · ${d.label} · U${d.positionU}` : n.deviceId
	}

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

	// ── Patching interactions (§13 P-2) ──
	patchArm = $state<PortRef | null>(null)
	stickyCable = $state<{ type: string; status: PatchStatus }>({ type: 'uutp', status: 'add' })
	statusHint = $state<string | null>(null)

	roomOfRack(rackId: string): string | undefined {
		return (this.rackById.get(rackId) as any)?._room
	}

	labelOf(deviceId: string, portIndex: number): string {
		const info = this.portInfo.get(`${deviceId}:${portIndex}`)
		if (info) return info.label
		const d = this.devices.find(x => x.id === deviceId)
		const r = d ? this.rackById.get(d.rackId) : null
		return d ? fallbackPortLabel(r?.label ?? d.rackId, d.positionU, portIndex) : `${deviceId}:${portIndex}`
	}

	disarm() {
		this.patchArm = null
		this.statusHint = null
	}

	/** Board port click: select existing cord → arm → complete (same room only). */
	portClick(rackId: string, deviceId: string, portIndex: number) {
		// While picking bulk destinations, plain clicks append destinations too
		if (this.bulkDest) { this.bulkToggle(deviceId, portIndex); return }
		const existing = this.portConnMap.get(`${deviceId}:${portIndex}`)
		{
			const held = this.holdOf(deviceId, portIndex)
			if (held && !existing) {
				this.statusHint = `${this.labelOf(deviceId, portIndex)} is held for ${held} — Alt+click releases the hold`
				return
			}
		}
		if (!this.patchArm) {
			if (existing) {
				this.selectConnection(this.selectedConnectionId === existing.id ? null : existing.id)
				return
			}
			this.patchArm = { rackId, deviceId, portIndex, face: 'front' }
			this.statusHint = `${this.labelOf(deviceId, portIndex)} armed — click another free port to connect · Esc cancels`
			return
		}
		if (this.patchArm.deviceId === deviceId && this.patchArm.portIndex === portIndex) { this.disarm(); return }
		if (existing) { this.statusHint = 'Port already patched — pick a free port'; return }
		const roomA = this.roomOfRack(this.patchArm.rackId)
		const roomB = this.roomOfRack(rackId)
		if (!roomA || roomA !== roomB) {
			this.statusHint = 'Ports are in different rooms — cross-room circuits use structured interconnects (Frames), not patch cords'
			return
		}
		const fromRef = this.patchArm
		const toRef: PortRef = { rackId, deviceId, portIndex, face: 'front' }
		const ct = getCableType(this.stickyCable.type, this.customCableTypes)
		const len = calculateCableLength(fromRef, toRef, $state.snapshot(this.racks), $state.snapshot(this.devices))
		const conn: PatchConnection = {
			id: `patch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
			fromPortRef: fromRef,
			toPortRef: toRef,
			cableType: this.stickyCable.type,
			cableColor: ct.color,
			lengthMeters: len,
			lengthLocked: false,
			kind: 'patch',
			status: this.stickyCable.status,
		}
		this.mutateRoom(roomA, `patch ${this.labelOf(fromRef.deviceId!, fromRef.portIndex)} ↔ ${this.labelOf(deviceId, portIndex)}`,
			conns => [...conns, conn])
		this.disarm()
		this.selectConnection(conn.id)
	}

	// ── Port holds: reserve free ports (VLAN / uplink / spare) so patching
	//    can't take them by accident. Device-keyed (`deviceId:portIndex`) on the
	//    frames doc — position keys collide past 48 ports, and a hold should
	//    move with its switch. saveFields: hold releases must persist. ──
	holds = $derived<Record<string, string>>(this.framesDoc?.portHolds ?? {})
	stickyHoldLabel = $state('VLAN')

	holdOf(deviceId: string, portIndex: number): string | undefined {
		return this.holds[`${deviceId}:${portIndex}`]
	}

	/** Alt+click on a free chip: toggle a hold (undoable; writes only portHolds). */
	toggleHold(deviceId: string, portIndex: number) {
		const key = `${deviceId}:${portIndex}`
		if (this.portConnMap.has(key)) { this.statusHint = 'Port is patched — remove the cord before holding it'; return }
		const prev = { ...(this.framesDoc?.portHolds ?? {}) }
		const next = { ...prev }
		const removing = key in next
		const label = removing ? next[key] : (this.stickyHoldLabel.trim() || 'hold')
		if (removing) delete next[key]; else next[key] = label
		const apply = (holds: Record<string, string>) => {
			this.framesDoc = { ...(this.framesDoc ?? {}), portHolds: holds }
			this.db.saveFields('frames', { id: this.framesDocId(), portHolds: holds })
		}
		apply(next)
		const portLabel = this.labelOf(deviceId, portIndex)
		this.history.record({
			label: removing ? `release hold on ${portLabel}` : `hold ${portLabel} (${label})`,
			undo: () => apply(prev),
			redo: () => apply(next),
		})
		this.statusHint = removing
			? `Hold released on ${portLabel}`
			: `${portLabel} held for ${label} — Alt+click again to release`
	}

	// ── Bulk patching (§13 P-3): ordered sources → ordered destinations → preview ──
	/** Ordered SOURCE port keys (`deviceId:portIndex`), built by Ctrl+click. */
	bulkSel = $state<string[]>([])
	/** null = not picking destinations; array = ordered DEST keys being collected. */
	bulkDest = $state<string[] | null>(null)
	bulkPreviewOpen = $state(false)

	private parseKey(key: string): { deviceId: string; portIndex: number } {
		const i = key.lastIndexOf(':')
		return { deviceId: key.slice(0, i), portIndex: Number(key.slice(i + 1)) }
	}
	labelOfKey(key: string): string {
		const { deviceId, portIndex } = this.parseKey(key)
		return this.labelOf(deviceId, portIndex)
	}
	roomOfKey(key: string): string | undefined {
		const d = this.devices.find(x => x.id === this.parseKey(key).deviceId)
		return d ? this.roomOfRack(d.rackId) : undefined
	}
	private refOfKey(key: string): PortRef {
		const { deviceId, portIndex } = this.parseKey(key)
		const d = this.devices.find(x => x.id === deviceId)
		return { rackId: d?.rackId ?? '', deviceId, portIndex, face: 'front' }
	}

	/** Ctrl/⌘+click on a chip: toggle a source, or append the next destination while picking. */
	bulkToggle(deviceId: string, portIndex: number) {
		const key = `${deviceId}:${portIndex}`
		if (this.portConnMap.has(key)) { this.statusHint = 'Port already patched — bulk patch uses free ports'; return }
		{
			const held = this.holds[key]
			if (held) { this.statusHint = `${this.labelOf(deviceId, portIndex)} is held for ${held} — skipped (Alt+click releases)`; return }
		}
		if (this.bulkDest) {
			if (this.bulkSel.includes(key) || this.bulkDest.includes(key)) return
			if (this.bulkDest.length >= this.bulkSel.length) return
			this.bulkDest = [...this.bulkDest, key]
			if (this.bulkDest.length === this.bulkSel.length) {
				this.bulkPreviewOpen = true
				this.statusHint = null
			} else {
				this.statusHint = `Destination ${this.bulkDest.length + 1} of ${this.bulkSel.length}…`
			}
			return
		}
		this.patchArm = null
		this.bulkSel = this.bulkSel.includes(key) ? this.bulkSel.filter(k => k !== key) : [...this.bulkSel, key]
	}

	beginBulkDest() {
		if (this.bulkSel.length === 0) return
		this.patchArm = null
		this.bulkDest = []
		this.statusHint = `Pick ${this.bulkSel.length} destination port(s) in order — Esc cancels`
	}
	cancelBulk() {
		this.bulkSel = []
		this.bulkDest = null
		this.bulkPreviewOpen = false
		this.statusHint = null
	}

	/** Preview rows for the mapping dialog (pairs sources[i] → dests[i]). */
	bulkPairs = $derived.by(() => {
		if (!this.bulkDest) return []
		return this.bulkSel.map((src, i) => {
			const dst = this.bulkDest![i]
			const roomA = this.roomOfKey(src)
			const roomB = dst ? this.roomOfKey(dst) : undefined
			return {
				src, dst,
				srcLabel: this.labelOfKey(src),
				dstLabel: dst ? this.labelOfKey(dst) : '—',
				crossRoom: !!dst && (!roomA || roomA !== roomB),
			}
		})
	})

	createBulk() {
		if (!this.bulkDest || this.bulkDest.length !== this.bulkSel.length || this.bulkSel.length === 0) return
		const ct = getCableType(this.stickyCable.type, this.customCableTypes)
		const racksSnap = $state.snapshot(this.racks)
		const devsSnap = $state.snapshot(this.devices)
		const byRoom = new Map<string, PatchConnection[]>()
		let skipped = 0
		for (let i = 0; i < this.bulkSel.length; i++) {
			const src = this.bulkSel[i], dst = this.bulkDest[i]
			const roomA = this.roomOfKey(src), roomB = this.roomOfKey(dst)
			if (!roomA || roomA !== roomB) { skipped++; continue }
			const fromRef = this.refOfKey(src), toRef = this.refOfKey(dst)
			const conn: PatchConnection = {
				id: `patch-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
				fromPortRef: fromRef,
				toPortRef: toRef,
				cableType: this.stickyCable.type,
				cableColor: ct.color,
				lengthMeters: calculateCableLength(fromRef, toRef, racksSnap, devsSnap),
				lengthLocked: false,
				kind: 'patch',
				status: this.stickyCable.status,
			}
			if (!byRoom.has(roomA)) byRoom.set(roomA, [])
			byRoom.get(roomA)!.push(conn)
		}
		for (const [room, conns] of byRoom) {
			this.mutateRoom(room, `bulk patch ${conns.length} cord(s)`, cs => [...cs, ...conns])
		}
		this.statusHint = skipped ? `${skipped} pair(s) skipped — endpoints in different rooms` : null
		this.bulkSel = []
		this.bulkDest = null
		this.bulkPreviewOpen = false
	}

	// ── Port filter (§13 P-2): substring + type/usage chips + free-only ──
	filter = $state<{ q: string; types: string[]; freeOnly: boolean }>({ q: '', types: [], freeOnly: false })
	filterActive = $derived(!!this.filter.q.trim() || this.filter.types.length > 0 || this.filter.freeOnly)

	portMatches(deviceId: string, portIndex: number): boolean {
		const key = `${deviceId}:${portIndex}`
		const info = this.portInfo.get(key)
		const q = this.filter.q.trim().toLowerCase()
		if (q && !(info?.label?.toLowerCase().includes(q) || String(portIndex) === q)) return false
		if (this.filter.types.length && !(info && this.filter.types.includes(info.locationType))) return false
		if (this.filter.freeOnly && (this.portConnMap.has(key) || key in this.holds)) return false
		return true
	}

	toggleFilterType(t: string) {
		this.filter = {
			...this.filter,
			types: this.filter.types.includes(t) ? this.filter.types.filter(x => x !== t) : [...this.filter.types, t],
		}
	}
	clearFilter() {
		this.filter = { q: '', types: [], freeOnly: false }
		this.highlightPortKey = null
	}

	/** Enter = jump to the next matching port across the bench (boards in order, top-down). */
	highlightPortKey = $state<string | null>(null)
	jumpNext() {
		if (!this.filterActive) { this.highlightPortKey = null; return }
		const keys: string[] = []
		for (const rackId of this.bench) {
			const devs = this.devices
				.filter(d => d.rackId === rackId && (d.portCount ?? 0) > 0)
				.sort((a, b) => b.positionU - a.positionU)
			for (const d of devs) {
				for (let p = 1; p <= (d.portCount ?? 0); p++) {
					if (this.portMatches(d.id, p)) keys.push(`${d.id}:${p}`)
				}
			}
		}
		if (keys.length === 0) { this.highlightPortKey = null; return }
		const cur = this.highlightPortKey ? keys.indexOf(this.highlightPortKey) : -1
		this.highlightPortKey = keys[(cur + 1) % keys.length]
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
