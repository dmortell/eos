<script lang="ts">
	/**
	 * Patching editor P-1 — the patch bench (elevations-plan.md §13).
	 * Multi-room working set of rack boards over the existing racks /
	 * patching / frames docs; PatchListPane underneath.
	 */
	import { page } from '$app/state'
	import { replaceState } from '$app/navigation'
	import { Firestore, Spinner, Titlebar, Icon } from '$lib'
	import type { FloorConfig } from '$lib/types/project'
	import { migrateFloors, fmtFloor } from '$lib/utils/floor'
	import { BenchEditor, ROOMS } from './bench.svelte'
	import DeviceTree from './DeviceTree.svelte'
	import RackBoard from './RackBoard.svelte'
	import PatchListPane from '../../patching/parts/PatchListPane.svelte'

	const db = new Firestore()
	const editor = new BenchEditor(db)

	let loading = $state(true)
	let projectName = $state('')
	let floors = $state<FloorConfig[]>([{ number: 1, serverRoomCount: 1 }])
	let activeFloor = $state(Number(page.url.searchParams.get('floor')) || 1)
	let listOpen = $state(true)

	// ── Subscriptions ──
	$effect(() => {
		const pid = page.params.pid
		if (!pid) return
		editor.pid = pid
		const unsub = db.subscribeOne('projects', pid, (data: any) => {
			if (data?.name) projectName = data.name
			if (data?.floors?.length) {
				floors = migrateFloors(data.floors)
				if (!floors.find(f => f.number === activeFloor)) activeFloor = floors[0].number
			}
			loading = false
		})
		return () => unsub?.()
	})

	$effect(() => {
		const pid = page.params.pid
		if (!pid) return
		editor.floor = activeFloor
		editor.loadBench()
		const unsubs = [
			db.subscribeOne('frames', editor.framesDocId(), (d: any) => {
				editor.syncFrames(d)
				if (d?.floorFormat) editor.floorFormat = d.floorFormat
			}),
			...ROOMS.flatMap(room => [
				db.subscribeOne('racks', editor.roomDocId(room), (d: any) => editor.syncRoom(room, d)),
				db.subscribeOne('patching', editor.roomDocId(room), (d: any) => editor.syncPatch(room, d)),
			]),
		]
		return () => unsubs.forEach(u => u?.())
	})

	// Keep ?floor= in the URL (same pattern as the sibling tools)
	$effect(() => {
		const url = new URL(page.url)
		url.searchParams.set('floor', String(activeFloor))
		replaceState(url, {})
	})

	// ── Keyboard: undo/redo ──
	$effect(() => {
		const onKey = (e: KeyboardEvent) => {
			const f = (e.target as Element)?.closest?.('input, textarea, select, [contenteditable]')
			if (f) return
			if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
				e.preventDefault()
				if (e.shiftKey) editor.history.redo(); else editor.history.undo()
			} else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
				e.preventDefault()
				editor.history.redo()
			}
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	})

	let benchRacks = $derived(editor.bench.filter(id => editor.rackById.has(id)))
</script>

<svelte:head><title>{projectName} — Patching</title></svelte:head>

<div class="h-screen flex flex-col bg-gray-50">
	<Titlebar title="{projectName} — Patching" menu saveStatus={editor.saveStatus} />

	{#if loading}
		<div class="flex-1 flex items-center justify-center"><Spinner /></div>
	{:else}
		<!-- Toolbar: floor pills + link back to Elevations -->
		<div class="h-8 px-2 flex items-center gap-2 bg-white border-b border-gray-200 text-xs shrink-0">
			<Icon name="cable" size={13} />
			<span class="font-semibold text-gray-700">Patch bench</span>
			<div class="w-px h-4 bg-gray-200"></div>
			{#each floors as f (f.number)}
				<button class="h-5.5 px-2 rounded text-[11px] font-medium
						{activeFloor === f.number ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}"
					onclick={() => activeFloor = f.number}>{fmtFloor(f.number, editor.floorFormat, floors)}</button>
			{/each}
			<div class="flex-1"></div>
			<button class="h-5.5 px-1.5 rounded text-gray-400 hover:bg-gray-100" title="Undo (Ctrl+Z)" onclick={() => editor.history.undo()}><Icon name="undo" size={13} /></button>
			<button class="h-5.5 px-1.5 rounded text-gray-400 hover:bg-gray-100" title="Redo (Ctrl+Y)" onclick={() => editor.history.redo()}><Icon name="redo" size={13} /></button>
			<a class="h-5.5 px-2 flex items-center gap-1 rounded border border-gray-200 text-[11px] text-gray-600 hover:bg-gray-50"
				href="/projects/{page.params.pid}/elevations?floor={activeFloor}">
				<Icon name="layers" size={11} /> Elevations
			</a>
		</div>

		<div class="flex-1 min-h-0 flex">
			<!-- Device tree sidebar -->
			<div class="w-60 shrink-0 bg-white border-r border-gray-200">
				<DeviceTree {editor} />
			</div>

			<!-- Bench -->
			<div class="flex-1 min-w-0 flex flex-col">
				<div class="flex-1 min-h-0 overflow-auto p-3">
					{#if benchRacks.length === 0}
						<div class="h-full flex items-center justify-center">
							<div class="text-center text-gray-400 text-xs space-y-1">
								<Icon name="cable" size={24} class="mx-auto text-gray-300" />
								<p class="font-medium text-gray-500">The bench is empty</p>
								<p>Add racks or devices from the list on the left —<br />each rack becomes a board of its ports.</p>
							</div>
						</div>
					{:else}
						<div class="flex flex-wrap gap-3 items-start">
							{#each benchRacks as rackId (rackId)}
								<RackBoard {editor} {rackId} />
							{/each}
						</div>
					{/if}
				</div>

				<!-- Patch list -->
				<div class="shrink-0 border-t border-gray-200 bg-white {listOpen ? 'h-64' : 'h-8'} transition-[height]">
					{#if listOpen}
						<div class="h-full overflow-hidden">
							<PatchListPane
								connections={editor.connections}
								racks={editor.racks}
								devices={editor.devices}
								customCableTypes={editor.customCableTypes}
								orphanedIds={editor.orphanedIds}
								selectedConnectionId={editor.selectedConnectionId}
								removedCount={editor.removedCount}
								portInfoMap={editor.portInfo}
								onselect={id => editor.selectConnection(id)}
								ontoggle={() => listOpen = false}
								onsetstatus={(ids, s) => editor.setConnectionStatus(ids, s)}
								ondelete={ids => editor.deleteConnections(ids)}
								onrestore={ids => editor.restoreConnections(ids)}
								onpurge={() => editor.purgeRemoved()}
								onupdate={(id, u) => editor.updateConnection(id, u)} />
						</div>
					{:else}
						<button class="w-full h-full px-3 flex items-center gap-2 text-[11px] text-gray-500 hover:bg-gray-50"
							onclick={() => listOpen = true}>
							<Icon name="chevronUp" size={12} />
							Patch list · {editor.activeConnections.length} cords
						</button>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>
