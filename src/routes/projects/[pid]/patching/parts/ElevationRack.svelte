<script lang="ts">
	import type { PatchConnection, CustomCableType } from './types'
	import ElevationPort from './ElevationPort.svelte'
	import {
		RU_HEIGHT, PORT_GAP, RACK_PADDING,
		U_LABEL_W, RACK_LABEL_H, PORTS_PER_ROW,
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
</script>

<div class="relative" style:width="{width}px" style:height="{height + RACK_LABEL_H}px">
	<!-- Rack label above -->
	<div class="absolute flex items-center justify-between w-full pointer-events-none select-none"
		style:top="0px" style:height="{RACK_LABEL_H}px" style:left="0px">
		<b class="text-[11px] text-gray-700 pl-1">{rack.label}</b>
		<span class="text-[9px] text-gray-400 pr-1">{rack.heightU}U</span>
	</div>

	<!-- Rack frame -->
	<div class="absolute border border-gray-300 bg-white rounded-sm"
		style:top="{RACK_LABEL_H}px" style:left="0px" style:width="{width}px" style:height="{height}px">

		<!-- U labels -->
		{#each Array.from({ length: rack.heightU }) as _, i}
			{@const u = i + 1}
			{@const y = uToY(u, rack.heightU)}
			<div class="absolute text-[7px] font-mono text-gray-300 text-right pr-0.5 select-none pointer-events-none leading-none flex items-center justify-end"
				style:top="{y}px" style:left="0px" style:width="{U_LABEL_W - 2}px" style:height="{RU_HEIGHT}px">
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
			{@const rows = portRowCount(device.portCount)}
			{@const hasPorts = device.portCount > 0}
			<div class="absolute rounded-sm"
				style:top="{dTop}px" style:left="{U_LABEL_W}px" style:right="0" style:height="{dH}px"
				title="{device.label || device.type} — U{device.positionU} {device.portCount ? device.portCount + ' ports' : ''}">

				<!-- Device background -->
				<div class="absolute inset-0 border rounded-sm"
					style:background={device.color ? device.color + '15' : '#f1f5f9'}
					style:border-color={device.color || '#cbd5e1'}>
				</div>

				{#if hasPorts}
					<!-- Port grid fills the device block using CSS grid (like sample1) -->
					<div class="relative w-full h-full grid place-items-center px-0.5"
						style:grid-template-columns="repeat({Math.min(device.portCount, PORTS_PER_ROW)}, 1fr)"
						style:grid-template-rows="repeat({rows}, 1fr)"
						style:gap="{PORT_GAP}px"
						style:padding="{RACK_PADDING}px {RACK_PADDING}px">
						{#each Array.from({ length: device.portCount }) as _, idx}
							{@const pIdx = idx + 1}
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
				{:else}
					<!-- No ports: show label -->
					<div class="relative flex items-center justify-center w-full h-full select-none pointer-events-none">
						<span class="text-[9px] font-medium text-gray-500 truncate px-1">{device.label || device.type}</span>
					</div>
				{/if}
			</div>
		{/each}
	</div>
</div>
