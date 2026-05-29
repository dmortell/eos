<script lang="ts">
	import { Firestore } from '$lib'
	import { writeLog, type ChangeDetail } from '$lib/logger'
	import { migrateFloors } from '$lib/utils/floor'
	import type { FloorConfig } from '$lib/types/project'
	import PatchListPane from '../../patching/parts/PatchListPane.svelte'
	import { buildPortInfoMap } from '../../patching/parts/elevationUtils'
	import type { PatchConnection, CustomCableType, PortRef, PatchStatus } from '../../patching/parts/types'
	import { getWorkspace } from '../state.svelte'

	const ws = getWorkspace()
	const db = new Firestore()

	const baseId = $derived.by(() => {
		if (!ws) return null
		const m = ws.selectedNodeMeta
		if (!m?.floor || !m?.room) return null
		const fl = String(m.floor).padStart(2, '0')
		return {
			floor: m.floor,
			room: m.room,
			roomDoc: `${ws.pid}_F${fl}_R${m.room}`,
			floorDoc: `${ws.pid}_F${fl}`,
		}
	})

	let patchDoc = $state<any>(null)
	let rackDoc = $state<any>(null)
	let frameDoc = $state<any>(null)
	let floors = $state<FloorConfig[]>([])

	// ── Local connections mirror with debounced save (same echo-suppression
	//    pattern as the writable elevation / inline inspector edits) ──
	let localConnections = $state<PatchConnection[]>([])
	let suppressUntil = 0

	$effect(() => {
		const id = baseId?.roomDoc
		if (!id) {
			patchDoc = null
			return
		}
		const unsub = db.subscribeOne('patching', id, (data: any) => (patchDoc = data))
		return () => unsub?.()
	})

	$effect(() => {
		if (!patchDoc) {
			localConnections = []
			return
		}
		if (Date.now() < suppressUntil) return
		localConnections = patchDoc.connections ?? []
	})

	$effect(() => {
		const id = baseId?.roomDoc
		if (!id) { rackDoc = null; return }
		const unsub = db.subscribeOne('racks', id, (data: any) => (rackDoc = data))
		return () => unsub?.()
	})

	$effect(() => {
		const id = baseId?.floorDoc
		if (!id) { frameDoc = null; return }
		const unsub = db.subscribeOne('frames', id, (data: any) => (frameDoc = data))
		return () => unsub?.()
	})

	$effect(() => {
		if (!ws?.pid) return
		const unsub = db.subscribeOne('projects', ws.pid, (data: any) => {
			if (data?.floors?.length) floors = migrateFloors(data.floors)
		})
		return () => unsub?.()
	})

	const connections = $derived<PatchConnection[]>(localConnections)
	const customCableTypes = $derived<CustomCableType[]>(patchDoc?.customCableTypes ?? [])
	const racks = $derived(rackDoc?.racks ?? [])
	const devices = $derived(rackDoc?.devices ?? [])

	const serverRoomCount = $derived(
		baseId ? (floors.find((f) => f.number === baseId.floor)?.serverRoomCount ?? 1) : 1,
	)
	const floorFormat = $derived<string>(frameDoc?.floorFormat ?? 'L01')

	const portInfoMap = $derived(
		baseId
			? buildPortInfoMap(frameDoc, baseId.room, devices, racks, baseId.floor, serverRoomCount, floorFormat)
			: new Map(),
	)

	const rackIds = $derived(new Set<string>(racks.map((r: any) => r.id)))
	const deviceIds = $derived(new Set<string>(devices.map((d: any) => d.id)))

	function isRefOrphaned(ref: PortRef): boolean {
		if (!ref.rackId && !ref.deviceId) return false
		return (!!ref.rackId && !rackIds.has(ref.rackId)) || (!!ref.deviceId && !deviceIds.has(ref.deviceId))
	}

	const orphanedIds = $derived.by(() => {
		const ids = new Set<string>()
		for (const c of connections) {
			if (isRefOrphaned(c.fromPortRef) || isRefOrphaned(c.toPortRef)) ids.add(c.id)
		}
		return ids
	})

	const removedCount = $derived(connections.filter((c) => c.status === 'remove').length)

	// ── Write-back helpers ─────────────────────────────────────────────────

	let saveTimer: ReturnType<typeof setTimeout> | null = null
	let pendingChanges: ChangeDetail[] = []

	function scheduleSave() {
		suppressUntil = Date.now() + 1500
		if (saveTimer) clearTimeout(saveTimer)
		saveTimer = setTimeout(() => {
			const id = baseId?.roomDoc
			if (!id) return
			db.save('patching', {
				id,
				projectId: ws.pid,
				connections: localConnections,
			})
			if (pendingChanges.length) {
				writeLog(ws.pid, 'patching', 'workspace', pendingChanges)
				pendingChanges = []
			}
		}, 400)
	}

	function setStatus(ids: string[], status: PatchStatus) {
		const set = new Set(ids)
		localConnections = localConnections.map((c) =>
			set.has(c.id) ? { ...c, status, previousStatus: c.status !== status ? c.status : c.previousStatus } : c,
		)
		pendingChanges.push({ action: 'update', field: 'status', details: `${ids.length} → ${status}` })
		scheduleSave()
	}

	function softDelete(ids: string[]) {
		const set = new Set(ids)
		localConnections = localConnections.map((c) => {
			if (!set.has(c.id)) return c
			if (c.status === 'remove') return c
			return { ...c, previousStatus: c.status, status: 'remove' }
		})
		pendingChanges.push({ action: 'remove', field: 'connection', details: `${ids.length} soft-deleted` })
		scheduleSave()
	}

	function restore(ids: string[]) {
		const set = new Set(ids)
		localConnections = localConnections.map((c) => {
			if (!set.has(c.id) || c.status !== 'remove') return c
			const prev = (c.previousStatus ?? 'add') as PatchStatus
			return { ...c, status: prev, previousStatus: undefined }
		})
		pendingChanges.push({ action: 'restore', field: 'connection', details: `${ids.length} restored` })
		scheduleSave()
	}

	function purgeRemoved() {
		const before = localConnections.length
		localConnections = localConnections.filter((c) => c.status !== 'remove')
		const removed = before - localConnections.length
		if (removed > 0) {
			pendingChanges.push({ action: 'purge', field: 'connection', details: `${removed} removed permanently` })
			scheduleSave()
		}
	}

	function updateConnection(id: string, updates: Partial<PatchConnection>) {
		localConnections = localConnections.map((c) => (c.id === id ? ({ ...c, ...updates } as PatchConnection) : c))
		pendingChanges.push({ action: 'update', field: 'connection', details: id })
		scheduleSave()
	}
</script>

{#if !ws}
	<div class="p-3 text-xs text-zinc-400">Workspace context not initialised.</div>
{:else if !baseId}
	<div class="p-3 text-xs text-zinc-500">
		Select a rack, row, or server room in the navigator to see its patch list.
	</div>
{:else if !patchDoc}
	<div class="p-3 text-xs text-zinc-400">Loading patch data…</div>
{:else if connections.length === 0}
	<div class="p-3 text-xs text-zinc-500">
		No patches yet for floor {baseId.floor} room {baseId.room}.
	</div>
{:else}
	<PatchListPane
		{connections}
		{racks}
		{devices}
		{customCableTypes}
		{orphanedIds}
		selectedConnectionId={ws.selectedConnectionId}
		{removedCount}
		{portInfoMap}
		onselect={(id) => (ws.selectedConnectionId = id)}
		ontoggle={() => (ws.bottomPanelOpen = false)}
		onsetstatus={setStatus}
		ondelete={softDelete}
		onrestore={restore}
		onpurge={purgeRemoved}
		onupdate={updateConnection}
	/>
{/if}
