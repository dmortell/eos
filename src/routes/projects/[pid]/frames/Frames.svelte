<script lang="ts">
	import { Button, Icon } from '$lib'
	import type { ZoneConfig, LocationConfig, FrameConfig, RackData, PortLabel } from './parts/types'
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
	// Migrate from single-zone to multi-zone format
	let zones = $state<ZoneConfig[]>(
		data?.zones ?? (data?.zone ? [data.zone] : [defaultZoneConfig()])
	)
	let activeZoneIndex = $state(0)
	let frames = $state<FrameConfig[]>(data?.frames ?? [])
	let rooms = $state<{ roomNumber: string; roomName: string }[]>(data?.rooms ?? [])
	let customLocationTypes = $state<string[]>(data?.customLocationTypes ?? [])
	let excelGroupByRoom = $state<boolean>(data?.excelGroupByRoom ?? false)
	let selectedLocation = $state<number | null>(null)
	let selectedFrameId = $state<string | null>(frames[0]?.id ?? null)
	let saveStatus = $state<'saved' | 'saving' | 'unsaved'>('saved')
	let viewMode = $state<'sidebar' | 'stacked'>('sidebar')
	let settingsOpen = $state(false)

	// ── Refs for scroll sync ──
	let locationListEl: HTMLDivElement | undefined = $state()
	let frameDrawingEl: HTMLDivElement | undefined = $state()

	// ── Derived ──
	let activeZone = $derived(zones[activeZoneIndex] ?? zones[0])
	let allLabels = $derived<PortLabel[]>(zones.flatMap(z => generatePortLabels(z)))
	let maxServerRooms = $derived(Math.max(...zones.map(z => z.serverRoomCount), 1))
	let racks = $derived<RackData[]>(generateRacks(allLabels, maxServerRooms, frames.length > 0 ? frames : undefined))

	// ── Debounced auto-save ──
	let saveTimer: ReturnType<typeof setTimeout> | null = null
	let initialized = false

	/** Strip undefined values recursively (Firestore rejects them) */
	function stripUndefined(obj: any): any {
		if (Array.isArray(obj)) return obj.map(stripUndefined)
		if (obj && typeof obj === 'object') {
			const out: any = {}
			for (const [k, v] of Object.entries(obj)) {
				if (v !== undefined) out[k] = stripUndefined(v)
			}
			return out
		}
		return obj
	}

	$effect(() => {
		const _ = JSON.stringify({ zones, frames, rooms, customLocationTypes, excelGroupByRoom })

		if (!initialized) {
			initialized = true
			return
		}

		saveStatus = 'unsaved'
		if (saveTimer) clearTimeout(saveTimer)
		saveTimer = setTimeout(() => {
			if (onsave) {
				saveStatus = 'saving'
				onsave(stripUndefined({ zones, frames, rooms, customLocationTypes, excelGroupByRoom }))
				saveStatus = 'saved'
			}
		}, 500)
	})

	// ── Handlers ──
	function updateZone(updated: ZoneConfig) {
		zones = zones.map((z, i) => i === activeZoneIndex ? updated : z)
	}

	function addZone() {
		const z = defaultZoneConfig()
		z.zone = String.fromCharCode(65 + zones.length) // next letter
		zones = [...zones, z]
		activeZoneIndex = zones.length - 1
	}

	function removeZone(index: number) {
		if (zones.length <= 1) return
		zones = zones.filter((_, i) => i !== index)
		if (activeZoneIndex >= zones.length) activeZoneIndex = zones.length - 1
	}

	function updateLocation(index: number, loc: LocationConfig) {
		const locs = [...activeZone.locations]
		locs[index] = loc
		updateZone({ ...activeZone, locations: locs })
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
		exportToExcel(racks, zones, excelGroupByRoom)
	}

	function updateSettings(data: { customTypes: string[]; rooms: { roomNumber: string; roomName: string }[]; excelGroupByRoom: boolean }) {
		customLocationTypes = data.customTypes
		rooms = data.rooms
		excelGroupByRoom = data.excelGroupByRoom
	}
</script>

<SettingsDialog
	open={settingsOpen}
	customTypes={customLocationTypes}
	{rooms}
	{excelGroupByRoom}
	onclose={() => settingsOpen = false}
	onupdate={updateSettings}
/>

{#if viewMode === 'sidebar'}
	<!-- Sidebar layout -->
	<div class="flex h-[calc(100vh-38px)] bg-white">
		<!-- Sidebar -->
		<div class="w-[360px] shrink-0 border-r border-gray-200 flex flex-col overflow-hidden">
			<div class="p-3 space-y-3 overflow-y-auto flex-1" bind:this={locationListEl}>
				{@render zoneTabs()}
				<ConfigPanel zone={activeZone} onupdate={updateZone} />
				<LocationList
					locations={activeZone.locations}
					hasTwoRooms={activeZone.serverRoomCount >= 2}
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
				{@render zoneTabs()}
				<ConfigPanel zone={activeZone} onupdate={updateZone} />
				<LocationList
					locations={activeZone.locations}
					hasTwoRooms={activeZone.serverRoomCount >= 2}
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

{#snippet zoneTabs()}
	<div class="flex items-center gap-1">
		{#each zones as z, i}
			<button
				class="px-2 py-0.5 text-xs font-mono rounded border transition-colors
					{i === activeZoneIndex
						? 'bg-blue-50 border-blue-300 text-blue-700 font-semibold'
						: 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}"
				onclick={() => activeZoneIndex = i}
			>
				F{String(z.floor).padStart(2, '0')}-{z.zone}
				<span class="text-[9px] text-gray-400 ml-0.5">{z.locations.length}</span>
			</button>
		{/each}
		<button
			class="px-1.5 py-0.5 text-[10px] rounded border border-dashed border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400 transition-colors"
			onclick={addZone}
		>+ Zone</button>
		{#if zones.length > 1}
			<button
				class="px-1.5 py-0.5 text-[10px] rounded text-red-400 hover:text-red-600 transition-colors"
				onclick={() => removeZone(activeZoneIndex)}
				title="Remove active zone"
			>&times;</button>
		{/if}
	</div>
{/snippet}

{#snippet toolbar()}
	<!-- Summary + toolbar -->
	<div class="mb-3 flex items-center justify-between text-sm flex-wrap gap-2">
		<div class="flex items-center gap-3">
			{#if allLabels.length > 0}
				<span class="font-mono text-blue-600 font-semibold">
					{zones.map(z => `F${String(z.floor).padStart(2, '0')}-${z.zone}`).join(' / ')}
				</span>
				<span class="text-gray-400">
					{zones.reduce((n, z) => n + z.locations.length, 0)} locations &middot; {allLabels.length} ports
				</span>
			{/if}
		</div>

		<div class="flex items-center gap-1">
			{#if allLabels.length > 0}
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
			serverRoomCount={maxServerRooms}
			onupdate={updateFrames}
			onselect={id => selectedFrameId = id}
		/>
	</div>
{/snippet}

{#snippet frameContent()}
	<FrameDrawing {racks} {selectedFrameId} {selectedLocation} onselect={selectLocationFromFrame} />
{/snippet}
