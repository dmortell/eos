<script lang="ts">
	import { Button, Icon } from '$lib'
	import type { ZoneConfig, LocationConfig, FrameConfig, RackData, PortLabel } from './parts/types'
	import { defaultFrameConfig } from './parts/types'
	import { generatePortLabels, generateRacks } from './parts/engine'
	import { exportToExcel } from './parts/exportExcel'
	import ConfigPanel from './parts/ConfigPanel.svelte'
	import LocationList from './parts/LocationList.svelte'
	import FrameToolbar from './parts/FrameToolbar.svelte'
	import FrameDrawing from './parts/FrameDrawing.svelte'
	import SettingsDialog from './parts/SettingsDialog.svelte'
	import Titlebar from '$lib/Titlebar.svelte'
	import { PaneGroup, Pane, Handle } from '$lib/components/ui/resizable'

	let { data = null, onsave }: {
		data?: any
		onsave?: (payload: any) => void
	} = $props()

	// ── Migrate from old single-zone format ──
	function migrateData(d: any): { floor: number; serverRoomCount: number; zoneLocations: Record<string, LocationConfig[]> } {
		if (d?.zoneLocations) {
			return { floor: d.floor ?? 1, serverRoomCount: d.serverRoomCount ?? 1, zoneLocations: d.zoneLocations }
		}
		// Old format: single zone object or zones array
		const zone = d?.zones?.[0] ?? d?.zone
		if (zone) {
			return {
				floor: zone.floor ?? 1,
				serverRoomCount: zone.serverRoomCount ?? 1,
				zoneLocations: { [zone.zone ?? 'A']: zone.locations ?? [] }
			}
		}
		return { floor: 1, serverRoomCount: 1, zoneLocations: {} }
	}

	const migrated = migrateData(data)

	// ── State: global settings ──
	let floor = $state(migrated.floor)
	let serverRoomCount = $state(migrated.serverRoomCount)

	// ── State: per-zone locations keyed by zone letter ──
	let zoneLocations = $state<Record<string, LocationConfig[]>>(migrated.zoneLocations)
	let activeZone = $state<string>(Object.keys(migrated.zoneLocations)[0] ?? 'A')

	// ── State: frames & settings (shared across all zones) ──
	let frames = $state<FrameConfig[]>(data?.frames ?? [])
	let rooms = $state<{ roomNumber: string; roomName: string }[]>(data?.rooms ?? [])
	let customLocationTypes = $state<string[]>(data?.customLocationTypes ?? [])
	let excelGroupByRoom = $state<boolean>(data?.excelGroupByRoom ?? true)
	let selectedLocation = $state<string | null>(null)
	let selectedFrameId = $state<string | null>(frames[0]?.id ?? null)
	let saveStatus = $state<'saved' | 'saving' | 'unsaved'>('saved')
	let viewMode = $state<'sidebar' | 'stacked'>('sidebar')
	let settingsOpen = $state(false)
	let showAllZones = $state(false)

	// ── Refs for scroll sync ──
	let locationListEl: HTMLDivElement | undefined = $state()
	let frameDrawingEl: HTMLDivElement | undefined = $state()

	// ── Derived ──
	/** Zone letters that have locations */
	let zoneLetters = $derived<string[]>(
		Object.keys(zoneLocations).filter(k => zoneLocations[k].length > 0).sort()
	)

	/** Active zone's locations */
	let activeLocations = $derived<LocationConfig[]>(zoneLocations[activeZone] ?? [])

	/** All locations across all zones, with a lookup to route updates back */
	// TODO is this a correct use of $derived() for reactivity? Or should it be changed to $derived.by(()=>{})
	type IndexedLoc = { zone: string; indexInZone: number }
	let allLocationsFlat = $derived<{ locations: LocationConfig[]; index: IndexedLoc[] }>((() => {
		const locations: LocationConfig[] = []
		const index: IndexedLoc[] = []
		for (const z of zoneLetters) {
			for (let i = 0; i < zoneLocations[z].length; i++) {
				locations.push(zoneLocations[z][i])
				index.push({ zone: z, indexInZone: i })
			}
		}
		return { locations, index }
	})())

	/** The locations to display in the list */
	let displayedLocations = $derived(showAllZones ? allLocationsFlat.locations : activeLocations)

	function zoneForLoc(index: number): string {
		if (showAllZones) return allLocationsFlat.index[index]?.zone ?? activeZone
		return activeZone
	}

	/** Build ZoneConfig objects for each zone and generate combined labels */
	let allLabels = $derived<PortLabel[]>(
		zoneLetters.flatMap(z => generatePortLabels({ floor, zone: z, serverRoomCount, locations: zoneLocations[z] }))
	)

	/** Build ZoneConfig array for export */
	let allZoneConfigs = $derived<ZoneConfig[]>(
		zoneLetters.map(z => ({ floor, zone: z, serverRoomCount, locations: zoneLocations[z] }))
	)

	let racks = $derived<RackData[]>(generateRacks(allLabels, serverRoomCount, frames.length > 0 ? frames : undefined))

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
		const _ = JSON.stringify({ floor, serverRoomCount, zoneLocations, frames, rooms, customLocationTypes, excelGroupByRoom })

		if (!initialized) {
			initialized = true
			return
		}

		saveStatus = 'unsaved'
		if (saveTimer) clearTimeout(saveTimer)
		saveTimer = setTimeout(() => {
			if (onsave) {
				saveStatus = 'saving'
				onsave(stripUndefined({ floor, serverRoomCount, zoneLocations, frames, rooms, customLocationTypes, excelGroupByRoom }))
				saveStatus = 'saved'
			}
		}, 500)
	})

	// ── Handlers ──
	function setFloor(val: number) { floor = val }
	function setServerRooms(count: number) { serverRoomCount = count }

	function setActiveZone(zone: string) {
		activeZone = zone
		selectedLocation = null
	}

	function generateLocations(count: number) {
		const existing = zoneLocations[activeZone] ?? []
		const locs = Array.from({ length: count }, (_, i) => {
			if (i < existing.length) return existing[i]
			return {
				locationNumber: i + 1,
				portCount: 2,
				serverRoomAssignment: ['A', 'A'],
				locationType: 'desk' as const,
			}
		})
		zoneLocations = { ...zoneLocations, [activeZone]: locs }
	}

	function updateLocation(index: number, loc: LocationConfig) {
		if (showAllZones) {
			const { zone, indexInZone } = allLocationsFlat.index[index]
			const locs = [...(zoneLocations[zone] ?? [])]
			locs[indexInZone] = loc
			zoneLocations = { ...zoneLocations, [zone]: locs }
		} else {
			const locs = [...activeLocations]
			locs[index] = loc
			zoneLocations = { ...zoneLocations, [activeZone]: locs }
		}
	}

	function selectLocation(key: string) {
		selectedLocation = selectedLocation === key ? null : key
		if (selectedLocation !== null) scrollToLocation(selectedLocation)
	}

	function selectLocationFromFrame(key: string) {
		selectedLocation = selectedLocation === key ? null : key
		if (selectedLocation !== null) scrollToLocationInList(selectedLocation)
	}

	function updateFrames(updated: FrameConfig[]) {
		frames = updated
		if (!updated.find(f => f.id === selectedFrameId)) {
			selectedFrameId = updated[0]?.id ?? null
		}
	}

	function scrollToLocation(key: string) {
		if (!frameDrawingEl) return
		const portEl = frameDrawingEl.querySelector(`[data-loc="${key}"]`)
		portEl?.scrollIntoView({ behavior: 'smooth', block: 'center' })
	}

	function scrollToLocationInList(key: string) {
		if (!locationListEl) return
		const rowEl = locationListEl.querySelector(`[data-loc-row="${key}"]`)
		rowEl?.scrollIntoView({ behavior: 'smooth', block: 'center' })
	}

	function handleExport() {
		exportToExcel(racks, allZoneConfigs, excelGroupByRoom)
	}

	function updateSettings(data: { customTypes: string[]; rooms: { roomNumber: string; roomName: string }[]; excelGroupByRoom: boolean }) {
		customLocationTypes = data.customTypes
		rooms = data.rooms
		excelGroupByRoom = data.excelGroupByRoom
	}
