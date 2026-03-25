<script lang="ts">
	import type { PatchConnection, CustomCableType } from './types'
	import type { PortInfo } from './elevationUtils'
	import ElevationPort from './ElevationPort.svelte'
	import {
		RU_HEIGHT, PORT_CELL_W, PORT_CELL_H, PORT_GAP, RACK_PADDING,
		U_LABEL_W, RACK_LABEL_H, PORTS_PER_ROW,
		rackWidth, rackHeight, uToY, portRowCount, deviceAreaWidth,
	} from './elevationUtils'

	let {
		rack,
		devices = [],
		portConnectionMap = new Map(),
		portInfoMap = new Map(),
		duplicatePorts = new Set(),
		customCableTypes = [],
		selectedPortKey = null,
		connectFromKey = null,
		onportclick,
	}: {
		rack: any
		devices: any[]
		portConnectionMap: Map<string, PatchConnection>
		portInfoMap: Map<string, PortInfo>
		duplicatePorts: Set<string>
		customCableTypes: CustomCableType[]
		selectedPortKey?: string | null
		connectFromKey?: string | null
		onportclick?: (deviceId: string, portIndex: number) => void
	} = $props()

	let width = $derived(rackWidth())
	let height = $derived(rackHeight(rack.heightU))
	let devAreaW = $derived(deviceAreaWidth())

	// Sort devices by positionU descending (top of rack first visually)
	let sortedDevices = $derived(
		[...devices].sort((a: any, b: any) => b.positionU - a.positionU)
	)

	function deviceTop(device: any): number {
		return uToY(device.positionU + device.heightU - 1, rack.heightU)
	}

	function deviceH(device: any): number {
		return device.heightU * RU_HEIGHT
	}
</script>

<div class="relative" style:width="{width}px" style:height="{height + RACK_LABEL_H}px">
	<!-- Rack label above -->
	<div class="absolute flex items-center justify-between pointer-events-none select-none"
		style:top="0px" style:height="{RACK_LABEL_H}px" style:left="{U_LABEL_W}px" style:width="{devAreaW}px">
		<b class="text-[11px] text-gray-700 pl-1">{rack.label}</b>
		<span class="text-[9px] text-gray-400 pr-1">{rack.heightU}U</span>
	</div>

	<!-- Rack frame -->
	<div class="absolute border border-gray-300 bg-white rounded-sm"
		style:top="{RACK_LABEL_H}px" style:left="0px" style:width="{width}px" style:height="{height}px">

		<!-- U labels (left + right) -->
		{#each Array.from({ length: rack.heightU }) as _, i}
			{@const u = i + 1}
			{@const y = uToY(u, rack.heightU)}
			<!-- Left U label -->
			<div class="absolute text-[7px] font-mono text-gray-300 text-right pr-0.5 select-none pointer-events-none leading-none flex items-center justify-end"
				style:top="{y}px" style:left="0px" style:width="{U_LABEL_W - 2}px" style:height="{RU_HEIGHT}px">
				{u}
			</div>
			<!-- Right U label -->
			<div class="absolute text-[7px] font-mono text-gray-300 pl-0.5 select-none pointer-events-none leading-none flex items-center"
				style:top="{y}px" style:right="0px" style:width="{U_LABEL_W - 2}px" style:height="{RU_HEIGHT}px">
				{u}
			</div>
			<!-- U gridline -->
			<div class="absolute bg-gray-100"
				style:top="{y + RU_HEIGHT - 1}px" style:left="{U_LABEL_W}px" style:width="{devAreaW}px" style:height="1px"></div>
		{/each}

		<!-- Devices -->
		{#each sortedDevices as device (device.id)}
			{@const dTop = deviceTop(device)}
			{@const dH = deviceH(device)}
			{@const rows = portRowCount(device.portCount)}
			{@const hasPorts = device.portCount > 0}
			{@const cols = Math.min(device.portCount, PORTS_PER_ROW)}
			<div class="absolute rounded-sm"
				style:top="{dTop}px" style:left="{U_LABEL_W}px" style:width="{devAreaW}px" style:height="{dH}px">

				<!-- Device background (shows title on hover over empty area) -->
				<div class="absolute inset-0 border rounded-sm"
					style:background={device.color ? device.color + '15' : '#f1f5f9'}
					style:border-color={device.color || '#cbd5e1'}
					title="{device.label || device.type} — U{device.positionU} {device.portCount ? device.portCount + ' ports' : ''}">
				</div>

				{#if hasPorts}
					<!-- Device label at bottom-left, under ports (z-0) -->
					<div class="absolute bottom-0 left-0.5 select-none pointer-events-none z-0 opacity-50">
						<span class="text-[7px] text-gray-500 truncate">{device.label || device.type}</span>
					</div>

					<!-- Port grid: fixed cell size, top-aligned (z-10, above label) -->
					<div class="absolute z-10"
						style:top="{RACK_PADDING}px"
						style:left="{RACK_PADDING}px">
						{#each Array.from({ length: rows }) as _, rowIdx}
							{@const rowStart = rowIdx * PORTS_PER_ROW}
							{@const rowEnd = Math.min(rowStart + PORTS_PER_ROW, device.portCount)}
							<div class="flex" style:gap="{PORT_GAP}px" style:margin-bottom="{rowIdx < rows - 1 ? PORT_GAP : 0}px">
								{#each Array.from({ length: rowEnd - rowStart }) as _, colIdx}
									{@const pIdx = rowStart + colIdx + 1}
									{@const connKey = `${device.id}:${pIdx}`}
									<ElevationPort
										portIndex={pIdx}
										connection={portConnectionMap.get(connKey) ?? null}
										portInfo={portInfoMap.get(connKey) ?? null}
										isDuplicate={duplicatePorts.has(connKey)}
										{customCableTypes}
										selected={selectedPortKey === connKey}
										isConnectSource={connectFromKey === connKey}
										onclick={() => onportclick?.(device.id, pIdx)}
									/>
								{/each}
							</div>
						{/each}
					</div>
				{:else}
					<!-- No ports: show label centered -->
					<div class="relative flex items-center justify-center w-full h-full select-none pointer-events-none">
						<span class="text-[9px] font-medium text-gray-500 truncate px-1">{device.label || device.type}</span>
					</div>
				{/if}
			</div>
		{/each}
	</div>
</div>
