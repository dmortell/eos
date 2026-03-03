<script lang="ts">
	import type { PanelData } from './types'
	import PortCell from './PortCell.svelte'

	let { panel, selectedLocation, onselect }: {
		panel: PanelData
		selectedLocation?: number | null
		onselect?: (loc: number) => void
	} = $props()
</script>

<div class="border-b border-gray-200 last:border-b-0">
	<div class="flex items-stretch">
		<!-- RU number rail -->
		<div class="w-8 bg-gray-100 flex items-center justify-center border-r border-gray-200 shrink-0">
			<span class="font-mono text-[9px] text-gray-500 font-bold">{panel.ru}</span>
		</div>

		<div class="flex-1 p-0.5 space-y-px">
			<!-- Top row -->
			<div class="flex items-center gap-px">
				<span class="font-mono text-[7px] text-gray-400 w-3 shrink-0">T</span>
				<div class="grid grid-cols-24 gap-px flex-1">
					{#each panel.topRow as port, i (i)}
						<PortCell {port} selected={port?.locationNumber === selectedLocation} {onselect} />
					{/each}
				</div>
			</div>
			<!-- Bottom row -->
			<div class="flex items-center gap-px">
				<span class="font-mono text-[7px] text-gray-400 w-3 shrink-0">B</span>
				<div class="grid grid-cols-24 gap-px flex-1">
					{#each panel.bottomRow as port, i (i)}
						<PortCell {port} selected={port?.locationNumber === selectedLocation} {onselect} />
					{/each}
				</div>
			</div>
		</div>
	</div>
</div>
