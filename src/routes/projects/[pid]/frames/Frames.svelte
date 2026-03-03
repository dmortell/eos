<script lang="ts">
	import type { ZoneConfig, LocationConfig, FrameConfig, RackData } from './parts/types'
	import { defaultZoneConfig, defaultFrameConfig } from './parts/types'
	import { generatePortLabels, generateRacks } from './parts/engine'
	import ConfigPanel from './parts/ConfigPanel.svelte'
	import LocationList from './parts/LocationList.svelte'
	import FrameToolbar from './parts/FrameToolbar.svelte'
	import FrameDrawing from './parts/FrameDrawing.svelte'

	let { data = null, onsave }: {
		data?: any
		onsave?: (payload: any) => void
	} = $props()

	// ── State ──
	let zone = $state<ZoneConfig>(data?.zone ?? defaultZoneConfig())
	let frames = $state<FrameConfig[]>(data?.frames ?? [])
	let rooms = $state<{ roomNumber: string; roomName: string }[]>(data?.rooms ?? [])
	let customLocationTypes = $state<string[]>(data?.customLocationTypes ?? [])
	let selectedLocation = $state<number | null>(null)
	let selectedFrameId = $state<string | null>(frames[0]?.id ?? null)
	let saveStatus = $state<'saved' | 'saving' | 'unsaved'>('saved')

	// ── Derived: recompute labels and racks whenever zone/frames change ──
	let labels = $derived(generatePortLabels(zone))
	let racks = $derived<RackData[]>(generateRacks(labels, zone, frames.length > 0 ? frames : undefined))

	// ── Debounced auto-save ──
	let saveTimer: ReturnType<typeof setTimeout> | null = null
	let initialized = false

	$effect(() => {
		const _ = JSON.stringify({ zone, frames, rooms, customLocationTypes })

		if (!initialized) {
			initialized = true
			return
		}

		saveStatus = 'unsaved'
		if (saveTimer) clearTimeout(saveTimer)
		saveTimer = setTimeout(() => {
			if (onsave) {
				saveStatus = 'saving'
				onsave({ zone, frames, rooms, customLocationTypes })
				saveStatus = 'saved'
			}
		}, 500)
	})

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

	function updateFrames(updated: FrameConfig[]) {
		frames = updated
		// If selected frame was removed, select first available
		if (!updated.find(f => f.id === selectedFrameId)) {
			selectedFrameId = updated[0]?.id ?? null
		}
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
			<div class="mb-3 flex items-center justify-between text-sm">
				<div class="flex items-center gap-3">
					<span class="font-mono text-blue-600 font-semibold">
						Floor {String(zone.floor).padStart(2, '0')} &middot; Zone {zone.zone}
					</span>
					<span class="text-gray-400">
						{zone.locations.length} locations &middot; {labels.length} ports
					</span>
				</div>
				{#if onsave}
					<span class="text-[10px] font-mono {saveStatus === 'saved' ? 'text-green-500' : saveStatus === 'saving' ? 'text-amber-500' : 'text-gray-400'}">
						{saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Saving...' : 'Unsaved'}
					</span>
				{/if}
			</div>
		{/if}

		<!-- Frame toolbar -->
		<div class="mb-4">
			<FrameToolbar
				{frames}
				{selectedFrameId}
				{zone}
				onupdate={updateFrames}
				onselect={id => selectedFrameId = id}
			/>
		</div>

		<FrameDrawing {racks} {selectedLocation} onselect={selectLocation} />
	</div>
</div>
