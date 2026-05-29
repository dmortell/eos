<script lang="ts">
	import { getContext } from 'svelte'
	import { Firestore, Session } from '$lib'
	import { migrateFloors } from '$lib/utils/floor'
	import type { FloorConfig } from '$lib/types/project'
	import Outlets from '../../outlets/Outlets.svelte'
	import { getWorkspace } from '../state.svelte'

	const ws = getWorkspace()
	const db = new Firestore()
	const session = getContext('session') as Session | undefined

	const floor = $derived<number>(ws?.selectedNodeMeta?.floor ?? 1)

	let outletsData = $state<any>(null)
	let racksData = $state<Record<string, any>>({})
	let frameData = $state<any>(null)
	let floors = $state<FloorConfig[]>([{ number: 1, serverRoomCount: 1 }])
	let files = $state<any[]>([])
	let projectName = $state('')

	const outletDocId = $derived(`${ws.pid}_F${String(floor).padStart(2, '0')}`)

	$effect(() => {
		if (!ws?.pid) return
		const unsub = db.subscribeOne('projects', ws.pid, (data: any) => {
			if (data?.name) projectName = data.name
			if (data?.floors?.length) floors = migrateFloors(data.floors)
		})
		return () => unsub?.()
	})

	$effect(() => {
		const unsub = db.subscribeOne('outlets', outletDocId, (data: any) => (outletsData = data))
		return () => unsub?.()
	})

	$effect(() => {
		const unsub = db.subscribeOne('frames', outletDocId, (data: any) => (frameData = data))
		return () => unsub?.()
	})

	$effect(() => {
		const pid = ws?.pid
		if (!pid) return
		const fl = String(floor).padStart(2, '0')
		const unsubs = ['A', 'B', 'C', 'D'].map((rm) =>
			db.subscribeOne('racks', `${pid}_F${fl}_R${rm}`, (data: any) => {
				racksData = { ...racksData, [rm]: data }
			}),
		)
		return () => unsubs.forEach((u) => u?.())
	})

	$effect(() => {
		if (!ws?.pid) return
		const unsub = db.subscribeWhere('files', 'projectId', ws.pid, (data: any[]) => (files = data))
		return () => unsub?.()
	})

	/** Layer preset derived from the active view: high outlets, low outlets, or trunks. */
	const initialLayers = $derived.by(() => {
		switch (ws.activeView) {
			case 'outlets-high':
				return { 'outlets-high': true, 'outlets-low': false, trunks: false }
			case 'outlets-low':
				return { 'outlets-high': false, 'outlets-low': true, trunks: false }
			case 'trunks':
				return { 'outlets-high': false, 'outlets-low': false, trunks: true }
			default:
				return undefined
		}
	})

	function save(payload: any) {
		db.save('outlets', { id: outletDocId, projectId: ws.pid, ...payload })
	}

	function saveRack(room: string, rackId: string, updates: any) {
		const fl = String(floor).padStart(2, '0')
		const docId = `${ws.pid}_F${fl}_R${room}`
		const rackDoc = racksData[room]
		if (!rackDoc?.racks) return
		const racks = rackDoc.racks.map((r: any) => (r.id === rackId ? { ...r, ...updates } : r))
		db.save('racks', { id: docId, racks })
	}
</script>

<div class="absolute inset-0 overflow-hidden bg-white dark:bg-zinc-900">
	{#if !outletsData && !files.length}
		<div class="absolute inset-0 grid place-items-center text-xs text-zinc-400">
			Loading floorplan…
		</div>
	{:else}
		{#key floor}
			<Outlets
				bare
				data={outletsData}
				{files}
				{floors}
				{frameData}
				{racksData}
				{floor}
				projectId={ws.pid}
				{projectName}
				{db}
				uid={session?.user?.uid ?? ''}
				{initialLayers}
				onsave={save}
				onsaverack={saveRack}
			/>
		{/key}
	{/if}
</div>
