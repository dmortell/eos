<script lang="ts">
	/**
	 * Docked polymorphic inspector — one panel whose sections render by selection
	 * kind (rack / device / mixed multi). Replaces the racks tool's overlapping
	 * floating PropertiesPanel + DeviceProperties windows. Field snippets carry
	 * the shared "— mixed —" handling once.
	 */
	import { Icon } from '$lib'
	import type { ElevationsEditor } from '../editor.svelte'
	import { rackTypes, DEFAULT_SHELF_HEIGHTS, type RackConfig, type DeviceConfig } from '../../racks/parts/types'

	let { editor }: { editor: ElevationsEditor } = $props()

	let racks = $derived(editor.selectedRacks)
	let devs = $derived(editor.selectedDevices)
	let rack = $derived(racks[0] ?? null)
	let device = $derived(devs[0] ?? null)
	let rackMulti = $derived(racks.length > 1)
	let devMulti = $derived(devs.length > 1)
	let allPanels = $derived(devs.length > 0 && devs.every(d => d.type === 'panel'))

	function sharedRack<T>(fn: (r: RackConfig) => T): T | undefined {
		if (racks.length === 0) return undefined
		const first = fn(racks[0])
		return racks.every(r => fn(r) === first) ? first : undefined
	}
	function sharedDev<T>(fn: (d: DeviceConfig) => T): T | undefined {
		if (devs.length === 0) return undefined
		const first = fn(devs[0])
		return devs.every(d => fn(d) === first) ? first : undefined
	}
	function updateRacks(updates: Record<string, any>) {
		for (const r of racks) editor.updateRack(r.id, updates)
	}
	function updateDevs(updates: Record<string, any>) {
		for (const d of devs) editor.updateDevice(d.id, updates)
	}

	let isRU = $derived(rack && rack.type !== 'desk' && rack.type !== 'shelf' && rack.type !== 'vcm')
	let hasShelves = $derived(rack && !rackMulti && (rack.type === 'desk' || rack.type === 'shelf'))
	let hasDerivedFrame = $derived(rack && rack.type !== 'desk' && rack.type !== 'shelf' && rack.type !== 'vcm')
</script>

