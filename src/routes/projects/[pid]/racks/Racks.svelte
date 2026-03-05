<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity'
	import { Button, Icon } from '$lib'
	import Titlebar from '$lib/Titlebar.svelte'
	import { PaneGroup, Pane, Handle } from '$lib/components/ui/resizable'
	import type { ChangeDetail } from '$lib/logger'
	import type { RackConfig, DeviceConfig, DeviceTemplate, RackRow, RackSettings, ViewState } from './parts/types'
	import { DEFAULT_SETTINGS, SCALE, RU_HEIGHT_MM, RACK_GAP_PX, RACK_19IN_MM, rackHeightMm } from './parts/constants'
	import ConfigPanel from './parts/ConfigPanel.svelte'
	import RackList from './parts/RackList.svelte'
	import DevicePalette from './parts/DevicePalette.svelte'
	import Canvas from './parts/Canvas.svelte'
	import RackFrame from './parts/RackFrame.svelte'
	import Rect from './parts/Rect.svelte'
	import Draggable from './parts/Draggable.svelte'
	import DeviceView from './parts/DeviceView.svelte'
	import PropertiesPanel from './parts/PropertiesPanel.svelte'

	let { data = null, floor, room, projectId = '', onsave, onfloorchange, onroomchange }: {
		data?: any
		floor: number
		room: string
		projectId?: string
		onsave?: (payload: any, changes: ChangeDetail[]) => void
		onfloorchange?: (floor: number) => void
		onroomchange?: (room: string) => void
	} = $props()

	// ── State ──
	let rows = $state<RackRow[]>(data?.rows ?? [{ id: 'default', label: 'Row A' }])
	let racks = $state<RackConfig[]>((data?.racks ?? []).map((r: any) => ({ ...r, heightMm: rackHeightMm(r.heightU ?? 42) })))
	let devices = $state<DeviceConfig[]>(data?.devices ?? [])
	let library = $state<DeviceTemplate[]>(data?.library ?? [])
	let settings = $state<RackSettings>(data?.settings ?? { ...DEFAULT_SETTINGS })
	let activeRowId = $state<string>(rows[0]?.id ?? 'default')
	let selectedIds = new SvelteSet<string>()
	let saveStatus = $state<'saved' | 'saving' | 'unsaved'>('saved')

	// Window dimensions
	let innerWidth = $state(1200)
	let innerHeight = $state(800)
	let canvasWidth = $derived(innerWidth - 280)
	let canvasHeight = $derived(innerHeight - 62) // titlebar + status

	// Max height for canvas bottom reference
	let maxRackHeight = $derived(
		racks.length ? Math.max(...racks.map(r => r.heightMm)) : 2000
	)

	// View state
	let view = $state<ViewState>({
		x: 60, y: 0, zoom: 0.5, scale: SCALE,
		grid: 100 * SCALE, width: 3000, height: 3000,
		showGrid: true, panning: false, dragging: false,
		button: 0, bottom: Math.max(settings.ceilingLevel + 500, maxRackHeight + 500),
	})

	// Keep bottom in sync
	$effect(() => {
		view.bottom = Math.max(settings.ceilingLevel + 500, maxRackHeight + 500)
	})

	// Racks in active row, with computed positions
	let activeRacks = $derived(
		racks
			.filter(r => !activeRowId || r.rowId === activeRowId)
			.sort((a, b) => a.order - b.order)
			.map((rack, idx, arr) => {
				// Calculate x position: sum of widths + gaps of preceding racks
				let x = 0
				for (let i = 0; i < idx; i++) {
					x += arr[i].widthMm + RACK_GAP_PX / SCALE
				}
				return { ...rack, _x: x, _z: settings.floorLevel }
			})
	)

	// Selected item helpers
	let selectedRack = $derived(
		racks.find(r => selectedIds.has(r.id)) ?? null
	)
	let selectedDevice = $derived(
		devices.find(d => selectedIds.has(d.id)) ?? null
	)

	// ── Auto-save ──
	let saveTimer: ReturnType<typeof setTimeout> | null = null
	let pendingChanges: ChangeDetail[] = []

	function scheduleSave() {
		saveStatus = 'unsaved'
		if (saveTimer) clearTimeout(saveTimer)
		saveTimer = setTimeout(doSave, 500)
	}

	function doSave() {
		saveStatus = 'saving'
		const payload = {
			rows,
			racks: racks.map(({ _x, _z, ...r }: any) => r),
			devices,
			library,
			settings,
		}
		onsave?.(payload, pendingChanges)
		pendingChanges = []
		saveStatus = 'saved'
	}

	function logChange(action: string, field?: string, details?: string) {
		pendingChanges.push({ action, field, details })
		scheduleSave()
	}

	// ── Rack CRUD ──
	function addRack(form?: any) {
		const id = `rack-${Date.now()}`
		const order = racks.filter(r => r.rowId === activeRowId).length
		const label = form?.label || `R${String(order + 1).padStart(2, '0')}`
		const hu = form?.heightU ?? 42
		const newRack: RackConfig = {
			id, label, rowId: activeRowId, order,
			heightU: hu,
			heightMm: rackHeightMm(hu),
			widthMm: form?.widthMm ?? 700,
			depthMm: form?.depthMm ?? 800,
			type: form?.type ?? '4-post',
			serverRoom: form?.serverRoom ?? room,
			maker: form?.maker,
			model: form?.model,
		}
		racks = [...racks, newRack]
		logChange('add', 'rack', label)
	}

	function deleteRack(rackId: string) {
		const rack = racks.find(r => r.id === rackId)
		if (!rack) return
		devices = devices.filter(d => d.rackId !== rackId)
		racks = racks.filter(r => r.id !== rackId)
		selectedIds.delete(rackId)
		logChange('remove', 'rack', rack.label)
	}

	function updateRack(rackId: string, updates: Partial<RackConfig>) {
		if (updates.heightU != null) updates.heightMm = rackHeightMm(updates.heightU)
		racks = racks.map(r => r.id === rackId ? { ...r, ...updates } : r)
		logChange('update', 'rack', rackId)
	}

	function selectRack(rackId: string) {
		selectedIds.clear()
		selectedIds.add(rackId)
	}

	// ── Device CRUD ──
	function addDevice(template: DeviceTemplate) {
		// Find first rack to place into
		const targetRack = activeRacks[0]
		if (!targetRack) return

		// Find first available RU position
		const rackDevices = devices.filter(d => d.rackId === targetRack.id)
		const occupied = new Set<number>()
		for (const d of rackDevices) {
			for (let u = d.positionU; u < d.positionU + d.heightU; u++) occupied.add(u)
		}
		let positionU = 1
		while (occupied.has(positionU)) positionU++

		const id = `dev-${Date.now()}`
		const newDevice: DeviceConfig = {
			id,
			rackId: targetRack.id,
			label: template.label,
			type: template.type,
			heightU: template.heightU,
			positionU,
			portCount: template.portCount,
			portType: template.portType,
			maker: template.maker,
			// Default panel metadata from parent rack
			...(template.type === 'panel' ? {
				patchLevel: 'floor' as const,
				serverRoom: targetRack.serverRoom ?? room,
			} : {}),
		}
		devices = [...devices, newDevice]
		selectedIds.clear()
		selectedIds.add(id)
		logChange('add', 'device', `${template.label} in ${targetRack.label}`)
	}

	function deleteDevice(deviceId: string) {
		const dev = devices.find(d => d.id === deviceId)
		devices = devices.filter(d => d.id !== deviceId)
		selectedIds.delete(deviceId)
		if (dev) logChange('remove', 'device', dev.label)
	}

	function updateDevice(deviceId: string, updates: Partial<DeviceConfig>) {
		devices = devices.map(d => d.id === deviceId ? { ...d, ...updates } : d)
		logChange('update', 'device', deviceId)
	}

	// ── Custom device library ──
	function addCustomTemplate(template: DeviceTemplate) {
		library = [...library, template]
		logChange('add', 'library', template.label)
	}

	// ── Row management ──
	function addRow() {
		const id = `row-${Date.now()}`
		const label = `Row ${String.fromCharCode(65 + rows.length)}`
		rows = [...rows, { id, label }]
		activeRowId = id
		logChange('add', 'row', label)
	}

	// ── Canvas helpers ──
	function screenRect(rack: any) {
		return {
			left: rack._x * SCALE,
			top: (view.bottom - rack._z - rack.heightMm) * SCALE,
			width: rack.widthMm * SCALE,
			height: rack.heightMm * SCALE,
		}
	}

	function deviceScreenRect(device: DeviceConfig) {
		const rack = activeRacks.find(r => r.id === device.rackId)
		if (!rack) return { left: 0, top: 0, width: 0, height: 0 }
		const rackRect = screenRect(rack)
		const innerLeft = rackRect.left + ((rack.widthMm - RACK_19IN_MM) / 2) * SCALE
		const ruBottom = rackRect.top + rackRect.height - device.positionU * RU_HEIGHT_MM * SCALE
		return {
			left: innerLeft,
			top: ruBottom - device.heightU * RU_HEIGHT_MM * SCALE,
			width: RACK_19IN_MM * SCALE,
			height: device.heightU * RU_HEIGHT_MM * SCALE,
		}
	}

	function onDeviceDragged(rect: any, device: DeviceConfig) {
		// Find which rack the device was dropped into
		for (const rack of activeRacks) {
			const rr = screenRect(rack)
			const midX = rect.left + rect.width / 2
			if (midX >= rr.left && midX <= rr.left + rr.width) {
				// Calculate RU position from drop position
				const ruFromBottom = (rr.top + rr.height - rect.top - rect.height) / SCALE / RU_HEIGHT_MM
				const snappedRU = Math.max(1, Math.min(rack.heightU - device.heightU + 1, Math.round(ruFromBottom)))
				updateDevice(device.id, { rackId: rack.id, positionU: snappedRU })
				return
			}
		}
	}

	function onCanvasClick(e: MouseEvent) {
		if (!view.dragging) {
			selectedIds.clear()
		}
	}
