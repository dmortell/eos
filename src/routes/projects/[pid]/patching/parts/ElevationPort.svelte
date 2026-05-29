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

	// Port background color from usage type (frames data) — solid color
	let bgColor = $derived.by(() => {
		if (!portInfo) return null
		return PORT_TYPE_COLORS[portInfo.locationType] ?? null
	})

	/** Port has no Frames label — gate patching on it until the panel is
	 *  assigned to a frame in the Frames tool. */
	let unlabeled = $derived(!portInfo?.label)

	let title = $derived.by(() => {
		const parts: string[] = []
		if (portInfo?.label) {
			parts.push(portInfo.label)
		} else if (connection) {
			parts.push(`Port ${portIndex} (unlabeled)`)
		} else {
			parts.push(`Port ${portIndex} — unlabeled. Assign this panel to a patch frame before patching.`)
		}
		if (connection) {
			const ct = getCableType(connection.cableType, customCableTypes)
			const status = connection.status === 'installed' ? '' : ` [${connection.status}]`
			parts.push(`${ct.label} ${connection.lengthMeters}m${status}`)
		}
		if (isDuplicate) {
			parts.push('⚠ DUPLICATE — multiple patches on this port')
		}
		return parts.join(' — ')
	})

	function handleClick() {
		// Already-connected ports can still be clicked (to select / inspect) even
		// if their panel is no longer in a frame — orphan refs need to remain
		// reachable. Brand-new patches on unlabeled ports are gated.
		if (unlabeled && !connection) return
		onclick?.(portIndex)
	}

	let dotSize = DOT_R * 2
	let showDot = $derived(isDuplicate || !!cableColor)
	let dotColor = $derived(isDuplicate ? '#ef4444' : cableColor)	// Determine dot color: red for duplicate, cable color for connected
	let textColor = $derived(bgColor ? bgColor : '#9ca3af')	// Text color — darker on colored backgrounds for contrast
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="relative flex items-center justify-center rounded-sm border transition-all select-none shrink-0
		{unlabeled && !connection ? 'border-dashed border-gray-200 cursor-not-allowed' : 'cursor-pointer'}
		{isDuplicate ? 'border-red-400' : connection ? 'border-gray-300' : unlabeled ? 'border-gray-200' : 'border-gray-200'}
		{isConnectSource ? 'ring-2 ring-green-400 z-10' : selected ? 'ring-2 ring-blue-400 z-10' : (unlabeled && !connection ? '' : 'hover:border-blue-300')}"
	style:width="{PORT_CELL_W}px"
	style:height="{PORT_CELL_H}px"
	style:background={bgColor ? bgColor + '30' : connection ? '#f9fafb' : '#ffffff'}
	style:opacity={unlabeled && !connection ? '0.45' : null}
	{title}
	onclick={handleClick}
>
	<!-- Port number -->
	<span class="text-[7px] font-mono leading-none" style:color={textColor}>{portIndex}</span>

	<!-- Connection/duplicate indicator dot (center-bottom), 70% opacity -->
	{#if showDot}
		<span
			class="absolute rounded-full"
			class:animate-pulse={isDuplicate}
			style:bottom="{DOT_INSET - 3}px"
			style:left="{PORT_CELL_W / 2 - DOT_R - 1}px"
			style:width="{dotSize}px"
			style:height="{dotSize}px"
			style:background={dotColor}
			style:opacity="0.7"
		></span>
	{/if}
</div>
