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
	let loading = $state(true);
	let activeFloor = $state(1);
	let activeRoom = $state('A');

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
</script>

{#if loading}
	<div class="flex items-center justify-center h-screen">
		<Spinner>Loading racks...</Spinner>
	</div>
{:else}
	{#key `${activeFloor}-${activeRoom}`}
		<Racks data={rackData} floor={activeFloor} room={activeRoom} projectId={page.params.pid}
			onsave={save} onfloorchange={changeFloor} onroomchange={changeRoom} />
	{/key}
{/if}