</script>

<svelte:window bind:innerHeight bind:innerWidth />

<main class="h-dvh w-full overflow-hidden flex flex-col">
	<Titlebar title="Rack Elevations — F{String(floor).padStart(2, '0')} Room {room}">
		<div class="flex items-center gap-2 text-xs">
			<span class="text-gray-400">
				{#if saveStatus === 'saved'}Saved{:else if saveStatus === 'saving'}Saving...{:else}Unsaved{/if}
			</span>
		</div>
	</Titlebar>

	<PaneGroup direction="horizontal" class="flex-1 min-h-0">
		<!-- Sidebar -->
		<Pane defaultSize={20} minSize={15} maxSize={35}>
			<div class="h-full overflow-y-auto border-r border-gray-200">
				<ConfigPanel {floor} {room} {rows} {activeRowId}
					onfloor={onfloorchange} onroom={onroomchange}
					onrow={id => activeRowId = id} />

				<RackList {racks} {rows} {activeRowId}
					onadd={addRack} onselect={selectRack} ondelete={deleteRack} onaddrow={addRow} />

				<DevicePalette {library} onadd={addDevice} oncustomadd={addCustomTemplate} />
			</div>
		</Pane>

		<Handle withHandle />

		<!-- Canvas -->
		<Pane defaultSize={80}>
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="h-full" onclick={onCanvasClick}>
				<Canvas bind:view width={canvasWidth} height={canvasHeight}>
					<!-- Reference lines -->
					<Rect item={{ x: -300, z: settings.slabLevel - 200, width: 30000, height: 200 }} label="Slab FL+{settings.slabLevel}" {view} />
					<Rect item={{ x: -300, z: settings.floorLevel - 20, width: 30000, height: 20 }} label="Floor FL+{settings.floorLevel}" {view} />
					<Rect item={{ x: -300, z: settings.ceilingLevel, width: 30000, height: 20 }} label="Ceiling FL+{settings.ceilingLevel}" {view} />

					<!-- Rack frames -->
					{#each activeRacks as rack (rack.id)}
						<RackFrame {rack} {view} selected={selectedIds.has(rack.id)} />
					{/each}

					<!-- Devices -->
					{#each devices.filter(d => activeRacks.some(r => r.id === d.rackId)) as device (device.id)}
						<Draggable {view} shape={deviceScreenRect(device)} item={device}
							selected={selectedIds.has(device.id)}
							onClick={e => { selectedIds.clear(); selectedIds.add(device.id) }}
							onDragged={(rect) => onDeviceDragged(rect, device)}>
							<DeviceView {device} {view} ondelete={() => deleteDevice(device.id)} />
						</Draggable>
					{/each}
				</Canvas>
			</div>
		</Pane>
	</PaneGroup>

	<!-- Properties panel -->
	<PropertiesPanel {selectedRack} {selectedDevice}
		onupdaterack={updateRack} onupdatedevice={updateDevice} />

	<!-- Status bar -->
	<div class="h-6 px-3 flex items-center justify-between text-[10px] text-gray-400 border-t border-gray-200 bg-gray-50 shrink-0">
		<span>{activeRacks.length} rack{activeRacks.length !== 1 ? 's' : ''} · {devices.length} device{devices.length !== 1 ? 's' : ''}</span>
		<span>Zoom: {Math.round(view.zoom * 100)}%</span>
	</div>
</main>
