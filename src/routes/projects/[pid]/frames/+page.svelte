<script>
	import { page } from '$app/state';
	import { Firestore, Spinner } from '$lib';
	import Frames from './Frames.svelte';

	let db = new Firestore();
	let frameData = $state(/** @type {any} */ (null));
	let loading = $state(true);
	let activeFloor = $state(1);
	let hasMigrated = false;

	/** Firestore doc ID for a given floor */
	function docId(floor = activeFloor) {
		return `${page.params.pid}_F${String(floor).padStart(2, '0')}`;
	}

	// Subscribe to the active floor's document
	$effect(() => {
		const pid = page.params.pid;
		const fl = activeFloor;
		if (!pid) return;

		const id = docId(fl);
		loading = true;

		const unsub = db.subscribeOne('frames', id, data => {
			frameData = data;
			loading = false;

			// One-time migration: check old single-doc format on first load
			if (!hasMigrated) {
				hasMigrated = true;
				migrateOldDoc(pid);
			}
		});

		return () => { unsub?.(); };
	});

	/** Migrate data from old `frames/{pid}` doc to new per-floor doc if it exists */
	async function migrateOldDoc(/** @type {string} */ pid) {
		try {
			const oldData = await db.getOne('frames', pid);
			if (oldData && (oldData.zoneLocations || oldData.zone || oldData.zones)) {
				const oldFloor = /** @type {number} */ (oldData.floor ?? 1);
				const newId = `${pid}_F${String(oldFloor).padStart(2, '0')}`;
				// Only migrate if the floor doc is empty
				const existing = await db.getOne('frames', newId);
				if (!existing || (!existing.zoneLocations && !existing.frames)) {
					const { id: _, ...payload } = oldData;
					await db.save('frames', { id: newId, ...payload, floor: oldFloor });
					if (activeFloor !== oldFloor) {
						activeFloor = oldFloor;
					}
				}
			}
		} catch {
			// Old doc may not exist — that's fine
		}
	}

	function changeFloor(/** @type {number} */ newFloor) {
		if (newFloor === activeFloor) return;
		activeFloor = newFloor;
	}

	function save(/** @type {any} */ payload) {
		const pid = page.params.pid;
		if (!pid) return;
		db.save('frames', { id: docId(), ...payload, floor: activeFloor });
	}
</script>

{#if loading}
	<div class="flex items-center justify-center h-screen">
		<Spinner>Loading frames...</Spinner>
	</div>
{:else}
	{#key activeFloor}
		<Frames data={frameData} floor={activeFloor} onsave={save} onfloorchange={changeFloor} />
	{/key}
{/if}
