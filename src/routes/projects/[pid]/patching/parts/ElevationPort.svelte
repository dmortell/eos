<script lang="ts">
	import type { PatchConnection } from './types'
	import { getCableType } from './constants'
	import { PORT_W, PORT_H } from './elevationUtils'

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
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="relative flex items-center justify-center rounded-sm border cursor-pointer transition-all select-none
		{connection ? 'border-gray-300 bg-gray-50' : 'border-gray-200 bg-white'}
		{selected ? 'ring-2 ring-blue-400 z-10' : 'hover:border-blue-300'}"
	style:width="{PORT_W}px"
	style:height="{PORT_H}px"
	{title}
	onclick={() => onclick?.(portIndex)}
>
	<!-- Port number -->
	<span class="text-[7px] font-mono text-gray-400 leading-none">{portIndex}</span>

	<!-- Connection indicator dot -->
	{#if cableColor}
		<span
			class="absolute top-0.5 right-0.5 w-[5px] h-[5px] rounded-full"
			style:background={cableColor}
		></span>
	{/if}
</div>
