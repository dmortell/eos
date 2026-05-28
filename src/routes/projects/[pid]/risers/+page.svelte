<script lang="ts">
	import { page } from '$app/state'
	import { getContext } from 'svelte'
	import { Firestore, Spinner, Session } from '$lib'
	import { writeLog } from '$lib/logger'
	import type { ChangeDetail } from '$lib/logger'
	import type { FloorConfig } from '$lib/types/project'
	import { migrateFloors, updateFloors as _updateFloors, deleteFloor as _deleteFloor } from '$lib/utils/floor'
	import { findOrCreateDrawing } from '$lib/versioning/service'
	import Risers from './Risers.svelte'
	import type { RiserDocData } from './parts/types'

	let db = new Firestore()
	let session = getContext('session') as Session
	let riserData: RiserDocData | null = $state(null)
	let floors = $state<FloorConfig[]>([{ number: 1, serverRoomCount: 1 }])
	let loading = $state(true)
	let projectName = $state('')
	let floorFormat = $state('L01')
	let drawingId = $state('')

	// Subscribe to the project doc — supplies the floor list and project name.
	$effect(() => {
		const pid = page.params.pid
		if (!pid) return
		const unsub = db.subscribeOne('projects', pid, (data: Record<string, any>) => {
			if (data?.name) projectName = data.name
			if (Array.isArray(data?.floors) && data.floors.length) floors = migrateFloors(data.floors)
		})
		return () => { unsub?.() }
	})

	// Subscribe to the riser doc (one per project).
	$effect(() => {
		const pid = page.params.pid
		if (!pid) return
		loading = true
		const unsub = db.subscribeOne('risers', pid, (data: Record<string, any> | null) => {
			riserData = (data as RiserDocData) ?? null
			loading = false
		})
		return () => { unsub?.() }
	})

	// Use floor 1's frames doc (if any) for the floorFormat preference — keeps
	// labelling consistent across tools.
	$effect(() => {
		const pid = page.params.pid
		if (!pid) return
		const unsub = db.subscribeOne('frames', `${pid}_F01`, (data: Record<string, any>) => {
			if (data?.floorFormat) floorFormat = data.floorFormat
		})
		return () => { unsub?.() }
	})

	// Resolve drawing ID for versioning.
	$effect(() => {
		const pid = page.params.pid
		const uid = session?.user?.uid
		if (!pid || !uid) return
		findOrCreateDrawing(db, {
			projectId: pid,
			toolType: 'risers',
			sourceDocId: pid,
			title: `Riser Diagram — ${projectName || pid}`,
			uid,
		}).then((id) => { drawingId = id })
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

	function updateFloors(updated: FloorConfig[]) {
		const pid = page.params.pid
		if (!pid) return
		floors = updated
		_updateFloors(db, pid, updated, updated[0]?.number ?? 1)
	}

	async function deleteFloor(fl: number) {
		const pid = page.params.pid
		if (!pid) return
		const result = await _deleteFloor(db, pid, fl, floors, fl)
		floors = result.floors
	}
</script>

{#if loading}
	<div class="flex items-center justify-center h-screen">
		<Spinner>Loading risers...</Spinner>
	</div>
{:else}
	<Risers
		data={riserData}
		{floors}
		projectId={page.params.pid}
		{projectName}
		{floorFormat}
		{drawingId}
		{db}
		uid={session.user?.uid ?? ''}
		onsave={save}
		onupdatefloors={updateFloors}
		ondeletefloor={deleteFloor}
	/>
{/if}
