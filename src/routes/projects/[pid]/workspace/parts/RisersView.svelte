<script lang="ts">
	import { page } from '$app/state'
	import { getContext } from 'svelte'
	import { Firestore, Session } from '$lib'
	import { migrateFloors } from '$lib/utils/floor'
	import { writeLog, type ChangeDetail } from '$lib/logger'
	import type { FloorConfig } from '$lib/types/project'
	import Risers from '../../risers/Risers.svelte'
	import type { RiserDocData } from '../../risers/parts/types'
	import { getWorkspace } from '../state.svelte'

	const ws = getWorkspace()
	const db = new Firestore()
	const session = getContext('session') as Session | undefined

	let riserData = $state<RiserDocData | null>(null)
	let floors = $state<FloorConfig[]>([{ number: 1, serverRoomCount: 1 }])
	let projectName = $state('')
	let floorFormat = $state('L01')
	let loading = $state(true)

	$effect(() => {
		const pid = page.params.pid
		if (!pid) return
		const u = db.subscribeOne('projects', pid, (data: any) => {
			if (data?.name) projectName = data.name
			if (data?.floors?.length) floors = migrateFloors(data.floors)
		})
		return () => u?.()
	})

	$effect(() => {
		const pid = page.params.pid
		if (!pid) return
		loading = true
		const u = db.subscribeOne('risers', pid, (data: any) => {
			riserData = (data as RiserDocData) ?? null
			loading = false
		})
		return () => u?.()
	})

	$effect(() => {
		const pid = page.params.pid
		if (!pid) return
		const u = db.subscribeOne('frames', `${pid}_F01`, (data: any) => {
			if (data?.floorFormat) floorFormat = data.floorFormat
		})
		return () => u?.()
	})

	function save(payload: Partial<RiserDocData>, changes: ChangeDetail[]) {
		const pid = page.params.pid
		if (!pid) return
		db.save('risers', { id: pid, projectId: pid, ...payload })
		if (changes?.length) {
			const uid = session?.user?.uid ?? 'unknown'
			writeLog(pid, 'risers', uid, changes)
		}
	}
</script>

<div class="absolute inset-0 overflow-hidden bg-zinc-50 dark:bg-zinc-900">
	{#if loading}
		<div class="absolute inset-0 grid place-items-center text-xs text-zinc-400">
			Loading risers…
		</div>
	{:else}
		<Risers
			bare
			data={riserData}
			{floors}
			projectId={page.params.pid ?? ''}
			{projectName}
			{floorFormat}
			{db}
			uid={session?.user?.uid ?? ''}
			onsave={save}
		/>
	{/if}
</div>
