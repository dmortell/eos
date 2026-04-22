<script lang="ts">
	import { page } from '$app/state';
	import { getContext } from 'svelte';
	import { Firestore, Spinner, Session } from '$lib';
	import { writeLog } from '$lib/logger';
	import { migrateFloors, updateFloors as _updateFloors, deleteFloor as _deleteFloor } from '$lib/utils/floor';
	import type { DeviceTemplate } from './parts/types';
	import { VIEW_FRONT, VIEW_REAR, VIEW_DEFAULT } from './parts/types';
	import { findOrCreateDrawing } from '$lib/versioning/service';
	import Racks from './Racks.svelte';

	let db = new Firestore();
	let session = getContext('session') as Session;
	let rackData: any = $state(null);
	let library: DeviceTemplate[] = $state([]);
	let floors = $state([{ number: 1, serverRoomCount: 1 }]);
	let loading = $state(true);
	let activeFloor = $state(Number(page.url.searchParams.get('floor')) || 1);
	let activeRoom = $state(page.url.searchParams.get('room') ?? 'A');
	const _sp = page.url.searchParams;
	const initialViewMask = _sp.has('front') || _sp.has('rear')
		? ((_sp.get('front') === '1' ? VIEW_FRONT : 0) | (_sp.get('rear') === '1' ? VIEW_REAR : 0)) || VIEW_DEFAULT
		: undefined;
	let floorFormat = $state('L01');
	let projectName = $state('');
	let drawingId = $state('');

	/** Firestore doc ID for a given floor + room */
	function docId(floor = activeFloor, room = activeRoom) {
		return `${page.params.pid}_F${String(floor).padStart(2, '0')}_R${room}`;
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

	// Subscribe to the active floor+room document
	$effect(() => {
		const pid = page.params.pid;
		const fl = activeFloor;
		const rm = activeRoom;
		if (!pid) return;

		const id = docId(fl, rm);
		loading = true;

		const unsub = db.subscribeOne('racks', id, (data: any) => {
			rackData = data;
			loading = false;
		});

		return () => { unsub?.(); };
	});

	// Subscribe to the frames doc for the active floor to read floorFormat
	$effect(() => {
		const pid = page.params.pid;
		const fl = activeFloor;
		if (!pid) return;

		const frameDocId = `${pid}_F${String(fl).padStart(2, '0')}`;
		const unsub = db.subscribeOne('frames', frameDocId, (data: Record<string, any>) => {
			if (data?.floorFormat) floorFormat = data.floorFormat;
		});

		return () => { unsub?.(); };
	});

	// Subscribe to project-level device library (shared across all floors/rooms)
	$effect(() => {
		const pid = page.params.pid;
		if (!pid) return;

		const unsub = db.subscribeOne('racks', `${pid}_library`, (data: Record<string, any>) => {
			library = data?.templates ?? [];
		});

		return () => { unsub?.(); };
	});

	// Resolve drawing ID for versioning
	$effect(() => {
		const pid = page.params.pid;
		const fl = activeFloor;
		const rm = activeRoom;
		const uid = session?.user?.uid;
		if (!pid || !uid) return;
		const sourceDocId = docId(fl, rm);
		findOrCreateDrawing(db, {
			projectId: pid,
			toolType: 'racks',
			sourceDocId,
			title: `Rack Elevations ${fl}F Room ${rm}`,
			uid,
		}).then(id => { drawingId = id });
	});

	function changeFloor(newFloor: number) {
		if (newFloor === activeFloor) return;
		activeFloor = newFloor;
		// Clamp room to what exists on this floor
		const floorCfg = floors.find(f => f.number === newFloor);
		const maxRooms = floorCfg?.serverRoomCount ?? 1;
		const available = ['A', 'B', 'C', 'D'].slice(0, maxRooms);
		if (!available.includes(activeRoom)) activeRoom = available[0];
	}

	function changeRoom(newRoom: string) {
		if (newRoom === activeRoom) return;
		activeRoom = newRoom;
	}

	function updateFloors(updated: import('$lib/types/project').FloorConfig[]) {
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

	function save(payload: any, changes: import('$lib/logger').ChangeDetail[]) {
		const pid = page.params.pid;
		if (!pid) return;
		db.save('racks', { id: docId(), ...payload, floor: activeFloor, room: activeRoom });

		// Ensure current floor is in the project floors list
		if (!floors.find(f => f.number === activeFloor)) {
			floors = [...floors, { number: activeFloor, serverRoomCount: 1 }].sort((a, b) => a.number - b.number);
			db.save('projects', { id: pid, floors });
		}

		if (changes?.length) {
			const uid = session?.user?.uid ?? 'unknown';
			writeLog(pid, 'racks', uid, changes, { floor: activeFloor, room: activeRoom });
		}
	}

	function saveLibrary(templates: DeviceTemplate[]) {
		const pid = page.params.pid;
		if (!pid) return;
		db.save('racks', { id: `${pid}_library`, templates });
	}
</script>

{#if loading}
	<div class="flex items-center justify-center h-screen">
		<Spinner>Loading racks...</Spinner>
	</div>
{:else}
	<!-- {#key `${activeFloor}-${activeRoom}`}
			{/key} -->
		<Racks data={rackData} {library} floor={activeFloor} room={activeRoom} {floors} projectId={page.params.pid} {floorFormat} {projectName}
			{drawingId} {db} uid={session.user?.uid ?? ''} {initialViewMask}
			onsave={save} onlibrarychange={saveLibrary} onfloorchange={changeFloor} onroomchange={changeRoom}
			onupdatefloors={updateFloors} ondeletefloor={deleteFloor} />
{/if}
