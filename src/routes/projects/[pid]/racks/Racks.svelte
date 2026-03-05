<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity'
	import { Button, Icon } from '$lib'
	import Titlebar from '$lib/Titlebar.svelte'
	import { PaneGroup, Pane, Handle } from '$lib/components/ui/resizable'
	import type { ChangeDetail } from '$lib/logger'
	import type { RackConfig, DeviceConfig, DeviceTemplate, RackRow, RackSettings, ViewState } from './parts/types'
	import { DEFAULT_SETTINGS, SCALE, RU_HEIGHT_MM, RACK_GAP_PX, RACK_19IN_MM, rackHeightMm } from './parts/constants'
	import RackList from './parts/RackList.svelte'
	import DevicePalette from './parts/DevicePalette.svelte'
	import Canvas from './parts/Canvas.svelte'
	import RackFrame from './parts/RackFrame.svelte'
	import Rect from './parts/Rect.svelte'
	import Draggable from './parts/Draggable.svelte'
	import DeviceView from './parts/DeviceView.svelte'
	import PropertiesPanel from './parts/PropertiesPanel.svelte'

	import FloorManagerDialog, { type FloorConfig } from '$lib/components/FloorManagerDialog.svelte'

	let { data = null, library = [], floor, room, floors = [], projectId = '', floorFormat = 'L01', onsave, onlibrarychange, onfloorchange, onroomchange, onupdatefloors, ondeletefloor }: {
		data?: any
		library?: DeviceTemplate[]
		floor: number
		room: string
		floors?: FloorConfig[]
		projectId?: string
		floorFormat?: string
		onsave?: (payload: any, changes: ChangeDetail[]) => void
		onlibrarychange?: (templates: DeviceTemplate[]) => void
		onfloorchange?: (floor: number) => void
		onroomchange?: (room: string) => void
		onupdatefloors?: (floors: FloorConfig[]) => void
		ondeletefloor?: (floor: number) => void
	} = $props()

	// ── State ──
	let rows = $state<RackRow[]>(data?.rows ?? [{ id: 'default', label: 'Row A' }])
	let racks = $state<RackConfig[]>((data?.racks ?? []).map((r: any) => ({ ...r, heightMm: rackHeightMm(r.heightU ?? 42) })))
	let devices = $state<DeviceConfig[]>(data?.devices ?? [])
	let settings = $state<RackSettings>(data?.settings ?? { ...DEFAULT_SETTINGS })
	let activeRowId = $state<string>(rows[0]?.id ?? 'default')
	let selectedIds = new SvelteSet<string>()
	let floorManagerOpen = $state(false)
	let saveStatus = $state<'saved' | 'saving' | 'unsaved'>('saved')

	// Window dimensions
	let innerWidth = $state(1200)
	let innerHeight = $state(800)
	let canvasWidth = $derived(innerWidth - 280)
	let canvasHeight = $derived(innerHeight - 95) // titlebar(30) + toolbar(32) + status(28) + borders(5)

	// Max height for canvas bottom reference
	let maxRackHeight = $derived(
		racks.length ? Math.max(...racks.map(r => r.heightMm)) : 2000
	)

	// View state — restore pan/zoom from localStorage
	const viewKey = `racks-view-${projectId}-F${floor}-R${room}`
	function loadView(): { x: number; y: number; zoom: number } {
		try {
			const saved = localStorage.getItem(viewKey)
			if (saved) return JSON.parse(saved)
		} catch {}
		return { x: 60, y: 0, zoom: 0.3 }
	}
	const savedView = loadView()

	let view = $state<ViewState>({
		x: savedView.x, y: savedView.y, zoom: savedView.zoom, scale: SCALE,
		grid: 100 * SCALE, width: 3000, height: 3000,
		showGrid: true, panning: false, dragging: false,
		button: 0, bottom: Math.max(settings.ceilingLevel + 500, maxRackHeight + 500),
	})

	// Keep bottom in sync
	$effect(() => {
		view.bottom = Math.max(settings.ceilingLevel + 500, maxRackHeight + 500)
	})

	// Persist pan/zoom to localStorage (debounced)
	let viewSaveTimer: ReturnType<typeof setTimeout> | null = null
	$effect(() => {
		const { x, y, zoom } = view
		if (viewSaveTimer) clearTimeout(viewSaveTimer)
		viewSaveTimer = setTimeout(() => {
			try { localStorage.setItem(viewKey, JSON.stringify({ x, y, zoom })) } catch {}
		}, 300)
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

	/** Per-rack set of RU positions occupied by more than one device */
	let rackOverlaps = $derived.by(() => {
		const map = new Map<string, Set<number>>()
		// Count how many devices occupy each RU in each rack
		const ruCounts = new Map<string, Map<number, number>>()
		for (const d of devices) {
			if (!ruCounts.has(d.rackId)) ruCounts.set(d.rackId, new Map())
			const counts = ruCounts.get(d.rackId)!
			for (let u = d.positionU; u < d.positionU + d.heightU; u++) {
				counts.set(u, (counts.get(u) ?? 0) + 1)
			}
		}
		for (const [rackId, counts] of ruCounts) {
			const overlapping = new Set<number>()
			for (const [u, count] of counts) {
				if (count > 1) overlapping.add(u)
			}
			if (overlapping.size > 0) map.set(rackId, overlapping)
		}
		return map
	})

	// ── Sync from remote (realtime Firestore updates) ──
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
		if (d.rows) rows = d.rows
		if (d.racks) racks = d.racks.map((r: any) => ({ ...r, heightMm: rackHeightMm(r.heightU ?? 42) }))
		if (d.devices) devices = d.devices
		if (d.settings) settings = { ...DEFAULT_SETTINGS, ...d.settings }
	})

	// ── Auto-save ──
	let saveTimer: ReturnType<typeof setTimeout> | null = null
	let pendingChanges: ChangeDetail[] = []

	function scheduleSave() {
		saveStatus = 'unsaved'
		syncPaused = true // pause remote sync while editing
		if (saveTimer) clearTimeout(saveTimer)
		saveTimer = setTimeout(doSave, 500)
	}

	/** Format floor number using floorFormat setting */
	function fmtFloor(fl: number): string {
		const n = String(fl).padStart(2, '0')
		if (floorFormat === '01F') return `${n}F`
		if (floorFormat === '01') return n
		return `L${n}`
	}

	/** Strip undefined values recursively (Firestore rejects them) */
	function strip(obj: any): any {
		if (Array.isArray(obj)) return obj.map(strip)
		if (obj && typeof obj === 'object') {
			const out: any = {}
			for (const [k, v] of Object.entries(obj)) {
				if (v !== undefined) out[k] = strip(v)
			}
			return out
		}
		return obj
	}

	function doSave() {
		saveStatus = 'saving'
		const payload = strip({
			rows,
			racks: racks.map(({ _x, _z, ...r }: any) => r),
			devices,
			settings,
		})
		onsave?.(payload, pendingChanges)
		pendingChanges = []
		pauseSync()
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

	/** Place a device into a rack at first free RU slot from bottom */
	function placeDevice(template: DeviceTemplate, targetRack: typeof activeRacks[number], positionU?: number) {
		// Find first available RU position if not specified
		if (positionU == null) {
			const rackDevices = devices.filter(d => d.rackId === targetRack.id)
			const occupied = new Set<number>()
			for (const d of rackDevices) {
				for (let u = d.positionU; u < d.positionU + d.heightU; u++) occupied.add(u)
			}
			positionU = 1
			while (occupied.has(positionU)) positionU++
		}

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

	/** Click-to-add: place in selected rack or first rack */
	function addDevice(template: DeviceTemplate) {
		const targetRack = activeRacks.find(r => selectedIds.has(r.id)) ?? activeRacks[0]
		if (!targetRack) return
		placeDevice(template, targetRack)
	}

	// ── Palette drag-to-canvas ──
	let canvasEl: HTMLDivElement | undefined = $state()
	let draggingTemplate = $state<DeviceTemplate | null>(null)
	let ghostPos = $state({ x: 0, y: 0 })
	let dropGhost = $state<{ left: number; top: number; width: number; height: number } | null>(null)
	let paletteDragMoved = false

	/** Convert screen mouse position to canvas-local coords, then find rack + RU */
	function hitTestRack(clientX: number, clientY: number, heightU: number) {
		if (!canvasEl) return null
		const rect = canvasEl.getBoundingClientRect()
		const cx = (clientX - rect.left - view.x) / view.zoom
		const cy = (clientY - rect.top - view.y) / view.zoom
		for (const rack of activeRacks) {
			const rr = screenRect(rack)
			if (cx >= rr.left && cx <= rr.left + rr.width && cy >= rr.top && cy <= rr.top + rr.height) {
				const ruFromBottom = (rr.top + rr.height - cy) / SCALE / RU_HEIGHT_MM
				const snappedRU = Math.max(1, Math.min(rack.heightU - heightU + 1, Math.round(ruFromBottom)))
				// Compute ghost rect in canvas coords
				const innerLeft = rr.left + ((rack.widthMm - RACK_19IN_MM) / 2) * SCALE
				const ruBottom = rr.top + rr.height - snappedRU * RU_HEIGHT_MM * SCALE
				return {
					rack, snappedRU,
					ghost: {
						left: innerLeft,
						top: ruBottom - heightU * RU_HEIGHT_MM * SCALE,
						width: RACK_19IN_MM * SCALE,
						height: heightU * RU_HEIGHT_MM * SCALE,
					}
				}
			}
		}
		return null
	}

	function onPaletteDragStart(e: MouseEvent, template: DeviceTemplate) {
		if (e.button !== 0) return
		e.preventDefault()
		draggingTemplate = template
		ghostPos = { x: e.clientX, y: e.clientY }
		paletteDragMoved = false
		document.addEventListener('mousemove', onPaletteDragMove)
		document.addEventListener('mouseup', onPaletteDragEnd)
	}

	function onPaletteDragMove(e: MouseEvent) {
		paletteDragMoved = true
		ghostPos = { x: e.clientX, y: e.clientY }
		// Update drop ghost
		if (draggingTemplate) {
			const hit = hitTestRack(e.clientX, e.clientY, draggingTemplate.heightU)
			dropGhost = hit?.ghost ?? null
		}
	}

	function onPaletteDragEnd(e: MouseEvent) {
		document.removeEventListener('mousemove', onPaletteDragMove)
		document.removeEventListener('mouseup', onPaletteDragEnd)
		dropGhost = null

		if (!paletteDragMoved || !draggingTemplate || !canvasEl) { draggingTemplate = null; return }

		const hit = hitTestRack(e.clientX, e.clientY, draggingTemplate.heightU)
		if (hit) {
			placeDevice(draggingTemplate, hit.rack, hit.snappedRU)
		}
		draggingTemplate = null
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

	// ── Custom device library (project-level) ──
	function addCustomTemplate(template: DeviceTemplate) {
		const updated = [...library, template]
		onlibrarychange?.(updated)
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

	let confirmingDeleteRow = $state<string | null>(null)

	function deleteRow(rowId: string) {
		const row = rows.find(r => r.id === rowId)
		if (!row) return
		const rackIds = new Set(racks.filter(r => r.rowId === rowId).map(r => r.id))
		devices = devices.filter(d => !rackIds.has(d.rackId))
		racks = racks.filter(r => r.rowId !== rowId)
		rows = rows.filter(r => r.id !== rowId)
		if (activeRowId === rowId) activeRowId = rows[0]?.id ?? ''
		confirmingDeleteRow = null
		logChange('remove', 'row', row.label)
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

	function onDeviceDrag(rect: any, _mouse: any, item: any) {
		// Show ghost at snap position while dragging existing device
		const midX = rect.left + rect.width / 2
		for (const rack of activeRacks) {
			const rr = screenRect(rack)
			if (midX >= rr.left && midX <= rr.left + rr.width) {
				const ruFromBottom = (rr.top + rr.height - rect.top - rect.height) / SCALE / RU_HEIGHT_MM
				const snappedRU = Math.max(1, Math.min(rack.heightU - item.heightU + 1, Math.round(ruFromBottom)))
				const innerLeft = rr.left + ((rack.widthMm - RACK_19IN_MM) / 2) * SCALE
				const ruBottom = rr.top + rr.height - snappedRU * RU_HEIGHT_MM * SCALE
				dropGhost = {
					left: innerLeft,
					top: ruBottom - item.heightU * RU_HEIGHT_MM * SCALE,
					width: RACK_19IN_MM * SCALE,
					height: item.heightU * RU_HEIGHT_MM * SCALE,
				}
				return
			}
		}
		dropGhost = null
	}

	function onDeviceDragged(rect: any, device: DeviceConfig, copy?: boolean) {
		dropGhost = null
		for (const rack of activeRacks) {
			const rr = screenRect(rack)
			const midX = rect.left + rect.width / 2
			if (midX >= rr.left && midX <= rr.left + rr.width) {
				const ruFromBottom = (rr.top + rr.height - rect.top - rect.height) / SCALE / RU_HEIGHT_MM
				const snappedRU = Math.max(1, Math.min(rack.heightU - device.heightU + 1, Math.round(ruFromBottom)))
				if (copy) {
					// Ctrl+drag: duplicate the device at the new position
					const id = `dev-${Date.now()}`
					const { id: _, ...rest } = device
					devices = [...devices, { ...rest, id, rackId: rack.id, positionU: snappedRU }]
					selectedIds.clear()
					selectedIds.add(id)
					logChange('copy', 'device', `${device.label} to ${rack.label} RU${snappedRU}`)
				} else {
					updateDevice(device.id, { rackId: rack.id, positionU: snappedRU })
				}
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

<!-- Row delete confirmation -->
{#if confirmingDeleteRow}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onclick={() => confirmingDeleteRow = null}>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="bg-white rounded-lg shadow-xl border border-gray-200 p-4 w-72" onclick={e => e.stopPropagation()}>
			<p class="text-sm text-gray-700 mb-3">Delete <strong>{rows.find(r => r.id === confirmingDeleteRow)?.label}</strong>? All racks and devices in this row will be removed.</p>
			<div class="flex gap-2 justify-end">
				<button class="px-3 py-1.5 text-xs rounded border border-gray-200 hover:bg-gray-50" onclick={() => confirmingDeleteRow = null}>Cancel</button>
				<button class="px-3 py-1.5 text-xs rounded bg-red-600 text-white hover:bg-red-500" onclick={() => deleteRow(confirmingDeleteRow!)}>Delete</button>
			</div>
		</div>
	</div>
{/if}

<main class="h-dvh w-full overflow-hidden flex flex-col">
	<Titlebar title="Rack Elevations">
		<div class="flex items-center gap-2 text-xs">
			<span class="text-gray-400">
				{#if saveStatus === 'saved'}Saved{:else if saveStatus === 'saving'}Saving...{:else}Unsaved{/if}
			</span>
		</div>
	</Titlebar>

	<!-- Toolbar: Room + Row selection -->
	<div class="h-8 px-3 flex items-center gap-3 border-b border-gray-200 bg-white shrink-0 text-xs">
		<!-- Server Room pills -->
		<span class="text-[10px] text-gray-400 uppercase tracking-wider">Room</span>
		<div class="flex gap-0.5">
			{#each ['A', 'B', 'C', 'D'].slice(0, floors.find(f => f.number === floor)?.serverRoomCount ?? 4) as r}
				<button
					class="h-6 w-7 rounded text-[11px] font-semibold transition-colors
						{room === r ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}"
					onclick={() => onroomchange?.(r)}
				>{r}</button>
			{/each}
		</div>

		<div class="w-px h-4 bg-gray-200"></div>

		<!-- Row pills -->
		<span class="text-[10px] text-gray-400 uppercase tracking-wider">Row</span>
		<div class="flex gap-0.5">
			{#each rows as row}
				<div class="relative group">
					<button
						class="h-6 px-2 rounded text-[11px] font-medium transition-colors
							{activeRowId === row.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}"
						onclick={() => activeRowId = row.id}
					>{row.label}</button>
					{#if rows.length > 1}
						<button
							class="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 text-white text-[7px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
							onclick={e => { e.stopPropagation(); confirmingDeleteRow = row.id }}
						>&times;</button>
					{/if}
				</div>
			{/each}
			<button
				class="h-6 w-6 rounded bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600 flex items-center justify-center transition-colors"
				title="Add row"
				onclick={addRow}
			><Icon name="plus" size={12} /></button>
		</div>
	</div>

	<PaneGroup direction="horizontal" class="flex-1 min-h-0">
		<!-- Sidebar -->
		<Pane defaultSize={20} minSize={15} maxSize={35}>
			<div class="h-full overflow-y-auto border-r border-gray-200">
				<RackList {racks} {rows} {activeRowId}
					onadd={addRack} onselect={selectRack} ondelete={deleteRack} onaddrow={addRow} />

				<DevicePalette {library} onadd={addDevice} ondragstart={onPaletteDragStart} oncustomadd={addCustomTemplate} />
			</div>
		</Pane>

		<Handle withHandle />

		<!-- Canvas -->
		<Pane defaultSize={80}>
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="h-full" onclick={onCanvasClick} bind:this={canvasEl}>
				<Canvas bind:view width={canvasWidth} height={canvasHeight}>
					<!-- Reference lines -->
					<Rect item={{ x: -300, z: settings.slabLevel - 200, width: 30000, height: 200 }} label="Slab FL+{settings.slabLevel}" {view} />
					<Rect item={{ x: -300, z: settings.floorLevel - 20, width: 30000, height: 20 }} label="Floor FL+{settings.floorLevel}" {view} />
					<Rect item={{ x: -300, z: settings.ceilingLevel, width: 30000, height: 20 }} label="Ceiling FL+{settings.ceilingLevel}" {view} />

					<!-- Rack frames -->
					{#each activeRacks as rack (rack.id)}
						<RackFrame {rack} {view} selected={selectedIds.has(rack.id)} overlaps={rackOverlaps.get(rack.id)} />
					{/each}

					<!-- Devices -->
					{#each devices.filter(d => activeRacks.some(r => r.id === d.rackId)) as device (device.id)}
						<Draggable {view} shape={deviceScreenRect(device)} item={device}
							selected={selectedIds.has(device.id)}
							onClick={e => { selectedIds.clear(); selectedIds.add(device.id) }}
							onDrag={onDeviceDrag}
							onDragged={(rect, _item, copy) => onDeviceDragged(rect, device, copy)}>
							<DeviceView {device} {view} ondelete={() => deleteDevice(device.id)} />
						</Draggable>
					{/each}

					<!-- Drop ghost for palette drag -->
					{#if dropGhost}
						<div class="absolute bg-blue-200/50 border-2 border-blue-400 border-dashed rounded-sm pointer-events-none"
							style:left={dropGhost.left + 'px'} style:top={dropGhost.top + 'px'}
							style:width={dropGhost.width + 'px'} style:height={dropGhost.height + 'px'}>
						</div>
					{/if}
				</Canvas>
			</div>
		</Pane>
	</PaneGroup>

	<!-- Properties panel -->
	<PropertiesPanel {selectedRack} {selectedDevice}
		onupdaterack={updateRack} onupdatedevice={updateDevice} />

	<!-- Status bar with floor tabs -->
	<div class="h-7 flex items-stretch border-t border-gray-200 bg-gray-50 shrink-0">
		<!-- Floor tabs (left) -->
		<div class="flex items-stretch gap-0 overflow-x-auto">
			{#each floors as fl (fl.number)}
				<button
					class="px-3 text-[11px] font-mono font-medium border-r border-gray-200 transition-colors
						{floor === fl.number ? 'bg-white text-blue-600 border-t-2 border-t-blue-500' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600 border-t-2 border-t-transparent'}"
					onclick={() => onfloorchange?.(fl.number)}
				>{fmtFloor(fl.number)}</button>
			{/each}
			<button
				class="px-2 text-gray-300 hover:text-gray-500 transition-colors"
				title="Manage floors"
				onclick={() => floorManagerOpen = true}
			><Icon name="plus" size={12} /></button>
		</div>

		<!-- Spacer + stats (right) -->
		<div class="flex-1"></div>
		<div class="flex items-center gap-4 px-3 text-[10px] text-gray-400">
			<span>{activeRacks.length} rack{activeRacks.length !== 1 ? 's' : ''} · {devices.length} device{devices.length !== 1 ? 's' : ''}</span>
			<span>Zoom: {Math.round(view.zoom * 100)}%</span>
		</div>
	</div>
</main>

<!-- Drag ghost (follows cursor) -->
{#if draggingTemplate}
	<div class="fixed pointer-events-none z-50 px-2 py-1 bg-blue-100 border border-blue-400 rounded text-xs font-medium text-blue-800 shadow-lg opacity-80"
		style:left={ghostPos.x + 12 + 'px'} style:top={ghostPos.y - 10 + 'px'}>
		{draggingTemplate.label} ({draggingTemplate.heightU}U)
	</div>
{/if}

<FloorManagerDialog
	open={floorManagerOpen}
	{floors}
	{floorFormat}
	onclose={() => floorManagerOpen = false}
	onupdate={updated => onupdatefloors?.(updated)}
	ondelete={fl => ondeletefloor?.(fl)}
/>
