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
	let loading = $state(true);
	let activeFloor = $state(1);
	let activeRoom = $state('A');
	let floorFormat = $state('L01');

	/** Firestore doc ID for a given floor + room */
	function docId(floor = activeFloor, room = activeRoom) {
		return `${page.params.pid}_F${String(floor).padStart(2, '0')}_R${room}`;
	}

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

	/** @param {any} payload @param {import('$lib/logger').ChangeDetail[]} changes */
	function save(payload, changes) {
		const pid = page.params.pid;
		if (!pid) return;
		db.save('racks', { id: docId(), ...payload, floor: activeFloor, room: activeRoom });

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
		<Racks data={rackData} {library} floor={activeFloor} room={activeRoom} projectId={page.params.pid} {floorFormat}
			onsave={save} onlibrarychange={saveLibrary} onfloorchange={changeFloor} onroomchange={changeRoom} />
	{/key}
{/if}
