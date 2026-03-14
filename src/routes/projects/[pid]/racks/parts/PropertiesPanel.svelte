<script lang="ts">
	import { Window } from '$lib'
	import { type RackConfig, type DeviceConfig, rackTypes, DEFAULT_SHELF_HEIGHTS } from './types'

	let { selectedRacks = [], selectedDevices = [], onupdaterack, onupdatedevice }: {
		selectedRacks?: RackConfig[]
		selectedDevices?: DeviceConfig[]
		onupdaterack?: (id: string, updates: Record<string, any>) => void
		onupdatedevice?: (id: string, updates: Record<string, any>) => void
	} = $props()

	let hasSelection = $derived(selectedRacks.length > 0 || selectedDevices.length > 0)
	let multiRack = $derived(selectedRacks.length > 1)
	let multiDevice = $derived(selectedDevices.length > 1)
	let selectedRack = $derived(selectedRacks[0] ?? null)
	let selectedDevice = $derived(selectedDevices[0] ?? null)

	let isRU = $derived(selectedRack && selectedRack.type !== 'desk' && selectedRack.type !== 'shelf' && selectedRack.type !== 'vcm')
	let hasShelves = $derived(selectedRack && !multiRack && (selectedRack.type === 'desk' || selectedRack.type === 'shelf'))

	/** Return the shared value across items, or undefined if mixed */
	function shared<T, I>(items: I[], fn: (item: I) => T): T | undefined {
		if (items.length === 0) return undefined
		const first = fn(items[0])
		return items.every(item => fn(item) === first) ? first : undefined
	}

	/** Apply an update to all selected racks */
	function updateAllRacks(updates: Record<string, any>) {
		for (const r of selectedRacks) onupdaterack?.(r.id, updates)
	}

	/** Apply an update to all selected devices */
	function updateAllDevices(updates: Record<string, any>) {
		for (const d of selectedDevices) onupdatedevice?.(d.id, updates)
	}

	let title = $derived.by(() => {
		if (selectedDevices.length > 1) return `Properties (${selectedDevices.length} devices)`
		if (selectedRacks.length > 1) return `Properties (${selectedRacks.length} racks)`
		return 'Properties'
	})

	let allPanels = $derived(selectedDevices.length > 0 && selectedDevices.every(d => d.type === 'panel'))
</script>

