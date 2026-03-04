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
	import LogsDialog from './parts/LogsDialog.svelte'
	import Titlebar from '$lib/Titlebar.svelte'
	import { PaneGroup, Pane, Handle } from '$lib/components/ui/resizable'

	import type { ChangeDetail } from '$lib/logger'

	let { data = null, floor, projectId = '', onsave, onfloorchange }: {
		data?: any
		floor: number
		projectId?: string
		onsave?: (payload: any, changes: ChangeDetail[]) => void
		onfloorchange?: (floor: number) => void
	} = $props()

	// ── Migrate from old single-zone format ──
	function migrateData(d: any): { serverRoomCount: number; zoneLocations: Record<string, LocationConfig[]> } {
		if (d?.zoneLocations) {
			return { serverRoomCount: d.serverRoomCount ?? 1, zoneLocations: d.zoneLocations }
		}
		// Old format: single zone object or zones array
		const zone = d?.zones?.[0] ?? d?.zone
		if (zone) {
			return {
				serverRoomCount: zone.serverRoomCount ?? 1,
				zoneLocations: { [zone.zone ?? 'A']: zone.locations ?? [] }
			}
		}
		return { serverRoomCount: 1, zoneLocations: {} }
	}

	const migrated = migrateData(data)

	// ── State: global settings ──
	let serverRoomCount = $state(migrated.serverRoomCount)

	// ── State: per-zone locations keyed by zone letter ──
	let zoneLocations = $state<Record<string, LocationConfig[]>>(migrated.zoneLocations)
	let activeZone = $state<string>(Object.keys(migrated.zoneLocations)[0] ?? 'A')

	// ── State: frames & settings (shared across all zones) ──
	let frames = $state<FrameConfig[]>(data?.frames ?? [])
	let rooms = $state<{ roomNumber: string; roomName: string }[]>(data?.rooms ?? [])
	let customLocationTypes = $state<string[]>(data?.customLocationTypes ?? [])
	let excelGroupByRoom = $state<boolean>(data?.excelGroupByRoom ?? true)
	let selectedLocations = $state<Set<string>>(new Set())
	let lastSelectedKey = $state<string | null>(null)
	let selectedFrameId = $state<string | null>(frames[0]?.id ?? null)
	let saveStatus = $state<'saved' | 'saving' | 'unsaved'>('saved')
	let viewMode = $state<'sidebar' | 'stacked'>('sidebar')
	let settingsOpen = $state(false)
	let logsOpen = $state(false)
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

	// ── Debounced auto-save with change tracking ──
	let saveTimer: ReturnType<typeof setTimeout> | null = null
	let initialized = false
	let pendingChanges: ChangeDetail[] = []
	let prevSnapshot: string = ''

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

	/** Compute human-readable change details by diffing previous vs current state */
	function computeChanges(prev: any, next: any): ChangeDetail[] {
		if (!prev) return []
		const changes: ChangeDetail[] = []

		if (prev.serverRoomCount !== next.serverRoomCount) {
			changes.push({ action: 'update', field: 'serverRoomCount', from: prev.serverRoomCount, to: next.serverRoomCount })
		}

		// Zone location changes
		const allZones = new Set([...Object.keys(prev.zoneLocations ?? {}), ...Object.keys(next.zoneLocations ?? {})])
		for (const z of allZones) {
			const prevLocs: LocationConfig[] = prev.zoneLocations?.[z] ?? []
			const nextLocs: LocationConfig[] = next.zoneLocations?.[z] ?? []

			if (prevLocs.length !== nextLocs.length) {
				changes.push({ action: prevLocs.length < nextLocs.length ? 'add' : 'remove', field: 'locations', zone: z, from: prevLocs.length, to: nextLocs.length })
			}

			const minLen = Math.min(prevLocs.length, nextLocs.length)
			for (let i = 0; i < minLen; i++) {
				const p = prevLocs[i], n = nextLocs[i]
				if (JSON.stringify(p) === JSON.stringify(n)) continue

				const locDetail: string[] = []
				if (p.portCount !== n.portCount) locDetail.push(`ports: ${p.portCount}→${n.portCount}`)
				if (p.locationType !== n.locationType) locDetail.push(`type: ${p.locationType}→${n.locationType}`)
				if (p.isHighLevel !== n.isHighLevel) locDetail.push(`HL: ${!!p.isHighLevel}→${!!n.isHighLevel}`)
				if (p.roomNumber !== n.roomNumber) locDetail.push(`room: ${p.roomNumber ?? ''}→${n.roomNumber ?? ''}`)
				if (JSON.stringify(p.serverRoomAssignment) !== JSON.stringify(n.serverRoomAssignment)) locDetail.push('roomAssignment changed')

				if (locDetail.length > 0) {
					changes.push({ action: 'update', field: 'location', zone: z, details: `${z}.${String(n.locationNumber).padStart(3, '0')}: ${locDetail.join(', ')}` })
				}
			}
		}

		// Frame config changes
		if (JSON.stringify(prev.frames) !== JSON.stringify(next.frames)) {
			const prevFrames: FrameConfig[] = prev.frames ?? []
			const nextFrames: FrameConfig[] = next.frames ?? []

			if (prevFrames.length < nextFrames.length) {
				const added = nextFrames.filter(f => !prevFrames.find(p => p.id === f.id))
				for (const f of added) changes.push({ action: 'add', field: 'frame', details: f.name })
			} else if (prevFrames.length > nextFrames.length) {
				const removed = prevFrames.filter(f => !nextFrames.find(n => n.id === f.id))
				for (const f of removed) changes.push({ action: 'remove', field: 'frame', details: f.name })
			}

			for (const nf of nextFrames) {
				const pf = prevFrames.find(f => f.id === nf.id)
				if (pf && JSON.stringify(pf) !== JSON.stringify(nf)) {
					const details: string[] = []
					if (pf.name !== nf.name) details.push(`name: ${pf.name}→${nf.name}`)
					if (pf.totalRU !== nf.totalRU) details.push(`totalRU: ${pf.totalRU}→${nf.totalRU}`)
					if (pf.panelStartRU !== nf.panelStartRU || pf.panelEndRU !== nf.panelEndRU) details.push(`panelRange: ${pf.panelStartRU}-${pf.panelEndRU}→${nf.panelStartRU}-${nf.panelEndRU}`)
					if (pf.hlPanelStartRU !== nf.hlPanelStartRU || pf.hlPanelEndRU !== nf.hlPanelEndRU) details.push(`hlRange changed`)
					if (JSON.stringify(pf.slots) !== JSON.stringify(nf.slots)) details.push(`slots: ${pf.slots.length}→${nf.slots.length}`)
					if (details.length) changes.push({ action: 'update', field: 'frame', details: `${nf.name}: ${details.join(', ')}` })
				}
			}
		}

		if (JSON.stringify(prev.rooms) !== JSON.stringify(next.rooms)) {
			changes.push({ action: 'update', field: 'rooms', from: (prev.rooms ?? []).length, to: (next.rooms ?? []).length })
		}
		if (JSON.stringify(prev.customLocationTypes) !== JSON.stringify(next.customLocationTypes)) {
			changes.push({ action: 'update', field: 'customLocationTypes' })
		}
		if (prev.excelGroupByRoom !== next.excelGroupByRoom) {
			changes.push({ action: 'update', field: 'excelGroupByRoom', to: next.excelGroupByRoom })
		}

		return changes
	}

	$effect(() => {
		const current = { serverRoomCount, zoneLocations, frames, rooms, customLocationTypes, excelGroupByRoom }
		const snapshot = JSON.stringify(current)

		if (!initialized) {
			initialized = true
			prevSnapshot = snapshot
			return
		}

		// Compute changes from previous state
		if (prevSnapshot) {
			const prev = JSON.parse(prevSnapshot)
			const changes = computeChanges(prev, current)
			if (changes.length) pendingChanges.push(...changes)
		}
		prevSnapshot = snapshot

		saveStatus = 'unsaved'
		if (saveTimer) clearTimeout(saveTimer)
		saveTimer = setTimeout(() => {
			if (onsave) {
				saveStatus = 'saving'
				const changesToLog = [...pendingChanges]
				pendingChanges = []
				onsave(stripUndefined({ floor, serverRoomCount, zoneLocations, frames, rooms, customLocationTypes, excelGroupByRoom }), changesToLog)
				saveStatus = 'saved'
			}
		}, 500)
	})

	// ── Handlers ──
	function setFloor(val: number) { onfloorchange?.(val) }
	function setServerRooms(count: number) { serverRoomCount = count }

	function setActiveZone(zone: string) {
		activeZone = zone
		selectedLocations = new Set()
		lastSelectedKey = null
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
		const srcList = showAllZones ? allLocationsFlat.locations : activeLocations
		const original = srcList[index]
		if (!original) return

		// Determine what fields changed
		const changedFields: Partial<LocationConfig> = {}
		if (loc.portCount !== original.portCount) changedFields.portCount = loc.portCount
		if (loc.locationType !== original.locationType) changedFields.locationType = loc.locationType
		if (loc.isHighLevel !== original.isHighLevel) changedFields.isHighLevel = loc.isHighLevel
		if (loc.roomNumber !== original.roomNumber) changedFields.roomNumber = loc.roomNumber
		if (JSON.stringify(loc.serverRoomAssignment) !== JSON.stringify(original.serverRoomAssignment)) {
			changedFields.serverRoomAssignment = loc.serverRoomAssignment
		}

		// If multiple selected and this loc is in the selection, apply changes to all selected
		const editedKey = showAllZones
			? `${allLocationsFlat.index[index].zone}-${original.locationNumber}`
			: `${activeZone}-${original.locationNumber}`
		const applyToAll = selectedLocations.size > 1 && selectedLocations.has(editedKey) && Object.keys(changedFields).length > 0

		if (applyToAll) {
			let updated = { ...zoneLocations }
			const locs = showAllZones ? allLocationsFlat.locations : activeLocations
			for (let i = 0; i < locs.length; i++) {
				const z = showAllZones ? allLocationsFlat.index[i].zone : activeZone
				const key = `${z}-${locs[i].locationNumber}`
				if (!selectedLocations.has(key)) continue

				const updatedLoc = { ...locs[i], ...changedFields }
				// Sync serverRoomAssignment length with portCount
				if ('portCount' in changedFields) {
					updatedLoc.serverRoomAssignment = Array.from({ length: changedFields.portCount! }, (_, j) =>
						locs[i].serverRoomAssignment[j] || 'A'
					)
				}
				if (showAllZones) {
					const { zone, indexInZone } = allLocationsFlat.index[i]
					const zoneLocs = [...(updated[zone] ?? [])]
					zoneLocs[indexInZone] = updatedLoc
					updated = { ...updated, [zone]: zoneLocs }
				} else {
					const zoneLocs = [...(updated[activeZone] ?? [])]
					zoneLocs[i] = updatedLoc
					updated = { ...updated, [activeZone]: zoneLocs }
				}
			}
			zoneLocations = updated
		} else {
			// Single update
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
	}

	/** All displayed location keys in order (for shift-range selection) */
	let displayedKeys = $derived<string[]>(
		displayedLocations.map((loc, i) => {
			const z = showAllZones ? allLocationsFlat.index[i]?.zone ?? activeZone : activeZone
			return `${z}-${loc.locationNumber}`
		})
	)

	function selectLocation(key: string, e: MouseEvent | KeyboardEvent) {
		if (e.shiftKey && lastSelectedKey) {
			// Range select from lastSelectedKey to key
			const startIdx = displayedKeys.indexOf(lastSelectedKey)
			const endIdx = displayedKeys.indexOf(key)
			if (startIdx >= 0 && endIdx >= 0) {
				const from = Math.min(startIdx, endIdx)
				const to = Math.max(startIdx, endIdx)
				const rangeKeys = displayedKeys.slice(from, to + 1)
				selectedLocations = new Set([...selectedLocations, ...rangeKeys])
			}
		} else if (e.ctrlKey || e.metaKey) {
			// Toggle individual
			const next = new Set(selectedLocations)
			if (next.has(key)) next.delete(key)
			else next.add(key)
			selectedLocations = next
			lastSelectedKey = key
		} else {
			// Plain click: toggle single
			if (selectedLocations.size === 1 && selectedLocations.has(key)) {
				selectedLocations = new Set()
				lastSelectedKey = null
			} else {
				selectedLocations = new Set([key])
				lastSelectedKey = key
			}
			scrollToLocation(key)
		}
	}

	function selectLocationFromFrame(key: string) {
		if (selectedLocations.size === 1 && selectedLocations.has(key)) {
			selectedLocations = new Set()
			lastSelectedKey = null
		} else {
			selectedLocations = new Set([key])
			lastSelectedKey = key
			scrollToLocationInList(key)
		}
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
<LogsDialog open={logsOpen} {projectId} onclose={() => logsOpen = false} />

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
		{selectedLocations}
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
			<Button onclick={() => logsOpen = true} icon="scrollText" class="text-[10px] h-6" title="Change log">Logs</Button>
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
	<FrameDrawing {racks} {selectedFrameId} {selectedLocations} onselect={selectLocationFromFrame} />
{/snippet}