<div class="w-60 shrink-0 border-l border-gray-200 bg-white flex flex-col overflow-y-auto print:hidden">
	{#if !rack && !device}
		<div class="p-4 text-[11px] text-gray-400 leading-relaxed">
			Select a rack or device to edit its properties.
			<div class="mt-2 text-gray-300">Drag devices from the Library tab onto a rack. Ctrl+drag copies.</div>
		</div>
	{/if}

	{#if rack}
		<div class="border-b border-gray-100">
			<div class="px-2 py-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 bg-gray-50">
				<Icon name="server" size={12} />
				{rackMulti ? `Rack (${racks.length})` : rack.label}
			</div>
			<div class="p-2 space-y-1 text-xs">
				{@render Field('label', sharedRack(r => r.label), v => updateRacks({ label: v }))}
				{@render SelectField('serverRoom', sharedRack(r => r.serverRoom ?? '') ?? '', [['', '—'], ['A', 'A'], ['B', 'B'], ['C', 'C'], ['D', 'D']], v => updateRacks({ serverRoom: v || undefined }))}
				{@render SelectField('type', sharedRack(r => r.type) ?? '', rackTypes.map(rt => [rt.id, rt.label] as [string, string]), v => updateRacks({ type: v }))}
				{#if isRU}
					{@render NumberField('heightU', sharedRack(r => r.heightU), v => updateRacks({ heightU: v }))}
				{:else}
					{@render NumberField('heightMm', sharedRack(r => r.heightMm), v => updateRacks({ heightMm: v }))}
				{/if}
				{@render NumberField('widthMm', sharedRack(r => r.widthMm), v => updateRacks({ widthMm: v }))}
				{@render NumberField('depthMm', sharedRack(r => r.depthMm), v => updateRacks({ depthMm: v }))}
				{#if hasShelves && rack}
					{@const heights = rack.shelfHeights ?? DEFAULT_SHELF_HEIGHTS[rack.type] ?? [0, 0, 0, 0]}
					{#each [0, 1, 2, 3] as i}
						{@render NumberField(`shelf ${i + 1}`, heights[i] ?? 0, v => {
							const h = [...heights]; h[i] = v
							editor.updateRack(rack!.id, { shelfHeights: h })
						})}
					{/each}
				{/if}
				{@render Field('maker', sharedRack(r => r.maker ?? ''), v => updateRacks({ maker: v }))}
				{@render Field('model', sharedRack(r => r.model ?? ''), v => updateRacks({ model: v }))}
				{#if rack.sku}
					{@render Field('sku', sharedRack(r => r.sku ?? ''), undefined)}
				{/if}

				{#if !rackMulti && hasDerivedFrame && editor.projectId}
					<a
						class="flex items-center gap-1 px-2 py-1 mt-1 rounded border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 text-[11px] font-medium no-underline"
						href={`/projects/${editor.projectId}/frames?floor=${editor.floor}&frame=${encodeURIComponent(rack.id)}`}
						title="Open this rack's patch frame in the Frames tool">
						<Icon name="link" size={11} /> Open in Frames tool
					</a>
				{/if}

				<label class="flex gap-2 items-start">
					<span class="w-16 text-gray-500 text-[10px] shrink-0 pt-1">notes</span>
					<textarea
						rows="2"
						value={sharedRack(r => r.notes ?? '') ?? ''}
						placeholder={sharedRack(r => r.notes) === undefined ? 'mixed' : ''}
						class="flex-1 min-w-0 px-1 py-0.5 border border-gray-300 rounded text-xs resize-y"
						onchange={e => updateRacks({ notes: e.currentTarget.value || undefined })}></textarea>
				</label>
			</div>
		</div>
	{/if}

	{#if device}
		<div class="border-b border-gray-100">
			<div class="px-2 py-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 bg-gray-50">
				<Icon name="layers" size={12} />
				{devMulti ? `Device (${devs.length})` : device.label}
			</div>
			<div class="p-2 space-y-1 text-xs">
				{@render Field('label', sharedDev(d => d.label), v => updateDevs({ label: v }))}
				{@render Field('type', sharedDev(d => d.type))}
				{#if !devMulti}
					{@render NumberField('positionU', device.positionU, v => editor.updateDevice(device!.id, { positionU: v }))}
				{/if}
				{@render NumberField('heightU', sharedDev(d => d.heightU), v => updateDevs({ heightU: v }))}
				{@render NumberField('portCount', sharedDev(d => d.portCount), v => updateDevs({ portCount: v }))}
				{@render NumberField('widthMm', sharedDev(d => d.widthMm ?? 480), v => updateDevs({ widthMm: v }))}
				{@render NumberField('depthMm', sharedDev(d => d.depthMm ?? 0), v => updateDevs({ depthMm: v || undefined }))}
				{@render SelectField('mounting', sharedDev(d => d.mounting ?? 'both') ?? '', [['front', 'Front'], ['rear', 'Rear'], ['both', 'Both'], ['none', 'None']], v => updateDevs({ mounting: v }))}
				{#if !devMulti}
					{@render NumberField('offsetX', device.offsetX ?? 0, v => editor.updateDevice(device!.id, { offsetX: Math.round(v / 25) * 25 }))}
				{/if}
				{#if allPanels}
					{@render SelectField('patchLevel', sharedDev(d => d.patchLevel ?? 'floor') ?? '', [['floor', 'Floor'], ['high', 'High-level']], v => updateDevs({ patchLevel: v }))}
					{@render SelectField('serverRoom', sharedDev(d => d.serverRoom ?? 'A') ?? '', [['A', 'A'], ['B', 'B'], ['C', 'C'], ['D', 'D']], v => updateDevs({ serverRoom: v }))}
				{/if}
				{@render Field('maker', sharedDev(d => d.maker ?? ''), v => updateDevs({ maker: v }))}
				{@render Field('model', sharedDev(d => d.model ?? ''), v => updateDevs({ model: v }))}
			</div>
		</div>
	{/if}
</div>

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
