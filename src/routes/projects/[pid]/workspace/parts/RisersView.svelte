<script lang="ts">
	import { page } from '$app/state'
	import { getContext, setContext } from 'svelte'
	import { Firestore, Session } from '$lib'
	import { migrateFloors } from '$lib/utils/floor'
	import { writeLog, type ChangeDetail } from '$lib/logger'
	import type { FloorConfig } from '$lib/types/project'
	import Risers from '../../risers/Risers.svelte'
	import RiserToolbar from '../../risers/parts/RiserToolbar.svelte'
	import type { RiserDocData, RiserMode } from '../../risers/parts/types'
	import { getWorkspace } from '../state.svelte'
	import { risersBridge as bridge } from '../risersBridge.svelte'

	const ws = getWorkspace()
	const db = new Firestore()
	const session = getContext('session') as Session | undefined

	let riserData = $state<RiserDocData | null>(null)
	let floors = $state<FloorConfig[]>([{ number: 1, serverRoomCount: 1 }])
	let projectName = $state('')
	let floorFormat = $state('L01')
	let loading = $state(true)

	// ── Lifted Risers toolbar state ──
	let mode = $state<RiserMode>('select')
	let fromFloor = $state(1)
	let toFloor = $state(1)
	let hiddenFloors = $state<number[]>([])
	let initFromDoc = false

	let risersRef = $state<any>(null)

	// ── Sidebar handoff to workspace right panel ──
	// Risers writes its reactive state + callback references into the
	// module-scope bridge object; RisersInspector reads from it. See
	// risersBridge.svelte.ts for the rationale (RightPanel and RisersView are
	// siblings, so Svelte context can't reach across — module-scope works.)
	$effect(() => {
		bridge.mounted = true
		return () => {
			bridge.mounted = false
		}
	})
	// Risers still uses context-based lookup so the standalone /risers route
	// stays bridge-agnostic; we provide the same object via context too.
	setContext('risers-bridge', bridge)

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

	$effect(() => {
		if (!riserData || initFromDoc) return
		fromFloor = riserData.fromFloor ?? fromFloor
		toFloor = riserData.toFloor ?? toFloor
		hiddenFloors = riserData.hiddenFloors ?? []
		initFromDoc = true
	})

	// ── Bridge wiring: floor range + project floor mgmt for RisersInspector ──
	$effect(() => {
		bridge.fromFloor = fromFloor
		bridge.toFloor = toFloor
		bridge.hiddenFloors = hiddenFloors
		bridge.floors = floors
		bridge.floorFormat = floorFormat
	})

	$effect(() => {
		bridge.setFromFloor = (n: number) => {
			fromFloor = n
		}
		bridge.setToFloor = (n: number) => {
			toFloor = n
		}
		bridge.setHiddenFloors = (arr: number[]) => {
			hiddenFloors = arr
		}
		bridge.updateFloors = (updated: FloorConfig[]) => {
			const pid = page.params.pid
			if (!pid) return
			floors = updated
			db.save('projects', { id: pid, floors: updated })
		}
		bridge.deleteFloor = (floorNumber: number) => {
			const pid = page.params.pid
			if (!pid) return
			const remaining = floors.filter((f) => f.number !== floorNumber)
			floors = remaining
			db.save('projects', { id: pid, floors: remaining })
		}
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

<div class="absolute inset-0 flex flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-900">
	{#if loading}
		<div class="flex-1 grid place-items-center text-xs text-zinc-400">
			Loading risers…
		</div>
	{:else}
		<!-- Risers toolbar lifted OUT of the canvas so the canvas SVG below is
		     drawing-clean. Floor range + Hide controls are NOT included here —
		     they live in the workspace right panel inspector. -->
		<div class="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
			<RiserToolbar
				bind:mode
				onZoomIn={() => risersRef?.zoomIn?.()}
				onZoomOut={() => risersRef?.zoomOut?.()}
				onZoomFit={() => risersRef?.zoomFit?.()}
			/>
		</div>

		<div class="flex-1 min-h-0 relative">
			<Risers
				bare
				bind:this={risersRef}
				bind:fromFloor
				bind:toFloor
				bind:mode
				bind:hiddenFloors
				data={riserData}
				{floors}
				projectId={page.params.pid ?? ''}
				{projectName}
				{floorFormat}
				{db}
				uid={session?.user?.uid ?? ''}
				onsave={save}
			/>
		</div>
	{/if}
</div>
