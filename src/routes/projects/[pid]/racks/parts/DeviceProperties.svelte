<script lang="ts">
	import { Window } from '$lib'
	import type { DeviceConfig } from './types'

	let { devices = [], onupdate }: {
		devices?: DeviceConfig[]
		onupdate?: (id: string, updates: Record<string, any>) => void
	} = $props()

	let multi = $derived(devices.length > 1)
	let device = $derived(devices[0] ?? null)
	let allPanels = $derived(devices.length > 0 && devices.every(d => d.type === 'panel'))

	let title = $derived(
		multi ? `Device (${devices.length})` : 'Device'
	)

	function shared<T>(fn: (d: DeviceConfig) => T): T | undefined {
		if (devices.length === 0) return undefined
		const first = fn(devices[0])
		return devices.every(d => fn(d) === first) ? first : undefined
	}

	function updateAll(updates: Record<string, any>) {
		for (const d of devices) onupdate?.(d.id, updates)
	}
</script>

{#if device}
	<Window {title} open={true} top={70} right={20} class="w-56 p-2 overflow-hidden print:hidden">
		<div class="space-y-1 text-xs">
			{@render Field('label', shared(d => d.label), v => updateAll({ label: v }))}
			{#if !multi}
				{@render Field('type', device.type)}
			{:else}
				{@render Field('type', shared(d => d.type))}
			{/if}
			{#if !multi}
				{@render NumberField('positionU', device.positionU, v => onupdate?.(device!.id, { positionU: v }))}
			{/if}
			{@render NumberField('heightU', shared(d => d.heightU), v => updateAll({ heightU: v }))}
			{@render NumberField('portCount', shared(d => d.portCount), v => updateAll({ portCount: v }))}
			{@render NumberField('widthMm', shared(d => d.widthMm ?? 480), v => updateAll({ widthMm: v }))}
			{#if !multi}
				{@render NumberField('offsetX', device.offsetX ?? 0, v => onupdate?.(device!.id, { offsetX: Math.round(v / 25) * 25 }))}
			{/if}
			{#if allPanels}
				{@render SelectField('patchLevel', shared(d => d.patchLevel ?? 'floor') ?? '', [['floor', 'Floor'], ['high', 'High-level']], v => updateAll({ patchLevel: v }))}
				{@render SelectField('serverRoom', shared(d => d.serverRoom ?? 'A') ?? '', [['A', 'A'], ['B', 'B'], ['C', 'C'], ['D', 'D']], v => updateAll({ serverRoom: v }))}
			{/if}
			{@render Field('maker', shared(d => d.maker ?? ''), v => updateAll({ maker: v }))}
			{@render Field('model', shared(d => d.model ?? ''), v => updateAll({ model: v }))}
		</div>
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
