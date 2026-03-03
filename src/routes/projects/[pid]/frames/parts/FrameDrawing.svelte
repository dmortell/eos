<script lang="ts">
	import type { RackData } from './types'
	import PanelStrip from './PanelStrip.svelte'

	let { racks, selectedLocation, onselect }: {
		racks: RackData[]
		selectedLocation?: number | null
		onselect?: (loc: number) => void
	} = $props()
</script>

{#if racks.length === 0}
	<div class="flex items-center justify-center h-64 text-gray-400 text-sm">
		Configure a zone and generate locations to see the patch frame
	</div>
{:else}
	<div class="space-y-6">
		{#each racks as rack (rack.frame.id)}
			<div class="space-y-2">
				<!-- Frame header -->
				<div class="flex items-center gap-3">
					<div class="w-3 h-3 rounded-full {rack.frame.serverRoom === 'A' ? 'bg-blue-500' : 'bg-purple-500'}"></div>
					<h3 class="font-semibold text-sm uppercase tracking-wider text-gray-700">
						{rack.frame.name}
					</h3>
					<span class="text-xs text-gray-400">
						{rack.panels.length} panel{rack.panels.length !== 1 ? 's' : ''} / {rack.frame.totalRU}U frame
					</span>
				</div>

				<!-- Rack body -->
				<div class="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
					<!-- Column header -->
					<div class="flex items-center px-0.5 py-0.5 bg-gray-50 border-b border-gray-200">
						<span class="font-mono text-[7px] text-gray-400 w-8 text-center shrink-0">RU</span>
						<span class="w-3 shrink-0"></span>
						<div class="grid grid-cols-24 gap-px flex-1">
							{#each Array(24) as _, i}
								<span class="font-mono text-[6px] text-gray-400 text-center">{i + 1}</span>
							{/each}
						</div>
					</div>

					<!-- Panels (rendered bottom-up: highest RU at top of visual) -->
					{#each [...rack.panels].reverse() as panel (panel.panelNumber)}
						<PanelStrip {panel} {selectedLocation} {onselect} />
					{/each}

					<!-- Empty RU indicator -->
					{#if rack.panels.length < rack.frame.totalRU}
						<div class="px-2 py-1.5 flex items-center gap-2 border-t border-gray-100 bg-gray-50/50">
							<span class="font-mono text-[9px] text-gray-400">
								{rack.frame.totalRU - rack.panels.length} empty RU remaining
							</span>
						</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>
{/if}
