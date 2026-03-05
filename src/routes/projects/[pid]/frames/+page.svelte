<script>
	import { page } from '$app/state';
	import { getContext } from 'svelte';
	import { Firestore, Spinner, Session } from '$lib';
	import { writeLog } from '$lib/logger';
	import Frames from './Frames.svelte';

	let db = new Firestore();
	/** @type {Session} */
	let session = getContext('session');
	let frameData = $state(/** @type {any} */ (null));
	/** @type {Record<string, any>} */
	let racksData = $state({});
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

			if (!hasMigrated) {
				hasMigrated = true;
				migrateOldDoc(pid);
			}
		});

		return () => { unsub?.(); };
	});

	// Subscribe to racks docs for each server room (A–D) on the active floor
	$effect(() => {
		const pid = page.params.pid;
		const fl = activeFloor;
		if (!pid) return;

		const floorStr = String(fl).padStart(2, '0');
		const rooms = ['A', 'B', 'C', 'D'];
		const unsubs = rooms.map(rm => {
			const rackDocId = `${pid}_F${floorStr}_R${rm}`;
			return db.subscribeOne('racks', rackDocId, data => {
				racksData = { ...racksData, [rm]: data };
			});
		});

		return () => { unsubs.forEach(u => u?.()); };
	});

	/** Migrate data from old `frames/{pid}` doc to new per-floor doc if it exists */
	async function migrateOldDoc(/** @type {string} */ pid) {
		try {
			const oldData = await db.getOne('frames', pid);
			if (oldData && (oldData.zoneLocations || oldData.zone || oldData.zones)) {
				const oldFloor = /** @type {number} */ (oldData.floor ?? 1);
				const newId = `${pid}_F${String(oldFloor).padStart(2, '0')}`;
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

	/** @param {any} payload @param {import('$lib/logger').ChangeDetail[]} changes */
	function save(payload, changes) {
		const pid = page.params.pid;
		if (!pid) return;
		db.save('frames', { id: docId(), ...payload, floor: activeFloor });

		// Log changes
		if (changes?.length) {
			const uid = session?.user?.uid ?? 'unknown';
			writeLog(pid, 'frames', uid, changes, { floor: activeFloor });
		}
	}
</script>

{#if loading}
	<div class="flex items-center justify-center h-screen">
		<Spinner>Loading frames...</Spinner>
	</div>
{:else}
	{#key activeFloor}
		<Frames data={frameData} {racksData} floor={activeFloor} projectId={page.params.pid} onsave={save} onfloorchange={changeFloor} />
	{/key}
{/if}
