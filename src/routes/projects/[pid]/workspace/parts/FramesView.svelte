<script lang="ts">
	import { page } from '$app/state'
	import { getContext } from 'svelte'
	import { Firestore, Session } from '$lib'
	import { migrateFloors } from '$lib/utils/floor'
	import { writeLog, type ChangeDetail } from '$lib/logger'
	import type { FloorConfig } from '$lib/types/project'
	import Frames from '../../frames/Frames.svelte'
	import { getWorkspace } from '../state.svelte'

	const ws = getWorkspace()
	const db = new Firestore()
	const session = getContext('session') as Session | undefined

	const floor = $derived<number>(ws?.selectedNodeMeta?.floor ?? 1)
	const initialFrameId = $derived<string | undefined>(ws?.selectedNodeMeta?.rackId ?? undefined)

	let frameData = $state<any>(null)
	let racksData = $state<Record<string, any>>({})
	let floors = $state<FloorConfig[]>([{ number: 1, serverRoomCount: 1 }])
	let projectName = $state('')

	const docId = $derived(`${ws.pid}_F${String(floor).padStart(2, '0')}`)

	$effect(() => {
		if (!ws?.pid) return
		const unsub = db.subscribeOne('projects', ws.pid, (data: any) => {
			if (data?.name) projectName = data.name
			if (data?.floors?.length) floors = migrateFloors(data.floors)
		})
		return () => unsub?.()
	})

	$effect(() => {
		const id = docId
		if (!id) return
		const unsub = db.subscribeOne('frames', id, (data: any) => (frameData = data))
		return () => unsub?.()
	})

	// Subscribe to all 4 possible server rooms on the floor — Frames derives its
	// physical rack/panel layout from the racks docs.
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

	function save(payload: any, changes: ChangeDetail[]) {
		const id = docId
		if (!id) return
		db.save('frames', { id, projectId: ws.pid, ...payload })
		if (changes?.length) {
			writeLog(ws.pid, 'frames', session?.user?.uid ?? 'workspace', changes)
		}
	}
</script>

<div class="absolute inset-0 overflow-hidden bg-white dark:bg-zinc-900">
	{#if !frameData && !Object.keys(racksData).length}
		<div class="absolute inset-0 grid place-items-center text-xs text-zinc-400">
			Loading frames…
		</div>
	{:else}
		<Frames
			bare
			data={frameData}
			{racksData}
			{floor}
			{floors}
			projectId={ws.pid}
			{projectName}
			{initialFrameId}
			{db}
			uid={session?.user?.uid ?? ''}
			onsave={save}
		/>
	{/if}
</div>
