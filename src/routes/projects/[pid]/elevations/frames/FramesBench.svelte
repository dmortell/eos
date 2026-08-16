<script lang="ts">
	/**
	 * Frames tab of the Elevations tool (§14 F-1) — the termination map.
	 * Rear rack boards (panels only) + a destination pane (Locations coverage,
	 * F-2 adds the embedded floorplan + other-racks tabs) + the links table.
	 */
	import { Icon, Spinner, type Firestore } from '$lib'
	import { FramesEditor, ROOMS } from './frames-editor.svelte'
	import PanelTree from './PanelTree.svelte'
	import RearRackBoard from './RearRackBoard.svelte'
	import { LOC_TYPE_COLORS } from '$lib/elevation/loc-colors'
	import { isLocationEnd } from '$lib/elevation/links'

	let { db, pid, floor }: { db: Firestore; pid: string; floor: number } = $props()

	const editor = new FramesEditor(db)
	let ready = $state(false)

	$effect(() => {
		if (!pid) return
		editor.pid = pid
		editor.floor = floor
		editor.roomData = {}
		editor.loadBench()
		ready = false
		const unsubs = [
			db.subscribeOne('frames', editor.framesDocId(), (d: any) => { editor.syncFrames(d); ready = true }),
			...ROOMS.map(room =>
				db.subscribeOne('racks', editor.roomDocId(room), (d: any) => { editor.syncRoom(room, d); ready = true })),
		]
		return () => unsubs.forEach(u => u?.())
	})

	// Undo/redo + Esc (Elevations' handler stands down on this view)
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
			} else if (e.key === 'Escape') {
				if (editor.termArm) editor.disarmTerm()
				else if (editor.termSel.length) editor.cancelTermSel()
				else if (editor.selectedLinkId) editor.selectedLinkId = null
			}
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	})

	let benchRacks = $derived(editor.bench.filter(id => editor.rackById.has(id)))
	let selectedLink = $derived(editor.selectedLinkId ? editor.links[editor.selectedLinkId] ?? null : null)
	let expandedLoc = $state<string | null>(null)

	function bakeAll() {
		if (!confirm(`Bake ${editor.bakeableCount} engine-allocated label(s) into stored strings?\n\nBaked labels become the truth: they stop moving on re-generation and become structural links. This is not undoable (clearing a label stays a per-port action in the Elevation view).`)) return
		const n = editor.bakeAllocation()
		editor.statusHint = `Baked ${n} label(s) — links created`
	}
	let linkCounts = $derived.by(() => {
		const all = Object.values(editor.links)
		return { total: all.length, ties: all.filter(l => !isLocationEnd(l.b)).length }
	})
	let listOpen = $state(true)
</script>

