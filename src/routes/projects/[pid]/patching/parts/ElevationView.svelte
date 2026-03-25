<script lang="ts">
	import type { PatchConnection, CustomCableType } from './types'
	import { buildPortConnectionMap, rackWidth, rackHeight, RACK_GAP, RACK_LABEL_H } from './elevationUtils'
	import ElevationRack from './ElevationRack.svelte'
	import CableOverlay from './CableOverlay.svelte'

	let {
		connections = [],
		racks = [],
		devices = [],
		customCableTypes = [],
		frameData = null,
	}: {
		connections: PatchConnection[]
		racks: any[]
		devices: any[]
		customCableTypes: CustomCableType[]
		frameData?: any
	} = $props()

	// ── Pan/zoom state ──
	let container: HTMLDivElement | null = null
	let containerW = $state(0)
	let containerH = $state(0)
	let panX = $state(40)
	let panY = $state(40)
	let zoom = $state(1)

	// ── Port connection lookup ──
	let portConnMap = $derived(buildPortConnectionMap(connections))

	// ── Selected state ──
	let selectedPortKey = $state<string | null>(null)
	let selectedConnectionId = $state<string | null>(null)

	// ── Rack layout: side by side, bottom-aligned ──
	let rackW = $derived(rackWidth())

	let rackXPositions = $derived.by(() => {
		const map = new Map<string, number>()
		let x = 0
		for (const rack of racks) {
			map.set(rack.id, x)
			x += rackW + RACK_GAP
		}
		return map
	})

	let maxRackHeight = $derived(
		racks.length > 0 ? Math.max(...racks.map((r: any) => rackHeight(r.heightU) + RACK_LABEL_H)) : 400
	)

	let rackYPositions = $derived.by(() => {
		const map = new Map<string, number>()
		for (const rack of racks) {
			const rackTotalH = rackHeight(rack.heightU) + RACK_LABEL_H
			map.set(rack.id, maxRackHeight - rackTotalH)
		}
		return map
	})

	let totalWidth = $derived(racks.length * rackW + (racks.length - 1) * RACK_GAP + 80)
	let totalHeight = $derived(maxRackHeight + 60)

	// ── Pan/zoom handlers ──
	let isPanning = $state(false)

	$effect(() => {
		container?.addEventListener('wheel', onwheel, { passive: false })
		return () => { container?.removeEventListener('wheel', onwheel) }
	})

	function onwheel(e: WheelEvent) {
		if (e.ctrlKey || e.altKey || e.metaKey || e.buttons === 2) {
			e.preventDefault()
			const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
			const newZoom = Math.min(4, Math.max(0.2, zoom * factor))
			const rect = container!.getBoundingClientRect()
			const mx = e.clientX - rect.left
			const my = e.clientY - rect.top
			panX = mx - (mx - panX) * (newZoom / zoom)
			panY = my - (my - panY) * (newZoom / zoom)
			zoom = newZoom
		} else {
			e.preventDefault()
			panX -= e.deltaX
			panY -= e.deltaY
		}
	}

	function onmousedown(e: MouseEvent) {
		if (e.button === 1 || e.button === 2) {
			e.preventDefault()
			isPanning = true
			document.addEventListener('mousemove', onmousemove)
			document.addEventListener('mouseup', onmouseup)
		}
	}

	function onmousemove(e: MouseEvent) {
		if (isPanning) {
			panX += e.movementX
			panY += e.movementY
		}
	}

	function onmouseup() {
		isPanning = false
		document.removeEventListener('mousemove', onmousemove)
		document.removeEventListener('mouseup', onmouseup)
	}

	function oncontextmenu(e: MouseEvent) { e.preventDefault() }

	function handlePortClick(deviceId: string, portIndex: number) {
		const key = `${deviceId}:${portIndex}`
		if (selectedPortKey === key) {
			selectedPortKey = null
			selectedConnectionId = null
		} else {
			selectedPortKey = key
			// If this port has a connection, select it
			const conn = portConnMap.get(key)
			selectedConnectionId = conn?.id ?? null
		}
	}

	// Center view on mount
	$effect(() => {
		if (containerW > 0 && containerH > 0 && racks.length > 0) {
			// Only auto-center once
			const totalW = totalWidth * zoom
			const totalH = totalHeight * zoom
			if (panX === 40 && panY === 40) {
				panX = Math.max(40, (containerW - totalW) / 2)
				panY = Math.max(40, (containerH - totalH) / 2)
			}
		}
	})
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={container}
	bind:clientWidth={containerW}
	bind:clientHeight={containerH}
	class="w-full h-full overflow-hidden relative bg-gray-50 cursor-default"
	class:cursor-grabbing={isPanning}
	onmousedown={onmousedown}
	oncontextmenu={oncontextmenu}
	style="background-image: radial-gradient(circle, #ddd 1px, transparent 1px); background-size: {20 * zoom}px {20 * zoom}px; background-position: {panX}px {panY}px;"
>
	{#if racks.length === 0}
		<div class="absolute inset-0 flex items-center justify-center">
			<div class="text-sm text-gray-400 text-center">
				<p>No racks in this room.</p>
				<p class="text-xs mt-1">Add racks in the Rack Elevations tool first.</p>
			</div>
		</div>
	{:else}
		<!-- Transformed canvas -->
		<div class="absolute" style:transform="translate({panX}px, {panY}px) scale({zoom})" style:transform-origin="0 0">
			<!-- Racks side by side, bottom-aligned -->
			{#each racks as rack (rack.id)}
				{@const rackX = rackXPositions.get(rack.id) ?? 0}
				{@const rackY = rackYPositions.get(rack.id) ?? 0}
				{@const rackDevices = devices.filter((d: any) => d.rackId === rack.id)}
				<div class="absolute" style:left="{rackX}px" style:top="{rackY}px">
					<ElevationRack
						{rack}
						devices={rackDevices}
						portConnectionMap={portConnMap}
						{customCableTypes}
						{selectedPortKey}
						onportclick={handlePortClick}
					/>
				</div>
			{/each}

			<!-- Cable overlay (above racks, z-20) -->
			<CableOverlay
				{connections}
				{racks}
				{devices}
				{rackXPositions}
				{rackYPositions}
				{customCableTypes}
				canvasWidth={totalWidth}
				canvasHeight={totalHeight}
				{selectedConnectionId}
			/>
		</div>

		<!-- Zoom indicator -->
		<div class="absolute bottom-2 right-2 text-[10px] text-gray-400 bg-white/80 px-1.5 py-0.5 rounded border border-gray-200 select-none pointer-events-none">
			{Math.round(zoom * 100)}%
		</div>
	{/if}
</div>
