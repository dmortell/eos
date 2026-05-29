<script lang="ts">
	import { Firestore } from '$lib'
	import PatchListPane from '../../patching/parts/PatchListPane.svelte'
	import type { PatchConnection, CustomCableType, PortRef } from '../../patching/parts/types'
	import { getWorkspace } from '../state.svelte'

	const ws = getWorkspace()
	const db = new Firestore()

	/** Doc ids derived from the workspace selection. Patching, racks, and frames
	 *  are all floor+room scoped (frames is just floor); when no floor/room is
	 *  selected, the patch list shows an empty-state message. */
	const baseId = $derived.by(() => {
		if (!ws) return null
		const m = ws.selectedNodeMeta
		if (!m?.floor || !m?.room) return null
		const fl = String(m.floor).padStart(2, '0')
		return { floor: m.floor, room: m.room, racks: `${ws.pid}_F${fl}_R${m.room}` }
	})

	let patchDoc = $state<any>(null)
	let rackDoc = $state<any>(null)

	$effect(() => {
		const id = baseId?.racks
		if (!id) {
			patchDoc = null
			return
		}
		const unsub = db.subscribeOne('patching', id, (data: any) => {
			patchDoc = data
		})
		return () => unsub?.()
	})

	$effect(() => {
		const id = baseId?.racks
		if (!id) {
			rackDoc = null
			return
		}
		const unsub = db.subscribeOne('racks', id, (data: any) => {
			rackDoc = data
		})
		return () => unsub?.()
	})

	const connections = $derived<PatchConnection[]>(patchDoc?.connections ?? [])
	const customCableTypes = $derived<CustomCableType[]>(patchDoc?.customCableTypes ?? [])
	const racks = $derived(rackDoc?.racks ?? [])
	const devices = $derived(rackDoc?.devices ?? [])

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

	let selectedConnectionId = $state<string | null>(null)
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
		{selectedConnectionId}
		{removedCount}
		onselect={(id) => (selectedConnectionId = id)}
		ontoggle={() => (ws.bottomPanelOpen = false)}
	/>
{/if}
