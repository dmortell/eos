<script lang="ts">
	import { Button, Icon } from '$lib'
	import { rackTypes, type RackConfig, type RackRow } from './types'

	let { racks = [], rows = [], activeRowId = '', selectedIds = new Set<string>(), onadd, onselect, onrangeselect, ondelete, onaddrow, onreorder }: {
		racks: RackConfig[]
		rows: RackRow[]
		activeRowId: string
		selectedIds: Set<string>
		onadd?: (form: { label: string; heightU: number; heightMm: number; widthMm: number; depthMm: number; type: string; maker: string; model: string }) => void
		onselect?: (rackId: string, multi?: boolean) => void
		onrangeselect?: (ids: string[]) => void
		ondelete?: (rackId: string) => void
		onaddrow?: () => void
		onreorder?: (orderedIds: string[]) => void
	} = $props()

	let formOpen = $state(false)
	let confirmingDelete = $state<string | null>(null)
	let form = $state({
		label: 'Rack ' + (racks.length + 1),
		heightU: 42,
		heightMm: 2000,
		widthMm: 700,
		depthMm: 800,
		type: '4-post' as const,
		maker: '',
		model: '',
	})

	let filteredRacks = $derived(
		activeRowId ? racks.filter(r => r.rowId === activeRowId) : racks
	)

	let sortedRacks = $derived(
		[...filteredRacks].sort((a, b) => a.order - b.order)
	)

	function handleListClick(e: MouseEvent, rackId: string, index: number) {
		if (e.shiftKey && selectedIds.size > 0) {
			const anchorIdx = sortedRacks.findIndex(r => selectedIds.has(r.id))
			if (anchorIdx >= 0) {
				const lo = Math.min(anchorIdx, index)
				const hi = Math.max(anchorIdx, index)
				const ids = sortedRacks.slice(lo, hi + 1).map(r => r.id)
				onrangeselect?.(ids)
				return
			}
		}
		onselect?.(rackId, e.ctrlKey || e.metaKey || e.shiftKey)
	}

	function submit() {
		onadd?.(form)
		form.label = ''
	}

	// ── Drag-to-reorder ──
	let dragId = $state<string | null>(null)
	let dropIndex = $state<number | null>(null)

	function handleDragStart(e: DragEvent, rackId: string) {
		if (!selectedIds.has(rackId)) onselect?.(rackId)
		dragId = rackId
		e.dataTransfer!.effectAllowed = 'move'
		e.dataTransfer!.setData('text/plain', rackId)
	}

	function handleDragOver(e: DragEvent, index: number) {
		e.preventDefault()
		e.dataTransfer!.dropEffect = 'move'
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
		dropIndex = e.clientY < rect.top + rect.height / 2 ? index : index + 1
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault()
		if (dragId == null || dropIndex == null) return

		const draggedIds = new Set(selectedIds.has(dragId) ? selectedIds : [dragId])
		const remaining = sortedRacks.filter(r => !draggedIds.has(r.id))
		const dragged = sortedRacks.filter(r => draggedIds.has(r.id))

		// Find insert position in the remaining array
		let insertAt = 0
		for (let i = 0; i < dropIndex; i++) {
			if (i < sortedRacks.length && !draggedIds.has(sortedRacks[i].id)) insertAt++
		}

		remaining.splice(insertAt, 0, ...dragged)
		onreorder?.(remaining.map(r => r.id))
		dragId = null
		dropIndex = null
	}

	function handleDragEnd() {
		dragId = null
		dropIndex = null
	}
</script>

