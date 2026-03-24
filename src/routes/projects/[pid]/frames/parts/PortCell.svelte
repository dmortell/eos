<script lang="ts">
	import type { PortLabel, LocType } from './types'
	import { LOC_TYPE_COLORS } from './types'

	let { port, selected = false, portSelected = false, reservation, portKey, onselect }: {
		port: PortLabel | null
		selected?: boolean
		portSelected?: boolean
		reservation?: LocType
		portKey?: string
		onselect?: (key: string) => void
	} = $props()

	let locKey = $derived(port ? `${port.zone}-${port.locationNumber}` : '')

	let colorClass = $derived(
		port
			? LOC_TYPE_COLORS[port.locationType] ?? 'bg-blue-500/15 border-blue-500/40 text-blue-600'
			: ''
	)

	let roomClass = $derived(
		port?.serverRoom === 'B' ? 'ring-1 ring-purple-400/50' : ''
	)

	/** Display label without floor prefix: Z.NNN-SPP(-H) */
	let shortLabel = $derived(
		port ? port.label.replace(/^\d{2}\./, '') : ''
	)
</script>

{#if port}
	<button
		class="w-full h-7 rounded-sm border flex items-center justify-center cursor-pointer transition-colors {colorClass} {roomClass}"
		class:ring-2={selected || portSelected}
		class:ring-yellow-400={selected && !portSelected}
		class:ring-blue-400={portSelected}
		title={port.label}
		data-loc={locKey}
		data-port={portKey}
		onclick={() => onselect?.(locKey)}
	>
		<span class="font-mono text-[9px] leading-none select-none whitespace-nowrap overflow-hidden">
			{shortLabel}
		</span>
	</button>
{:else}
	<div
		class="w-full h-7 rounded-sm border flex items-center justify-center
			{reservation
				? LOC_TYPE_COLORS[reservation] + ' border-dashed'
				: 'bg-gray-100 border-gray-200/50'}"
		class:ring-2={portSelected}
		class:ring-blue-400={portSelected}
		data-port={portKey}
	>
		{#if reservation}
			<span class="font-mono text-[7px] opacity-60">{reservation}</span>
		{/if}
	</div>
{/if}
