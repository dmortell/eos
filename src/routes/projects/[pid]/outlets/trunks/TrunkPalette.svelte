<script lang="ts">
	import { Icon } from '$lib'
	import type { TrunkConfig, TrunkShape, TrunkLocation, PipeSpec, RectSpec, PipeCatalog, RectCatalog } from './types'
	import { trunkWidthMm, type TrunkNode } from './types'
	import { PIPE_CATALOG, RECT_CATALOG, LOCATION_LABELS, TRUNK_COLORS, DEFAULT_TRUNK_Z } from './constants'
	import { computeTrunkLength } from './geometry'

	let { trunks = [], selectedTrunkIds = new Set(), selectedNodeIds = new Set(), activeTool = 'select',
		onselect, ontoolchange, ondelete, ontogglevisibility, onupdatetrunk }: {
		trunks: TrunkConfig[]
		selectedTrunkIds: Set<string>
		selectedNodeIds: Set<string>
		activeTool: string
		onselect: (trunkId: string, multi: boolean) => void
		ontoolchange: (tool: 'select' | 'trunk') => void
		ondelete: () => void
		ontogglevisibility: (trunkId: string) => void
		onupdatetrunk: (trunkId: string, updates: Partial<TrunkConfig>) => void
	} = $props()

	// ── Drawing settings (sticky for new trunks) ──
	let shape = $state<TrunkShape>('rect')
	let location = $state<TrunkLocation>('floor')
	let pipeCatalog = $state<PipeCatalog>('PF28')
	let rectCatalog = $state<RectCatalog>('MK3')
	let customPipeOuter = $state(33)
	let customRectW = $state(100)
	let customRectH = $state(50)
	let defaultZ = $state(DEFAULT_TRUNK_Z)
	let defaultRooms = $state<string[]>(['A'])

	const ROOM_OPTIONS = ['A', 'B', 'C', 'D']

	/** Build current spec from drawing settings */
	export function currentSpec(): PipeSpec | RectSpec {
		if (shape === 'pipe') {
			const cat = PIPE_CATALOG[pipeCatalog]
			if (pipeCatalog === 'custom') return { catalog: 'custom', innerDiameterMm: customPipeOuter - 8, outerDiameterMm: customPipeOuter }
			return { catalog: pipeCatalog, innerDiameterMm: cat.innerMm, outerDiameterMm: cat.outerMm }
		}
		const cat = RECT_CATALOG[rectCatalog]
		if (rectCatalog === 'custom') return { catalog: 'custom', widthMm: customRectW, heightMm: customRectH }
		return { catalog: rectCatalog, widthMm: cat.widthMm, heightMm: cat.heightMm }
	}

	export function currentShape(): TrunkShape { return shape }
	export function currentLocation(): TrunkLocation { return location }
	export function currentZ(): number { return defaultZ }
	export function currentRooms(): string[] { return defaultRooms }

	// ── Selection info ──
	let selectedTrunks = $derived(trunks.filter(t => selectedTrunkIds.has(t.id)))
	let singleTrunk = $derived(selectedTrunks.length === 1 ? selectedTrunks[0] : null)

	let selectedNodes = $derived.by(() => {
		if (!singleTrunk) return []
		return singleTrunk.nodes.filter(n => selectedNodeIds.has(n.id))
	})
	let singleNode = $derived(selectedNodes.length === 1 ? selectedNodes[0] : null)

	const inputCls = 'w-full h-5 px-1.5 text-xs font-mono border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400'
	const selectCls = 'w-full h-5 px-1 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400'
	const labelCls = 'text-gray-500 text-[10px] w-16 shrink-0'
</script>

