<script lang="ts">
	import type { PatchConnection, CustomCableType } from './types'
	import { getCableType } from './constants'
	import {
		absolutePortPosition, cableChannelX,
		RACK_LABEL_H, RACK_GAP, rackHeight, rackWidth,
		U_LABEL_W, deviceAreaWidth, PORTS_PER_ROW,
		uToY, RU_HEIGHT,
	} from './elevationUtils'

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

	interface CableRoute {
		id: string
		path: string       // SVG path data
		color: string
		dashed: boolean
		label: string
		midLabel: string
		midX: number       // midpoint for label placement
		midY: number
	}

	const AdvancedRouting = true // Whether to route around managers and use orthogonal paths instead of straight lines

	/** Find the manager Y position closest to a target Y */
	function nearestManagerY(managers: number[], rackY: number, rackHeightU: number, targetY: number): number | null {
		if (managers.length === 0) return null
		let bestY = 0
		let bestDist = Infinity
		for (const u of managers) {
			const y = rackY + RACK_LABEL_H + uToY(u, rackHeightU) + RU_HEIGHT / 2
			const dist = Math.abs(y - targetY)
			if (dist < bestDist) { bestDist = dist; bestY = y }
		}
		return bestY + 10
	}

	/**
	 * Compute an orthogonal cable route.
	 * When AdvancedRouting is enabled and cable managers exist, cables cross
	 * between left and right side channels via the nearest horizontal manager,
	 * even if the route is longer than a direct path.
	 */
	function computeRoute(
		from: { x: number; y: number; col: number },
		to: { x: number; y: number; col: number },
		fromRackX: number, fromRackY: number, fromRackHeightU: number,
		toRackX: number, toRackY: number, toRackHeightU: number,
		sameRack: boolean,
		fromManagers: number[],
		toManagers: number[],
	): { path: string; midX: number; midY: number } {
		const fromCh = cableChannelX(fromRackX)
		const toCh = cableChannelX(toRackX)
		const DROP = 4 // px drop below dot before going horizontal
		const halfCols = PORTS_PER_ROW / 2
		const fromLeft = from.col < halfCols
		const toLeft = to.col < halfCols

		if (sameRack) {
			const y1 = from.y + DROP
			const y2 = to.y + DROP

			// Advanced: ports on different halves → route through a cable manager
			if (AdvancedRouting && fromLeft !== toLeft && fromManagers.length > 0) {
				const midTarget = (from.y + to.y) / 2
				const mgrY = nearestManagerY(fromManagers, fromRackY, fromRackHeightU, midTarget)!
				const leftCh = fromCh.left
				const rightCh = fromCh.right
				const fromChX = fromLeft ? leftCh : rightCh
				const toChX = toLeft ? leftCh : rightCh

				return {
					path: `M${from.x},${from.y} V${y1} H${fromChX} V${mgrY} H${toChX} V${y2} H${to.x} V${to.y}`,
					midX: (leftCh + rightCh) / 2,
					midY: mgrY,
				}
			}

			// Simple: same half or no managers — use nearest side
			const useLeft = fromLeft && toLeft ? true : !fromLeft && !toLeft ? false : fromLeft
			const chX = useLeft ? fromCh.left : fromCh.right
			const midY = (y1 + y2) / 2

			return {
				path: `M${from.x},${from.y} V${y1} H${chX} V${y2} H${to.x} V${to.y}`,
				midX: chX,
				midY,
			}
		}

		// Cross-rack
		const fromIsLeft = fromRackX < toRackX
		const y1drop = from.y + DROP
		const y2drop = to.y + DROP

		// Advanced: if port is on the wrong side for exit, route through a manager first
		if (AdvancedRouting) {
			const fromExitLeft = !fromIsLeft   // exit left when destination rack is to the left
			const toExitLeft = fromIsLeft      // enter from the left when source rack is to the left
			const fromNeedsCross = fromLeft !== fromExitLeft
			const toNeedsCross = toLeft !== toExitLeft

			const fromPortCh = fromLeft ? fromCh.left : fromCh.right
			const fromExitCh = fromIsLeft ? fromCh.right : fromCh.left
			const toEnterCh = fromIsLeft ? toCh.left : toCh.right
			const toPortCh = toLeft ? toCh.left : toCh.right

			const transitY = (from.y + to.y) / 2
			const segments: string[] = [`M${from.x},${from.y}`, `V${y1drop}`]

			if (fromNeedsCross && fromManagers.length > 0) {
				// Route to port's side channel, then through manager to exit side
				const mgrY = nearestManagerY(fromManagers, fromRackY, fromRackHeightU, from.y)!
				segments.push(`H${fromPortCh}`, `V${mgrY}`, `H${fromExitCh}`)
			} else {
				segments.push(`H${fromExitCh}`)
			}

			segments.push(`V${transitY}`, `H${toEnterCh}`)

			if (toNeedsCross && toManagers.length > 0) {
				// Route through manager in destination rack to reach port's side
				const mgrY = nearestManagerY(toManagers, toRackY, toRackHeightU, to.y)!
				segments.push(`V${mgrY}`, `H${toPortCh}`)
			}

			segments.push(`V${y2drop}`, `H${to.x}`, `V${to.y}`)

			return {
				path: segments.join(' '),
				midX: (fromExitCh + toEnterCh) / 2,
				midY: transitY,
			}
		}

		// Simple cross-rack
		const fromChX = fromIsLeft ? fromCh.right : fromCh.left
		const toChX = fromIsLeft ? toCh.left : toCh.right
		const transitY = (from.y + to.y) / 2

		return {
			path: `M${from.x},${from.y} V${y1drop} H${fromChX} V${transitY} H${toChX} V${y2drop} H${to.x} V${to.y}`,
			midX: (fromChX + toChX) / 2,
			midY: transitY,
		}
	}


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
