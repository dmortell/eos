<script lang="ts">
	/**
	 * Patching tab of the Elevations tool (elevations-plan.md §13, P-1) —
	 * the patch bench. Embedded component: Elevations owns the Titlebar,
	 * view tabs and floor switching; this owns its own subscriptions
	 * (multi-room racks/patching + frames docs) and the bench UI.
	 */
	import { Icon, Spinner, type Firestore } from '$lib'
	import { BenchEditor, ROOMS } from './bench.svelte'
	import DeviceTree from './DeviceTree.svelte'
	import RackBoard from './RackBoard.svelte'
	import PatchListPane from '../../patching/parts/PatchListPane.svelte'
	import { CABLE_TYPES } from '../../patching/parts/constants'
	import { tipHost } from '../parts/instantTip'
	import { DEFAULT_LOC_TYPES } from '../../frames/parts/types'
	import { LOC_TYPE_COLORS, LOC_TYPE_LABELS } from '$lib/elevation/loc-colors'

	let { db, pid, floor, seed = null }: {
		db: Firestore
		pid: string
		floor: number
		/** One-shot: racks to add to the bench (Inspector "Patch…" hand-off); ts forces reapply. */
		seed?: { rackIds: string[]; deviceId?: string; ts: number } | null
	} = $props()

	const editor = new BenchEditor(db)
	let ready = $state(false)
	let listOpen = $state(true)

	// (Re)subscribe on pid/floor change
	$effect(() => {
		if (!pid) return
		editor.pid = pid
		editor.floor = floor
		editor.roomData = {}
		editor.patchDocs = {}
		editor.loadBench()
		ready = false
		const unsubs = [
			db.subscribeOne('frames', editor.framesDocId(), (d: any) => {
				editor.syncFrames(d)
				if (d?.floorFormat) editor.floorFormat = d.floorFormat
				ready = true
			}),
			...ROOMS.flatMap(room => [
				db.subscribeOne('racks', editor.roomDocId(room), (d: any) => { editor.syncRoom(room, d); ready = true }),
				db.subscribeOne('patching', editor.roomDocId(room), (d: any) => editor.syncPatch(room, d)),
			]),
		]
		return () => unsubs.forEach(u => u?.())
	})

	// Apply the Elevations hand-off (re-applies when its ts changes)
	$effect(() => {
		if (!seed) return
		seed.ts // dependency
		for (const rackId of seed.rackIds) editor.addToBench(rackId)
		if (seed.deviceId) editor.highlightDeviceId = seed.deviceId
	})

	// Undo/redo + Esc while the tab is mounted (Elevations' handler stands down on this view)
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
			} else if ((e.key === 'Delete' || e.key === 'Backspace') && editor.selectedConnectionId) {
				e.preventDefault()
				editor.deleteConnections([editor.selectedConnectionId])
			} else if (e.key === 'Escape') {
				if (editor.bulkPreviewOpen) editor.bulkPreviewOpen = false
				else if (editor.bulkDest || editor.bulkSel.length) editor.cancelBulk()
				else if (editor.patchArm) editor.disarm()
				else if (editor.highlightPortKey) editor.highlightPortKey = null
				else if (editor.selectedConnectionId) editor.selectConnection(null)
			}
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	})

	let benchRacks = $derived(editor.bench.filter(id => editor.rackById.has(id)))
	let locTypes = $derived([
		...DEFAULT_LOC_TYPES.filter(t => t !== 'N/A'),
		...(editor.framesDoc?.customLocationTypes ?? []),
	])
</script>