<div class="h-full flex flex-col text-xs">
	<!-- Drawing settings -->
	<div class="p-2 border-b border-gray-200 space-y-1.5">
		<div class="flex items-center gap-2 mb-1">
			<button
				class="flex-1 py-1 rounded text-[11px] font-medium transition-colors
					{activeTool === 'trunk' ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:bg-gray-100 border border-gray-200'}"
				onclick={() => ontoolchange(activeTool === 'trunk' ? 'select' : 'trunk')}
			>
				<Icon name="route" size={12} class="inline -mt-0.5" />
				{activeTool === 'trunk' ? 'Drawing...' : 'Draw Trunk'}
			</button>
		</div>

		<!-- Shape toggle -->
		<div class="flex items-center gap-2">
			<span class={labelCls}>Shape</span>
			<div class="flex gap-1 flex-1">
				<button class="flex-1 py-0.5 rounded text-[10px] {shape === 'pipe' ? 'bg-purple-100 text-purple-700 font-medium' : 'text-gray-400 hover:bg-gray-50 border border-gray-200'}"
					onclick={() => shape = 'pipe'}>Pipe</button>
				<button class="flex-1 py-0.5 rounded text-[10px] {shape === 'rect' ? 'bg-orange-100 text-orange-700 font-medium' : 'text-gray-400 hover:bg-gray-50 border border-gray-200'}"
					onclick={() => shape = 'rect'}>Rect</button>
			</div>
		</div>

		<!-- Location -->
		<div class="flex items-center gap-2">
			<span class={labelCls}>Location</span>
			<select class={selectCls} bind:value={location}>
				{#each Object.entries(LOCATION_LABELS) as [val, label]}
					<option value={val}>{label}</option>
				{/each}
			</select>
		</div>

		<!-- Catalog -->
		<div class="flex items-center gap-2">
			<span class={labelCls}>Type</span>
			{#if shape === 'pipe'}
				<select class={selectCls} bind:value={pipeCatalog}>
					{#each Object.entries(PIPE_CATALOG) as [val, cat]}
						<option value={val}>{cat.label}</option>
					{/each}
				</select>
			{:else}
				<select class={selectCls} bind:value={rectCatalog}>
					{#each Object.entries(RECT_CATALOG) as [val, cat]}
						<option value={val}>{cat.label}</option>
					{/each}
				</select>
			{/if}
		</div>

		<!-- Custom dimensions -->
		{#if shape === 'pipe' && pipeCatalog === 'custom'}
			<div class="flex items-center gap-2">
				<span class={labelCls}>Outer ø</span>
				<input type="number" min="10" max="500" class={inputCls} bind:value={customPipeOuter} />
				<span class="text-[10px] text-gray-400">mm</span>
			</div>
		{/if}
		{#if shape === 'rect' && rectCatalog === 'custom'}
			<div class="flex items-center gap-2">
				<span class={labelCls}>Width</span>
				<input type="number" min="10" max="1000" class={inputCls} bind:value={customRectW} />
				<span class="text-[10px] text-gray-400">mm</span>
			</div>
			<div class="flex items-center gap-2">
				<span class={labelCls}>Height</span>
				<input type="number" min="5" max="500" class={inputCls} bind:value={customRectH} />
				<span class="text-[10px] text-gray-400">mm</span>
			</div>
		{/if}

		<!-- Z elevation -->
		<div class="flex items-center gap-2">
			<span class={labelCls}>Z elev</span>
			<input type="number" step="100" class={inputCls} bind:value={defaultZ} />
			<span class="text-[10px] text-gray-400">mm</span>
		</div>

		<!-- Rooms -->
		<div class="flex items-center gap-2">
			<span class={labelCls}>Rooms</span>
			<div class="flex gap-0.5 flex-1">
				{#each ROOM_OPTIONS as room}
					{@const active = defaultRooms.includes(room)}
					<button class="flex-1 py-0.5 rounded text-[10px] {active ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-400 hover:bg-gray-50 border border-gray-200'}"
						onclick={() => {
							if (active && defaultRooms.length > 1) defaultRooms = defaultRooms.filter(r => r !== room)
							else if (!active) defaultRooms = [...defaultRooms, room]
						}}>{room}</button>
				{/each}
			</div>
		</div>
	</div>

	<!-- Trunk list -->
	<div class="flex-1 min-h-0 overflow-y-auto">
		<div class="px-2 py-1 text-[10px] text-gray-400 uppercase tracking-wider font-medium sticky top-0 bg-white border-b border-gray-100">
			Trunks ({trunks.length})
		</div>
		{#if trunks.length === 0}
			<div class="p-4 text-center text-gray-400 text-[11px]">No trunks yet</div>
		{:else}
			{#each trunks as trunk (trunk.id)}
				{@const selected = selectedTrunkIds.has(trunk.id)}
				{@const color = trunk.color ?? TRUNK_COLORS[trunk.shape]}
				{@const len = computeTrunkLength(trunk)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div class="w-full flex items-center gap-1.5 px-2 py-1 text-left transition-colors cursor-pointer
						{selected ? 'bg-cyan-50 text-cyan-800' : 'hover:bg-gray-50 text-gray-600'}"
					onclick={(e) => onselect(trunk.id, e.ctrlKey || e.metaKey)}
					role="button" tabindex="0"
				>
					<!-- Visibility toggle -->
					<button
						class="shrink-0 text-gray-500 hover:text-gray-700 p-0.5"
						onclick={(e) => { e.stopPropagation(); ontogglevisibility(trunk.id) }}
					>
						<Icon name={trunk.visible !== false ? 'eye' : 'eyeSlash'} size={11} />
					</button>

					<!-- Color dot -->
					<span class="shrink-0 w-2 h-2 rounded-full" style:background={color}></span>

					<!-- Label -->
					<span class="flex-1 truncate text-[11px]">
						{trunk.label || trunk.id.slice(0, 8)}
					</span>

					<!-- Info -->
					<span class="shrink-0 text-[9px] text-gray-400 font-mono">
						{trunk.nodes.length}n {(len / 1000).toFixed(1)}m
					</span>
				</div>
			{/each}
		{/if}
	</div>

	<!-- Selected trunk properties -->
	{#if singleTrunk}
		{@const isPipe = singleTrunk.shape === 'pipe'}
		{@const spec = singleTrunk.spec}
		<div class="border-t border-gray-200 p-2 space-y-1.5">
			<div class="text-[10px] text-gray-400 uppercase tracking-wider font-medium">
				{singleTrunk.label || singleTrunk.id.slice(0, 12)}
			</div>

			<div class="flex items-center gap-2">
				<span class={labelCls}>Label</span>
				<input type="text" class={inputCls}
					value={singleTrunk.label ?? ''}
					onchange={(e) => onupdatetrunk(singleTrunk.id, { label: e.currentTarget.value || undefined })} />
			</div>

			<!-- Shape -->
			<div class="flex items-center gap-2">
				<span class={labelCls}>Shape</span>
				<div class="flex gap-1 flex-1">
					<button class="flex-1 py-0.5 rounded text-[10px] {isPipe ? 'bg-purple-100 text-purple-700 font-medium' : 'text-gray-400 hover:bg-gray-50 border border-gray-200'}"
						onclick={() => {
							const cat = PIPE_CATALOG.PF28
							onupdatetrunk(singleTrunk.id, { shape: 'pipe', spec: { catalog: 'PF28', innerDiameterMm: cat.innerMm, outerDiameterMm: cat.outerMm } })
						}}>Pipe</button>
					<button class="flex-1 py-0.5 rounded text-[10px] {!isPipe ? 'bg-orange-100 text-orange-700 font-medium' : 'text-gray-400 hover:bg-gray-50 border border-gray-200'}"
						onclick={() => {
							const cat = RECT_CATALOG.MK3
							onupdatetrunk(singleTrunk.id, { shape: 'rect', spec: { catalog: 'MK3', widthMm: cat.widthMm, heightMm: cat.heightMm } })
						}}>Rect</button>
				</div>
			</div>

			<!-- Location -->
			<div class="flex items-center gap-2">
				<span class={labelCls}>Location</span>
				<select class={selectCls}
					value={singleTrunk.location}
					onchange={(e) => onupdatetrunk(singleTrunk.id, { location: e.currentTarget.value as TrunkLocation })}>
					{#each Object.entries(LOCATION_LABELS) as [val, label]}
						<option value={val}>{label}</option>
					{/each}
				</select>
			</div>

			<!-- Type (catalog) -->
			<div class="flex items-center gap-2">
				<span class={labelCls}>Type</span>
				{#if isPipe}
					<select class={selectCls}
						value={(spec as PipeSpec).catalog}
						onchange={(e) => {
							const cat = PIPE_CATALOG[e.currentTarget.value as PipeCatalog]
							if (cat) onupdatetrunk(singleTrunk.id, { spec: { catalog: e.currentTarget.value as PipeCatalog, innerDiameterMm: cat.innerMm, outerDiameterMm: cat.outerMm } })
						}}>
						{#each Object.entries(PIPE_CATALOG) as [val, cat]}
							<option value={val}>{cat.label}</option>
						{/each}
					</select>
				{:else}
					<select class={selectCls}
						value={(spec as RectSpec).catalog}
						onchange={(e) => {
							const cat = RECT_CATALOG[e.currentTarget.value as RectCatalog]
							if (cat) onupdatetrunk(singleTrunk.id, { spec: { catalog: e.currentTarget.value as RectCatalog, widthMm: cat.widthMm, heightMm: cat.heightMm } })
						}}>
						{#each Object.entries(RECT_CATALOG) as [val, cat]}
							<option value={val}>{cat.label}</option>
						{/each}
					</select>
				{/if}
			</div>

			<!-- Dimensions -->
			{#if isPipe}
				<div class="flex items-center gap-2">
					<span class={labelCls}>Outer ø</span>
					<input type="number" min="10" max="500" class={inputCls}
						value={(spec as PipeSpec).outerDiameterMm}
						onchange={(e) => {
							const outer = parseInt(e.currentTarget.value) || 33
							onupdatetrunk(singleTrunk.id, { spec: { ...(spec as PipeSpec), outerDiameterMm: outer, innerDiameterMm: outer - 8 } })
						}} />
					<span class="text-[10px] text-gray-400">mm</span>
				</div>
			{:else}
				<div class="flex items-center gap-2">
					<span class={labelCls}>Width</span>
					<input type="number" min="10" max="1000" class={inputCls}
						value={(spec as RectSpec).widthMm}
						onchange={(e) => onupdatetrunk(singleTrunk.id, { spec: { ...(spec as RectSpec), widthMm: parseInt(e.currentTarget.value) || 100 } })} />
					<span class="text-[10px] text-gray-400">mm</span>
				</div>
				<div class="flex items-center gap-2">
					<span class={labelCls}>Height</span>
					<input type="number" min="5" max="500" class={inputCls}
						value={(spec as RectSpec).heightMm}
						onchange={(e) => onupdatetrunk(singleTrunk.id, { spec: { ...(spec as RectSpec), heightMm: parseInt(e.currentTarget.value) || 50 } })} />
					<span class="text-[10px] text-gray-400">mm</span>
				</div>
			{/if}

			<!-- Color override -->
			<div class="flex items-center gap-2">
				<span class={labelCls}>Color</span>
				<input type="color" class="w-6 h-5 rounded border border-gray-200 cursor-pointer"
					value={singleTrunk.color ?? TRUNK_COLORS[singleTrunk.shape]}
					onchange={(e) => onupdatetrunk(singleTrunk.id, { color: e.currentTarget.value })} />
				{#if singleTrunk.color}
					<button class="text-[10px] text-gray-400 hover:text-gray-600"
						onclick={() => onupdatetrunk(singleTrunk.id, { color: undefined })}>Reset</button>
				{/if}
			</div>

			<!-- Rooms -->
			<div class="flex items-center gap-2">
				<span class={labelCls}>Rooms</span>
				<div class="flex gap-0.5 flex-1">
					{#each ROOM_OPTIONS as room}
						{@const active = (singleTrunk.rooms ?? []).includes(room)}
						<button class="flex-1 py-0.5 rounded text-[10px] {active ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-400 hover:bg-gray-50 border border-gray-200'}"
							onclick={() => {
								const current = singleTrunk.rooms ?? []
								if (active && current.length > 1) onupdatetrunk(singleTrunk.id, { rooms: current.filter(r => r !== room) })
								else if (!active) onupdatetrunk(singleTrunk.id, { rooms: [...current, room] })
							}}>{room}</button>
					{/each}
				</div>
			</div>

			<!-- Stats -->
			<div class="flex items-center gap-2 text-[10px] text-gray-400">
				<span class="w-16">Nodes</span>
				<span class="font-mono">{singleTrunk.nodes.length}</span>
			</div>
			<div class="flex items-center gap-2 text-[10px] text-gray-400">
				<span class="w-16">Length</span>
				<span class="font-mono">{(computeTrunkLength(singleTrunk) / 1000).toFixed(2)} m</span>
			</div>

			{#if singleNode}
				<div class="border-t border-gray-100 pt-1.5 mt-1.5">
					<div class="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">Node</div>
					<div class="flex items-center gap-2 text-[10px] text-gray-400">
						<span class="w-16">Pos</span>
						<span class="font-mono">{Math.round(singleNode.position.x)}, {Math.round(singleNode.position.y)}</span>
					</div>
					<div class="flex items-center gap-2">
						<span class={labelCls}>Z</span>
						<input type="number" step="100" class={inputCls}
							value={singleNode.z}
							onchange={(e) => {
								const z = parseInt(e.currentTarget.value) || 0
								const updatedNodes = singleTrunk.nodes.map(n => n.id === singleNode.id ? { ...n, z } : n)
								onupdatetrunk(singleTrunk.id, { nodes: updatedNodes })
							}} />
						<span class="text-[10px] text-gray-400">mm</span>
					</div>
					<div class="flex items-center gap-2">
						<span class={labelCls}>Radius</span>
						<input type="number" min="0" max="500" step="50" class={inputCls}
							value={singleNode.radius ?? 0}
							onchange={(e) => {
								const radius = parseInt(e.currentTarget.value) || 0
								const updatedNodes = singleTrunk.nodes.map(n => n.id === singleNode.id ? { ...n, radius } : n)
								onupdatetrunk(singleTrunk.id, { nodes: updatedNodes })
							}} />
						<span class="text-[10px] text-gray-400">mm</span>
					</div>
				</div>
			{/if}

			<div class="flex gap-1 pt-1 border-t border-gray-100">
				<button class="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-red-500 border border-red-200 rounded hover:bg-red-50 transition-colors"
					onclick={ondelete}>
					<Icon name="trash" size={10} /> Delete
				</button>
			</div>
		</div>
	{:else if selectedTrunks.length > 1}
		<div class="border-t border-gray-200 p-2 space-y-1.5">
			<div class="text-[10px] text-gray-400 uppercase tracking-wider font-medium">
				{selectedTrunks.length} trunks selected
			</div>
			<button class="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-red-500 border border-red-200 rounded hover:bg-red-50 transition-colors"
				onclick={ondelete}>
				<Icon name="trash" size={10} /> Delete
			</button>
		</div>
	{/if}
</div>
