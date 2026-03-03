<script lang="ts">
	import { Button, Icon } from '$lib'
	import type { ZoneConfig, LocationConfig, FrameConfig, RackData } from './parts/types'
	import { defaultZoneConfig, defaultFrameConfig } from './parts/types'
	import { generatePortLabels, generateRacks } from './parts/engine'
	import { exportToExcel } from './parts/exportExcel'
	import ConfigPanel from './parts/ConfigPanel.svelte'
	import LocationList from './parts/LocationList.svelte'
	import FrameToolbar from './parts/FrameToolbar.svelte'
	import FrameDrawing from './parts/FrameDrawing.svelte'
	import SettingsDialog from './parts/SettingsDialog.svelte'

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
	let viewMode = $state<'sidebar' | 'stacked'>('sidebar')
	let settingsOpen = $state(false)

	// ── Refs for scroll sync ──
	let locationListEl: HTMLDivElement | undefined = $state()
	let frameDrawingEl: HTMLDivElement | undefined = $state()

	// ── Derived ──
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
		if (selectedLocation !== null) scrollToLocation(selectedLocation)
	}

	function selectLocationFromFrame(locNum: number) {
		selectedLocation = selectedLocation === locNum ? null : locNum
		if (selectedLocation !== null) scrollToLocationInList(selectedLocation)
	}

	function updateFrames(updated: FrameConfig[]) {
		frames = updated
		if (!updated.find(f => f.id === selectedFrameId)) {
			selectedFrameId = updated[0]?.id ?? null
		}
	}

	/** Scroll the frame drawing to show the selected location's ports */
	function scrollToLocation(locNum: number) {
		if (!frameDrawingEl) return
		const portEl = frameDrawingEl.querySelector(`[data-loc="${locNum}"]`)
		portEl?.scrollIntoView({ behavior: 'smooth', block: 'center' })
	}

	/** Scroll the location list to show the selected location */
	function scrollToLocationInList(locNum: number) {
		if (!locationListEl) return
		const rowEl = locationListEl.querySelector(`[data-loc-row="${locNum}"]`)
		rowEl?.scrollIntoView({ behavior: 'smooth', block: 'center' })
	}

	function handleExport() {
		exportToExcel(racks, zone)
	}

	function updateSettings(data: { customTypes: string[]; rooms: { roomNumber: string; roomName: string }[] }) {
		customLocationTypes = data.customTypes
		rooms = data.rooms
	}
</script>

<SettingsDialog
	open={settingsOpen}
	customTypes={customLocationTypes}
	{rooms}
	onclose={() => settingsOpen = false}
	onupdate={updateSettings}
/>

{#if viewMode === 'sidebar'}
	<!-- Sidebar layout -->
	<div class="flex h-[calc(100vh-38px)] bg-white">
		<!-- Sidebar -->
		<div class="w-[360px] shrink-0 border-r border-gray-200 flex flex-col overflow-hidden">
			<div class="p-3 space-y-3 overflow-y-auto flex-1" bind:this={locationListEl}>
				<ConfigPanel {zone} onupdate={updateZone} />
				<LocationList
					locations={zone.locations}
					hasTwoRooms={zone.serverRoomCount >= 2}
					customTypes={customLocationTypes}
					{selectedLocation}
					onupdate={updateLocation}
					onselect={selectLocation}
				/>
			</div>
		</div>

		<!-- Main content -->
		<div class="flex-1 overflow-auto p-4 bg-gray-50/50" bind:this={frameDrawingEl}>
			{@render toolbar()}
			{@render frameContent()}
		</div>
	</div>
{:else}
	<!-- Stacked layout -->
	<div class="h-[calc(100vh-38px)] bg-white overflow-auto">
		<div class="max-w-6xl mx-auto p-4 space-y-4">
			<!-- Config + locations -->
			<div class="space-y-3" bind:this={locationListEl}>
				<ConfigPanel {zone} onupdate={updateZone} />
				<LocationList
					locations={zone.locations}
					hasTwoRooms={zone.serverRoomCount >= 2}
					customTypes={customLocationTypes}
					{selectedLocation}
					onupdate={updateLocation}
					onselect={selectLocation}
				/>
			</div>

			<hr class="border-gray-200" />

			<!-- Frame drawing -->
			<div bind:this={frameDrawingEl}>
				{@render toolbar()}
				{@render frameContent()}
			</div>
		</div>
	</div>
{/if}

{#snippet toolbar()}
	<!-- Summary + toolbar -->
	<div class="mb-3 flex items-center justify-between text-sm flex-wrap gap-2">
		<div class="flex items-center gap-3">
			{#if zone.locations.length > 0}
				<span class="font-mono text-blue-600 font-semibold">
					Floor {String(zone.floor).padStart(2, '0')} &middot; Zone {zone.zone}
				</span>
				<span class="text-gray-400">
					{zone.locations.length} locations &middot; {labels.length} ports
				</span>
			{/if}
		</div>

		<div class="flex items-center gap-1">
			{#if zone.locations.length > 0}
				<Button onclick={handleExport} icon="download" class="text-[10px] h-6">Excel</Button>
			{/if}
			<Button onclick={() => settingsOpen = true} icon="settings" class="text-[10px] h-6">Settings</Button>
			<div class="flex">
				<Button group active={viewMode === 'sidebar'} onclick={() => viewMode = 'sidebar'}>
					<Icon name="sidebar" />
				</Button>
				<Button group active={viewMode === 'stacked'} onclick={() => viewMode = 'stacked'}>
					<Icon name="rows" />
				</Button>
			</div>
			{#if onsave}
				<span class="text-[10px] font-mono ml-1 {saveStatus === 'saved' ? 'text-green-500' : saveStatus === 'saving' ? 'text-amber-500' : 'text-gray-400'}">
					{saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Saving...' : 'Unsaved'}
				</span>
			{/if}
		</div>
	</div>

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
{/snippet}

{#snippet frameContent()}
	<FrameDrawing {racks} {selectedFrameId} {selectedLocation} onselect={selectLocationFromFrame} />
{/snippet}
