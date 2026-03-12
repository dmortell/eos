<script lang="ts">
	import { Button, Icon } from '$lib'
	import { rackTypes, type RackConfig, type RackRow } from './types'

	let { racks = [], rows = [], activeRowId = '', onadd, onselect, ondelete, onaddrow }: {
		racks: RackConfig[]
		rows: RackRow[]
		activeRowId: string
		onadd?: (form: { label: string; heightU: number; heightMm: number; widthMm: number; depthMm: number; type: string; maker: string; model: string }) => void
		onselect?: (rackId: string) => void
		ondelete?: (rackId: string) => void
		onaddrow?: () => void
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

	function submit() {
		onadd?.(form)
		form.label = ''
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
			<button class="p-0.5 rounded bg-gray-100 hover:bg-gray-200 transition-colors" title="Toggle form"
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
					<!-- <option value="2-post">2-post</option> -->
					<!-- <option value="4-post">4-post</option> -->
					<!-- <option value="cabinet">Cabinet</option> -->
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
		<div class="space-y-0.5">
			{#each filteredRacks.sort((a, b) => a.order - b.order) as rack (rack.id)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="flex items-center justify-between p-1 bg-gray-50 border border-gray-200 rounded text-xs hover:bg-gray-100 cursor-pointer transition-colors"
					onclick={() => onselect?.(rack.id)}>
					<div>
						<span class="font-medium text-gray-700">{rack.label}</span>
						<span class="text-gray-400 ml-1">{rack.heightU}U {rack.type}</span>
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
