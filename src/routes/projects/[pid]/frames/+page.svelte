<script lang="ts">
	import { page } from '$app/state';
	import { getContext } from 'svelte';
	import { Firestore, Spinner, Session } from '$lib';
	import { writeLog } from '$lib/logger';
	import type { ChangeDetail } from '$lib/logger';
	import type { FloorConfig } from '$lib/types/project';
	import { migrateFloors, updateFloors as _updateFloors, deleteFloor as _deleteFloor } from '$lib/utils/floor';
	import { findOrCreateDrawing } from '$lib/versioning/service';
	import Frames from './Frames.svelte';

	let db = new Firestore();
	let session = getContext('session') as Session;
	let frameData: any = $state(null);
	let racksData: Record<string, any> = $state({});
	let floors = $state<FloorConfig[]>([{ number: 1, serverRoomCount: 1 }]);
	let loading = $state(true);
	let activeFloor = $state(Number(page.url.searchParams.get('floor')) || 1);
	let projectName = $state('');
	let drawingId = $state('');
	let hasMigrated = false;
	/** Optional frame id from ?frame= URL param (from cross-tool navigation, e.g. Racks tool). */
	const initialFrameId = page.url.searchParams.get('frame') || undefined;

	// Subscribe to project doc for shared floors list
	$effect(() => {
		const pid = page.params.pid;
		if (!pid) return;
		const unsub = db.subscribeOne('projects', pid, (data: any) => {
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

	async function migrateOldDoc(pid: string) {
		try {
			const oldData = await db.getOne('frames', pid);
			if (oldData && (oldData.zoneLocations || oldData.zone || oldData.zones)) {
				const oldFloor = (oldData.floor as number) ?? 1;
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

	// Resolve drawing ID for versioning
	$effect(() => {
		const pid = page.params.pid;
		const fl = activeFloor;
		const uid = session?.user?.uid;
		if (!pid || !uid) return;
		const sourceDocId = docId(fl);
		findOrCreateDrawing(db, {
			projectId: pid,
			toolType: 'frames',
			sourceDocId,
			title: `Patch Frames ${fl}F`,
			uid,
		}).then(id => { drawingId = id });
	});

	// Sync floor to URL so tool menu links carry context across tools
	$effect(() => {
		const url = new URL(window.location.href);
		url.searchParams.set('floor', String(activeFloor));
		history.replaceState(history.state, '', url.toString());
	});

	function changeFloor(newFloor: number) {
		if (newFloor === activeFloor) return;
		activeFloor = newFloor;
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
		db.save('frames', { id: docId(), ...payload, floor: activeFloor });

		// Ensure current floor is in the project floors list
		if (!floors.find(f => f.number === activeFloor)) {
			floors = [...floors, { number: activeFloor, serverRoomCount: 1 }].sort((a, b) => a.number - b.number);
			db.save('projects', { id: pid, floors });
		}

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
		<Frames data={frameData} {racksData} floor={activeFloor} {floors} projectId={page.params.pid} {projectName}
			{drawingId} {db} uid={session.user?.uid ?? ''} {initialFrameId}
			onsave={save} onfloorchange={changeFloor} onupdatefloors={updateFloors} ondeletefloor={deleteFloor} />
	{/key}
{/if}
