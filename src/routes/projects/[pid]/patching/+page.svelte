<script lang="ts">
	import { page } from '$app/state';
	import { getContext } from 'svelte';
	import { Firestore, Spinner, Session } from '$lib';
	import { writeLog } from '$lib/logger';
	import type { ChangeDetail } from '$lib/logger';
	import type { FloorConfig } from '$lib/types/project';
	import { migrateFloors, updateFloors as _updateFloors, deleteFloor as _deleteFloor } from '$lib/utils/floor';
	import Patching from './Patching.svelte';

	let db = new Firestore();
	let session = getContext('session') as Session;
	let patchData: any = $state(null);
	let rackData: any = $state(null);
	let frameData: any = $state(null);
	let floors = $state<FloorConfig[]>([{ number: 1, serverRoomCount: 1 }]);
	let loading = $state(true);
	let activeFloor = $state(1);
	let activeRoom = $state('A');
	let floorFormat = $state('L01');
	let projectName = $state('');

	/** Firestore doc ID for a given floor + room */
	function docId(floor = activeFloor, room = activeRoom) {
		return `${page.params.pid}_F${String(floor).padStart(2, '0')}_R${room}`;
	}

	/** Firestore doc ID for frames (floor-scoped, no room) */
	function frameDocId(floor = activeFloor) {
		return `${page.params.pid}_F${String(floor).padStart(2, '0')}`;
	}

	// Subscribe to project doc for shared floors list
	$effect(() => {
		const pid = page.params.pid;
		if (!pid) return;
		const unsub = db.subscribeOne('projects', pid, (data: Record<string, any>) => {
			if (data?.name) projectName = data.name;
			if (data?.floors?.length) {
				floors = migrateFloors(data.floors);
				if (!floors.find(f => f.number === activeFloor)) {
					activeFloor = floors[0].number;
				}
			}
		});
		return () => { unsub?.(); };
	});

	// Subscribe to patching doc for active floor+room
	$effect(() => {
		const pid = page.params.pid;
		const fl = activeFloor;
		const rm = activeRoom;
		if (!pid) return;

		const id = docId(fl, rm);
		loading = true;

		const unsub = db.subscribeOne('patching', id, (data: any) => {
			patchData = data;
			loading = false;
		});

		return () => { unsub?.(); };
	});

	// Subscribe to racks doc for active floor+room (read-only)
	$effect(() => {
		const pid = page.params.pid;
		const fl = activeFloor;
		const rm = activeRoom;
		if (!pid) return;

		const id = docId(fl, rm);
		const unsub = db.subscribeOne('racks', id, (data: any) => {
			rackData = data;
		});

		return () => { unsub?.(); };
	});

	// Subscribe to frames doc for active floor (read-only, floor-scoped)
	$effect(() => {
		const pid = page.params.pid;
		const fl = activeFloor;
		if (!pid) return;

		const id = frameDocId(fl);
		const unsub = db.subscribeOne('frames', id, (data: Record<string, any>) => {
			frameData = data;
			if (data?.floorFormat) floorFormat = data.floorFormat;
		});

		return () => { unsub?.(); };
	});

	function changeFloor(newFloor: number) {
		if (newFloor === activeFloor) return;
		activeFloor = newFloor;
		const floorCfg = floors.find(f => f.number === newFloor);
		const maxRooms = floorCfg?.serverRoomCount ?? 1;
		const available = ['A', 'B', 'C', 'D'].slice(0, maxRooms);
		if (!available.includes(activeRoom)) activeRoom = available[0];
	}

	function changeRoom(newRoom: string) {
		if (newRoom === activeRoom) return;
		activeRoom = newRoom;
	}

	function updateFloors(updated: FloorConfig[]) {
		const pid = page.params.pid;
		if (!pid) return;
		floors = updated;
		activeFloor = _updateFloors(db, pid, updated, activeFloor);
	}

	async function deleteFloor(fl: number) {
		const pid = page.params.pid;
		if (!pid) return;
		const result = await _deleteFloor(db, pid, fl, floors, activeFloor);
		floors = result.floors;
		activeFloor = result.activeFloor;
	}

	function save(payload: any, changes: ChangeDetail[]) {
		const pid = page.params.pid;
		if (!pid) return;
		db.save('patching', { id: docId(), ...payload, floor: activeFloor, room: activeRoom });

		if (!floors.find(f => f.number === activeFloor)) {
			floors = [...floors, { number: activeFloor, serverRoomCount: 1 }].sort((a, b) => a.number - b.number);
			db.save('projects', { id: pid, floors });
		}

		if (changes?.length) {
			const uid = session?.user?.uid ?? 'unknown';
			writeLog(pid, 'patching', uid, changes, { floor: activeFloor, room: activeRoom });
		}
	}
</script>

{#if loading}
	<div class="flex items-center justify-center h-screen">
		<Spinner>Loading patching...</Spinner>
	</div>
{:else}
	<Patching data={patchData} {rackData} {frameData} floor={activeFloor} room={activeRoom}
		{floors} projectId={page.params.pid} {projectName} {floorFormat}
		onsave={save} onfloorchange={changeFloor} onroomchange={changeRoom}
		onupdatefloors={updateFloors} ondeletefloor={deleteFloor} />
{/if}
