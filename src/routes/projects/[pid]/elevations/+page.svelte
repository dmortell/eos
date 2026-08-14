<script lang="ts">
	import { page } from '$app/state'
	import { replaceState } from '$app/navigation'
	import { getContext } from 'svelte'
	import { Firestore, Spinner, Session } from '$lib'
	import { writeLog } from '$lib/logger'
	import { migrateFloors, updateFloors as _updateFloors, deleteFloor as _deleteFloor } from '$lib/utils/floor'
	import type { DeviceTemplate } from '../racks/parts/types'
	import { findOrCreateDrawing } from '$lib/versioning/service'
	import Elevations from './Elevations.svelte'

	let db = new Firestore()
	let session = getContext('session') as Session
	let rackData: any = $state(null)
	let library: DeviceTemplate[] = $state([])
	let floors = $state([{ number: 1, serverRoomCount: 1 }])
	let loading = $state(true)
	let activeFloor = $state(Number(page.url.searchParams.get('floor')) || 1)
	let activeRoom = $state(page.url.searchParams.get('room') ?? 'A')
	/** ?frame= deep link (frame.id === rack.id): focus that rack on load. */
	const initialFocusRackId = page.url.searchParams.get('frame') ?? undefined
	let floorFormat = $state('L01')
	let projectName = $state('')
	let drawingId = $state('')

	/** Firestore doc ID for a given floor + room */
	function docId(floor = activeFloor, room = activeRoom) {
		return `${page.params.pid}_F${String(floor).padStart(2, '0')}_R${room}`
	}

	// Project doc → name + shared floors list
	$effect(() => {
		const pid = page.params.pid
		if (!pid) return
		const unsub = db.subscribeOne('projects', pid, (data: Record<string, any>) => {
			if (data?.name) projectName = data.name
			if (data?.floors?.length) {
				floors = migrateFloors(data.floors)
				if (!floors.find(f => f.number === activeFloor)) {
					activeFloor = floors[0].number
				}
			}
		})
		return () => { unsub?.() }
	})

	// Active floor+room racks document — the same doc the Racks tool edits, so
	// both tools stay interoperable during the transition.
	$effect(() => {
		const pid = page.params.pid
		const fl = activeFloor
		const rm = activeRoom
		if (!pid) return
		const id = docId(fl, rm)
		loading = true
		const unsub = db.subscribeOne('racks', id, (data: any) => {
			rackData = data
			loading = false
		})
		return () => { unsub?.() }
	})

	// Frames doc → port labels, locations, floorFormat
	let framesData: any = $state(null)
	function framesDocId(fl = activeFloor) {
		return `${page.params.pid}_F${String(fl).padStart(2, '0')}`
	}
	$effect(() => {
		const pid = page.params.pid
		const fl = activeFloor
		if (!pid) return
		const unsub = db.subscribeOne('frames', framesDocId(fl), (data: Record<string, any>) => {
			framesData = data
			if (data?.floorFormat) floorFormat = data.floorFormat
		})
		return () => { unsub?.() }
	})

	// Patching doc for the active floor+room (same doc the Patching tool edits)
	let patchingData: any = $state(null)
	$effect(() => {
		const pid = page.params.pid
		const fl = activeFloor
		const rm = activeRoom
		if (!pid) return
		const unsub = db.subscribeOne('patching', docId(fl, rm), (data: any) => {
			patchingData = data
		})
		return () => { unsub?.() }
	})

	// Project-level device library (shared with the Racks tool)
	$effect(() => {
		const pid = page.params.pid
		if (!pid) return
		const unsub = db.subscribeOne('racks', `${pid}_library`, (data: Record<string, any>) => {
			library = data?.templates ?? []
		})
		return () => { unsub?.() }
	})

	// Versioning — same toolType/sourceDocId as the Racks tool so version
	// history is shared between the two during the transition.
	$effect(() => {
		const pid = page.params.pid
		const fl = activeFloor
		const rm = activeRoom
		const uid = session?.user?.uid
		if (!pid || !uid) return
		findOrCreateDrawing(db, {
			projectId: pid,
			toolType: 'racks',
			sourceDocId: docId(fl, rm),
			title: `Rack Elevations ${fl}F Room ${rm}`,
			uid,
		}).then(id => { drawingId = id })
	})

	// Sync floor/room to URL so tool-menu links carry context across tools
	$effect(() => {
		const url = new URL(window.location.href)
		url.searchParams.set('floor', String(activeFloor))
		url.searchParams.set('room', activeRoom)
		replaceState(url, page.state)
	})

	function changeFloor(newFloor: number) {
		if (newFloor === activeFloor) return
		activeFloor = newFloor
		const floorCfg = floors.find(f => f.number === newFloor)
		const available = ['A', 'B', 'C', 'D'].slice(0, floorCfg?.serverRoomCount ?? 1)
		if (!available.includes(activeRoom)) activeRoom = available[0]
	}

	function changeRoom(newRoom: string) {
		if (newRoom === activeRoom) return
		activeRoom = newRoom
	}

	function updateFloors(updated: import('$lib/types/project').FloorConfig[]) {
		const pid = page.params.pid
		if (!pid) return
		floors = updated
		activeFloor = _updateFloors(db, pid, updated, activeFloor)
	}

	async function deleteFloor(fl: number) {
		const pid = page.params.pid
		if (!pid) return
		const result = await _deleteFloor(db, pid, fl, floors, activeFloor)
		floors = result.floors
		activeFloor = result.activeFloor
	}

	function save(payload: any, changes: import('$lib/logger').ChangeDetail[]) {
		const pid = page.params.pid
		if (!pid) return
		db.save('racks', { id: docId(), ...payload, floor: activeFloor, room: activeRoom })

		if (!floors.find(f => f.number === activeFloor)) {
			floors = [...floors, { number: activeFloor, serverRoomCount: 1 }].sort((a, b) => a.number - b.number)
			db.save('projects', { id: pid, floors })
		}

		if (changes?.length) {
			const uid = session?.user?.uid ?? 'unknown'
			writeLog(pid, 'racks', uid, changes, { floor: activeFloor, room: activeRoom })
		}
	}

	function saveLibrary(templates: DeviceTemplate[]) {
		const pid = page.params.pid
		if (!pid) return
		db.save('racks', { id: `${pid}_library`, templates })
	}

	/** Patch cord edits → patching doc. */
	function savePatching(payload: any, changes: import('$lib/logger').ChangeDetail[]) {
		const pid = page.params.pid
		if (!pid) return
		db.save('patching', { id: docId(), ...payload, floor: activeFloor, room: activeRoom })
		if (changes?.length) {
			const uid = session?.user?.uid ?? 'unknown'
			writeLog(pid, 'patching', uid, changes, { floor: activeFloor, room: activeRoom })
		}
	}

	/** Location edits → frames doc (merge, so labelFormat/reservations/etc. are preserved). */
	function saveFrames(payload: any, changes: import('$lib/logger').ChangeDetail[]) {
		const pid = page.params.pid
		if (!pid) return
		db.save('frames', { id: framesDocId(), ...payload, floor: activeFloor })
		if (changes?.length) {
			const uid = session?.user?.uid ?? 'unknown'
			writeLog(pid, 'frames', uid, changes, { floor: activeFloor })
		}
	}
</script>

{#if loading}
	<div class="flex items-center justify-center h-screen">
		<Spinner>Loading elevations...</Spinner>
	</div>
{:else}
	<Elevations data={rackData} {framesData} {patchingData} {library} {initialFocusRackId} floor={activeFloor} room={activeRoom} {floors} projectId={page.params.pid} {floorFormat} {projectName}
		{drawingId} {db} uid={session.user?.uid ?? ''}
		onsave={save} onsaveframes={saveFrames} onsavepatching={savePatching} onlibrarychange={saveLibrary} onfloorchange={changeFloor} onroomchange={changeRoom}
		onupdatefloors={updateFloors} ondeletefloor={deleteFloor} />
{/if}
