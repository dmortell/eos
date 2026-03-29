<script lang="ts">
	import type { PanelData, LocType } from './types'
	import PortCell from './PortCell.svelte'

	let { panel, frameId, selectedLocations, selectedPorts, reservationMap, onselect }: {
		panel: PanelData
		frameId: string
		selectedLocations?: Set<string>
		selectedPorts?: Set<string>
		reservationMap?: Map<string, LocType>
		onselect?: (key: string) => void
	} = $props()

	function portKey(row: 'top' | 'bottom', col: number): string {
		return `${frameId}:${panel.ru}:${row}:${col}`
	}
</script>

<div class="border-b border-gray-200 last:border-b-0">
	<div class="flex items-stretch">
		<!-- RU number rail -->
		<div class="w-8 flex flex-col items-center justify-center border-r border-gray-200 shrink-0 {panel.isHighLevel ? 'bg-amber-50' : 'bg-gray-100'}">
			<span class="font-mono text-[9px] text-gray-500 font-bold">{panel.ru}</span>
			{#if panel.isHighLevel}<span class="text-xs text-amber-500 font-bold">HL</span>{/if}
		</div>

		<div class="flex-1 p-0.5 space-y-px">
			<div class="grid grid-cols-24 gap-px">
				{#each panel.topRow as port, col (col)}
					{@const pk = portKey('top', col)}
					<PortCell
						{port}
						portKey={pk}
						selected={port ? (selectedLocations?.has(`${port.zone}-${port.locationNumber}`) ?? false) : false}
						portSelected={selectedPorts?.has(pk) ?? false}
						reservation={reservationMap?.get(pk)}
						{onselect}
					/>
				{/each}
			</div>
			{#if panel.bottomRow.length > 0}
				<div class="grid grid-cols-24 gap-px">
					{#each panel.bottomRow as port, col (col)}
						{@const pk = portKey('bottom', col)}
						<PortCell
							{port}
							portKey={pk}
							selected={port ? (selectedLocations?.has(`${port.zone}-${port.locationNumber}`) ?? false) : false}
							portSelected={selectedPorts?.has(pk) ?? false}
							reservation={reservationMap?.get(pk)}
							{onselect}
						/>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>
