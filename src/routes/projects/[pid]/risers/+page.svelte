<script lang="ts">
	import { page } from '$app/state'
	import { replaceState } from '$app/navigation'
	import { getContext, untrack } from 'svelte'
	import { Firestore, Spinner, Session } from '$lib'
	import { writeLog } from '$lib/logger'
	import type { ChangeDetail } from '$lib/logger'
	import type { FloorConfig } from '$lib/types/project'
	import { migrateFloors, updateFloors as _updateFloors, deleteFloor as _deleteFloor, updateBuildingFloors as _updateBuildingFloors, updateSkippedFloors as _updateSkippedFloors } from '$lib/utils/floor'
	import { findOrCreateDrawing } from '$lib/versioning/service'
	import Risers from './Risers.svelte'
	import type { RiserDocData } from './parts/types'

	let db = new Firestore()
	let session = getContext('session') as Session
	let riserData: RiserDocData | null = $state(null)
	let floors = $state<FloorConfig[]>([{ number: 1, serverRoomCount: 1 }])
	let buildingFloors = $state<{ bottom: number; top: number } | undefined>(undefined)
	let skippedFloors = $state<number[]>([])
	let loading = $state(true)
	let projectName = $state('')
	let floorFormat = $state('L01')
	let drawingId = $state('')

	// ── Multiple riser drawings per project ──────────────────────────────────
	// Riser content lives in the flat top-level `risers` collection, one doc per
	// drawing, each tagged with `projectId`. The legacy doc keeps id === pid so
	// existing projects keep working with no migration; it becomes the default
	// drawing. The active drawing id is mirrored in the URL (?d=) so it's
	// shareable and survives reload; absent param → the default (pid).
	let drawings = $state<{ id: string; name?: string }[]>([])
	const pidParam = $derived(page.params.pid ?? '')
	// `activeId` is real state (not a pure URL-derived) so a click switches the
	// drawing immediately: replaceState updates the address bar but does NOT
	// reliably re-run a $derived(page.url…), which left selection stuck. We still
	// mirror it to the URL for shareability and follow the URL on load /
	// back-forward via the effect below.
	let activeId = $state('')
	$effect(() => {
		const fromUrl = page.url.searchParams.get('d') || pidParam
		untrack(() => { if (fromUrl && fromUrl !== activeId) activeId = fromUrl })
	})
	// Always surface at least the default entry, even before its doc exists.
	const drawingList = $derived(
		drawings.length ? drawings : pidParam ? [{ id: pidParam, name: projectName || 'Riser 1' }] : [],
	)

	// Subscribe to the project doc — supplies the floor list and project name.
	$effect(() => {
		const pid = page.params.pid
		if (!pid) return
		const unsub = db.subscribeOne('projects', pid, (data: Record<string, any>) => {
			if (data?.name) projectName = data.name
			if (Array.isArray(data?.floors) && data.floors.length) floors = migrateFloors(data.floors)
			buildingFloors = data?.buildingFloors ?? undefined
			skippedFloors = Array.isArray(data?.skippedFloors) ? data.skippedFloors : []
		})
		return () => { unsub?.() }
	})

	// Subscribe to the list of riser drawings for this project.
	$effect(() => {
		const pid = page.params.pid
		if (!pid) return
		const unsub = db.subscribeWhere('risers', 'projectId', pid, (docs: Record<string, any>[]) => {
			drawings = docs
				.map((d) => ({ id: d.id as string, name: d.name as string | undefined }))
				.sort((a, b) => (a.id === pid ? -1 : b.id === pid ? 1 : (a.name ?? '').localeCompare(b.name ?? '')))
		})
		return () => { unsub?.() }
	})

	// Subscribe to the active riser drawing's content. `loading` gates only the
	// FIRST load — switching drawings keeps <Risers> mounted (no spinner flicker);
	// the new doc flows in via the `data` prop and the editor re-seeds.
	$effect(() => {
		const id = activeId
		if (!id) return
		const unsub = db.subscribeOne('risers', id, (data: Record<string, any> | null) => {
			riserData = (data as RiserDocData) ?? null
			loading = false
		})
		return () => { unsub?.() }
	})

	function selectDrawing(id: string) {
		if (id === activeId) return
		activeId = id
		replaceState(`?d=${encodeURIComponent(id)}`, page.state ?? {})
	}

	function newDrawing() {
		const pid = page.params.pid
		if (!pid) return
		const id = crypto.randomUUID().slice(0, 12)
		const n = drawingList.length + 1
		const nums = floors.map((f) => f.number)
		const from = nums.length ? Math.min(...nums) : 1
		const to = nums.length ? Math.max(...nums) : 1
		db.save('risers', { id, projectId: pid, name: `Riser ${n}`, fromFloor: from, toFloor: to })
		selectDrawing(id)
	}

	function renameDrawing(id: string, name: string) {
		const pid = page.params.pid
		if (!pid) return
		// Ensure projectId is set so a freshly-named default doc appears in the list.
		db.save('risers', { id, projectId: pid, name })
	}

	async function deleteDrawing(id: string) {
		if (drawingList.length <= 1) return
		if (id === activeId) {
			const other = drawingList.find((d) => d.id !== id)
			if (other) selectDrawing(other.id)
		}
		await db.delete('risers', id)
	}

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
		if (!pid || !activeId) return
		// Persist to the ACTIVE drawing's doc (merge keeps its `name`/`projectId`).
		db.save('risers', { id: activeId, projectId: pid, ...payload })
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

	function updateBuilding(ext: { bottom: number; top: number }) {
		const pid = page.params.pid
		if (!pid) return
		buildingFloors = ext
		_updateBuildingFloors(db, pid, ext)
	}

	function updateSkipped(skipped: number[]) {
		const pid = page.params.pid
		if (!pid) return
		skippedFloors = skipped
		_updateSkippedFloors(db, pid, skipped)
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
		{buildingFloors}
		{skippedFloors}
		projectId={page.params.pid}
		{projectName}
		{floorFormat}
		{drawingId}
		{db}
		uid={session.user?.uid ?? ''}
		drawings={drawingList}
		activeDrawingId={activeId}
		onSelectDrawing={selectDrawing}
		onNewDrawing={newDrawing}
		onRenameDrawing={renameDrawing}
		onDeleteDrawing={deleteDrawing}
		onsave={save}
		onupdatefloors={updateFloors}
		onupdatebuilding={updateBuilding}
		onupdateskipped={updateSkipped}
		ondeletefloor={deleteFloor}
	/>
{/if}