<div class="space-y-2 p-2 border-b border-gray-200 print:hidden">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<span class="text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1">
			<Icon name="server" size={11} /> Racks
		</span>
		<div class="flex gap-1">
			{#if rows.length === 0 || activeRowId}
				<button class="p-0.5 rounded bg-gray-100 hover:bg-gray-200 transition-colors" title="Add a row of racks"
					onclick={onaddrow}>
					<Icon name="rows" size={12} />
				</button>
			{/if}
			<button class="p-0.5 rounded bg-gray-100 hover:bg-gray-200 transition-colors" title="Add Rack"
				onclick={() => formOpen = !formOpen}>
				<Icon name={formOpen ? 'chevronUp' : 'plus'} size={12} />
			</button>
		</div>
	</div>

	<!-- Add rack form -->
	{#if formOpen}
		<form class="grid grid-cols-2 gap-1 gap-x-2 text-xs" onsubmit={e => { e.preventDefault(); submit() }}>
			<label class="text-[10px] text-gray-500">Label
				<input class="w-full h-6 px-1 border border-gray-300 rounded text-xs" bind:value={form.label}
					placeholder={`Rack ${filteredRacks.length + 1}`} />
			</label>
			<label class="text-[10px] text-gray-500">Height (U)
				<input type="number" min="1" max="60" class="w-full h-6 px-1 border border-gray-300 rounded text-xs" bind:value={form.heightU} />
			</label>
			<label class="text-[10px] text-gray-500">Type
				<select class="w-full h-6 px-1 border border-gray-300 rounded text-xs" bind:value={form.type}>
				{#each rackTypes as rt}
					<option value={rt.id}>{rt.label}</option>
				{/each}
				</select>
			</label>
			<label class="text-[10px] text-gray-500">Width (mm)
				<input type="number" class="w-full h-6 px-1 border border-gray-300 rounded text-xs" bind:value={form.widthMm} />
			</label>
			<label class="text-[10px] text-gray-500">Maker
				<input class="w-full h-6 px-1 border border-gray-300 rounded text-xs" bind:value={form.maker} />
			</label>
			<div></div>
			<div class="col-span-2">
				<button type="submit" class="w-full h-7 bg-blue-600 text-white text-xs rounded hover:bg-blue-500 flex items-center justify-center gap-1 transition-colors">
					<Icon name="plus" size={12} /> Add Rack
				</button>
			</div>
		</form>
	{/if}

	<!-- Rack list -->
	{#if filteredRacks.length > 0}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="space-y-0.5 select-none" ondragover={e => e.preventDefault()} ondrop={handleDrop}>
			{#each sortedRacks as rack, i (rack.id)}
				{@const selected = selectedIds.has(rack.id)}
				{#if dropIndex === i && dragId}
					<div class="h-0.5 bg-blue-500 rounded-full mx-1"></div>
				{/if}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="flex items-center justify-between p-1 rounded text-xs cursor-pointer transition-colors select-none
						{selected ? 'bg-cyan-50 border border-cyan-300' : 'bg-gray-50 border border-gray-200 hover:bg-gray-100'}
						{dragId && (selectedIds.has(rack.id) || dragId === rack.id) ? 'opacity-40' : ''}"
					draggable="true"
					ondragstart={e => handleDragStart(e, rack.id)}
					ondragover={e => handleDragOver(e, i)}
					ondragend={handleDragEnd}
					onclick={(e) => handleListClick(e, rack.id, i)}>
					<div class="flex items-center gap-1" title="Drag to reorder">
						<Icon name="grip" size={10} class="text-gray-300 shrink-0 cursor-grab" />
						<span class="font-medium text-gray-700">{rack.label}</span>
						<span class="text-gray-400">{rack.heightU}U {rack.type}</span>
					</div>
					{#if confirmingDelete === rack.id}
						<div class="flex items-center gap-1 text-[10px]">
							<span class="text-red-600 font-medium">Delete?</span>
							<button class="px-1.5 py-0.5 bg-red-600 text-white rounded text-[10px] hover:bg-red-700"
								onclick={e => { e.stopPropagation(); ondelete?.(rack.id); confirmingDelete = null }}>Yes</button>
							<button class="px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded text-[10px] hover:bg-gray-300"
								onclick={e => { e.stopPropagation(); confirmingDelete = null }}>No</button>
						</div>
					{:else}
						<button class="text-red-400 hover:text-red-600 p-0.5" title="Delete"
							onclick={e => { e.stopPropagation(); confirmingDelete = rack.id }}>
							<Icon name="trash" size={11} />
						</button>
					{/if}
				</div>
			{/each}
			{#if dropIndex === sortedRacks.length && dragId}
				<div class="h-0.5 bg-blue-500 rounded-full mx-1"></div>
			{/if}
		</div>
	{:else}
		{#if !formOpen}
			<div class="text-center py-3">
				<p class="text-[10px] text-gray-400 mb-2">No racks yet</p>
				<Button class="px-3 py-1 bg-blue-600 text-white text-[10px] rounded hover:bg-blue-500 transition-colors" onclick={() => formOpen = true}>
					<Icon name="plus" size={10} /> Add Rack
				</Button>
			</div>
		{/if}
	{/if}
</div>
