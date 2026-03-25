<script lang="ts">
	import type { ZoneConfig, LocationConfig, FrameConfig, RackData, PortLabel, PortReservation, LocType } from './parts/types'
	import { portPosKey, parsePortPosKey } from './parts/types'
	import type { ChangeDetail } from '$lib/logger'
	import { Button, Icon, Titlebar } from '$lib'
	import { PaneGroup, Pane, Handle } from '$lib/components/ui/resizable'
	import { generatePortLabels, generateRacks } from './parts/engine'
	import { exportToExcel } from './parts/exportExcel'
	import ConfigPanel from './parts/ConfigPanel.svelte'
	import LocationList from './parts/LocationList.svelte'
	import FrameToolbar from './parts/FrameToolbar.svelte'
	import FrameDrawing from './parts/FrameDrawing.svelte'
	import BlockAssignBar from './parts/BlockAssignBar.svelte'
	import SettingsDialog from './parts/SettingsDialog.svelte'
	import LogsDialog from './parts/LogsDialog.svelte'
	import FloorManagerDialog from '$lib/components/FloorManagerDialog.svelte'
	import type { FloorConfig } from '$lib/types/project'
	import { fmtFloor } from '$lib/utils/floor'

	let { data = null, racksData = {}, floor, floors = [], projectId = '', projectName = '', onsave, onfloorchange, onupdatefloors, ondeletefloor }: {
		data?: any
		racksData?: Record<string, any>
		floor: number
		floors?: FloorConfig[]
		projectId?: string
		projectName?: string
		onsave?: (payload: any, changes: ChangeDetail[]) => void
		onfloorchange?: (floor: number) => void
		onupdatefloors?: (floors: FloorConfig[]) => void
		ondeletefloor?: (floor: number) => void
	} = $props()

	/** Derive FrameConfig[] from Racks tool data. Falls back to legacy frames if no racks data. */
	function deriveFramesFromRacks(rData: Record<string, any>, legacyFrames?: FrameConfig[]): FrameConfig[] {
		const derived: FrameConfig[] = []
		for (const [rm, doc] of Object.entries(rData)) {
			if (!doc?.racks) continue
			for (const rack of doc.racks as any[]) {
				if (!rack.serverRoom) continue
				if (rack.type === 'desk' || rack.type === 'shelf' || rack.type === 'vcm') continue
				const rackDevices = ((doc.devices ?? []) as any[]).filter((d: any) => d.rackId === rack.id)
				// All non-copper-panel devices are slots (occupy RU space, no copper ports)
				// This includes enclosures (fiber), switches, servers, managers, etc.
				const slots: import('./parts/types').FrameSlot[] = []
				for (const dev of rackDevices) {
					if (dev.type !== 'panel') {
						slots.push({ ru: dev.positionU, type: dev.type, height: dev.heightU, label: dev.label })
					}
				}
				// Only copper patch panels ('panel') get ports assigned by the engine
				const copperPanels = rackDevices.filter((d: any) => d.type === 'panel')
				const floorPanels = copperPanels.filter((d: any) => d.patchLevel !== 'high')
				const highPanels = copperPanels.filter((d: any) => d.patchLevel === 'high')

				// Build panelDevices with actual RU positions and port counts
				const panelDevices: import('./parts/types').PanelDevice[] = copperPanels.map((d: any) => ({
					ru: d.positionU as number,
					portCount: (d.portCount as number) || 48,
					isHighLevel: d.patchLevel === 'high',
				}))

				derived.push({
					id: rack.id,
					name: rack.label,
					serverRoom: rack.serverRoom,
					totalRU: rack.heightU ?? 42,
					panelStartRU: floorPanels.length ? Math.min(...floorPanels.map((d: any) => d.positionU)) : 1,
					panelEndRU: floorPanels.length ? Math.max(...floorPanels.map((d: any) => d.positionU + d.heightU - 1)) : rack.heightU ?? 42,
					hlPanelStartRU: highPanels.length ? Math.min(...highPanels.map((d: any) => d.positionU)) : undefined,
					hlPanelEndRU: highPanels.length ? Math.max(...highPanels.map((d: any) => d.positionU + d.heightU - 1)) : undefined,
					slots,
					panelDevices,
				})
			}
		}
		// Fall back to legacy frames if no racks data produced any frames
		return derived.length > 0 ? derived : (legacyFrames ?? [])
	}

	// ── State: global settings ──
	let serverRoomCount = $derived(floors.find(f => f.number === floor)?.serverRoomCount ?? data?.serverRoomCount ?? 1)

	// ── State: per-zone locations keyed by zone letter ──
	let zoneLocations = $state<Record<string, LocationConfig[]>>(data?.zoneLocations ?? {})
	let activeZone = $state<string>(Object.keys(data?.zoneLocations ?? {})[0] ?? 'A')

	// ── Frames derived from Racks tool data (read-only) ──
	// Falls back to legacy data.frames if no racks data exists yet
	let frames = $derived<FrameConfig[]>(deriveFramesFromRacks(racksData, data?.frames))
	let rooms = $state<{ roomNumber: string; roomName: string }[]>(data?.rooms ?? [])
	let customLocationTypes = $state<string[]>(data?.customLocationTypes ?? [])
	let excelGroupByRoom = $state<boolean>(data?.excelGroupByRoom ?? true)
	let floorFormat = $state<string>(data?.floorFormat ?? 'L01')
	let selectedLocations = $state<Set<string>>(new Set())
	let lastSelectedKey = $state<string | null>(null)
	let selectedFrameId = $state<string | null>(null)
	// Keep selectedFrameId in sync with available frames
	$effect(() => {
		if (frames.length > 0 && (!selectedFrameId || !frames.find(f => f.id === selectedFrameId))) {
			selectedFrameId = frames[0].id
		}
	})
	// ── Block assign: port-level reservations ──
	let selectedPorts = $state<Set<string>>(new Set())
	let portReservations = $state<PortReservation[]>(data?.portReservations ?? [])
	let reservationMap = $derived<Map<string, LocType>>(
		new Map(
			portReservations.flatMap(r =>
				r.ports.map(p => [portPosKey(p), r.type] as [string, LocType])
			)
		)
	)
	let nextReservationId = $state(1)

	let saveStatus = $state<'saved' | 'saving' | 'unsaved'>('saved')
	let viewMode = $state<'sidebar' | 'stacked'>('sidebar')
	let settingsOpen = $state(false)
	let logsOpen = $state(false)
	let showAllZones = $state(false)
	let floorManagerOpen = $state(false)

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
		zoneLetters.flatMap(z => generatePortLabels({ floor, zone: z, serverRoomCount, locations: zoneLocations[z] }, floorFormat))
	)

	/** Build ZoneConfig array for export */
	let allZoneConfigs = $derived<ZoneConfig[]>(
		zoneLetters.map(z => ({ floor, zone: z, serverRoomCount, locations: zoneLocations[z] }))
	)

	let racks = $derived<RackData[]>(generateRacks(allLabels, serverRoomCount, frames.length > 0 ? frames : undefined, reservationMap.size > 0 ? reservationMap : undefined))

	// ── Debounced auto-save with change tracking ──
	let saveTimer: ReturnType<typeof setTimeout> | null = null
	let initialized = false
	let pendingChanges: ChangeDetail[] = []
	let prevSnapshot: string = ''

	/** Compute human-readable change details by diffing previous vs current state */
	function computeChanges(prev: any, next: any): ChangeDetail[] {
		if (!prev) return []
		const changes: ChangeDetail[] = []

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

		// Frame config changes removed — frames are now derived from Racks tool data

		if (JSON.stringify(prev.rooms) !== JSON.stringify(next.rooms)) {
			changes.push({ action: 'update', field: 'rooms', from: (prev.rooms ?? []).length, to: (next.rooms ?? []).length })
		}
		if (JSON.stringify(prev.customLocationTypes) !== JSON.stringify(next.customLocationTypes)) {
			changes.push({ action: 'update', field: 'customLocationTypes' })
		}
		if (prev.excelGroupByRoom !== next.excelGroupByRoom) {
			changes.push({ action: 'update', field: 'excelGroupByRoom', to: next.excelGroupByRoom })
		}

		if (JSON.stringify(prev.portReservations) !== JSON.stringify(next.portReservations)) {
			const prevCount = (prev.portReservations ?? []).reduce((s: number, r: any) => s + r.ports.length, 0)
			const nextCount = (next.portReservations ?? []).reduce((s: number, r: any) => s + r.ports.length, 0)
			changes.push({ action: 'update', field: 'portReservations', from: prevCount, to: nextCount })
		}

		return changes
	}

	$effect(() => {
		const current = { zoneLocations, rooms, customLocationTypes, excelGroupByRoom, floorFormat, portReservations }
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
				// db.save() already sanitizes undefined values via sanitizeFirestoreData()
				onsave({ floor, zoneLocations, rooms, customLocationTypes, excelGroupByRoom, floorFormat, portReservations }, changesToLog)
				saveStatus = 'saved'
			}
		}, 500)
	})

	// ── Handlers ──
	function setServerRooms(count: number) {
		const updated = floors.map(f => f.number === floor ? { ...f, serverRoomCount: count } : f)
		onupdatefloors?.(updated)
	}

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
		exportToExcel(racks, allZoneConfigs, excelGroupByRoom, floorFormat, reservationMap.size > 0 ? reservationMap : undefined)
	}

	// ── Block assign handlers ──
	function blockSelectPorts(portKeys: string[], event: PointerEvent) {
		if (event.shiftKey) {
			selectedPorts = new Set([...selectedPorts, ...portKeys])
		} else if (event.ctrlKey || event.metaKey) {
			const next = new Set(selectedPorts)
			for (const k of portKeys) next.has(k) ? next.delete(k) : next.add(k)
			selectedPorts = next
		} else {
			selectedPorts = new Set(portKeys)
		}
	}

	function assignReservation(type: LocType) {
		const positions = [...selectedPorts].map(parsePortPosKey)

		// Remove these ports from existing reservations
		let updated = portReservations.map(r => ({
			...r,
			ports: r.ports.filter(p => !selectedPorts.has(portPosKey(p)))
		})).filter(r => r.ports.length > 0)

		// Add new reservation
		updated.push({ id: String(nextReservationId++), type, ports: positions })
		portReservations = updated
		selectedPorts = new Set()
	}

	function removeReservation() {
		portReservations = portReservations.map(r => ({
			...r,
			ports: r.ports.filter(p => !selectedPorts.has(portPosKey(p)))
		})).filter(r => r.ports.length > 0)
		selectedPorts = new Set()
	}

	function clearPortSelection() {
		selectedPorts = new Set()
	}

	function handleBlockKeydown(e: KeyboardEvent) {
		if (selectedPorts.size === 0) return
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
		if (e.key === 'Escape') { clearPortSelection(); e.preventDefault() }
		if (e.key === 'Delete' || e.key === 'Backspace') { removeReservation(); e.preventDefault() }
	}

	function updateSettings(data: { customTypes: string[]; rooms: { roomNumber: string; roomName: string }[]; excelGroupByRoom: boolean; floorFormat: string }) {
		customLocationTypes = data.customTypes
		rooms = data.rooms
		excelGroupByRoom = data.excelGroupByRoom
		floorFormat = data.floorFormat
	}

	/** Local shorthand: format a floor number using this component's floorFormat + floors */
	const fmt = (fl: number) => fmtFloor(fl, floorFormat, floors)
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="h-screen flex flex-col overflow-hidden print:h-auto print:overflow-visible" onkeydown={handleBlockKeydown}>
<div class="print:hidden">
	<Titlebar menu={true} title={projectName ? `${projectName} — Patch Frames` : 'Patch Frames'} />
