<script>
	import { page } from '$app/state';
	import { getContext } from 'svelte';
	import { Firestore, Spinner, Session } from '$lib';
	import { writeLog } from '$lib/logger';
	import Racks from './Racks.svelte';

	let db = new Firestore();
	/** @type {Session} */
	let session = getContext('session');
	let rackData = $state(/** @type {any} */ (null));
	/** @type {import('./parts/types').DeviceTemplate[]} */
	let library = $state([]);
	/** @type {import('$lib/components/FloorManagerDialog.svelte').FloorConfig[]} */
	let floors = $state([{ number: 1, serverRoomCount: 1 }]);
	let loading = $state(true);
	let activeFloor = $state(1);
	let activeRoom = $state('A');
	let floorFormat = $state('L01');
	let projectName = $state('');

	/** Migrate old floors format: number[] → FloorConfig[] */
	function migrateFloors(/** @type {any[]} */ raw) {
		if (!raw?.length) return [{ number: 1, serverRoomCount: 1 }];
		if (typeof raw[0] === 'object' && 'number' in raw[0]) return raw;
		return raw.map(n => ({ number: n, serverRoomCount: 1 }));
	}

	/** Firestore doc ID for a given floor + room */
	function docId(floor = activeFloor, room = activeRoom) {
		return `${page.params.pid}_F${String(floor).padStart(2, '0')}_R${room}`;
	}

	// Subscribe to project doc for shared floors list
	$effect(() => {
		const pid = page.params.pid;
		if (!pid) return;
		const unsub = db.subscribeOne('projects', pid, data => {
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

		const unsub = db.subscribeOne('racks', id, data => {
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
		const unsub = db.subscribeOne('frames', frameDocId, data => {
			if (data?.floorFormat) floorFormat = data.floorFormat;
		});

		return () => { unsub?.(); };
	});

	// Subscribe to project-level device library (shared across all floors/rooms)
	$effect(() => {
		const pid = page.params.pid;
		if (!pid) return;

		const unsub = db.subscribeOne('racks', `${pid}_library`, data => {
			library = data?.templates ?? [];
		});

		return () => { unsub?.(); };
	});

	function changeFloor(/** @type {number} */ newFloor) {
		if (newFloor === activeFloor) return;
		activeFloor = newFloor;
		// Clamp room to what exists on this floor
		const floorCfg = floors.find(f => f.number === newFloor);
		const maxRooms = floorCfg?.serverRoomCount ?? 1;
		const available = ['A', 'B', 'C', 'D'].slice(0, maxRooms);
		if (!available.includes(activeRoom)) activeRoom = available[0];
	}

	function changeRoom(/** @type {string} */ newRoom) {
		if (newRoom === activeRoom) return;
		activeRoom = newRoom;
	}

	/** @param {import('$lib/components/FloorManagerDialog.svelte').FloorConfig[]} updated */
	function updateFloors(updated) {
		const pid = page.params.pid;
		if (!pid) return;
		floors = updated;
		db.save('projects', { id: pid, floors: updated });
		if (!updated.find(f => f.number === activeFloor) && updated.length > 0) {
			activeFloor = updated[0].number;
		}
	}

	/** @param {number} fl */
	async function deleteFloor(fl) {
		const pid = page.params.pid;
		if (!pid) return;

		const floorStr = String(fl).padStart(2, '0');
		try { await db.delete('frames', `${pid}_F${floorStr}`); } catch {}
		for (const rm of ['A', 'B', 'C', 'D']) {
			try { await db.delete('racks', `${pid}_F${floorStr}_R${rm}`); } catch {}
		}

		const updated = floors.filter(f => f.number !== fl);
		floors = updated.length > 0 ? updated : [{ number: 1, serverRoomCount: 1 }];
		db.save('projects', { id: pid, floors });

		if (activeFloor === fl) {
			activeFloor = floors[0].number;
		}
	}

	/** @param {any} payload @param {import('$lib/logger').ChangeDetail[]} changes */
	function save(payload, changes) {
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

	/** @param {import('./parts/types').DeviceTemplate[]} templates */
	function saveLibrary(templates) {
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
	{#key `${activeFloor}-${activeRoom}`}
		<Racks data={rackData} {library} floor={activeFloor} room={activeRoom} {floors} projectId={page.params.pid} {floorFormat} {projectName}
			onsave={save} onlibrarychange={saveLibrary} onfloorchange={changeFloor} onroomchange={changeRoom}
			onupdatefloors={updateFloors} ondeletefloor={deleteFloor} />
	{/key}
{/if}
