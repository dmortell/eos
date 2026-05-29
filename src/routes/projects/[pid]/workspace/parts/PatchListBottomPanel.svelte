<script lang="ts">
	import { Firestore } from '$lib'
	import { migrateFloors } from '$lib/utils/floor'
	import type { FloorConfig } from '$lib/types/project'
	import PatchListPane from '../../patching/parts/PatchListPane.svelte'
	import { buildPortInfoMap } from '../../patching/parts/elevationUtils'
	import type { PatchConnection, CustomCableType, PortRef } from '../../patching/parts/types'
	import { getWorkspace } from '../state.svelte'

	const ws = getWorkspace()
	const db = new Firestore()

	/** Doc ids derived from the workspace selection. Patching + racks are
	 *  floor+room scoped; the frames doc is floor-scoped. */
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

	$effect(() => {
		const id = baseId?.roomDoc
		if (!id) { patchDoc = null; return }
		const unsub = db.subscribeOne('patching', id, (data: any) => (patchDoc = data))
		return () => unsub?.()
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

	const connections = $derived<PatchConnection[]>(patchDoc?.connections ?? [])
	const customCableTypes = $derived<CustomCableType[]>(patchDoc?.customCableTypes ?? [])
	const racks = $derived(rackDoc?.racks ?? [])
	const devices = $derived(rackDoc?.devices ?? [])

	const serverRoomCount = $derived(
		baseId ? (floors.find((f) => f.number === baseId.floor)?.serverRoomCount ?? 1) : 1,
	)
	const floorFormat = $derived<string>(frameDoc?.floorFormat ?? 'L01')

	/** Canonical Frames-label resolver. Mirrors the standalone Patching tool so
	 *  the bottom-panel patch list shows the same identifiers as the printed
	 *  panel stickers. Falls back to rack/U/port when frame data is missing. */
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
	/>
{/if}
