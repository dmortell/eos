<script lang="ts">
	import type { PatchConnection, CustomCableType } from './types'
	import { getCableType } from './constants'
	import { absolutePortPosition } from './elevationUtils'

	let {
		connections = [],
		racks = [],
		devices = [],
		rackXPositions = new Map(),
		customCableTypes = [],
		canvasWidth = 0,
		canvasHeight = 0,
		selectedConnectionId = null,
	}: {
		connections: PatchConnection[]
		racks: any[]
		devices: any[]
		rackXPositions: Map<string, number>
		customCableTypes: CustomCableType[]
		canvasWidth: number
		canvasHeight: number
		selectedConnectionId?: string | null
	} = $props()

	let deviceLookup = $derived(new Map(devices.map((d: any) => [d.id, d])))
	let rackLookup = $derived(new Map(racks.map((r: any) => [r.id, r])))

	interface CableLine {
		id: string
		x1: number; y1: number
		x2: number; y2: number
		color: string
		dashed: boolean
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
			if (fromRackX === undefined || toRackX === undefined) continue

			const from = absolutePortPosition(
				fromRackX, c.fromPortRef.portIndex, fromDev.portCount,
				fromDev.positionU, fromDev.heightU, fromRack.heightU
			)
			const to = absolutePortPosition(
				toRackX, c.toPortRef.portIndex, toDev.portCount,
				toDev.positionU, toDev.heightU, toRack.heightU
			)

			const ct = getCableType(c.cableType, customCableTypes)
			const dashed = (c.status as string) !== 'installed'

			lines.push({
				id: c.id,
				x1: from.x, y1: from.y,
				x2: to.x, y2: to.y,
				color: c.cableColor || ct.color,
				dashed,
			})
		}

		return lines
	})
</script>

<svg class="absolute inset-0 z-20 pointer-events-none" width={canvasWidth} height={canvasHeight} style="overflow: visible">
	{#each cables as cable (cable.id)}
		<!-- Hit area (wider, invisible) -->
		<line
			x1={cable.x1} y1={cable.y1}
			x2={cable.x2} y2={cable.y2}
			stroke="transparent"
			stroke-width={10}
			class="pointer-events-stroke cursor-pointer"
		/>
		<!-- Visible cable line -->
		<line
			x1={cable.x1} y1={cable.y1}
			x2={cable.x2} y2={cable.y2}
			stroke={cable.color}
			stroke-width={selectedConnectionId === cable.id ? 3 : 1.5}
			stroke-dasharray={cable.dashed ? '4,3' : 'none'}
			stroke-opacity={selectedConnectionId && selectedConnectionId !== cable.id ? 0.15 : 0.8}
			class="pointer-events-none"
		/>
	{/each}
</svg>
