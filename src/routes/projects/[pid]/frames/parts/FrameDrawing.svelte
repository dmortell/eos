<script lang="ts">
	import type { RackData, PanelData, FrameSlot } from './types'
	import PanelStrip from './PanelStrip.svelte'

	let { racks, selectedLocation, onselect }: {
		racks: RackData[]
		selectedLocation?: number | null
		onselect?: (loc: number) => void
	} = $props()

	type RUItem = { type: 'panel'; panel: PanelData } | { type: 'slot'; slot: FrameSlot } | { type: 'empty'; ru: number }

	/** Build a full RU map for a rack, bottom-up (RU 1 = bottom) */
	function buildRUMap(rack: RackData): RUItem[] {
		const totalRU = rack.frame.totalRU
		const items: RUItem[] = []

		// Map occupied RUs
		const occupied = new Map<number, RUItem>()
		for (const panel of rack.panels) {
			occupied.set(panel.ru, { type: 'panel', panel })
		}
		for (const slot of rack.frame.slots) {
			occupied.set(slot.ru, { type: 'slot', slot })
			if (slot.height === 2 && slot.ru + 1 <= totalRU) {
				occupied.set(slot.ru + 1, { type: 'slot', slot }) // 2U spans two RUs
			}
		}

		// Build list top-down (highest RU first in visual)
		for (let ru = totalRU; ru >= 1; ru--) {
			const item = occupied.get(ru)
			if (item) {
				// Skip second RU of a 2U slot (already rendered)
				if (item.type === 'slot' && item.slot.height === 2 && ru === item.slot.ru + 1) continue
				items.push(item)
			} else {
				items.push({ type: 'empty', ru })
			}
		}

		return items
	}
</script>

{#if racks.length === 0}
	<div class="flex items-center justify-center h-64 text-gray-400 text-sm">
		Configure a zone and generate locations to see the patch frame
	</div>
{:else}
	<div class="space-y-6">
		{#each racks as rack (rack.frame.id)}
			{@const ruMap = buildRUMap(rack)}
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

					{#each ruMap as item}
						{#if item.type === 'panel'}
							<PanelStrip panel={item.panel} {selectedLocation} {onselect} />
						{:else if item.type === 'slot'}
							<!-- Slot: blanking, cable mgmt, device -->
							<div class="border-b border-gray-200 last:border-b-0">
								<div class="flex items-stretch" style:height={item.slot.height === 2 ? '2.5rem' : '1.25rem'}>
									<div class="w-8 bg-gray-100 flex items-center justify-center border-r border-gray-200 shrink-0">
										<span class="font-mono text-[9px] text-gray-400">{item.slot.ru}</span>
									</div>
									<div class="flex-1 flex items-center px-2 {
										item.slot.type === 'blanking' ? 'bg-gray-200/50' :
										item.slot.type === 'device' ? 'bg-indigo-50' :
										'bg-yellow-50'
									}">
										<span class="font-mono text-[9px] text-gray-400 capitalize">
											{item.slot.type.replace(/-/g, ' ')}{item.slot.label ? `: ${item.slot.label}` : ''}
										</span>
									</div>
								</div>
							</div>
						{:else}
							<!-- Empty RU -->
							<div class="border-b border-gray-100 last:border-b-0">
								<div class="flex items-stretch h-3">
									<div class="w-8 bg-gray-50 flex items-center justify-center border-r border-gray-100 shrink-0">
										<span class="font-mono text-[7px] text-gray-300">{item.ru}</span>
									</div>
									<div class="flex-1"></div>
								</div>
							</div>
						{/if}
					{/each}
				</div>
			</div>
		{/each}
	</div>
{/if}
