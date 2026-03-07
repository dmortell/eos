<script>
	import { page } from '$app/state';
	import { Firestore, Spinner } from '$lib';
	import Outlets from './Outlets.svelte';

	let db = new Firestore();
	let outletsData = $state(/** @type {any} */ (null));
	/** @type {any[]} */
	let files = $state([]);
	/** @type {import('$lib/components/FloorManagerDialog.svelte').FloorConfig[]} */
	let floors = $state([{ number: 1, serverRoomCount: 1 }]);
	let frameData = $state(/** @type {any} */ (null));
	let loading = $state(true);
	let activeFloor = $state(1);
	let projectName = $state('');

	// Project doc (name, floors)
	$effect(() => {
		const pid = page.params.pid;
		if (!pid) return;
		const unsub = db.subscribeOne('projects', pid, data => {
			if (data?.name) projectName = /** @type {string} */ (data.name);
			if (Array.isArray(data?.floors) && data.floors.length) floors = data.floors;
		});
		return () => { unsub?.(); };
	});

	// Files collection (all uploaded PDFs)
	$effect(() => {
		const pid = page.params.pid;
		if (!pid) return;
		const unsub = db.subscribeMany('files', data => { files = data; });
		return () => { unsub?.(); };
	});

	/** Firestore doc ID for outlets on a given floor */
	function docId(floor = activeFloor) {
		return `${page.params.pid}_F${String(floor).padStart(2, '0')}`;
	}

	// Subscribe to outlets doc for active floor
	$effect(() => {
		const pid = page.params.pid;
		if (!pid) return;
		loading = true;
		const unsub = db.subscribeOne('outlets', docId(), data => {
			outletsData = data;
			loading = false;
		});
		return () => { unsub?.(); };
	});

	// Subscribe to frames doc for active floor (read-only, for linking)
	$effect(() => {
		const pid = page.params.pid;
		if (!pid) return;
		const unsub = db.subscribeOne('frames', docId(), data => {
			frameData = data;
		});
		return () => { unsub?.(); };
	});

	function changeFloor(/** @type {number} */ newFloor) {
		if (newFloor === activeFloor) return;
		activeFloor = newFloor;
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
		try { await db.delete('outlets', `${pid}_F${String(fl).padStart(2, '0')}`); } catch {}
		const updated = floors.filter(f => f.number !== fl);
		floors = updated.length > 0 ? updated : [{ number: 1, serverRoomCount: 1 }];
		db.save('projects', { id: pid, floors });
		if (activeFloor === fl) activeFloor = floors[0].number;
	}

	/** @param {any} payload */
	function save(payload) {
		const pid = page.params.pid;
		if (!pid) return;
		db.save('outlets', { id: docId(), ...payload, floor: activeFloor });
	}
</script>

{#if loading}
	<div class="flex items-center justify-center h-screen">
		<Spinner>Loading outlets...</Spinner>
	</div>
{:else}
	{#key activeFloor}
		<Outlets
			data={outletsData}
			{files}
			{floors}
			{frameData}
			floor={activeFloor}
			projectId={page.params.pid}
			{projectName}
			onsave={save}
			onfloorchange={changeFloor}
			onupdatefloors={updateFloors}
			ondeletefloor={deleteFloor}
		/>
	{/key}
{/if}
