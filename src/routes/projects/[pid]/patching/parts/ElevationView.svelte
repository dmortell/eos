<script lang="ts">
	import type { PatchConnection, CustomCableType, PatchSettings } from './types'
	import { CABLE_TYPES, getCableType } from './constants'
	import { calculateCableLength } from './cableUtils'
	import {
		buildPortConnectionMap, buildPortInfoMap, findDuplicatePorts,
		rackWidth, rackHeight, RACK_GAP, RACK_LABEL_H,
	} from './elevationUtils'
	import ElevationRack from './ElevationRack.svelte'
	import CableOverlay from './CableOverlay.svelte'
    import { Button } from '$lib';

	let {
		connections = [],
		racks = [],
		devices = [],
		customCableTypes = [],
		frameData = null,
		settings,
		floor = 1,
		room = 'A',
		serverRoomCount = 1,
		floorFormat = 'L01',
		onaddconnection,
		onupdateconnection,
		ondeleteconnection,
	}: {
		connections: PatchConnection[]
		racks: any[]
		devices: any[]
		customCableTypes: CustomCableType[]
		frameData?: any
		settings?: PatchSettings
		floor?: number
		room?: string
		serverRoomCount?: number
		floorFormat?: string
		onaddconnection?: (conn: PatchConnection) => void
		onupdateconnection?: (id: string, updates: Partial<PatchConnection>) => void
		ondeleteconnection?: (id: string) => void
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

	// ── Port info from frames data ──
	let portInfoMap = $derived(buildPortInfoMap(frameData, room, devices, racks, floor, serverRoomCount, floorFormat))

	// ── Duplicate ports ──
	let duplicatePorts = $derived(findDuplicatePorts(connections))

	// ── Selected state ──
	let selectedPortKey = $state<string | null>(null)
	let selectedConnectionId = $state<string | null>(null)

	// ── Click-to-connect state ──
	let connectFromKey = $state<string | null>(null)
	let activeCableType = $state(settings?.defaultCableType ?? 'uutp')

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

	/** Parse a port key "deviceId:portIndex" back to device/rack refs */
	function parsePortKey(key: string): { rackId: string; deviceId: string; portIndex: number } | null {
		const [deviceId, portStr] = key.split(':')
		const portIndex = parseInt(portStr, 10)
		const dev = devices.find((d: any) => d.id === deviceId)
		if (!dev) return null
		return { rackId: dev.rackId, deviceId, portIndex }
	}

	function handlePortClick(deviceId: string, portIndex: number) {
		const key = `${deviceId}:${portIndex}`

		// If we have a "from" port selected, and clicking a different port → create connection
		if (connectFromKey && connectFromKey !== key) {
			const from = parsePortKey(connectFromKey)
			const to = parsePortKey(key)
			if (from && to && onaddconnection) {
				const cableType = activeCableType
				const ct = getCableType(cableType, customCableTypes)
				const fromRef = { rackId: from.rackId, deviceId: from.deviceId, portIndex: from.portIndex, face: 'front' as const }
				const toRef = { rackId: to.rackId, deviceId: to.deviceId, portIndex: to.portIndex, face: 'front' as const }
				const len = calculateCableLength(fromRef, toRef, racks, devices)
				const conn: PatchConnection = {
					id: `patch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
					fromPortRef: fromRef,
					toPortRef: toRef,
					cableType,
					cableColor: ct.color,
					lengthMeters: len,
					lengthLocked: false,
					kind: 'patch',
					status: 'add',
				}
				onaddconnection(conn)
				selectedPortKey = key
				selectedConnectionId = conn.id
			}
			connectFromKey = null
			return
		}

		// Toggle selection
		if (selectedPortKey === key) {
			selectedPortKey = null
			selectedConnectionId = null
			connectFromKey = null
		} else {
			selectedPortKey = key
			const conn = portConnMap.get(key)
			selectedConnectionId = conn?.id ?? null
			// If port has no connection, set it as "from" for click-to-connect
			connectFromKey = conn ? null : key
		}
	}

	function handleCableClick(connectionId: string) {
		if (selectedConnectionId === connectionId) {
			selectedConnectionId = null
			selectedPortKey = null
		} else {
			selectedConnectionId = connectionId
			// Find and highlight one of the ports
			const conn = connections.find(c => c.id === connectionId)
			if (conn?.fromPortRef.deviceId) {
				selectedPortKey = `${conn.fromPortRef.deviceId}:${conn.fromPortRef.portIndex}`
			}
		}
		connectFromKey = null
	}

	// ── Selected connection details ──
	let selectedConn = $derived(selectedConnectionId ? connections.find(c => c.id === selectedConnectionId) : null)

	function refreshSelectedLength() {
		if (!selectedConnectionId || !onupdateconnection) return
		const conn = connections.find(c => c.id === selectedConnectionId)
		if (!conn) return
		const len = calculateCableLength(conn.fromPortRef, conn.toPortRef, racks, devices)
		if (len !== conn.lengthMeters) {
			onupdateconnection(selectedConnectionId, { lengthMeters: len, lengthLocked: false })
		}
	}

	function deleteSelectedConnection() {
		if (!selectedConnectionId || !ondeleteconnection) return
		ondeleteconnection(selectedConnectionId)
		selectedPortKey = null
		selectedConnectionId = null
		connectFromKey = null
	}

	// Center view on mount
	$effect(() => {
		if (containerW > 0 && containerH > 0 && racks.length > 0) {
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
						{portInfoMap}
						{duplicatePorts}
						{customCableTypes}
						{selectedPortKey}
						{connectFromKey}
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
				showLabels={settings?.showLabels ?? false}
				showLengths={settings?.showLengths ?? false}
				oncableclick={handleCableClick}
			/>
		</div>

		<!-- Top bar: cable type selector + connect mode indicator -->
		<div class="absolute top-2 left-2 z-30 flex items-center gap-2">
			<!-- Cable type quick selector -->
			<div class="flex items-center gap-1 bg-white/90 rounded border border-gray-200 shadow-sm px-1.5 py-0.5">
				<span class="text-[9px] text-gray-400 uppercase tracking-wider mr-0.5">Cable</span>
				{#each CABLE_TYPES as ct (ct.id)}
					<button
						class="h-5 px-1.5 rounded text-[9px] font-medium transition-colors
							{activeCableType === ct.id ? 'text-white' : 'text-gray-500 hover:bg-gray-100'}"
						style:background={activeCableType === ct.id ? ct.color : undefined}
						title={ct.label}
						onclick={() => activeCableType = ct.id}
					>{ct.label}</button>
				{/each}
				{#each customCableTypes as ct (ct.id)}
					<button
						class="h-5 px-1.5 rounded text-[9px] font-medium transition-colors
							{activeCableType === ct.id ? 'text-white' : 'text-gray-500 hover:bg-gray-100'}"
						style:background={activeCableType === ct.id ? ct.color : undefined}
						title={ct.label}
						onclick={() => activeCableType = ct.id}
					>{ct.label}</button>
				{/each}
			</div>

			<!-- Connect-mode indicator -->
			{#if connectFromKey}
				<div class="text-[11px] text-white bg-blue-600 px-3 py-1 rounded-full shadow-md select-none">
					Click another port to connect — Esc to cancel
				</div>
			{/if}
		</div>

		<!-- Selected connection info bar -->
		{#if selectedConn}
			{@const ct = getCableType(selectedConn.cableType, customCableTypes)}
			{@const fromDev = devices.find((d: any) => d.id === selectedConn.fromPortRef.deviceId)}
			{@const toDev = devices.find((d: any) => d.id === selectedConn.toPortRef.deviceId)}
			<div class="absolute bottom-2 left-2 z-30 flex items-center gap-2 bg-white/95 rounded border border-gray-200 shadow-sm px-2.5 py-1.5 text-[11px]">
				<span class="w-2 h-2 rounded-full shrink-0" style:background={ct.color}></span>
				<span class="text-gray-600">
					{fromDev?.label || fromDev?.type || '?'}:{selectedConn.fromPortRef.portIndex}
					→
					{toDev?.label || toDev?.type || '?'}:{selectedConn.toPortRef.portIndex}
				</span>
				<span class="text-gray-400">{ct.label} {selectedConn.lengthMeters}m</span>
				{#if selectedConn.status !== 'installed'}
					<span class="text-[9px] px-1 py-0.5 rounded bg-blue-50 text-blue-600">{selectedConn.status}</span>
				{/if}
				<Button icon="refresh" title="Refresh cable length" 
					class="h-5 px-1.5 rounded text-[10px] font-medium bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors"
					onclick={refreshSelectedLength}
				></Button>
				<button
					class="h-5 px-1.5 rounded text-[10px] font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
					title="Delete this connection (Del)"
					onclick={deleteSelectedConnection}
				>Delete</button>
			</div>
		{/if}

		<!-- Zoom indicator -->
		<div class="absolute bottom-2 right-2 text-[10px] text-gray-400 bg-white/80 px-1.5 py-0.5 rounded border border-gray-200 select-none pointer-events-none">
			{Math.round(zoom * 100)}%
		</div>
	{/if}
</div>

<svelte:window onkeydown={e => {
	if (e.key === 'Escape') { connectFromKey = null; selectedPortKey = null; selectedConnectionId = null }
	if ((e.key === 'Delete' || e.key === 'Backspace') && selectedConnectionId && !connectFromKey) { deleteSelectedConnection() }
}} />
