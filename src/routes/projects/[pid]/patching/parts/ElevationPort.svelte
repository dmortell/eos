<script lang="ts">
	import type { PatchConnection } from './types'
	import { getCableType } from './constants'
	import { PORT_CELL_H, DOT_R, DOT_INSET } from './elevationUtils'

	let {
		portIndex,
		connection = null,
		customCableTypes = [],
		selected = false,
		onclick,
	}: {
		portIndex: number
		connection?: PatchConnection | null
		customCableTypes?: any[]
		selected?: boolean
		onclick?: (portIndex: number) => void
	} = $props()

	let cableColor = $derived(
		connection ? getCableType(connection.cableType, customCableTypes).color : null
	)

	let title = $derived.by(() => {
		if (!connection) return `Port ${portIndex}`
		const ct = getCableType(connection.cableType, customCableTypes)
		const status = connection.status === 'installed' ? '' : ` [${connection.status}]`
		return `Port ${portIndex} — ${ct.label} ${connection.lengthMeters}m${status}`
	})

	let dotSize = DOT_R * 2
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="relative flex items-center justify-center rounded-sm border cursor-pointer transition-all select-none w-full min-w-0
		{connection ? 'border-gray-300 bg-gray-50' : 'border-gray-200 bg-white'}
		{selected ? 'ring-2 ring-blue-400 z-10' : 'hover:border-blue-300'}"
	style:height="{PORT_CELL_H}px"
	{title}
	onclick={() => onclick?.(portIndex)}
>
	<!-- Port number -->
	<span class="text-[7px] font-mono text-gray-400 leading-none">{portIndex}</span>

	<!-- Connection indicator dot (top-right, cables connect here) -->
	{#if cableColor}
		<span
			class="absolute rounded-full"
			style:top="{DOT_INSET}px"
			style:right="{DOT_INSET}px"
			style:width="{dotSize}px"
			style:height="{dotSize}px"
			style:background={cableColor}
		></span>
	{/if}
</div>
