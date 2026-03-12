<script lang="ts">
	import { Window } from '$lib'
	import { type RackConfig, type DeviceConfig, rackTypes, DEFAULT_SHELF_HEIGHTS } from './types'

	let isRU = $derived(selectedRack && selectedRack.type !== 'desk' && selectedRack.type !== 'shelf' && selectedRack.type !== 'vcm')
	let hasShelves = $derived(selectedRack && (selectedRack.type === 'desk' || selectedRack.type === 'shelf'))

	let { selectedRack = null, selectedDevice = null, onupdaterack, onupdatedevice }: {
		selectedRack?: (RackConfig & Record<string, any>) | null
		selectedDevice?: DeviceConfig | null
		onupdaterack?: (id: string, updates: Record<string, any>) => void
		onupdatedevice?: (id: string, updates: Record<string, any>) => void
	} = $props()

	let hasSelection = $derived(!!selectedRack || !!selectedDevice)
</script>

{#if hasSelection}
	<Window title="Properties" open={true} top={70} right={20} class="w-56 p-2">
		{#if selectedDevice}
			<div class="space-y-1 text-xs">
				{@render Field('label', selectedDevice.label, v => onupdatedevice?.(selectedDevice!.id, { label: v }))}
				{@render Field('type', selectedDevice.type)}
				{@render NumberField('positionU', selectedDevice.positionU, v => onupdatedevice?.(selectedDevice!.id, { positionU: v }))}
				{@render NumberField('heightU', selectedDevice.heightU, v => onupdatedevice?.(selectedDevice!.id, { heightU: v }))}
				{@render NumberField('portCount', selectedDevice.portCount, v => onupdatedevice?.(selectedDevice!.id, { portCount: v }))}
				{#if selectedDevice.widthMm}
					{@render NumberField('widthMm', selectedDevice.widthMm, v => onupdatedevice?.(selectedDevice!.id, { widthMm: v }))}
				{/if}
				{#if selectedDevice.type === 'panel'}
					{@render SelectField('patchLevel', selectedDevice.patchLevel ?? 'floor', [['floor', 'Floor'], ['high', 'High-level']], v => onupdatedevice?.(selectedDevice!.id, { patchLevel: v }))}
					{@render SelectField('serverRoom', selectedDevice.serverRoom ?? 'A', [['A', 'A'], ['B', 'B'], ['C', 'C'], ['D', 'D']], v => onupdatedevice?.(selectedDevice!.id, { serverRoom: v }))}
				{/if}
				{@render Field('maker', selectedDevice.maker ?? '', v => onupdatedevice?.(selectedDevice!.id, { maker: v }))}
				{@render Field('model', selectedDevice.model ?? '', v => onupdatedevice?.(selectedDevice!.id, { model: v }))}
			</div>
		{:else if selectedRack}
			<div class="space-y-1 text-xs">
				{@render Field('label', selectedRack.label, v => onupdaterack?.(selectedRack!.id, { label: v }))}
				{@render SelectField('serverRoom', selectedRack.serverRoom ?? '', [['', '—'], ['A', 'A'], ['B', 'B'], ['C', 'C'], ['D', 'D']], v => onupdaterack?.(selectedRack!.id, { serverRoom: v || undefined }))}
				{@render SelectField('type', selectedRack.type, rackTypes.map(rt => [rt.id, rt.label]), v => onupdaterack?.(selectedRack!.id, { type: v }))}
				{#if isRU}
					{@render NumberField('heightU', selectedRack.heightU, v => onupdaterack?.(selectedRack!.id, { heightU: v }))}
				{:else}
					{@render NumberField('heightMm', selectedRack.heightMm, v => onupdaterack?.(selectedRack!.id, { heightMm: v }))}
				{/if}
				{@render NumberField('widthMm', selectedRack.widthMm, v => onupdaterack?.(selectedRack!.id, { widthMm: v }))}
				{@render NumberField('depthMm', selectedRack.depthMm, v => onupdaterack?.(selectedRack!.id, { depthMm: v }))}
				{#if hasShelves}
					{@const heights = selectedRack.shelfHeights ?? DEFAULT_SHELF_HEIGHTS[selectedRack.type] ?? [0,0,0,0]}
					{#each [0,1,2,3] as i}
						{@render NumberField(`shelf ${i+1}`, heights[i] ?? 0, v => {
							const h = [...heights]; h[i] = v;
							onupdaterack?.(selectedRack!.id, { shelfHeights: h })
						})}
					{/each}
				{/if}
				{@render Field('maker', selectedRack.maker ?? '', v => onupdaterack?.(selectedRack!.id, { maker: v }))}
				{@render Field('model', selectedRack.model ?? '', v => onupdaterack?.(selectedRack!.id, { model: v }))}
			</div>
		{/if}
	</Window>
{/if}

{#snippet Field(key: string, value: string, onchange?: (v: string) => void)}
	<label class="flex gap-2 items-center">
		<span class="w-16 text-gray-500 text-[10px] shrink-0">{key}</span>
		{#if onchange}
			<input {value} class="flex-1 h-6 px-1 border-b border-gray-300 text-xs"
				onchange={e => onchange(e.currentTarget.value)} />
		{:else}
			<span class="text-gray-700">{value}</span>
		{/if}
	</label>
{/snippet}

{#snippet SelectField(key: string, value: string, options: [string, string][], onchange?: (v: string) => void)}
	<label class="flex gap-2 items-center">
		<span class="w-16 text-gray-500 text-[10px] shrink-0">{key}</span>
		<select class="flex-1 h-6 px-1 border-b border-gray-300 text-xs" {value}
			onchange={e => onchange?.(e.currentTarget.value)}>
			{#each options as [val, label]}
				<option value={val} selected={val === value}>{label}</option>
			{/each}
		</select>
	</label>
{/snippet}

{#snippet NumberField(key: string, value: number, onchange?: (v: number) => void)}
	<label class="flex gap-2 items-center">
		<span class="w-16 text-gray-500 text-[10px] shrink-0">{key}</span>
		{#if onchange}
			<input type="number" {value} class="flex-1 h-6 px-1 border-b border-gray-300 text-xs"
				onchange={e => onchange(parseInt(e.currentTarget.value) || 0)} />
		{:else}
			<span class="text-gray-700">{value}</span>
		{/if}
	</label>
{/snippet}