<div class="flex-1 min-h-0 flex bg-gray-50">
	<!-- Panel tree sidebar -->
	<div class="w-60 shrink-0 bg-white border-r border-gray-200 print:hidden">
		<PanelTree {editor} />
	</div>

	<!-- Boards + destination pane -->
	<div class="flex-1 min-w-0 flex flex-col">
		<div class="h-7 px-2 flex items-center gap-2 bg-white border-b border-gray-200 text-[11px] shrink-0 print:hidden">
			<Icon name="link" size={12} />
			<span class="font-semibold text-gray-700">Termination map</span>
			<span class="text-gray-400">{linkCounts.total} link{linkCounts.total !== 1 ? 's' : ''}{linkCounts.ties ? ` · ${linkCounts.ties} ties` : ''} · {benchRacks.length} board{benchRacks.length !== 1 ? 's' : ''}</span>
			{#if editor.statusHint}
				<span class="text-amber-600 font-medium truncate">{editor.statusHint}</span>
			{/if}
			<div class="flex-1"></div>
			<span class="text-gray-400">Cable</span>
			<select class="h-5.5 px-1 border border-gray-200 rounded bg-white text-[11px]" bind:value={editor.stickyLinkCable}>
				<option value="">—</option>
				<option value="cat5e">Cat5e</option>
				<option value="cat6">Cat6</option>
				<option value="cat6a">Cat6a</option>
				<option value="os2">OS2 SM</option>
				<option value="om4">OM4 MM</option>
			</select>
			{#if editor.termSel.length > 0}
				<span class="text-purple-600 font-medium">{editor.termSel.length} selected{editor.termSelLinkedCount ? ` (${editor.termSelLinkedCount} linked)` : ''}</span>
				{#if editor.termSelLinkedCount > 0}
					<button class="h-5 px-1.5 rounded border border-red-200 text-[10px] text-red-500 hover:bg-red-50"
						title="Remove the links of the selected linked ports"
						onclick={() => editor.clearSelectedLinks()}>Clear {editor.termSelLinkedCount} link{editor.termSelLinkedCount !== 1 ? 's' : ''}</button>
				{/if}
				{#if editor.termSelUnlinkedCount > 0}
					<span class="text-[10px] text-gray-400">→ pick a location's “⇐” button</span>
				{/if}
				<button class="h-5 px-1.5 rounded border border-gray-200 text-[10px] text-gray-500 hover:bg-gray-50" onclick={() => editor.cancelTermSel()}>Cancel</button>
			{/if}
			{#if editor.bakeableCount > 0}
				<button class="h-5 px-2 rounded border border-blue-200 bg-blue-50 text-[10px] text-blue-600 hover:bg-blue-100"
					title="Store the current engine-allocated labels as baked strings so they become structural links ({editor.bakeableCount} ports). Not undoable — labels stop moving on re-generation."
					onclick={bakeAll}>Bake allocation ({editor.bakeableCount})</button>
			{/if}
			<span class="text-[10px] text-gray-300">{editor.saveStatus === 'Saved' ? '' : 'Unsaved…'}</span>
			<button class="h-5 px-1.5 rounded text-gray-400 hover:bg-gray-100" title="Undo (Ctrl+Z)" onclick={() => editor.history.undo()}><Icon name="undo" size={12} /></button>
			<button class="h-5 px-1.5 rounded text-gray-400 hover:bg-gray-100" title="Redo (Ctrl+Y)" onclick={() => editor.history.redo()}><Icon name="redo" size={12} /></button>
		</div>

		<div class="flex-1 min-h-0 flex">
			<!-- Rear boards -->
			<div class="flex-1 min-w-0 overflow-auto p-3">
				{#if !ready}
					<div class="h-full flex items-center justify-center"><Spinner /></div>
				{:else if benchRacks.length === 0}
					<div class="h-full flex items-center justify-center">
						<div class="text-center text-gray-400 text-xs space-y-1">
							<Icon name="link" size={24} class="mx-auto text-gray-300" />
							<p class="font-medium text-gray-500">No boards on the bench</p>
							<p>Add racks or panels from the list on the left —<br />boards show the rear termination state of each panel.</p>
						</div>
					</div>
				{:else}
					<div class="flex flex-wrap gap-3 items-start">
						{#each benchRacks as rackId (rackId)}
							<RearRackBoard {editor} {rackId} />
						{/each}
					</div>
				{/if}
			</div>

			<!-- Destination pane (F-1: Locations coverage; F-2 adds floorplan + other racks) -->
			<div class="w-64 shrink-0 bg-white border-l border-gray-200 flex flex-col print:hidden">
				<div class="h-6 px-2 flex items-center gap-2 text-[10px] uppercase tracking-wider text-gray-400 font-medium border-b border-gray-100">
					Locations
					<span class="normal-case font-normal">· linked coverage</span>
				</div>
				<div class="flex-1 overflow-y-auto p-1">
					{#each editor.locations as l (l.id)}
						{@const linked = editor.linkedPortsByLocation.get(l.id) ?? 0}
						{@const expanded = expandedLoc === l.id}
						<div>
							<div class="flex items-center gap-1.5 px-1.5 py-0.5 text-[11px] rounded {editor.termArm || editor.termSelUnlinkedCount ? 'hover:bg-blue-50' : 'hover:bg-gray-50'}">
								<button class="flex items-center gap-1.5 flex-1 min-w-0 text-left" onclick={() => expandedLoc = expanded ? null : l.id}>
									<span class="px-1 rounded border font-mono text-[10px] shrink-0 {LOC_TYPE_COLORS[l.locationType] ?? 'bg-gray-100 border-gray-200 text-gray-600'}">{l.locationType}</span>
									<span class="font-mono text-gray-700">{l.zone}-{String(l.locationNumber).padStart(3, '0')}</span>
								</button>
								{#if editor.termSelUnlinkedCount > 0 && linked < l.portCount}
									<button class="h-4.5 px-1 shrink-0 rounded bg-purple-500 text-white text-[9px] hover:bg-purple-400"
										title="Terminate the {editor.termSelUnlinkedCount} selected port(s) to this location's free ports, in order"
										onclick={() => editor.terminateBlockTo(l.id)}>⇐ {Math.min(editor.termSelUnlinkedCount, l.portCount - linked)}</button>
								{/if}
								<span class="shrink-0 text-[10px] {linked >= l.portCount ? 'text-emerald-600' : linked > 0 ? 'text-amber-600' : 'text-gray-300'}">
									{linked}/{l.portCount}
								</span>
							</div>
							{#if expanded}
								<div class="flex flex-wrap gap-0.5 px-2 pb-1">
									{#each Array.from({ length: l.portCount }, (_, i) => i + 1) as p (p)}
										{@const taken = editor.linkedLocPorts.get(l.id)?.has(p)}
										<button class="w-7 h-5 rounded-sm border text-[9px] font-mono
												{taken ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : editor.termArm ? 'bg-blue-50 border-blue-300 text-blue-600 hover:bg-blue-100' : 'bg-gray-50 border-gray-200 text-gray-400'}"
											title={taken ? `Port ${p} — linked` : editor.termArm ? `Terminate ${editor.labelOf(editor.termArm.deviceId, editor.termArm.portIndex)} → ${l.zone}-${String(l.locationNumber).padStart(3, '0')} p${p}` : `Port ${p} — free`}
											onclick={() => editor.locationPortClick(l.id, p)}>p{p}</button>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
					{#if editor.locations.length === 0}
						<div class="p-2 text-[11px] text-gray-400">No locations on this floor yet.</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- Links table -->
		<div class="shrink-0 border-t border-gray-200 bg-white {listOpen ? 'h-56' : 'h-8'} print:hidden">
			{#if listOpen}
				<div class="h-full flex flex-col">
					<button class="h-7 px-3 shrink-0 flex items-center gap-2 text-[11px] text-gray-500 hover:bg-gray-50 border-b border-gray-100"
						onclick={() => listOpen = false}>
						<Icon name="chevronDown" size={12} />
						<span class="font-medium text-gray-600">Structured links</span> · {linkCounts.total}
					</button>
					<div class="flex-1 overflow-y-auto">
						<table class="w-full text-[11px]">
							<thead class="sticky top-0 bg-gray-50 text-gray-500">
								<tr class="text-left">
									<th class="px-2 py-1">Panel port</th>
									<th class="px-2 py-1">Far end</th>
									<th class="px-2 py-1 w-16">Kind</th>
									<th class="px-2 py-1 w-24">Cable</th>
									<th class="px-2 py-1 w-24">Status</th>
									<th class="px-2 py-1 w-8"></th>
								</tr>
							</thead>
							<tbody>
								{#each editor.linkList as l (l.id)}
									{@const isSel = editor.selectedLinkId === l.id}
									<tr class="border-t border-gray-100 cursor-pointer {isSel ? 'bg-blue-50' : 'hover:bg-gray-50'}"
										onclick={() => editor.selectedLinkId = isSel ? null : l.id}>
										<td class="px-2 py-0.5 font-mono">{editor.labelOf(l.a.deviceId, l.a.portIndex)}</td>
										<td class="px-2 py-0.5 font-mono">{editor.endLabel(l)}</td>
										<td class="px-2 py-0.5">
											<span class="px-1 rounded border text-[10px] {isLocationEnd(l.b) ? 'bg-sky-50 border-sky-200 text-sky-600' : 'bg-violet-50 border-violet-200 text-violet-600'}">
												{isLocationEnd(l.b) ? 'run' : 'tie'}
											</span>
										</td>
										<td class="px-2 py-0.5">
											<input class="w-20 h-5 px-1 border border-transparent hover:border-gray-200 rounded bg-transparent text-[11px]"
												value={l.cableType ?? ''} placeholder="—"
												onclick={e => e.stopPropagation()}
												onchange={e => editor.setLinkAttrs(l.id, { cableType: e.currentTarget.value || undefined })} />
										</td>
										<td class="px-2 py-0.5">
											<select class="h-5 px-0.5 border border-transparent hover:border-gray-200 rounded bg-transparent text-[11px]"
												value={l.status}
												onclick={e => e.stopPropagation()}
												onchange={e => editor.setLinkAttrs(l.id, { status: e.currentTarget.value as any })}>
												<option value="design">design</option>
												<option value="installed">installed</option>
											</select>
										</td>
										<td class="px-2 py-0.5">
											<button class="w-4 h-4 flex items-center justify-center rounded text-gray-600 hover:text-red-600 hover:bg-red-50"
												title="Remove this link"
												onclick={e => { e.stopPropagation(); editor.removeLink(l.id) }}>×</button>
										</td>
									</tr>
								{/each}
								{#if editor.linkList.length === 0}
									<tr><td colspan="6" class="px-2 py-3 text-center text-gray-400">No structured links yet — they bootstrap from baked labels as rooms load.</td></tr>
								{/if}
							</tbody>
						</table>
					</div>
					{#if selectedLink}
						<div class="h-6 px-3 shrink-0 flex items-center gap-2 border-t border-gray-100 text-[10px] text-gray-500 bg-gray-50">
							<span class="font-mono">{editor.labelOf(selectedLink.a.deviceId, selectedLink.a.portIndex)}</span>
							→ <span class="font-mono">{editor.endLabel(selectedLink)}</span>
							· {isLocationEnd(selectedLink.b) ? 'outlet run' : 'tie'} · {selectedLink.status}
						</div>
					{/if}
				</div>
			{:else}
				<button class="w-full h-full px-3 flex items-center gap-2 text-[11px] text-gray-500 hover:bg-gray-50"
					onclick={() => listOpen = true}>
					<Icon name="chevronUp" size={12} />
					Structured links · {linkCounts.total}
				</button>
			{/if}
		</div>
	</div>
</div>
