<script lang="ts">
	import { getContext } from 'svelte'
	import { Firestore, Session } from '$lib'
	import { migrateFloors } from '$lib/utils/floor'
	import { writeLog, type ChangeDetail } from '$lib/logger'
	import type { FloorConfig } from '$lib/types/project'
	import Patching from '../../patching/Patching.svelte'
	import { getWorkspace } from '../state.svelte'

	const ws = getWorkspace()
	const db = new Firestore()
	const session = getContext('session') as Session | undefined

	const floor = $derived<number>(ws?.selectedNodeMeta?.floor ?? 1)
	const room = $derived<string>(ws?.selectedNodeMeta?.room ?? 'A')

	let patchData = $state<any>(null)
	let rackData = $state<any>(null)
	let frameData = $state<any>(null)
	let floors = $state<FloorConfig[]>([{ number: 1, serverRoomCount: 1 }])
	let projectName = $state('')
	let floorFormat = $state('L01')

	const roomDocId = $derived(`${ws.pid}_F${String(floor).padStart(2, '0')}_R${room}`)
	const floorDocId = $derived(`${ws.pid}_F${String(floor).padStart(2, '0')}`)

	$effect(() => {
		if (!ws?.pid) return
		const unsub = db.subscribeOne('projects', ws.pid, (data: any) => {
			if (data?.name) projectName = data.name
			if (data?.floors?.length) floors = migrateFloors(data.floors)
		})
		return () => unsub?.()
	})

	$effect(() => {
		const id = roomDocId
		const unsub = db.subscribeOne('patching', id, (data: any) => (patchData = data))
		return () => unsub?.()
	})
	$effect(() => {
		const id = roomDocId
		const unsub = db.subscribeOne('racks', id, (data: any) => (rackData = data))
		return () => unsub?.()
	})
	$effect(() => {
		const id = floorDocId
		const unsub = db.subscribeOne('frames', id, (data: any) => {
			frameData = data
			if (data?.floorFormat) floorFormat = data.floorFormat
		})
		return () => unsub?.()
	})

	function save(payload: any, changes: ChangeDetail[]) {
		const id = roomDocId
		if (!id) return
		db.save('patching', { id, projectId: ws.pid, ...payload })
		if (changes?.length) {
			writeLog(ws.pid, 'patching', session?.user?.uid ?? 'workspace', changes)
		}
	}
</script>

<div class="absolute inset-0 overflow-hidden bg-white dark:bg-zinc-900">
	{#if !patchData && !rackData}
		<div class="absolute inset-0 grid place-items-center text-xs text-zinc-400">
			Loading patching…
		</div>
	{:else}
		<Patching
			bare
			data={patchData}
			{rackData}
			{frameData}
			{floor}
			{room}
			{floors}
			projectId={ws.pid}
			{projectName}
			{floorFormat}
			onsave={save}
		/>
	{/if}
</div>
