<script lang="ts">
	import { page } from '$app/state';
	import { getContext } from 'svelte';
	import { Firestore, Spinner, Session } from '$lib';
	import type { FloorConfig } from '$lib/types/project';
	import { updateFloors as _updateFloors, deleteFloor as _deleteFloor } from '$lib/utils/floor';
	import { findOrCreateDrawing } from '$lib/versioning/service';
	import Outlets from './Outlets.svelte';

	let db = new Firestore();
	let session = getContext('session') as Session;
	let outletsData: any = $state(null);
	let files: any[] = $state([]);
	let floors = $state<FloorConfig[]>([{ number: 1, serverRoomCount: 1 }]);
	let frameData: any = $state(null);
	let racksData: Record<string, any> = $state({});
	let loading = $state(true);
	let activeFloor = $state(1);
	let projectName = $state('');
	let drawingId = $state('');

	// Project doc (name, floors)
	$effect(() => {
		const pid = page.params.pid;
		if (!pid) return;
		const unsub = db.subscribeOne('projects', pid, data => {
			if (data?.name) projectName = data.name;
			if (Array.isArray(data?.floors) && data.floors.length) {
				floors = data.floors;
				if (!data.floors.find((f: any) => f.number === activeFloor)) {
					activeFloor = data.floors[0].number;
				}
			}
		});
		return () => { unsub?.(); };
	});

	// Files collection (only this project's uploaded PDFs)
	$effect(() => {
		const pid = page.params.pid;
		if (!pid) return;
		const unsub = db.subscribeWhere('files', 'projectId', pid, data => { files = data; });
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

	// Subscribe to racks docs for all rooms on active floor (read-only, for rack placement)
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

	// Resolve drawing ID for versioning
	$effect(() => {
		const pid = page.params.pid;
		const fl = activeFloor;
		const uid = session?.user?.uid;
		if (!pid || !uid) return;
		const sourceDocId = docId(fl);
		findOrCreateDrawing(db, {
			projectId: pid,
			toolType: 'outlets',
			sourceDocId,
			title: `Outlets ${fl}F`,
			uid,
		}).then(id => { drawingId = id });
	});

	function changeFloor(newFloor: number) {
		if (newFloor === activeFloor) return;
		activeFloor = newFloor;
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

	function save(payload: any) {
		const pid = page.params.pid;
		if (!pid) return;
		db.save('outlets', { id: docId(), ...payload, floor: activeFloor });
	}

	function saveRack(room: string, rackId: string, updates: Record<string, any>) {
		const pid = page.params.pid;
		if (!pid) return;
		const floorStr = String(activeFloor).padStart(2, '0');
		const rackDocId = `${pid}_F${floorStr}_R${room}`;
		const rackDoc = racksData[room];
		if (!rackDoc?.racks) return;
		const updatedRacks = rackDoc.racks.map((r: any) => r.id === rackId ? { ...r, ...updates } : r);
		db.save('racks', { id: rackDocId, racks: updatedRacks });
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
			{racksData}
			floor={activeFloor}
			projectId={page.params.pid}
			{projectName}
			{drawingId}
			{db}
			uid={session.user?.uid ?? ''}
			onsave={save}
			onsaverack={saveRack}
			onfloorchange={changeFloor}
			onupdatefloors={updateFloors}
			ondeletefloor={deleteFloor}
		/>
	{/key}
{/if}
