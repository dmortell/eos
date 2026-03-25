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
	import PatchList from './parts/PatchList.svelte'

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
	let saveStatus = $state<'saved' | 'saving' | 'unsaved'>('saved')
	let sidebarTab = $state<'devices' | 'summary'>('devices')

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
			status: 'planned',
		}
		connections = [...connections, conn]
		logChange('add', 'connection', id)
	}

	function updateConnection(id: string, updates: Partial<PatchConnection>) {
		connections = connections.map(c => c.id === id ? { ...c, ...updates } : c)
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
												<div class="flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-blue-50 text-[11px] text-gray-500 cursor-default group">
													<span class="w-5 text-right text-[10px] text-gray-300 font-mono">U{device.positionU}</span>
													<span class="flex-1 truncate">{device.label || device.type}</span>
													{#if device.portCount > 0}
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
								<div class="flex justify-between"><span>Planned</span><span class="font-mono text-amber-600">{connections.filter(c => c.status === 'planned').length}</span></div>
								<div class="flex justify-between"><span>Installed</span><span class="font-mono text-green-600">{connections.filter(c => c.status === 'installed').length}</span></div>
							</div>

							<!-- Cable type breakdown -->
							<div class="bg-gray-50 rounded p-2.5 space-y-1">
								<div class="text-[10px] text-gray-400 uppercase tracking-wider mb-1">By cable type</div>
								{#each CABLE_TYPES as ct (ct.id)}
									{@const count = connections.filter(c => c.cableType === ct.id).length}
									{#if count > 0}
										<div class="flex items-center gap-2">
											<span class="w-2.5 h-2.5 rounded-full shrink-0" style:background={ct.color}></span>
											<span class="flex-1">{ct.label}</span>
											<span class="font-mono font-medium text-gray-700">{count}</span>
										</div>
									{/if}
								{/each}
								{#each customCableTypes as ct (ct.id)}
									{@const count = connections.filter(c => c.cableType === ct.id).length}
									{#if count > 0}
										<div class="flex items-center gap-2">
											<span class="w-2.5 h-2.5 rounded-full shrink-0" style:background={ct.color}></span>
											<span class="flex-1">{ct.label}</span>
											<span class="font-mono font-medium text-gray-700">{count}</span>
										</div>
									{/if}
								{/each}
							</div>
						</div>
					{/if}
				</div>
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

					<!-- Add connection button -->
					<button
						class="h-6 px-2.5 rounded bg-blue-600 text-white text-[11px] font-medium hover:bg-blue-500 transition-colors flex items-center gap-1"
						onclick={addConnection}
					>
						<Icon name="plus" size={12} />
						Add Patch
					</button>
				</div>

				<!-- Patch list table -->
				<div class="flex-1 min-h-0 overflow-auto">
					<PatchList
						{connections}
						{racks}
						{devices}
						{customCableTypes}
						{settings}
						onupdate={updateConnection}
						ondelete={deleteConnection}
						ondeleteselected={deleteSelected}
					/>
				</div>

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