</div>

<SettingsDialog
	open={settingsOpen}
	customTypes={customLocationTypes}
	{rooms}
	{excelGroupByRoom}
	{floorFormat}
	onclose={() => settingsOpen = false}
	onupdate={updateSettings}
/>
<LogsDialog open={logsOpen} {projectId} {floorFormat} onclose={() => logsOpen = false} />

{#if viewMode === 'sidebar'}
	<PaneGroup direction="horizontal" class="flex-1 min-h-0 bg-white">
		<Pane defaultSize={25} minSize={15} maxSize={50}>
			<div class="h-full flex flex-col overflow-hidden print:hidden">
				<div class="p-3 space-y-3 overflow-y-auto flex-1" bind:this={locationListEl}>
					{@render configAndLocations()}
				</div>
			</div>
		</Pane>
		<Handle withHandle class="print:hidden" />
		<Pane defaultSize={75}>
			<div class="h-full flex flex-col">
				<div class="flex-1 overflow-auto p-4 bg-gray-50/50 print:overflow-visible print:p-0" bind:this={frameDrawingEl}>
					<div class="print:hidden">{@render toolbar()}</div>
					{@render frameContent()}
				</div>
				<div class="print:hidden">{@render statusBar()}</div>
			</div>
		</Pane>
	</PaneGroup>
{:else}
	<PaneGroup direction="vertical" class="flex-1 min-h-0 bg-white">
		<Pane defaultSize={40} minSize={15}>
			<div class="h-full overflow-auto p-3 print:hidden" bind:this={locationListEl}>
				<div class="max-w-6xl mx-auto space-y-3">
					{@render configAndLocations()}
				</div>
			</div>
		</Pane>
		<Handle withHandle class="print:hidden" />
		<Pane defaultSize={60} minSize={20}>
			<div class="h-full flex flex-col">
				<div class="flex-1 overflow-auto p-4 bg-gray-50/50 print:overflow-visible print:p-0" bind:this={frameDrawingEl}>
					<div class="print:hidden">{@render toolbar()}</div>
					{@render frameContent()}
				</div>
				<div class="print:hidden">{@render statusBar()}</div>
			</div>
		</Pane>
	</PaneGroup>
{/if}

<FloorManagerDialog
	open={floorManagerOpen}
	{floors}
	{floorFormat}
	onclose={() => floorManagerOpen = false}
	onupdate={updated => onupdatefloors?.(updated)}
	ondelete={fl => ondeletefloor?.(fl)}
/>
</div>

{#snippet statusBar()}
	<div class="h-7 flex items-stretch border-t border-gray-200 bg-gray-50 shrink-0">
		<div class="flex items-stretch gap-0 overflow-x-auto">
			{#each floors as fl (fl.number)}
				<button
					class="px-3 text-[11px] font-mono font-medium border-r border-gray-200 transition-colors
						{floor === fl.number ? 'bg-white text-blue-600 border-t-2 border-t-blue-500' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600 border-t-2 border-t-transparent'}"
					onclick={() => onfloorchange?.(fl.number)}
				>{fmt(fl.number)}</button>
			{/each}
			<button
				class="px-2 text-gray-300 hover:text-gray-500 transition-colors"
				title="Manage floors"
				onclick={() => floorManagerOpen = true}
			><Icon name="plus" size={12} /></button>
		</div>
		<div class="flex-1"></div>
		<div class="flex items-center gap-3 px-3 text-[10px] text-gray-400">
			<span>{allLabels.length} ports &middot; {racks.length} frame{racks.length !== 1 ? 's' : ''}{#if reservationMap.size > 0} &middot; {reservationMap.size} reserved{/if}</span>
		</div>
	</div>
{/snippet}

{#snippet configAndLocations()}
	<Button href={`/projects/${projectId}`} icon="chevronLeft" class="text-xs">Back</Button>
	<ConfigPanel
		{floor}
		floorLabel={fmt(floor)}
		{serverRoomCount}
		{activeZone}
		locations={activeLocations}
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
			<label class="flex items-center gap-1.5 text-[10px] text-gray-500 cursor-pointer select-none">
				<input type="checkbox" bind:checked={showAllZones} class="w-3 h-3 rounded" />
				All zones
			</label>
	</LocationList>
{/snippet}

{#snippet toolbar()}
	<div class="mb-3 flex items-center justify-between text-sm flex-wrap gap-2">
		<div class="flex items-center gap-3">
			{#if allLabels.length > 0}
				<span class="font-mono text-blue-600 font-semibold">
					{fmt(floor)} &middot; {zoneLetters.length > 1 ? `Zones ${zoneLetters.join(', ')}` : `Zone ${zoneLetters[0] ?? activeZone}`}
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
			onselect={id => selectedFrameId = id}
		/>
	</div>

	<BlockAssignBar
		count={selectedPorts.size}
		customTypes={customLocationTypes}
		onassign={assignReservation}
		onremove={removeReservation}
		onclear={clearPortSelection}
	/>
{/snippet}

{#snippet frameContent()}
	<FrameDrawing
		{racks}
		{selectedFrameId}
		{selectedLocations}
		{selectedPorts}
		{reservationMap}
		onselect={selectLocationFromFrame}
		onblockselect={blockSelectPorts}
	/>
{/snippet}

<style>
	@media print {
		/* Collapse sidebar/top pane and resize handle — paneforge sets inline styles so !important is needed */
		:global([data-pane-group] > [data-pane]:first-child) {
			flex-basis: 0 !important;
			flex-grow: 0 !important;
			overflow: hidden !important;
			max-width: 0 !important;
			max-height: 0 !important;
			padding: 0 !important;
		}
		:global([data-pane-group] > [data-slot="resizable-handle"]) {
			display: none !important;
		}
		/* Let the main pane take full width */
		:global([data-pane-group] > [data-pane]:last-child) {
			flex-basis: 100% !important;
			flex-grow: 1 !important;
			max-width: 100% !important;
		}
		:global([data-pane-group]) {
			overflow: visible !important;
		}
	}
</style>