<div class="flex-1 min-h-0 flex bg-gray-50">
	<!-- Device tree sidebar -->
	<div class="w-60 shrink-0 bg-white border-r border-gray-200 print:hidden">
		<DeviceTree {editor} />
	</div>

	<!-- Bench -->
	<div class="flex-1 min-w-0 flex flex-col">
		<div class="h-7 px-2 flex items-center gap-2 bg-white border-b border-gray-200 text-[11px] shrink-0 print:hidden">
			<Icon name="cable" size={12} />
			<span class="font-semibold text-gray-700">Patch bench</span>
			<span class="text-gray-400">{editor.activeConnections.length} cords · {benchRacks.length} board{benchRacks.length !== 1 ? 's' : ''}</span>
			{#if editor.statusHint}
				<span class="text-amber-600 font-medium truncate">{editor.statusHint}</span>
			{/if}
			<div class="flex-1"></div>
			<span class="text-[10px] text-gray-300">{editor.saveStatus === 'Saved' ? '' : 'Unsaved…'}</span>
			<button class="h-5 px-1.5 rounded text-gray-400 hover:bg-gray-100" title="Undo (Ctrl+Z)" onclick={() => editor.history.undo()}><Icon name="undo" size={12} /></button>
			<button class="h-5 px-1.5 rounded text-gray-400 hover:bg-gray-100" title="Redo (Ctrl+Y)" onclick={() => editor.history.redo()}><Icon name="redo" size={12} /></button>
		</div>

		<!-- Attributes + filter (P-2): sticky cord attributes for the next patch; port filter -->
		<div class="h-8 px-2 flex items-center gap-2 bg-white border-b border-gray-200 text-[11px] shrink-0 print:hidden">
			<span class="text-gray-400">Cable</span>
			<select class="h-5.5 px-1 border border-gray-200 rounded bg-white text-[11px]" bind:value={editor.stickyCable.type}>
				{#each CABLE_TYPES as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
				{#each editor.customCableTypes as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
			</select>
			<span class="text-gray-400">Status</span>
			<select class="h-5.5 px-1 border border-gray-200 rounded bg-white text-[11px]" bind:value={editor.stickyCable.status}>
				<option value="add">Add</option>
				<option value="change">Change</option>
				<option value="installed">Installed</option>
			</select>
			<div class="w-px h-4 bg-gray-200"></div>
			<div class="relative">
				<Icon name="search" size={11} class="absolute left-1.5 top-1/2 -translate-y-1/2 text-gray-300" />
				<input class="h-5.5 w-44 pl-6 pr-2 border border-gray-200 rounded text-[11px]"
					placeholder="Filter ports… (Enter = next)"
					bind:value={editor.filter.q}
					onkeydown={e => {
						if (e.key === 'Enter') { e.preventDefault(); editor.jumpNext() }
						else if (e.key === 'Escape') { e.preventDefault(); editor.clearFilter(); (e.currentTarget as HTMLInputElement).blur() }
					}} />
			</div>
			<div class="flex gap-0.5">
				{#each locTypes as t (t)}
					<button class="px-1 h-5 rounded border font-mono text-[10px] {LOC_TYPE_COLORS[t] ?? 'bg-gray-100 border-gray-200 text-gray-600'} {editor.filter.types.includes(t) ? 'ring-2 ring-blue-400' : 'opacity-70 hover:opacity-100'}"
						title={LOC_TYPE_LABELS[t] ?? t}
						onclick={() => editor.toggleFilterType(t)}>{t}</button>
				{/each}
			</div>
			<label class="flex items-center gap-1 text-gray-500">
				<input type="checkbox" bind:checked={editor.filter.freeOnly} /> free only
			</label>
			{#if editor.filterActive}
				<button class="h-5 px-1.5 rounded border border-gray-200 text-[10px] text-gray-500 hover:bg-gray-50" onclick={() => editor.clearFilter()}>Clear</button>
			{/if}
			<div class="flex-1"></div>
			<!-- Bulk flow (P-3): Ctrl+click sources → Patch to… → pick destinations → preview -->
			{#if editor.bulkDest}
				<span class="text-purple-600 font-medium">{editor.bulkDest.length}/{editor.bulkSel.length} destinations</span>
				<button class="h-5 px-1.5 rounded border border-gray-200 text-[10px] text-gray-500 hover:bg-gray-50" onclick={() => editor.cancelBulk()}>Cancel</button>
			{:else if editor.bulkSel.length > 0}
				<span class="text-purple-600 font-medium">{editor.bulkSel.length} source{editor.bulkSel.length !== 1 ? 's' : ''}</span>
				<button class="h-5 px-2 rounded bg-blue-600 text-white text-[10px] hover:bg-blue-500" onclick={() => editor.beginBulkDest()}>Patch to…</button>
				<button class="h-5 px-1.5 rounded border border-gray-200 text-[10px] text-gray-500 hover:bg-gray-50" onclick={() => editor.cancelBulk()}>Clear</button>
			{/if}
		</div>

		<div class="flex-1 min-h-0 overflow-auto p-3" use:tipHost>
			{#if !ready}
				<div class="h-full flex items-center justify-center"><Spinner /></div>
			{:else if benchRacks.length === 0}
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

		<!-- Circuit trace (P-4): full id-based chain through the selected cord -->
		{#if editor.circuit}
			<div class="shrink-0 border-t border-gray-200 bg-slate-50 px-2 py-1 flex items-center gap-1 overflow-x-auto text-[11px] print:hidden" use:tipHost>
				<span class="text-[10px] uppercase tracking-wide font-semibold text-gray-400 shrink-0 mr-1">Circuit</span>
				{#each editor.circuit.nodes as n, i (i)}
					{#if i > 0}
						{@const e = editor.circuit.edges[i - 1]}
						<span class="shrink-0 px-1 rounded text-[9px] border
								{e.kind === 'cord' ? 'bg-blue-50 border-blue-200 text-blue-600'
								: e.kind === 'tie' ? 'bg-violet-50 border-violet-200 text-violet-600'
								: 'bg-sky-50 border-sky-200 text-sky-600'}">
							{e.kind === 'cord' ? 'cord' : e.kind === 'tie' ? 'tie' : 'run'}
						</span>
						<span class="text-gray-300 shrink-0">→</span>
					{/if}
					{#if n.type === 'port'}
						{@const dev = editor.devices.find(d => d.id === n.deviceId)}
						<button class="shrink-0 px-1.5 py-0.5 rounded border border-gray-200 bg-white font-mono hover:border-blue-300 hover:bg-blue-50"
							data-tip={editor.traceNodeContext(n) + '\nclick: show this device on the bench'}
							onclick={() => { if (dev) editor.showDevice(dev) }}>{editor.traceNodeLabel(n)}</button>
					{:else}
						<span class="shrink-0 px-1.5 py-0.5 rounded border border-emerald-200 bg-emerald-50 font-mono text-emerald-700"
							data-tip="outlet / location — the structured run's far end">{editor.traceNodeLabel(n)}</span>
					{/if}
				{/each}
			</div>
		{/if}

		<!-- Patch list -->
		<div class="shrink-0 border-t border-gray-200 bg-white {listOpen ? 'h-64' : 'h-8'} print:hidden">
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

<!-- Bulk mapping preview (P-3): nothing is created until Create -->
{#if editor.bulkPreviewOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="fixed inset-0 bg-black/30 z-50 flex items-center justify-center print:hidden" onclick={() => editor.bulkPreviewOpen = false}>
		<div class="bg-white rounded-lg shadow-xl border border-gray-200 p-4 w-[440px] max-h-[70vh] flex flex-col" onclick={e => e.stopPropagation()}>
			<div class="flex items-center gap-2 mb-2">
				<Icon name="cable" size={14} />
				<span class="text-sm font-semibold text-gray-700">Bulk patch — {editor.bulkPairs.length} pair{editor.bulkPairs.length !== 1 ? 's' : ''}</span>
				<div class="flex-1"></div>
				<span class="text-[11px] text-gray-400">{editor.stickyCable.type} · {editor.stickyCable.status}</span>
			</div>
			<div class="flex-1 overflow-y-auto border border-gray-100 rounded">
				<table class="w-full text-[11px]">
					<tbody>
						{#each editor.bulkPairs as pair, i (pair.src)}
							<tr class="border-t border-gray-100 first:border-t-0 {pair.crossRoom ? 'bg-amber-50' : ''}">
								<td class="px-2 py-1 w-6 text-gray-400">{i + 1}</td>
								<td class="px-2 py-1 font-mono">{pair.srcLabel}</td>
								<td class="px-1 py-1 text-gray-400">→</td>
								<td class="px-2 py-1 font-mono">{pair.dstLabel}</td>
								<td class="px-2 py-1 text-right">
									{#if pair.crossRoom}<span class="text-[10px] text-amber-600" title="Endpoints are in different rooms — this pair will be skipped">skipped</span>{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="flex gap-2 justify-end mt-3">
				<button class="px-3 py-1.5 text-xs rounded border border-gray-200 hover:bg-gray-50" onclick={() => editor.cancelBulk()}>Cancel</button>
				<button class="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-500"
					onclick={() => editor.createBulk()}>Create {editor.bulkPairs.filter(p => !p.crossRoom).length}</button>
			</div>
		</div>
	</div>
{/if}
