<script lang="ts">
	import { Icon, Window } from '$lib'
	import type { TrunkConfig, PipeSpec, RectSpec, PipeCatalog, RectCatalog } from './types'
	import { LOCATION_LABELS, PIPE_CATALOG, RECT_CATALOG, TRUNK_COLORS } from './constants'
	import { computeTrunkLength } from './geometry'

	let { trunks, selectedTrunkIds, selectedIds = new Set(), selectedRackIds = new Set(),
		onupdate, onupdateselected, ondelete }: {
		trunks: TrunkConfig[]
		selectedTrunkIds: Set<string>
		selectedIds?: Set<string>
		selectedRackIds?: Set<string>
		onupdate: (id: string, updates: Partial<TrunkConfig>) => void
		onupdateselected: (updates: Partial<TrunkConfig>) => void
		ondelete: () => void
	} = $props()

	let selectedTrunks = $derived(trunks.filter(t => selectedTrunkIds.has(t.id)))
	let singleTrunk = $derived(selectedTrunks.length === 1 ? selectedTrunks[0] : null)

	function sharedTrunk<K extends keyof TrunkConfig>(key: K): TrunkConfig[K] | undefined {
		const vals = selectedTrunks.map(t => t[key])
		const first = vals[0]
		return vals.every(v => v === first) ? first : undefined
	}
</script>

