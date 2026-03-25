<script lang="ts">
	import type { PatchConnection, CustomCableType } from './types'
	import ElevationPort from './ElevationPort.svelte'
	import {
		RU_HEIGHT, PORT_W, PORT_H, PORT_GAP, RACK_PADDING,
		U_LABEL_W, DEVICE_LABEL_H, PORTS_PER_ROW,
		rackWidth, rackHeight, uToY, portRowCount,
	} from './elevationUtils'

	let {
		rack,
		devices = [],
		portConnectionMap = new Map(),
		customCableTypes = [],
		selectedPortKey = null,
		onportclick,
	}: {
		rack: any
		devices: any[]
		portConnectionMap: Map<string, PatchConnection>
		customCableTypes: CustomCableType[]
		selectedPortKey?: string | null
		onportclick?: (deviceId: string, portIndex: number) => void
	} = $props()

	let width = $derived(rackWidth())
	let height = $derived(rackHeight(rack.heightU))

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

	function portArray(portCount: number): number[] {
		return Array.from({ length: portCount }, (_, i) => i + 1)
	}
</script>

<div class="relative" style:width="{width}px" style:height="{height + 24}px">
	<!-- Rack label above -->
	<div class="absolute flex items-center justify-between w-full pointer-events-none select-none"
		style:top="0px" style:height="20px" style:left="0px">
		<b class="text-[11px] text-gray-700 pl-1">{rack.label}</b>
		<span class="text-[9px] text-gray-400 pr-1">{rack.heightU}U</span>
	</div>

	<!-- Rack frame -->
	<div class="absolute border border-gray-300 bg-white rounded-sm"
		style:top="22px" style:left="0px" style:width="{width}px" style:height="{height}px">

		<!-- U labels -->
		{#each Array.from({ length: rack.heightU }) as _, i}
			{@const u = i + 1}
			{@const y = uToY(u, rack.heightU)}
			<div class="absolute text-[8px] font-mono text-gray-300 text-right pr-1 select-none pointer-events-none leading-none flex items-center justify-end"
				style:top="{y}px" style:left="0px" style:width="{U_LABEL_W}px" style:height="{RU_HEIGHT}px">
				{u}
			</div>
			<!-- U gridline -->
			<div class="absolute bg-gray-100"
				style:top="{y + RU_HEIGHT - 1}px" style:left="{U_LABEL_W}px" style:right="0" style:height="1px"></div>
		{/each}

		<!-- Devices -->
		{#each sortedDevices as device (device.id)}
			{@const dTop = deviceTop(device)}
			{@const dH = deviceH(device)}
			{@const ports = portArray(device.portCount)}
			{@const rows = portRowCount(device.portCount)}
			<div class="absolute rounded-sm overflow-hidden"
				style:top="{dTop}px" style:left="{U_LABEL_W}px" style:right="0" style:height="{dH}px">

				<!-- Device background -->
				<div class="absolute inset-0 border rounded-sm"
					style:background={device.color ? device.color + '15' : '#f1f5f9'}
					style:border-color={device.color || '#cbd5e1'}>
				</div>

				<!-- Device label -->
				<div class="relative flex items-center gap-1 px-1 select-none pointer-events-none"
					style:height="{DEVICE_LABEL_H}px">
					<span class="text-[9px] font-medium text-gray-600 truncate">{device.label || device.type}</span>
					{#if device.portCount > 0}
						<span class="text-[8px] text-gray-400 ml-auto shrink-0">{device.portCount}p</span>
					{/if}
				</div>

				<!-- Port grid -->
				{#if device.portCount > 0}
					<div class="relative px-1">
						{#each Array.from({ length: rows }) as _, rowIdx}
							{@const rowStart = rowIdx * PORTS_PER_ROW + 1}
							{@const rowEnd = Math.min((rowIdx + 1) * PORTS_PER_ROW, device.portCount)}
							<div class="flex gap-px" style:margin-bottom="{PORT_GAP}px">
								{#each Array.from({ length: rowEnd - rowStart + 1 }) as _, colIdx}
									{@const pIdx = rowStart + colIdx}
									{@const connKey = `${device.id}:${pIdx}`}
									<ElevationPort
										portIndex={pIdx}
										connection={portConnectionMap.get(connKey) ?? null}
										{customCableTypes}
										selected={selectedPortKey === connKey}
										onclick={() => onportclick?.(device.id, pIdx)}
									/>
								{/each}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/each}
	</div>
</div>