</script>

<div class="h-screen flex flex-col overflow-hidden">
<Titlebar title="Patch Frames" />

<SettingsDialog
	open={settingsOpen}
	customTypes={customLocationTypes}
	{rooms}
	{excelGroupByRoom}
	onclose={() => settingsOpen = false}
	onupdate={updateSettings}
/>

{#if viewMode === 'sidebar'}
	<PaneGroup direction="horizontal" class="flex-1 min-h-0 bg-white">
		<Pane defaultSize={25} minSize={15} maxSize={50}>
			<div class="h-full flex flex-col overflow-hidden">
				<div class="p-3 space-y-3 overflow-y-auto flex-1" bind:this={locationListEl}>
					{@render configAndLocations()}
				</div>
			</div>
		</Pane>
		<Handle withHandle />
		<Pane defaultSize={75}>
			<div class="h-full overflow-auto p-4 bg-gray-50/50" bind:this={frameDrawingEl}>
				{@render toolbar()}
				{@render frameContent()}
			</div>
		</Pane>
	</PaneGroup>
{:else}
	<PaneGroup direction="vertical" class="flex-1 min-h-0 bg-white">
		<Pane defaultSize={40} minSize={15}>
			<div class="h-full overflow-auto p-3" bind:this={locationListEl}>
				<div class="max-w-6xl mx-auto space-y-3">
					{@render configAndLocations()}
				</div>
			</div>
		</Pane>
		<Handle withHandle />
		<Pane defaultSize={60} minSize={20}>
			<div class="h-full overflow-auto p-4 bg-gray-50/50" bind:this={frameDrawingEl}>
				{@render toolbar()}
				{@render frameContent()}
			</div>
		</Pane>
	</PaneGroup>
{/if}
</div>

{#snippet configAndLocations()}
	<ConfigPanel
		{floor}
		{serverRoomCount}
		{activeZone}
		locations={activeLocations}
		onfloor={setFloor}
		onserverrooms={setServerRooms}
		onzone={setActiveZone}
		ongenerate={generateLocations}
	/>
	<LocationList
		locations={displayedLocations}
		hasTwoRooms={serverRoomCount >= 2}
		customTypes={customLocationTypes}
		{selectedLocation}
		{zoneForLoc}
		onupdate={updateLocation}
		onselect={selectLocation}
	>
		{#if zoneLetters.length > 1}
			<label class="flex items-center gap-1.5 text-[10px] text-gray-500 cursor-pointer select-none">
				<input type="checkbox" bind:checked={showAllZones} class="w-3 h-3 rounded" />
				All zones
			</label>
		{/if}
	</LocationList>
{/snippet}

{#snippet toolbar()}
	<div class="mb-3 flex items-center justify-between text-sm flex-wrap gap-2">
		<div class="flex items-center gap-3">
			{#if allLabels.length > 0}
				<span class="font-mono text-blue-600 font-semibold">
					Floor {String(floor).padStart(2, '0')} &middot; {zoneLetters.length > 1 ? `Zones ${zoneLetters.join(', ')}` : `Zone ${zoneLetters[0] ?? activeZone}`}
				</span>
				<span class="text-gray-400">
					{allLabels.length} ports
				</span>
			{/if}
		</div>

		<div class="flex items-center gap-1">
			{#if allLabels.length > 0}
				<Button onclick={handleExport} icon="download" class="text-[10px] h-6" title="Save as Excel">Excel</Button>
			{/if}
			<Button onclick={() => settingsOpen = true} icon="settings" class="text-[10px] h-6" title="Settings">Settings</Button>
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

	<div class="mb-4">
		<FrameToolbar
			{frames}
			{selectedFrameId}
			{serverRoomCount}
			onupdate={updateFrames}
			onselect={id => selectedFrameId = id}
		/>
	</div>
{/snippet}

{#snippet frameContent()}
	<FrameDrawing {racks} {selectedFrameId} {selectedLocation} onselect={selectLocationFromFrame} />
{/snippet}
