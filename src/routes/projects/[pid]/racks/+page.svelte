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
	/** @type {number[]} */
	let floors = $state([1]);
	let loading = $state(true);
	let activeFloor = $state(1);
	let activeRoom = $state('A');
	let floorFormat = $state('L01');

	/** Firestore doc ID for a given floor + room */
	function docId(floor = activeFloor, room = activeRoom) {
		return `${page.params.pid}_F${String(floor).padStart(2, '0')}_R${room}`;
	}

	// Subscribe to project doc for shared floors list
	$effect(() => {
		const pid = page.params.pid;
		if (!pid) return;
		const unsub = db.subscribeOne('projects', pid, data => {
			if (data?.floors?.length) floors = data.floors;
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
	}

	function changeRoom(/** @type {string} */ newRoom) {
		if (newRoom === activeRoom) return;
		activeRoom = newRoom;
	}

	function addFloor() {
		const next = floors.length > 0 ? Math.max(...floors) + 1 : 1;
		floors = [...floors, next].sort((a, b) => a - b);
		activeFloor = next;
		const pid = page.params.pid;
		if (pid) db.save('projects', { id: pid, floors });
	}

	/** @param {number} fl */
	async function deleteFloor(fl) {
		const pid = page.params.pid;
		if (!pid) return;

		const floorStr = String(fl).padStart(2, '0');

		// Delete frames doc for this floor
		try { await db.delete('frames', `${pid}_F${floorStr}`); } catch {}

		// Delete racks docs for this floor (all rooms A-D)
		for (const rm of ['A', 'B', 'C', 'D']) {
			try { await db.delete('racks', `${pid}_F${floorStr}_R${rm}`); } catch {}
		}

		// Update floors list
		floors = floors.filter(f => f !== fl);
		if (floors.length === 0) floors = [1];
		db.save('projects', { id: pid, floors });

		if (activeFloor === fl) {
			activeFloor = floors[0];
		}
	}

	/** @param {any} payload @param {import('$lib/logger').ChangeDetail[]} changes */
	function save(payload, changes) {
		const pid = page.params.pid;
		if (!pid) return;
		db.save('racks', { id: docId(), ...payload, floor: activeFloor, room: activeRoom });

		// Ensure current floor is in the project floors list
		if (!floors.includes(activeFloor)) {
			floors = [...floors, activeFloor].sort((a, b) => a - b);
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
		<Racks data={rackData} {library} floor={activeFloor} room={activeRoom} {floors} projectId={page.params.pid} {floorFormat}
			onsave={save} onlibrarychange={saveLibrary} onfloorchange={changeFloor} onroomchange={changeRoom}
			onaddfloor={addFloor} ondeletefloor={deleteFloor} />
	{/key}
{/if}
