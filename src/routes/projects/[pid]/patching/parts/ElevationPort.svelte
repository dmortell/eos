<script lang="ts">
	import type { PatchConnection } from './types'
	import type { PortInfo } from './elevationUtils'
	import { getCableType } from './constants'
	import { PORT_CELL_W, PORT_CELL_H, DOT_R, DOT_INSET, PORT_TYPE_COLORS } from './elevationUtils'

	let {
		portIndex,
		connection = null,
		portInfo = null,
		isDuplicate = false,
		customCableTypes = [],
		selected = false,
		isConnectSource = false,
		onclick,
	}: {
		portIndex: number
		connection?: PatchConnection | null
		portInfo?: PortInfo | null
		isDuplicate?: boolean
		customCableTypes?: any[]
		selected?: boolean
		isConnectSource?: boolean
		onclick?: (portIndex: number) => void
	} = $props()

	let cableColor = $derived(
		connection ? getCableType(connection.cableType, customCableTypes).color : null
	)

	// Port background color from usage type (frames data)
	let bgColor = $derived.by(() => {
		if (!portInfo) return null
		const hex = PORT_TYPE_COLORS[portInfo.locationType]
		return hex ?? null
	})

	let title = $derived.by(() => {
		const parts: string[] = []
		// Port label from frames, or just port number
		if (portInfo?.label) {
			parts.push(portInfo.label)
		} else {
			parts.push(`Port ${portIndex}`)
		}
		// Connection info
		if (connection) {
			const ct = getCableType(connection.cableType, customCableTypes)
			const status = connection.status === 'installed' ? '' : ` [${connection.status}]`
			parts.push(`${ct.label} ${connection.lengthMeters}m${status}`)
		}
		// Duplicate warning
		if (isDuplicate) {
			parts.push('⚠ DUPLICATE — multiple patches on this port')
		}
		return parts.join(' — ')
	})

	let dotSize = DOT_R * 2

	// Determine dot color: red for duplicate, cable color for connected
	let dotColor = $derived(isDuplicate ? '#ef4444' : cableColor)
	let showDot = $derived(isDuplicate || !!cableColor)
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="relative flex items-center justify-center rounded-sm border cursor-pointer transition-all select-none shrink-0
		{isDuplicate ? 'border-red-400' : connection ? 'border-gray-300 bg-gray-50' : 'border-gray-200 bg-white'}
		{isConnectSource ? 'ring-2 ring-green-400 z-10' : selected ? 'ring-2 ring-blue-400 z-10' : 'hover:border-blue-300'}"
	style:width="{PORT_CELL_W}px"
	style:height="{PORT_CELL_H}px"
	style:background={bgColor ? bgColor + '20' : undefined}
	{title}
	onclick={() => onclick?.(portIndex)}
>
	<!-- Port number -->
	<span class="text-[7px] font-mono text-gray-400 leading-none">{portIndex}</span>

	<!-- Connection/duplicate indicator dot (top-right) -->
	{#if showDot}
		<span
			class="absolute rounded-full"
			class:animate-pulse={isDuplicate}
			style:top="{DOT_INSET}px"
			style:right="{DOT_INSET}px"
			style:width="{dotSize}px"
			style:height="{dotSize}px"
			style:background={dotColor}
		></span>
	{/if}
</div>
