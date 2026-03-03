<script lang="ts">
	import type { ZoneConfig, LocationConfig, RackData } from './parts/types'
	import { defaultZoneConfig } from './parts/types'
	import { generatePortLabels, generateRacks } from './parts/engine'
	import ConfigPanel from './parts/ConfigPanel.svelte'
	import LocationList from './parts/LocationList.svelte'
	import FrameDrawing from './parts/FrameDrawing.svelte'

	let { data = null }: { data?: any } = $props()

	// ── State ──
	let zone = $state<ZoneConfig>(data?.zone ?? defaultZoneConfig())
	let selectedLocation = $state<number | null>(null)

	// ── Derived: recompute labels and racks whenever zone changes ──
	let labels = $derived(generatePortLabels(zone))
	let racks = $derived<RackData[]>(generateRacks(labels, zone))

	// ── Handlers ──
	function updateZone(updated: ZoneConfig) {
		zone = updated
	}

	function updateLocation(index: number, loc: LocationConfig) {
		const locs = [...zone.locations]
		locs[index] = loc
		zone = { ...zone, locations: locs }
	}

	function selectLocation(locNum: number) {
		selectedLocation = selectedLocation === locNum ? null : locNum
	}
</script>

<div class="flex h-[calc(100vh-38px)] bg-white">
	<!-- Sidebar -->
	<div class="w-[360px] shrink-0 border-r border-gray-200 flex flex-col overflow-hidden">
		<div class="p-3 space-y-3 overflow-y-auto flex-1">
			<ConfigPanel {zone} onupdate={updateZone} />
			<LocationList
				locations={zone.locations}
				hasTwoRooms={zone.serverRoomCount === 2}
				{selectedLocation}
				onupdate={updateLocation}
				onselect={selectLocation}
			/>
		</div>
	</div>

	<!-- Main content: frame drawing -->
	<div class="flex-1 overflow-auto p-4 bg-gray-50/50">
		<!-- Summary bar -->
		{#if zone.locations.length > 0}
			<div class="mb-4 flex items-center gap-3 text-sm">
				<span class="font-mono text-blue-600 font-semibold">
					Floor {String(zone.floor).padStart(2, '0')} &middot; Zone {zone.zone}
				</span>
				<span class="text-gray-400">
					{zone.locations.length} locations &middot; {labels.length} ports
				</span>
			</div>
		{/if}

		<FrameDrawing {racks} {selectedLocation} onselect={selectLocation} />
	</div>
</div>
