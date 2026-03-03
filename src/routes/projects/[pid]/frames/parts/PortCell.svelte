<script lang="ts">
	import type { PortLabel } from './types'
	import { LOC_TYPE_COLORS } from './types'

	let { port, selected = false, onselect }: {
		port: PortLabel | null
		selected?: boolean
		onselect?: (loc: number) => void
	} = $props()

	let colorClass = $derived(
		port
			? LOC_TYPE_COLORS[port.locationType] ?? 'bg-blue-500/15 border-blue-500/40 text-blue-600'
			: ''
	)

	let roomClass = $derived(
		port?.serverRoom === 'B' ? 'ring-1 ring-purple-400/50' : ''
	)
</script>

{#if port}
	<button
		class="w-full h-6 rounded-sm border flex items-center justify-center cursor-pointer transition-colors {colorClass} {roomClass}"
		class:ring-2={selected}
		class:ring-yellow-400={selected}
		title={port.label}
		onclick={() => onselect?.(port!.locationNumber)}
	>
		<span class="font-mono text-[7px] leading-none select-all whitespace-nowrap overflow-hidden">
			{port.label}
		</span>
	</button>
{:else}
	<div class="w-full h-6 bg-gray-100 rounded-sm border border-gray-200/50"></div>
{/if}