{#if hasSelection}
	<Window {title} open={true} top={70} right={20} class="w-56 p-2 overflow-hidden">
		{#if selectedDevices.length > 0}
			<div class="space-y-1 text-xs">
				{@render Field('label', shared(selectedDevices, d => d.label), v => updateAllDevices({ label: v }))}
				{#if !multiDevice}
					{@render Field('type', selectedDevice!.type)}
				{:else}
					{@render Field('type', shared(selectedDevices, d => d.type))}
				{/if}
				{#if !multiDevice}
					{@render NumberField('positionU', selectedDevice!.positionU, v => onupdatedevice?.(selectedDevice!.id, { positionU: v }))}
				{/if}
				{@render NumberField('heightU', shared(selectedDevices, d => d.heightU), v => updateAllDevices({ heightU: v }))}
				{@render NumberField('portCount', shared(selectedDevices, d => d.portCount), v => updateAllDevices({ portCount: v }))}
				{@render NumberField('widthMm', shared(selectedDevices, d => d.widthMm ?? 480), v => updateAllDevices({ widthMm: v }))}
				{#if !multiDevice}
					{@render NumberField('offsetX', selectedDevice!.offsetX ?? 0, v => onupdatedevice?.(selectedDevice!.id, { offsetX: Math.round(v / 25) * 25 }))}
				{/if}
				{#if allPanels}
					{@render SelectField('patchLevel', shared(selectedDevices, d => d.patchLevel ?? 'floor') ?? '', [['floor', 'Floor'], ['high', 'High-level']], v => updateAllDevices({ patchLevel: v }))}
					{@render SelectField('serverRoom', shared(selectedDevices, d => d.serverRoom ?? 'A') ?? '', [['A', 'A'], ['B', 'B'], ['C', 'C'], ['D', 'D']], v => updateAllDevices({ serverRoom: v }))}
				{/if}
				{@render Field('maker', shared(selectedDevices, d => d.maker ?? ''), v => updateAllDevices({ maker: v }))}
				{@render Field('model', shared(selectedDevices, d => d.model ?? ''), v => updateAllDevices({ model: v }))}
			</div>
		{:else if selectedRacks.length > 0}
			<div class="space-y-1 text-xs">
				{#if multiRack}
					{@render Field('label', shared(selectedRacks, r => r.label), v => updateAllRacks({ label: v }))}
				{:else}
					{@render Field('label', selectedRack!.label, v => onupdaterack?.(selectedRack!.id, { label: v }))}
				{/if}
				{@render SelectField('serverRoom', shared(selectedRacks, r => r.serverRoom ?? '') ?? '', [['', '—'], ['A', 'A'], ['B', 'B'], ['C', 'C'], ['D', 'D']], v => updateAllRacks({ serverRoom: v || undefined }))}
				{@render SelectField('type', shared(selectedRacks, r => r.type) ?? '', rackTypes.map(rt => [rt.id, rt.label]), v => updateAllRacks({ type: v }))}
				{#if isRU}
					{@render NumberField('heightU', shared(selectedRacks, r => r.heightU), v => updateAllRacks({ heightU: v }))}
				{:else}
					{@render NumberField('heightMm', shared(selectedRacks, r => r.heightMm), v => updateAllRacks({ heightMm: v }))}
				{/if}
				{@render NumberField('widthMm', shared(selectedRacks, r => r.widthMm), v => updateAllRacks({ widthMm: v }))}
				{@render NumberField('depthMm', shared(selectedRacks, r => r.depthMm), v => updateAllRacks({ depthMm: v }))}
				{#if hasShelves}
					{@const heights = selectedRack!.shelfHeights ?? DEFAULT_SHELF_HEIGHTS[selectedRack!.type] ?? [0,0,0,0]}
					{#each [0,1,2,3] as i}
						{@render NumberField(`shelf ${i+1}`, heights[i] ?? 0, v => {
							const h = [...heights]; h[i] = v;
							onupdaterack?.(selectedRack!.id, { shelfHeights: h })
						})}
					{/each}
				{/if}
				{@render Field('maker', shared(selectedRacks, r => r.maker ?? ''), v => updateAllRacks({ maker: v }))}
				{@render Field('model', shared(selectedRacks, r => r.model ?? ''), v => updateAllRacks({ model: v }))}
			</div>
		{/if}
	</Window>
{/if}

{#snippet Field(key: string, value: string | undefined, onchange?: (v: string) => void)}
	<label class="flex gap-2 items-center">
		<span class="w-16 text-gray-500 text-[10px] shrink-0">{key}</span>
		{#if onchange}
			<input value={value ?? ''} class="flex-1 min-w-0 h-6 px-1 border-b border-gray-300 text-xs"
				placeholder={value === undefined ? 'mixed' : ''}
				onchange={e => onchange(e.currentTarget.value)} />
		{:else}
			<span class="text-gray-700">{value ?? ''}</span>
		{/if}
	</label>
{/snippet}

{#snippet SelectField(key: string, value: string, options: [string, string][], onchange?: (v: string) => void)}
	<label class="flex gap-2 items-center">
		<span class="w-16 text-gray-500 text-[10px] shrink-0">{key}</span>
		<select class="flex-1 min-w-0 h-6 px-1 border-b border-gray-300 text-xs" {value}
			onchange={e => onchange?.(e.currentTarget.value)}>
			{#if !options.some(([v]) => v === value)}
				<option value="" disabled selected>mixed</option>
			{/if}
			{#each options as [val, label]}
				<option value={val} selected={val === value}>{label}</option>
			{/each}
		</select>
	</label>
{/snippet}

{#snippet NumberField(key: string, value: number | undefined, onchange?: (v: number) => void)}
	<label class="flex gap-2 items-center">
		<span class="w-16 text-gray-500 text-[10px] shrink-0">{key}</span>
		{#if onchange}
			<input type="number" value={value ?? ''} class="flex-1 min-w-0 h-6 px-1 border-b border-gray-300 text-xs"
				placeholder={value === undefined ? 'mixed' : ''}
				onchange={e => onchange(parseInt(e.currentTarget.value) || 0)} />
		{:else}
			<span class="text-gray-700">{value ?? ''}</span>
		{/if}
	</label>
{/snippet}
