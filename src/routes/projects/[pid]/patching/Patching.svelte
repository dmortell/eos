<script lang="ts">
	import { Icon, Titlebar } from '$lib'
	import { PaneGroup, Pane, Handle } from '$lib/components/ui/resizable'
	import type { ChangeDetail } from '$lib/logger'
	import type { FloorConfig } from '$lib/types/project'
	import { fmtFloor } from '$lib/utils/floor'
	import FloorManagerDialog from '$lib/components/FloorManagerDialog.svelte'
	import type { PatchConnection, PatchSettings, CustomCableType } from './parts/types'
	import { DEFAULT_SETTINGS } from './parts/types'
	import { CABLE_TYPES, getCableType } from './parts/constants'
	import { calculateCableLength } from './parts/cableUtils'
	import { exportPatchExcel, importCordIds } from './parts/exportExcel'
	import PatchList from './parts/PatchList.svelte'
	import ElevationView from './parts/ElevationView.svelte'
	import SettingsDialog from './parts/SettingsDialog.svelte'

	let {
		data = null, rackData = null, frameData = null,
		floor, room, floors = [], projectId = '', projectName = '', floorFormat = 'L01',
		onsave, onfloorchange, onroomchange, onupdatefloors, ondeletefloor,
	}: {
		data?: any
		rackData?: any
		frameData?: any
		floor: number
		room: string
		floors?: FloorConfig[]
		projectId?: string
		projectName?: string
		floorFormat?: string
		onsave?: (payload: any, changes: ChangeDetail[]) => void
		onfloorchange?: (floor: number) => void
		onroomchange?: (room: string) => void
		onupdatefloors?: (floors: FloorConfig[]) => void
		ondeletefloor?: (floor: number) => void
	} = $props()

	// ── State ──
	let connections = $state<PatchConnection[]>(data?.connections ?? [])
	let customCableTypes = $state<CustomCableType[]>(data?.customCableTypes ?? [])
	let settings = $state<PatchSettings>({ ...DEFAULT_SETTINGS, ...(data?.settings ?? {}) })
	let floorManagerOpen = $state(false)
	let settingsOpen = $state(false)
	let saveStatus = $state<'saved' | 'saving' | 'unsaved'>('saved')
	let sidebarTab = $state<'devices' | 'summary'>('devices')
	let editNewId = $state<string | null>(null)
	let viewMode = $state<'list' | 'elevation'>('list')

	// ── Bulk-add state ──
	let bulkFrom = $state<{ rackId: string; deviceId: string } | null>(null)
	let bulkTo = $state<{ rackId: string; deviceId: string } | null>(null)
	let bulkFromStart = $state(1)
	let bulkToStart = $state(1)
	let bulkCount = $state(1)
	let bulkCableType = $state(settings.defaultCableType)

	// ── Racks data (read-only, from racks tool) ──
	let racks = $derived(rackData?.racks ?? [])
	let devices = $derived(rackData?.devices ?? [])
	let rows = $derived(rackData?.rows ?? [])

	// ── Frames data (read-only, for port labels) ──
	let frameZones = $derived(frameData?.zoneLocations ?? [])
	let frameConfigs = $derived(frameData?.frames ?? [])

	// ── Floor/room helpers ──
	const fmt = (fl: number) => fmtFloor(fl, floorFormat, floors)
	let roomCount = $derived(floors.find(f => f.number === floor)?.serverRoomCount ?? 1)

	// ── Connection stats ──
	let totalPorts = $derived(
		devices.reduce((sum: number, d: any) => sum + (d.portCount ?? 0), 0)
	)
	let connectedPorts = $derived(connections.length * 2)

	// ── Orphaned reference detection ──
	let rackIds = $derived(new Set(racks.map((r: any) => r.id)))
	let deviceIds = $derived(new Set(devices.map((d: any) => d.id)))

	function isRefOrphaned(ref: PatchConnection['fromPortRef']): boolean {
		if (!ref.rackId && !ref.deviceId) return false  // empty ref, not orphaned
		return !!(ref.rackId && !rackIds.has(ref.rackId)) || !!(ref.deviceId && !deviceIds.has(ref.deviceId))
	}

	let orphanedIds = $derived.by(() => {
		const ids = new Set<string>()
		for (const c of connections) {
			if (isRefOrphaned(c.fromPortRef) || isRefOrphaned(c.toPortRef)) {
				ids.add(c.id)
			}
		}
		return ids
	})

	// ── BOM summary (grouped by cable type then length) ──
	let bomGroups = $derived.by(() => {
		const map = new Map<string, Map<number, number>>()
		for (const c of connections) {
			if (!map.has(c.cableType)) map.set(c.cableType, new Map())
			const lengths = map.get(c.cableType)!
			lengths.set(c.lengthMeters, (lengths.get(c.lengthMeters) ?? 0) + 1)
		}
		const groups: { typeId: string; label: string; color: string; totalQty: number; lengths: { length: number; qty: number }[] }[] = []
		for (const [typeId, lengths] of map) {
			const ct = getCableType(typeId, customCableTypes)
			const entries = [...lengths.entries()]
				.map(([length, qty]) => ({ length, qty }))
				.sort((a, b) => a.length - b.length)
			groups.push({ typeId, label: ct.label, color: ct.color, totalQty: entries.reduce((s, e) => s + e.qty, 0), lengths: entries })
		}
		return groups.sort((a, b) => a.label.localeCompare(b.label))
	})

	// ── Sync from remote ──
	let syncPaused = $state(false)
	let syncTimer: ReturnType<typeof setTimeout> | null = null

	function pauseSync() {
		syncPaused = true
		if (syncTimer) clearTimeout(syncTimer)
		syncTimer = setTimeout(() => { syncPaused = false }, 1500)
	}

	$effect(() => {
		const d = data
		if (syncPaused || saveStatus !== 'saved' || !d) return
		if (d.connections) connections = d.connections
		if (d.customCableTypes) customCableTypes = d.customCableTypes
		if (d.settings) settings = { ...DEFAULT_SETTINGS, ...d.settings }
	})

	// ── Auto-save ──
	let saveTimer: ReturnType<typeof setTimeout> | null = null
	let pendingChanges: ChangeDetail[] = []

	function scheduleSave() {
		saveStatus = 'unsaved'
		syncPaused = true
		if (saveTimer) clearTimeout(saveTimer)
		saveTimer = setTimeout(doSave, 500)
	}

	function doSave() {
		saveStatus = 'saving'
		const payload = { connections, customCableTypes, settings }
		onsave?.(payload, pendingChanges)
		pendingChanges = []
		pauseSync()
		saveStatus = 'saved'
	}

	function logChange(action: string, field?: string, details?: string) {
		pendingChanges.push({ action, field, details })
		scheduleSave()
	}

	// ── Bulk-add helpers ──
	function usedPortsForDevice(deviceId: string): Set<number> {
		const used = new Set<number>()
		for (const c of connections) {
			if (c.fromPortRef.deviceId === deviceId) used.add(c.fromPortRef.portIndex)
			if (c.toPortRef.deviceId === deviceId) used.add(c.toPortRef.portIndex)
		}
		return used
	}

	function firstAvailablePort(deviceId: string): number {
		const dev = devices.find((d: any) => d.id === deviceId)
		if (!dev || !dev.portCount) return 1
		const used = usedPortsForDevice(deviceId)
		for (let i = 1; i <= dev.portCount; i++) {
			if (!used.has(i)) return i
		}
		return 1
	}

	function handleDeviceClick(rackId: string, deviceId: string) {
		const dev = devices.find((d: any) => d.id === deviceId)
		if (!dev?.portCount) return

		if (!bulkFrom) {
			// First click: select source device
			bulkFrom = { rackId, deviceId }
			bulkFromStart = firstAvailablePort(deviceId)
			bulkTo = null
		} else if (bulkFrom.deviceId === deviceId) {
			// Click same device: deselect
			bulkFrom = null
			bulkTo = null
		} else {
			// Second click: select destination, show bulk panel
			bulkTo = { rackId, deviceId }
			bulkToStart = firstAvailablePort(deviceId)
			// Default count = min available ports on both devices
			const fromDev = devices.find((d: any) => d.id === bulkFrom!.deviceId)
			const fromAvail = (fromDev?.portCount ?? 0) - usedPortsForDevice(bulkFrom!.deviceId).size
			const toAvail = (dev.portCount ?? 0) - usedPortsForDevice(deviceId).size
			bulkCount = Math.max(1, Math.min(fromAvail, toAvail))
			bulkCableType = settings.defaultCableType
		}
	}

	function cancelBulk() {
		bulkFrom = null
		bulkTo = null
	}

	function executeBulk() {
		if (!bulkFrom || !bulkTo) return
		const ct = getCableType(bulkCableType, customCableTypes)
		const newConns: PatchConnection[] = []
		for (let i = 0; i < bulkCount; i++) {
			const fromRef = { rackId: bulkFrom.rackId, deviceId: bulkFrom.deviceId, portIndex: bulkFromStart + i, face: 'front' as const }
			const toRef = { rackId: bulkTo.rackId, deviceId: bulkTo.deviceId, portIndex: bulkToStart + i, face: 'front' as const }
			const len = calculateCableLength(fromRef, toRef, racks, devices)
			newConns.push({
				id: `patch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${i}`,
				fromPortRef: fromRef,
				toPortRef: toRef,
				cableType: bulkCableType,
				cableColor: ct.color,
				lengthMeters: len,
				lengthLocked: false,
				kind: 'patch',
				status: 'add',
			})
		}
		connections = [...connections, ...newConns]
		logChange('add', 'connections', `${bulkCount} bulk connections`)
		cancelBulk()
	}

	// ── Connection CRUD ──
	function addConnection() {
		const id = `patch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
		const conn: PatchConnection = {
			id,
			fromPortRef: { rackId: '', deviceId: '', portIndex: 0, face: 'front' },
			toPortRef: { rackId: '', deviceId: '', portIndex: 0, face: 'front' },
			cableType: settings.defaultCableType,
			cableColor: settings.defaultCableColor,
			lengthMeters: 0,
			lengthLocked: false,
			kind: 'patch',
			status: 'add',
		}
		connections = [...connections, conn]
		editNewId = id
		logChange('add', 'connection', id)
	}

	function updateConnection(id: string, updates: Partial<PatchConnection>) {
		connections = connections.map(c => {
			if (c.id !== id) return c
			const updated = { ...c, ...updates }
			// Auto-calc length when ports change and length is not locked
			if (!updated.lengthLocked && (updates.fromPortRef || updates.toPortRef)) {
				const len = calculateCableLength(updated.fromPortRef, updated.toPortRef, racks, devices)
				if (len > 0) updated.lengthMeters = len
			}
			return updated
		})
		logChange('update', 'connection', id)
	}

	function deleteConnection(id: string) {
		connections = connections.filter(c => c.id !== id)
		logChange('remove', 'connection', id)
	}

	function deleteSelected(ids: string[]) {
		connections = connections.filter(c => !ids.includes(c.id))
		logChange('remove', 'connections', `${ids.length} connections`)
	}

	function updateSelected(ids: string[], updates: Partial<PatchConnection>) {
		const idSet = new Set(ids)
		connections = connections.map(c => idSet.has(c.id) ? { ...c, ...updates } : c)
		logChange('update', 'connections', `${ids.length} connections`)
	}

	// ── Cord ID import ──
	let importStatus = $state<string | null>(null)

	async function handleCordIdImport(e: Event) {
		const input = e.target as HTMLInputElement
		const file = input.files?.[0]
		if (!file) return
		try {
			const cordMap = await importCordIds(file)
			if (cordMap.size === 0) {
				importStatus = 'No cord IDs found in file'
				return
			}
			let updated = 0
			connections = connections.map((c, i) => {
				const cordId = cordMap.get(i)
				if (cordId && cordId !== c.cordId) {
					updated++
					return { ...c, cordId }
				}
				return c
			})
			if (updated > 0) {
				logChange('import', 'cordIds', `${updated} cord IDs imported`)
			}
			importStatus = `Imported ${updated} cord ID${updated !== 1 ? 's' : ''}`
		} catch (err) {
			importStatus = `Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`
		}
		input.value = ''
		setTimeout(() => importStatus = null, 4000)
	}
</script>

<svelte:window />

<main class="h-dvh w-full overflow-hidden flex flex-col">
	<Titlebar menu={true} title={projectName ? `${projectName} — Patching` : 'Patching'}></Titlebar>

	<PaneGroup direction="horizontal" class="flex-1 min-h-0">
		<!-- Sidebar: device tree -->
		<Pane defaultSize={22} minSize={15} maxSize={40}>
			<div class="h-full border-r border-gray-200 flex flex-col print:hidden">
				<!-- Sidebar tabs -->
				<div class="flex border-b border-gray-200 shrink-0">
					<button
						class="flex-1 py-1.5 text-[11px] font-medium transition-colors
							{sidebarTab === 'devices' ? 'text-blue-600 border-b-2 border-blue-500 bg-white' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}"
						onclick={() => sidebarTab = 'devices'}
					>Devices</button>
					<button
						class="flex-1 py-1.5 text-[11px] font-medium transition-colors
							{sidebarTab === 'summary' ? 'text-blue-600 border-b-2 border-blue-500 bg-white' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}"
						onclick={() => sidebarTab = 'summary'}
					>Summary</button>
				</div>

				<!-- Sidebar content -->
				<div class="flex-1 min-h-0 overflow-y-auto p-2">
					{#if sidebarTab === 'devices'}
						<!-- Device tree: racks → devices with port counts -->
						{#if racks.length === 0}
							<div class="text-xs text-gray-400 p-4 text-center">
								No racks configured.<br />
								<span class="text-gray-500">Add racks in the Rack Elevations tool first.</span>
							</div>
						{:else}
							{#each racks as rack (rack.id)}
								{@const rackDevices = devices.filter((d: any) => d.rackId === rack.id)}
								{@const rackConns = connections.filter(c =>
									c.fromPortRef.rackId === rack.id || c.toPortRef.rackId === rack.id
								)}
								<div class="mb-2">
									<div class="flex items-center gap-1.5 px-1.5 py-1 rounded bg-gray-50 text-[11px] font-semibold text-gray-600">
										<Icon name="server" size={12} />
										<span class="flex-1 truncate">{rack.label}</span>
										<span class="text-[10px] font-normal text-gray-400">{rack.heightU}U · {rack.type}</span>
									</div>
									{#if rackDevices.length > 0}
										<div class="ml-3 mt-0.5 space-y-px">
											{#each rackDevices.sort((a: any, b: any) => b.positionU - a.positionU) as device (device.id)}
												{@const devConns = connections.filter(c =>
													c.fromPortRef.deviceId === device.id || c.toPortRef.deviceId === device.id
												)}
												{@const isBulkFrom = bulkFrom?.deviceId === device.id}
												{@const isBulkTo = bulkTo?.deviceId === device.id}
												<!-- svelte-ignore a11y_click_events_have_key_events -->
												<!-- svelte-ignore a11y_no_static_element_interactions -->
												<div
													class="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[11px] transition-colors
														{isBulkFrom ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300' : isBulkTo ? 'bg-green-100 text-green-700 ring-1 ring-green-300' : 'text-gray-500 hover:bg-blue-50'}
														{device.portCount > 0 ? 'cursor-pointer' : 'cursor-default'}"
													onclick={() => handleDeviceClick(rack.id, device.id)}
												>
													<span class="w-5 text-right text-[10px] font-mono {isBulkFrom ? 'text-blue-400' : isBulkTo ? 'text-green-400' : 'text-gray-300'}">U{device.positionU}</span>
													<span class="flex-1 truncate">{device.label || device.type}</span>
													{#if isBulkFrom}
														<span class="text-[9px] text-blue-400 font-medium">FROM</span>
													{:else if isBulkTo}
														<span class="text-[9px] text-green-500 font-medium">TO</span>
													{:else if device.portCount > 0}
														<span class="text-[10px] text-gray-300">{devConns.length}/{device.portCount}</span>
													{/if}
												</div>
											{/each}
										</div>
									{:else}
										<div class="ml-3 text-[10px] text-gray-300 py-0.5 px-1.5">Empty</div>
									{/if}
								</div>
							{/each}
						{/if}
					{:else}
						<!-- Summary tab: connection stats -->
						<div class="space-y-3 text-xs text-gray-500">
							<div class="bg-gray-50 rounded p-2.5 space-y-1.5">
								<div class="flex justify-between"><span>Total connections</span><span class="font-mono font-medium text-gray-700">{connections.length}</span></div>
								<div class="flex justify-between"><span>Ports used</span><span class="font-mono font-medium text-gray-700">{connectedPorts} / {totalPorts}</span></div>
								<div class="flex justify-between"><span>Add</span><span class="font-mono text-blue-600">{connections.filter(c => c.status === 'add' || (c.status as string) === 'planned').length}</span></div>
								<div class="flex justify-between"><span>Change</span><span class="font-mono text-amber-600">{connections.filter(c => c.status === 'change').length}</span></div>
								<div class="flex justify-between"><span>Remove</span><span class="font-mono text-red-600">{connections.filter(c => c.status === 'remove').length}</span></div>
								<div class="flex justify-between"><span>Installed</span><span class="font-mono text-green-600">{connections.filter(c => c.status === 'installed').length}</span></div>
							</div>

							<!-- BOM: cable type + length breakdown -->
							<div class="bg-gray-50 rounded p-2.5 space-y-1">
								<div class="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Bill of materials</div>
								{#each bomGroups as group (group.typeId)}
									<div>
										<div class="flex items-center gap-1.5">
											<span class="w-2 h-2 rounded-full shrink-0" style:background={group.color}></span>
											<span class="font-medium text-gray-600">{group.label}</span>
											<span class="font-mono text-gray-400 text-[10px] ml-auto">{group.totalQty}</span>
										</div>
										<div class="ml-3.5 space-y-px">
											{#each group.lengths as entry}
												<div class="flex justify-between text-[10px] text-gray-400">
													<span>{entry.length}m</span>
													<span class="font-mono text-gray-500">×{entry.qty}</span>
												</div>
											{/each}
										</div>
									</div>
								{/each}
								{#if bomGroups.length === 0}
									<div class="text-[10px] text-gray-300">No connections</div>
								{/if}
							</div>
						</div>
					{/if}
				</div>

				<!-- Bulk-add panel -->
				{#if bulkFrom}
					<div class="border-t border-gray-200 bg-blue-50/50 p-2 shrink-0 space-y-2">
						{#if !bulkTo}
							<div class="text-[11px] text-blue-600 font-medium">
								Now click a destination device
							</div>
							<button class="text-[10px] text-gray-400 hover:text-gray-600" onclick={cancelBulk}>Cancel</button>
						{:else}
							{@const fromDev = devices.find((d: any) => d.id === bulkFrom?.deviceId)}
							{@const toDev = devices.find((d: any) => d.id === bulkTo?.deviceId)}
							<div class="text-[11px] font-medium text-gray-700">Bulk Add Patches</div>
							<div class="text-[10px] text-gray-500 space-y-1">
								<div class="flex items-center gap-1">
									<span class="text-blue-600 font-medium">{fromDev?.label || fromDev?.type}</span>
									<Icon name="arrowRight" size={10} class="text-gray-300" />
									<span class="text-green-600 font-medium">{toDev?.label || toDev?.type}</span>
								</div>
							</div>

							<div class="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
								<label class="text-gray-400">From port</label>
								<label class="text-gray-400">To port</label>
								<input type="number" min="1" max={fromDev?.portCount ?? 48}
									class="w-full border border-gray-200 rounded px-1.5 py-0.5 text-[11px] bg-white"
									bind:value={bulkFromStart} />
								<input type="number" min="1" max={toDev?.portCount ?? 48}
									class="w-full border border-gray-200 rounded px-1.5 py-0.5 text-[11px] bg-white"
									bind:value={bulkToStart} />

								<label class="text-gray-400">Count</label>
								<label class="text-gray-400">Cable</label>
								<input type="number" min="1" max={99}
									class="w-full border border-gray-200 rounded px-1.5 py-0.5 text-[11px] bg-white"
									bind:value={bulkCount} />
								<select class="w-full border border-gray-200 rounded px-1 py-0.5 text-[11px] bg-white"
									bind:value={bulkCableType}>
									{#each CABLE_TYPES as ct}
										<option value={ct.id}>{ct.label}</option>
									{/each}
								</select>
							</div>

							<div class="text-[10px] text-gray-400">
								Ports {bulkFromStart}–{bulkFromStart + bulkCount - 1} → {bulkToStart}–{bulkToStart + bulkCount - 1}
							</div>

							<div class="flex gap-1.5">
								<button
									class="flex-1 h-6 rounded bg-blue-600 text-white text-[11px] font-medium hover:bg-blue-500 transition-colors"
									onclick={executeBulk}
								>Create {bulkCount} patches</button>
								<button
									class="h-6 px-2 rounded bg-gray-100 text-gray-500 text-[11px] hover:bg-gray-200 transition-colors"
									onclick={cancelBulk}
								>Cancel</button>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</Pane>

		<Handle withHandle />

		<!-- Main: patch list -->
		<Pane defaultSize={78}>
			<div class="h-full flex flex-col">
				<!-- Floor/Room selector bar -->
				<div class="h-8 px-3 flex items-center gap-3 border-b border-gray-200 bg-white shrink-0 text-xs print:hidden">
					<span class="text-[10px] text-gray-400 uppercase tracking-wider">Floor</span>
					<div class="flex gap-0.5 items-center">
						{#each floors as fl (fl.number)}
							<button
								class="h-6 px-2 rounded text-[11px] font-mono font-medium transition-colors
									{floor === fl.number ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}"
								onclick={() => onfloorchange?.(fl.number)}
							>{fmt(fl.number)}</button>
						{/each}
						<button
							class="h-6 w-6 rounded bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600 flex items-center justify-center transition-colors"
							title="Manage floors"
							onclick={() => floorManagerOpen = true}
						><Icon name="plus" size={12} /></button>
					</div>

					<div class="w-px h-4 bg-gray-200"></div>

					<span class="text-[10px] text-gray-400 uppercase tracking-wider">Room</span>
					<div class="flex gap-0.5">
						{#each ['A', 'B', 'C', 'D'].slice(0, roomCount) as r}
							<button
								class="h-6 w-7 rounded text-[11px] font-semibold transition-colors
									{room === r ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}"
								onclick={() => onroomchange?.(r)}
							>{r}</button>
						{/each}
					</div>

					<div class="flex-1"></div>

					<!-- View toggle -->
					<div class="flex rounded overflow-hidden border border-gray-200">
						<button
							class="h-6 px-2 text-[11px] font-medium flex items-center gap-1 transition-colors
								{viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}"
							onclick={() => viewMode = 'list'}
							title="Table view"
						><Icon name="list" size={12} />Table</button>
						<button
							class="h-6 px-2 text-[11px] font-medium flex items-center gap-1 transition-colors
								{viewMode === 'elevation' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}"
							onclick={() => viewMode = 'elevation'}
							title="Elevation view"
						><Icon name="server" size={12} />Elevation</button>
					</div>

					<!-- Settings -->
					<button
						class="h-6 w-6 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors flex items-center justify-center"
						title="Settings"
						onclick={() => settingsOpen = true}
					><Icon name="settings" size={13} /></button>

					<!-- Import cord IDs -->
					<label
						class="h-6 px-2 rounded bg-gray-100 text-gray-600 text-[11px] font-medium hover:bg-gray-200 transition-colors flex items-center gap-1 cursor-pointer"
						title="Import cord IDs from vendor Excel"
					>
						<Icon name="upload" size={12} />
						Import
						<input type="file" accept=".xlsx" class="hidden" onchange={handleCordIdImport} />
					</label>

					<!-- Export -->
					<button
						class="h-6 px-2 rounded bg-gray-100 text-gray-600 text-[11px] font-medium hover:bg-gray-200 transition-colors flex items-center gap-1"
						title="Export to Excel"
						onclick={() => exportPatchExcel({ connections, racks, devices, customCableTypes, projectName, floor, room })}
					>
						<Icon name="download" size={12} />
						Export
					</button>

					<!-- Add connection button -->
					<button
						class="h-6 px-2.5 rounded bg-blue-600 text-white text-[11px] font-medium hover:bg-blue-500 transition-colors flex items-center gap-1"
						onclick={addConnection}
					>
						<Icon name="plus" size={12} />
						Add Patch
					</button>
				</div>

				<!-- Orphaned references warning -->
				{#if orphanedIds.size > 0}
					<div class="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border-b border-amber-200 shrink-0">
						<Icon name="alertTriangle" size={14} class="text-amber-500 shrink-0" />
						<span class="text-[11px] text-amber-700">
							{orphanedIds.size} connection{orphanedIds.size !== 1 ? 's' : ''} reference devices that no longer exist in the racks tool. These rows are highlighted below.
						</span>
					</div>
				{/if}

				<!-- Import status -->
				{#if importStatus}
					<div class="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border-b border-blue-200 shrink-0">
						<Icon name="info" size={14} class="text-blue-500 shrink-0" />
						<span class="text-[11px] text-blue-700">{importStatus}</span>
					</div>
				{/if}

				<!-- Main content area -->
				{#if viewMode === 'list'}
					<div class="flex-1 min-h-0 overflow-auto">
						<PatchList
							{connections}
							{racks}
							{devices}
							{customCableTypes}
							{settings}
							{editNewId}
							{orphanedIds}
							onupdate={updateConnection}
							ondelete={deleteConnection}
							ondeleteselected={deleteSelected}
							onupdateselected={updateSelected}
							oneditnewclear={() => editNewId = null}
						/>
					</div>
				{:else}
					<div class="flex-1 min-h-0">
						<ElevationView
							{connections}
							{racks}
							{devices}
							{customCableTypes}
							{frameData}
							{settings}
							{floor}
							{room}
							serverRoomCount={roomCount}
							{floorFormat}
							onaddconnection={conn => {
								connections = [...connections, conn]
								logChange('add', 'connection', conn.id)
							}}
							onupdateconnection={(id, updates) => updateConnection(id, updates)}
							ondeleteconnection={deleteConnection}
						/>
					</div>
				{/if}

				<!-- Status bar -->
				<div class="h-7 flex items-stretch border-t border-gray-200 bg-gray-50 shrink-0 print:hidden">
					<div class="flex items-center gap-4 px-3 text-[10px] text-gray-400 w-full">
						<span>{connections.length} connection{connections.length !== 1 ? 's' : ''}</span>
						<span>{racks.length} rack{racks.length !== 1 ? 's' : ''} · {devices.length} device{devices.length !== 1 ? 's' : ''}</span>
						<div class="flex-1"></div>
						<span class:text-amber-500={saveStatus === 'unsaved'} class:text-blue-500={saveStatus === 'saving'}>
							{saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Saving...' : 'Unsaved'}
						</span>
					</div>
				</div>
			</div>
		</Pane>
	</PaneGroup>
</main>

<FloorManagerDialog
	open={floorManagerOpen}
	{floors}
	{floorFormat}
	onclose={() => floorManagerOpen = false}
	onupdate={updated => onupdatefloors?.(updated)}
	ondelete={fl => ondeletefloor?.(fl)}
/>

<SettingsDialog
	open={settingsOpen}
	{settings}
	{customCableTypes}
	onclose={() => settingsOpen = false}
	onsavesettings={s => { settings = s; logChange('update', 'settings') }}
	onsavecabletypes={types => { customCableTypes = types; logChange('update', 'customCableTypes') }}
/>
