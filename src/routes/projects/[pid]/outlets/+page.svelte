<script lang="ts">
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import { getContext } from 'svelte';
	import { Firestore, Spinner, Session } from '$lib';
	import type { FloorConfig } from '$lib/types/project';
	import { updateFloors as _updateFloors, deleteFloor as _deleteFloor, floorDocId } from '$lib/utils/floor';
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
	let activeFloor = $state(Number(page.url.searchParams.get('floor')) || 1);
	// Active tenant area within the floor (outlets only). '' = the floor has no
	// areas (legacy single-floorplan behaviour, unsuffixed doc key).
	let activeArea = $state(page.url.searchParams.get('area') ?? '');
	let projectName = $state('');
	let drawingId = $state('');

	const currentAreas = $derived(floors.find(f => f.number === activeFloor)?.areas ?? []);
	// Keep activeArea valid as the floor / its areas change.
	$effect(() => {
		const areas = currentAreas;
		if (!areas.length) { if (activeArea) activeArea = ''; return; }
		if (!areas.find(a => a.id === activeArea)) activeArea = areas[0].id;
	});

	// Parse initial view layer params from URL (e.g. ?lowOutlets=1&highTrunks=0)
	const _sp = page.url.searchParams;
	const initialLayers: Record<string, boolean> | undefined =
		_sp.has('lowOutlets') || _sp.has('highOutlets') || _sp.has('lowTrunks') || _sp.has('highTrunks')
			? {
				lowOutlets: _sp.get('lowOutlets') === '1',
				highOutlets: _sp.get('highOutlets') === '1',
				lowTrunks: _sp.get('lowTrunks') === '1',
				highTrunks: _sp.get('highTrunks') === '1',
			}
			: undefined;

	// Project doc (name, floors)
	$effect(() => {
		const pid = page.params.pid;
		if (!pid) return;
		const unsub = db.subscribeOne('projects', pid, data => {
			if (data?.name) projectName = data.name as string;
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

	/** Firestore doc ID for outlets on a given floor + area. Outlets is the only
	 *  per-floor tool split by tenant area; frames/racks stay per-floor/room. */
	function docId(floor = activeFloor, area = activeArea) {
		return floorDocId(page.params.pid ?? '', floor, area || undefined);
	}
	/** Per-floor key for frames/links (no area suffix). */
	function floorKey(floor = activeFloor) {
		return floorDocId(page.params.pid ?? '', floor);
	}

	// Subscribe to outlets doc for active floor + area
	$effect(() => {
		const pid = page.params.pid;
		if (!pid) return;
		const id = docId(activeFloor, activeArea);
		loading = true;
		const unsub = db.subscribeOne('outlets', id, data => {
			outletsData = data;
			loading = false;
		});
		return () => { unsub?.(); };
	});

	// Subscribe to frames doc for active floor (read-only, for linking)
	$effect(() => {
		const pid = page.params.pid;
		if (!pid) return;
		const unsub = db.subscribeOne('frames', floorKey(), data => {
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
		const area = activeArea;
		const uid = session?.user?.uid;
		if (!pid || !uid) return;
		const sourceDocId = docId(fl, area);
		const areaLabel = currentAreas.find(a => a.id === area)?.label;
		findOrCreateDrawing(db, {
			projectId: pid,
			toolType: 'outlets',
			sourceDocId,
			title: `Outlets ${fl}F${areaLabel ? ` · ${areaLabel}` : ''}`,
			uid,
		}).then(id => { drawingId = id });
	});

	// Sync floor + area to URL so tool menu links carry context across tools
	$effect(() => {
		const url = new URL(window.location.href);
		url.searchParams.set('floor', String(activeFloor));
		if (activeArea) url.searchParams.set('area', activeArea); else url.searchParams.delete('area');
		replaceState(url, page.state);
	});

	function changeFloor(newFloor: number) {
		if (newFloor === activeFloor) return;
		activeFloor = newFloor;
	}

	function changeArea(areaId: string) {
		if (areaId === activeArea) return;
		activeArea = areaId;
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
	{#key `${activeFloor}_${activeArea}`}
		<Outlets
			data={outletsData}
			{files}
			{floors}
			{frameData}
			{racksData}
			floor={activeFloor}
			areas={currentAreas}
			activeArea={activeArea}
			projectId={page.params.pid}
			{projectName}
			{drawingId}
			{db}
			uid={session.user?.uid ?? ''}
			{initialLayers}
			onsave={save}
			onsaverack={saveRack}
			onfloorchange={changeFloor}
			onareachange={changeArea}
			onupdatefloors={updateFloors}
			ondeletefloor={deleteFloor}
		/>
	{/key}
{/if}
