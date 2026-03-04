<script lang="ts">
	import type { PanelData } from './types'
	import PortCell from './PortCell.svelte'

	let { panel, selectedLocation, onselect }: {
		panel: PanelData
		selectedLocation?: string | null
		onselect?: (key: string) => void
	} = $props()
</script>

<div class="border-b border-gray-200 last:border-b-0">
	<div class="flex items-stretch">
		<!-- RU number rail -->
		<div class="w-8 flex flex-col items-center justify-center border-r border-gray-200 shrink-0 {panel.isHighLevel ? 'bg-amber-50' : 'bg-gray-100'}">
			<span class="font-mono text-[9px] text-gray-500 font-bold">{panel.ru}</span>
			{#if panel.isHighLevel}<span class="text-[6px] text-amber-500 font-bold">HL</span>{/if}
		</div>

		<div class="flex-1 p-0.5 space-y-px">
			<div class="grid grid-cols-24 gap-px">
				{#each panel.topRow as port, i (i)}
					<PortCell {port} selected={port ? `${port.zone}-${port.locationNumber}` === selectedLocation : false} {onselect} />
				{/each}
			</div>
			<div class="grid grid-cols-24 gap-px">
				{#each panel.bottomRow as port, i (i)}
					<PortCell {port} selected={port ? `${port.zone}-${port.locationNumber}` === selectedLocation : false} {onselect} />
				{/each}
			</div>
		</div>
	</div>
</div>