<Window title="Trunk Properties" open={true} right={16} top={selectedIds.size > 0 ? 480 : (selectedRackIds.size > 0 ? 320 : 48)} class="p-3 space-y-1.5 text-xs w-56">
	<div class="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">
		{singleTrunk ? (singleTrunk.label || singleTrunk.id.slice(0, 8)) : `${selectedTrunkIds.size} trunks`}
	</div>

	{#if singleTrunk}
		<label class="flex items-center gap-2">
			<span class="text-gray-500 w-14 shrink-0">Label</span>
			<input type="text" class="flex-1 h-5 px-1.5 text-xs font-mono border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
				value={singleTrunk.label ?? ''}
				onchange={e => onupdate(singleTrunk!.id, { label: e.currentTarget.value || undefined })} />
		</label>
	{/if}

	<label class="flex items-center gap-2">
		<span class="text-gray-500 w-14 shrink-0">Shape</span>
		<div class="flex gap-1 flex-1">
			<button class="flex-1 py-0.5 rounded text-[10px] {sharedTrunk('shape') === 'rect' ? 'bg-orange-100 text-orange-700 font-medium' : 'text-gray-400 hover:bg-gray-50 border border-gray-200'}"
				onclick={() => {
					const cat = RECT_CATALOG.MK3
					onupdateselected({ shape: 'rect', spec: { catalog: 'MK3', widthMm: cat.widthMm, heightMm: cat.heightMm } })
				}}>Rect</button>
			<button class="flex-1 py-0.5 rounded text-[10px] {sharedTrunk('shape') === 'pipe' ? 'bg-purple-100 text-purple-700 font-medium' : 'text-gray-400 hover:bg-gray-50 border border-gray-200'}"
				onclick={() => {
					const cat = PIPE_CATALOG.PF28
					onupdateselected({ shape: 'pipe', spec: { catalog: 'PF28', innerDiameterMm: cat.innerMm, outerDiameterMm: cat.outerMm } })
				}}>Pipe</button>
		</div>
	</label>

	<label class="flex items-center gap-2">
		<span class="text-gray-500 w-14 shrink-0">Location</span>
		<select class="flex-1 h-5 px-1 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
			value={sharedTrunk('location') ?? ''}
			onchange={e => { if (e.currentTarget.value) onupdateselected({ location: e.currentTarget.value as any }) }}>
			{#if !sharedTrunk('location')}<option value="">— mixed —</option>{/if}
			{#each Object.entries(LOCATION_LABELS) as [val, label]}
				<option value={val}>{label}</option>
			{/each}
		</select>
	</label>

	<!-- Type (catalog) — only for single trunk since spec structure differs by shape -->
	{#if singleTrunk}
		<label class="flex items-center gap-2">
			<span class="text-gray-500 w-14 shrink-0">Type</span>
			{#if singleTrunk.shape === 'pipe'}
				<select class="flex-1 h-5 px-1 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
					value={(singleTrunk.spec as PipeSpec).catalog}
					onchange={e => {
						const cat = PIPE_CATALOG[e.currentTarget.value as PipeCatalog]
						if (cat) onupdate(singleTrunk!.id, { spec: { catalog: e.currentTarget.value as any, innerDiameterMm: cat.innerMm, outerDiameterMm: cat.outerMm } })
					}}>
					{#each Object.entries(PIPE_CATALOG) as [val, cat]}
						<option value={val}>{cat.label}</option>
					{/each}
				</select>
			{:else}
				<select class="flex-1 h-5 px-1 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
					value={(singleTrunk.spec as RectSpec).catalog}
					onchange={e => {
						const cat = RECT_CATALOG[e.currentTarget.value as RectCatalog]
						if (cat) onupdate(singleTrunk!.id, { spec: { catalog: e.currentTarget.value as any, widthMm: cat.widthMm, heightMm: cat.heightMm } })
					}}>
					{#each Object.entries(RECT_CATALOG) as [val, cat]}
						<option value={val}>{cat.label}</option>
					{/each}
				</select>
			{/if}
		</label>
	{/if}

	<!-- Color -->
	<div class="flex items-center gap-2">
		<span class="text-gray-500 w-14 shrink-0">Color</span>
		{#if singleTrunk}
			<input type="color" class="w-6 h-5 rounded border border-gray-200 cursor-pointer"
				value={singleTrunk.color ?? TRUNK_COLORS[singleTrunk.shape]}
				onchange={e => onupdate(singleTrunk!.id, { color: e.currentTarget.value })} />
			{#if singleTrunk.color}
				<button class="text-[10px] text-gray-400 hover:text-gray-600"
					onclick={() => onupdate(singleTrunk!.id, { color: undefined })}>Reset</button>
			{/if}
		{:else}
			<input type="color" class="w-6 h-5 rounded border border-gray-200 cursor-pointer"
				value={sharedTrunk('color') ?? '#888888'}
				onchange={e => onupdateselected({ color: e.currentTarget.value })} />
			<button class="text-[10px] text-gray-400 hover:text-gray-600"
				onclick={() => onupdateselected({ color: undefined })}>Reset</button>
		{/if}
	</div>

	<!-- Rooms -->
	{#if singleTrunk}
		<div class="flex items-center gap-2">
			<span class="text-gray-500 w-14 shrink-0">Rooms</span>
			<div class="flex gap-0.5 flex-1">
				{#each ['A', 'B', 'C', 'D'] as room}
					{@const active = (singleTrunk.rooms ?? []).includes(room)}
					<button class="flex-1 py-0.5 rounded text-[10px] {active ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-400 hover:bg-gray-50 border border-gray-200'}"
						onclick={() => {
							const current = singleTrunk!.rooms ?? []
							if (active && current.length > 1) onupdate(singleTrunk!.id, { rooms: current.filter(r => r !== room) })
							else if (!active) onupdate(singleTrunk!.id, { rooms: [...current, room] })
						}}>{room}</button>
				{/each}
			</div>
		</div>

		<!-- Stats -->
		<div class="flex items-center gap-2 text-[10px] text-gray-400">
			<span class="w-14">Nodes</span>
			<span class="font-mono">{singleTrunk.nodes.length}</span>
		</div>
		<div class="flex items-center gap-2 text-[10px] text-gray-400">
			<span class="w-14">Length</span>
			<span class="font-mono">{(computeTrunkLength(singleTrunk) / 1000).toFixed(2)} m</span>
		</div>
	{/if}

	<div class="flex items-center gap-1 pt-1 border-t border-gray-100">
		<button class="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-red-500 border border-red-200 rounded hover:bg-red-50 transition-colors"
			onclick={ondelete}>
			<Icon name="trash" size={10} /> Delete {selectedTrunks.length > 1 ? selectedTrunks.length : ''}
		</button>
	</div>
</Window>
