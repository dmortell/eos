<script lang="ts">
	import type { PatchConnection, CustomCableType } from './types'
	import { getCableType } from './constants'
	import { absolutePortPosition } from './elevationUtils'
	import { computeRoute, type CableRoute } from './cableUtils'

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

	// Build set of cable-manager RU positions per rack for routing awareness
	let managersByRack = $derived.by(() => {
		const map = new Map<string, number[]>()
		for (const d of devices) {
			if (d.type === 'manager') {
				const list = map.get(d.rackId) ?? []
				list.push(d.positionU)
				map.set(d.rackId, list)
			}
		}
		return map
	})

	let cables = $derived.by(() => {
		const routes: CableRoute[] = []

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

			const sameRack = fromRack.id === toRack.id
			const { path, midX, midY } = computeRoute(
				from, to,
				fromRackX, fromRackY, fromRack.heightU,
				toRackX, toRackY, toRack.heightU,
				sameRack,
				managersByRack.get(fromRack.id) ?? [],
				managersByRack.get(toRack.id) ?? [],
			)

			const ct = getCableType(c.cableType, customCableTypes)
			const dashed = (c.status as string) !== 'installed'

			const fromLabel = `${fromDev.label || fromDev.type}:${c.fromPortRef.portIndex}`
			const toLabel = `${toDev.label || toDev.type}:${c.toPortRef.portIndex}`
			const status = c.status === 'installed' ? '' : ` [${c.status}]`
			const label = `${fromLabel} → ${toLabel}\n${ct.label} ${c.lengthMeters}m${status}`

			const midParts: string[] = []
			if (showLabels) midParts.push(ct.label)
			if (showLengths) midParts.push(`${c.lengthMeters}m`)

			routes.push({
				id: c.id,
				path,
				color: c.cableColor || ct.color,
				dashed,
				label,
				midLabel: midParts.join(' '),
				midX,
				midY,
			})
		}

		return routes
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
		<path
			d={cable.path}
			fill="none"
			stroke="transparent"
			stroke-width={12}
			class="pointer-events-stroke cursor-pointer"
			onclick={() => oncableclick?.(cable.id)}
			onmouseenter={() => hoveredId = cable.id}
			onmouseleave={() => hoveredId = null}
		>
			<title>{cable.label}</title>
		</path>
		<!-- Visible cable path -->
		<path
			d={cable.path}
			fill="none"
			stroke={cable.color}
			stroke-width={isHighlighted ? 2.5 : 1}
			stroke-dasharray={cable.dashed ? '4,3' : 'none'}
			stroke-opacity={isDimmed ? 0.08 : isHighlighted ? 1 : 0.5}
			stroke-linejoin="round"
			class="pointer-events-none"
		/>
		<!-- Mid-cable label (when showLabels or showLengths) -->
		{#if cable.midLabel && !isDimmed}
			<text
				x={cable.midX} y={cable.midY - 3}
				text-anchor="middle"
				font-size="7"
				fill={cable.color}
				opacity={isHighlighted ? 1 : 0.6}
				class="pointer-events-none select-none"
			>{cable.midLabel}</text>
		{/if}
	{/each}
</svg>
