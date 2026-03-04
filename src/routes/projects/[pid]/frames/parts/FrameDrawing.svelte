<script lang="ts">
	import type { RackData, PanelData, FrameSlot } from './types'
	import PanelStrip from './PanelStrip.svelte'

	let { racks, selectedFrameId, selectedLocations, onselect }: {
		racks: RackData[]
		selectedFrameId?: string | null
		selectedLocations?: Set<string>
		onselect?: (key: string) => void
	} = $props()

	/** Show only the selected frame, or all if none selected */
	let visibleRacks = $derived(
		selectedFrameId
			? racks.filter(r => r.frame.id === selectedFrameId)
			: racks
	)

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
			for (let h = 1; h < slot.height; h++) {
				if (slot.ru + h <= totalRU) occupied.set(slot.ru + h, { type: 'slot', slot })
			}
		}

		// Build list top-down (highest RU first in visual)
		for (let ru = totalRU; ru >= 1; ru--) {
			const item = occupied.get(ru)
			if (item) {
				// Skip extra RUs of a multi-U slot (only render at base RU)
				if (item.type === 'slot' && ru !== item.slot.ru) continue
				items.push(item)
			} else {
				items.push({ type: 'empty', ru })
			}
		}

		return items
	}
</script>

{#if visibleRacks.length === 0 && racks.length === 0}
	<div class="flex items-center justify-center h-64 text-gray-400 text-sm">
		Configure a zone and generate locations to see the patch frame
	</div>
{:else}
	<div class="space-y-6">
		{#each visibleRacks as rack (rack.frame.id)}
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
						<div class="grid grid-cols-24 gap-px flex-1">
							{#each Array(24) as _, i}
								<span class="font-mono text-[6px] text-gray-400 text-center">{i + 1}</span>
							{/each}
						</div>
					</div>

					{#each ruMap as item}
						{#if item.type === 'panel'}
							<PanelStrip panel={item.panel} {selectedLocations} {onselect} />
						{:else if item.type === 'slot'}
							<!-- Slot: blanking, cable mgmt, device -->
							<div class="border-b border-gray-200 last:border-b-0">
								<div class="flex items-stretch" style:height="{item.slot.height * 1.25}rem">
									<div class="w-8 bg-gray-100 flex flex-col items-center justify-between py-px border-r border-gray-200 shrink-0">
									{#each Array(item.slot.height) as _, h}
										<span class="font-mono text-[7px] text-gray-400">{item.slot.ru + item.slot.height - 1 - h}</span>
									{/each}
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
