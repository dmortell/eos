<script lang="ts">
	import type { PatchConnection, CustomCableType } from './types'
	import { getCableType } from './constants'
	import { absolutePortPosition } from './elevationUtils'

	let {
		connections = [],
		racks = [],
		devices = [],
		rackXPositions = new Map(),
		rackYPositions = new Map(),
		customCableTypes = [],
		canvasWidth = 0,
		canvasHeight = 0,
		selectedConnectionId = null,
		showLabels = false,
		showLengths = false,
		oncableclick,
	}: {
		connections: PatchConnection[]
		racks: any[]
		devices: any[]
		rackXPositions: Map<string, number>
		rackYPositions: Map<string, number>
		customCableTypes: CustomCableType[]
		canvasWidth: number
		canvasHeight: number
		selectedConnectionId?: string | null
		showLabels?: boolean
		showLengths?: boolean
		oncableclick?: (connectionId: string) => void
	} = $props()

	let deviceLookup = $derived(new Map(devices.map((d: any) => [d.id, d])))
	let rackLookup = $derived(new Map(racks.map((r: any) => [r.id, r])))

	let hoveredId = $state<string | null>(null)

	interface CableLine {
		id: string
		x1: number; y1: number
		x2: number; y2: number
		color: string
		dashed: boolean
		label: string
		midLabel: string // short label for cable overlay text
	}

	let cables = $derived.by(() => {
		const lines: CableLine[] = []

		for (const c of connections) {
			const fromDev = deviceLookup.get(c.fromPortRef.deviceId)
			const toDev = deviceLookup.get(c.toPortRef.deviceId)
			if (!fromDev || !toDev) continue
			if (c.fromPortRef.portIndex <= 0 || c.toPortRef.portIndex <= 0) continue

			const fromRack = rackLookup.get(c.fromPortRef.rackId)
			const toRack = rackLookup.get(c.toPortRef.rackId)
			if (!fromRack || !toRack) continue

			const fromRackX = rackXPositions.get(fromRack.id)
			const toRackX = rackXPositions.get(toRack.id)
			const fromRackY = rackYPositions.get(fromRack.id) ?? 0
			const toRackY = rackYPositions.get(toRack.id) ?? 0
			if (fromRackX === undefined || toRackX === undefined) continue

			const from = absolutePortPosition(
				fromRackX, fromRackY, c.fromPortRef.portIndex, fromDev.portCount,
				fromDev.positionU, fromDev.heightU, fromRack.heightU
			)
			const to = absolutePortPosition(
				toRackX, toRackY, c.toPortRef.portIndex, toDev.portCount,
				toDev.positionU, toDev.heightU, toRack.heightU
			)

			const ct = getCableType(c.cableType, customCableTypes)
			const dashed = (c.status as string) !== 'installed'

			// Build tooltip label
			const fromLabel = `${fromDev.label || fromDev.type}:${c.fromPortRef.portIndex}`
			const toLabel = `${toDev.label || toDev.type}:${c.toPortRef.portIndex}`
			const status = c.status === 'installed' ? '' : ` [${c.status}]`
			const label = `${fromLabel} → ${toLabel}\n${ct.label} ${c.lengthMeters}m${status}`

			// Build short mid-cable label
			const midParts: string[] = []
			if (showLabels) midParts.push(ct.label)
			if (showLengths) midParts.push(`${c.lengthMeters}m`)
			const midLabel = midParts.join(' ')

			lines.push({
				id: c.id,
				x1: from.x, y1: from.y,
				x2: to.x, y2: to.y,
				color: c.cableColor || ct.color,
				dashed,
				label,
				midLabel,
			})
		}

		return lines
	})
</script>

<svg class="absolute inset-0 z-20 pointer-events-none" width={canvasWidth} height={canvasHeight} style="overflow: visible">
	{#each cables as cable (cable.id)}
		{@const isSelected = selectedConnectionId === cable.id}
		{@const isHovered = hoveredId === cable.id}
		{@const isHighlighted = isSelected || isHovered}
		{@const isDimmed = (selectedConnectionId || hoveredId) && !isHighlighted}
		<!-- Hit area (wider, invisible, clickable) -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<line
			x1={cable.x1} y1={cable.y1}
			x2={cable.x2} y2={cable.y2}
			stroke="transparent"
			stroke-width={12}
			class="pointer-events-stroke cursor-pointer"
			onclick={() => oncableclick?.(cable.id)}
			onmouseenter={() => hoveredId = cable.id}
			onmouseleave={() => hoveredId = null}
		>
			<title>{cable.label}</title>
		</line>
		<!-- Visible cable line -->
		<line
			x1={cable.x1} y1={cable.y1}
			x2={cable.x2} y2={cable.y2}
			stroke={cable.color}
			stroke-width={isHighlighted ? 3 : 1.5}
			stroke-dasharray={cable.dashed ? '4,3' : 'none'}
			stroke-opacity={isDimmed ? 0.12 : isHighlighted ? 1 : 0.7}
			class="pointer-events-none transition-all"
		/>
		<!-- Endpoint dots on hover/select -->
		{#if isHighlighted}
			<circle cx={cable.x1} cy={cable.y1} r={3} fill={cable.color} class="pointer-events-none" />
			<circle cx={cable.x2} cy={cable.y2} r={3} fill={cable.color} class="pointer-events-none" />
		{/if}
		<!-- Mid-cable label (when showLabels or showLengths) -->
		{#if cable.midLabel && !isDimmed}
			{@const mx = (cable.x1 + cable.x2) / 2}
			{@const my = (cable.y1 + cable.y2) / 2}
			<text
				x={mx} y={my - 3}
				text-anchor="middle"
				font-size="7"
				fill={cable.color}
				opacity={isHighlighted ? 1 : 0.6}
				class="pointer-events-none select-none"
			>{cable.midLabel}</text>
		{/if}
	{/each}
</svg>
