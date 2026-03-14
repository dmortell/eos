<script lang="ts">

	import { Button, Icon, Titlebar } from '$lib'
	import { PaneGroup, Pane, Handle } from '$lib/components/ui/resizable'
	import type { ChangeDetail } from '$lib/logger'
	import type { RackConfig, DeviceConfig, DeviceTemplate, RackRow, RackSettings, ViewState } from './parts/types'
	import { DEFAULT_SETTINGS, SCALE, RU_HEIGHT_MM, RACK_GAP_PX, RACK_19IN_MM, rackHeightMm } from './parts/constants'
	import RackList from './parts/RackList.svelte'
	import DevicePalette from './parts/DevicePalette.svelte'
	import RackDevices from './parts/RackDevices.svelte'
	import Canvas from './parts/Canvas.svelte'
	import RackFrame from './parts/RackFrame.svelte'
	import Rect from './parts/Rect.svelte'
	import Draggable from './parts/Draggable.svelte'
	import DeviceView from './parts/DeviceView.svelte'
	import PropertiesPanel from './parts/PropertiesPanel.svelte'
	import FloorManagerDialog from '$lib/components/FloorManagerDialog.svelte'
	import { fmtFloor } from '$lib/utils/floor'
	import type { FloorConfig } from '$lib/types/project'

	let { data = null, library = [], floor, room, floors = [], projectId = '', projectName = '', floorFormat = 'L01', onsave, onlibrarychange, onfloorchange, onroomchange, onupdatefloors, ondeletefloor }: {
		data?: any
		library?: DeviceTemplate[]
		floor: number
		room: string
		floors?: FloorConfig[]
		projectId?: string
		projectName?: string
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
	const isRUType = (t: string) => t !== 'desk' && t !== 'shelf' && t !== 'vcm'
	const hydrateRack = (r: any) => ({ ...r, heightMm: isRUType(r.type) ? rackHeightMm(r.heightU ?? 42) : (r.heightMm ?? 1600) })
	let racks = $state<RackConfig[]>((data?.racks ?? []).map(hydrateRack))
	let devices = $state<DeviceConfig[]>(data?.devices ?? [])
	let settings = $state<RackSettings>({ ...DEFAULT_SETTINGS, ...(data?.settings ?? {}) })
	let activeRowId = $state<string>(rows[0]?.id ?? 'default')
	let sidebarTab = $state<'racks' | 'devices' | 'library'>('devices')
	let selectedIds = $state(new Set<string>())
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
		if (d.racks) racks = d.racks.map(hydrateRack)
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

	/** Local shorthand: format a floor number using this component's floorFormat + floors */
	const fmt = (fl: number) => fmtFloor(fl, floorFormat, floors)

	/** Get display name for a room (custom name or default "Room X") */
	function roomLabel(rm: string): string {
		const floorCfg = floors.find(f => f.number === floor)
		return floorCfg?.roomNames?.[rm] || `Room ${rm}`
	}

	function doSave() {
		saveStatus = 'saving'
		// db.save() already sanitizes undefined values via sanitizeFirestoreData()
		const payload = {
			rows,
			racks: racks.map(({ _x, _z, ...r }: any) => r), // strip computed canvas-only props
			devices,
			settings,
		}
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
		const rackType = form?.type ?? '4-post'
		const isFurniture = rackType === 'desk' || rackType === 'shelf' || rackType === 'vcm'
		const hu = isFurniture ? 0 : (form?.heightU ?? 42)
		const defaultHeightMm = rackType === 'desk' ? 1600 : rackType === 'shelf' ? 1600 : rackType === 'vcm' ? 2000 : rackHeightMm(hu)
		const defaultWidthMm = rackType === 'vcm' ? 300 : 700
		const newRack: RackConfig = {
			id, label, rowId: activeRowId, order,
			heightU: hu,
			heightMm: form?.heightMm ?? defaultHeightMm,
			widthMm: form?.widthMm ?? defaultWidthMm,
			depthMm: form?.depthMm ?? 800,
			type: rackType,
			serverRoom: room,
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
		const next = new Set(selectedIds); next.delete(rackId); selectedIds = next
		logChange('remove', 'rack', rack.label)
	}

	function updateRack(rackId: string, updates: Partial<RackConfig>) {
		if (updates.heightU != null) {
			const rack = racks.find(r => r.id === rackId)
			if (rack && isRUType(rack.type)) updates.heightMm = rackHeightMm(updates.heightU)
		}
		racks = racks.map(r => r.id === rackId ? { ...r, ...updates } : r)
		logChange('update', 'rack', rackId)
	}

	function selectRack(rackId: string, multi = false) {
		if (multi) {
			const next = new Set(selectedIds)
			if (next.has(rackId)) next.delete(rackId)
			else next.add(rackId)
			selectedIds = next
		} else {
			selectedIds = new Set([rackId])
		}
	}

	function rangeSelectRacks(ids: string[]) {
		const next = new Set(selectedIds)
		for (const id of ids) next.add(id)
		selectedIds = next
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
			const maxU = isRUType(targetRack.type)
				? targetRack.heightU
				: Math.floor(targetRack.heightMm / RU_HEIGHT_MM)
			positionU = 1
			while (occupied.has(positionU) && positionU <= maxU) positionU++
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
			...(template.widthMm ? { widthMm: template.widthMm } : {}),
			// Default panel metadata from parent rack
			...(template.type === 'panel' ? {
				patchLevel: 'floor' as const,
				serverRoom: targetRack.serverRoom ?? room,
			} : {}),
		}
		devices = [...devices, newDevice]
		selectedIds = new Set([id])
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
		const next = new Set(selectedIds); next.delete(deviceId); selectedIds = next
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
		const devW = (device.widthMm ?? RACK_19IN_MM) * SCALE
		const ox = (device.offsetX ?? 0) * SCALE
		const innerLeft = rackRect.left + (rackRect.width - devW) / 2 + ox
		const ruBottom = rackRect.top + rackRect.height - device.positionU * RU_HEIGHT_MM * SCALE
		return {
			left: innerLeft,
			top: ruBottom - device.heightU * RU_HEIGHT_MM * SCALE,
			width: devW,
			height: device.heightU * RU_HEIGHT_MM * SCALE,
		}
	}

	function snapOffsetX(rect: any, rr: any, devW: number): number {
		const devMidX = rect.left + rect.width / 2
		const rackCenterX = rr.left + rr.width / 2
		const offsetPx = devMidX - rackCenterX
		return Math.round(offsetPx / SCALE / 25) * 25
	}

	function onDeviceDrag(rect: any, _mouse: any, item: any) {
		// Show ghost at snap position while dragging existing device
		const midX = rect.left + rect.width / 2
		const devW = (item.widthMm ?? RACK_19IN_MM) * SCALE
		for (const rack of activeRacks) {
			const rr = screenRect(rack)
			if (midX >= rr.left && midX <= rr.left + rr.width) {
				const ruFromBottom = (rr.top + rr.height - rect.top - rect.height) / SCALE / RU_HEIGHT_MM
				const maxRU = isRUType(rack.type)
					? rack.heightU - item.heightU + 1
					: Math.floor(rack.heightMm / RU_HEIGHT_MM) - item.heightU + 1
				const snappedRU = Math.max(1, Math.min(maxRU, Math.round(ruFromBottom)))
				const ox = snapOffsetX(rect, rr, devW)
				const centerLeft = rr.left + (rr.width - devW) / 2 + ox * SCALE
				const ruBottom = rr.top + rr.height - snappedRU * RU_HEIGHT_MM * SCALE
				dropGhost = {
					left: centerLeft,
					top: ruBottom - item.heightU * RU_HEIGHT_MM * SCALE,
					width: devW,
					height: item.heightU * RU_HEIGHT_MM * SCALE,
				}
				return
			}
		}
		dropGhost = null
	}

	function onDeviceDragged(rect: any, device: DeviceConfig, copy?: boolean) {
		dropGhost = null
		const devW = (device.widthMm ?? RACK_19IN_MM) * SCALE
		for (const rack of activeRacks) {
			const rr = screenRect(rack)
			const midX = rect.left + rect.width / 2
			if (midX >= rr.left && midX <= rr.left + rr.width) {
				const ruFromBottom = (rr.top + rr.height - rect.top - rect.height) / SCALE / RU_HEIGHT_MM
				const maxRU = isRUType(rack.type)
					? rack.heightU - device.heightU + 1
					: Math.floor(rack.heightMm / RU_HEIGHT_MM) - device.heightU + 1
				const snappedRU = Math.max(1, Math.min(maxRU, Math.round(ruFromBottom)))
				const ox = snapOffsetX(rect, rr, devW)
				if (copy) {
					const id = `dev-${Date.now()}`
					const { id: _, ...rest } = device
					devices = [...devices, { ...rest, id, rackId: rack.id, positionU: snappedRU, offsetX: ox }]
					selectedIds = new Set([id])
					logChange('copy', 'device', `${device.label} to ${rack.label} RU${snappedRU}`)
				} else {
					updateDevice(device.id, { rackId: rack.id, positionU: snappedRU, offsetX: ox })
				}
				return
			}
		}
	}

	function onCanvasClick(e: MouseEvent) {
		if (!view.dragging) {
			selectedIds = new Set()
		}
	}

	// ── Draggable reference lines (floor, ceiling, walls) ──
	let editingLine = $state<string | null>(null)
	let lineDragField: 'floorLevel' | 'ceilingLevel' | 'leftWallX' | 'rightWallX' | null = null
	let lineDragStartVal = 0
	let lineDragStartMouse = 0

	function startLineDrag(e: MouseEvent, field: typeof lineDragField) {
		if (e.button !== 0) return
		e.preventDefault()
		e.stopPropagation()
		lineDragField = field
		lineDragStartVal = settings[field!]
		const isHorizontal = field === 'leftWallX' || field === 'rightWallX'
		lineDragStartMouse = isHorizontal ? e.clientX : e.clientY
		document.body.style.userSelect = 'none'
		document.addEventListener('mousemove', onLineDragMove)
		document.addEventListener('mouseup', onLineDragEnd)
	}

	function onLineDragMove(e: MouseEvent) {
		if (!lineDragField) return
		const isHorizontal = lineDragField === 'leftWallX' || lineDragField === 'rightWallX'
		if (isHorizontal) {
			const dx = e.clientX - lineDragStartMouse
			settings[lineDragField] = Math.round(lineDragStartVal + dx / (view.zoom * SCALE))
		} else {
			const dy = e.clientY - lineDragStartMouse
			settings[lineDragField] = Math.round(lineDragStartVal - dy / (view.zoom * SCALE))
		}
	}

	function onLineDragEnd() {
		document.body.style.userSelect = ''
		document.removeEventListener('mousemove', onLineDragMove)
		document.removeEventListener('mouseup', onLineDragEnd)
		if (lineDragField) logChange('update', 'settings', lineDragField)
		lineDragField = null
	}
</script>

<svelte:window bind:innerHeight bind:innerWidth />

<!-- Row delete confirmation -->
{#if confirmingDeleteRow}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="fixed inset-0 bg-black/30 z-50 flex items-center justify-center print:hidden" onclick={() => confirmingDeleteRow = null}>
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
	<Titlebar menu={true} title={projectName ? `${projectName} — Rack Elevations` : 'Rack Elevations'}></Titlebar>

	<PaneGroup direction="horizontal" class="flex-1 min-h-0">
		<!-- Sidebar -->
		<Pane defaultSize={20} minSize={15} maxSize={35}>
			<div class="h-full border-r border-gray-200 flex flex-col print:hidden">
				<!-- Sidebar tabs -->
				<div class="flex border-b border-gray-200 shrink-0">
					<button
						class="flex-1 py-1.5 text-[11px] font-medium transition-colors
							{sidebarTab === 'racks' ? 'text-blue-600 border-b-2 border-blue-500 bg-white' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}"
						onclick={() => sidebarTab = 'racks'}
					>Racks</button>
					<button
						class="flex-1 py-1.5 text-[11px] font-medium transition-colors
							{sidebarTab === 'devices' ? 'text-blue-600 border-b-2 border-blue-500 bg-white' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}"
						onclick={() => sidebarTab = 'devices'}
					>Devices</button>
					<button
						class="flex-1 py-1.5 text-[11px] font-medium transition-colors
							{sidebarTab === 'library' ? 'text-blue-600 border-b-2 border-blue-500 bg-white' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}"
						onclick={() => sidebarTab = 'library'}
					>Library</button>
				</div>

				<!-- Sidebar content -->
				<div class="flex-1 min-h-0 overflow-y-auto">
					{#if sidebarTab === 'racks'}
						<RackList {racks} {rows} {activeRowId} {selectedIds} onadd={addRack} onselect={selectRack} onrangeselect={rangeSelectRacks} ondelete={deleteRack} onaddrow={addRow} />
					{:else if sidebarTab === 'devices'}
						<div class="p-2 space-y-2">
							{#if activeRacks.length === 0}
								<p class="text-xs text-gray-400 py-4 text-center">No racks in this row</p>
							{:else}
								{#each activeRacks as rack (rack.id)}
									{@const rackDevices = devices.filter(d => d.rackId === rack.id).sort((a, b) => b.positionU - a.positionU)}
									<div>
										{#if rackDevices.length === 0}
										<!-- <p class="text-[10px] text-gray-300 pl-1">Empty</p> -->
										{:else}
										<div class="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{rack.label}</div>
											<div class="space-y-0.5">
												{#each rackDevices as device (device.id)}
													<!-- svelte-ignore a11y_click_events_have_key_events -->
												<!-- svelte-ignore a11y_no_static_element_interactions -->
												 <!-- {selectedIds.has(device.id) ? 'bg-blue-50 border border-blue-300' : 'bg-gray-50 border border-gray-200 hover:bg-gray-100'}" -->
												<div
													class="flex items-center gap-2 w-full pb-1 rounded text-left text-xs transition-colors cursor-pointer select-none
														{selectedIds.has(device.id) ? 'bg-blue-50 border border-blue-300' : 'xxbg-gray-50 border border-gray-200 hover:bg-gray-100'}"
													onclick={() => { selectedIds = new Set([device.id]) }}
												>
													<div class="min-w-0 flex-1">
														<div class="font-mediumxx text-gray-700 truncate">U{device.positionU}: {device.label} · {device.type}</div>
														<!-- <div class="text-[10px] text-gray-400">U{device.positionU} · {device.heightU}U · {device.type}</div> -->
													</div>
													<button class="shrink-0 p-0.5 text-gray-300 hover:text-red-500 transition-colors"
														onclick={e => { e.stopPropagation(); deleteDevice(device.id) }}
														title="Delete device">
														<Icon name="trash" size={12} />
													</button>
												</div>
												{/each}
											</div>
										{/if}
									</div>
								{/each}
							{/if}
						</div>
					{:else if sidebarTab === 'library'}
						<DevicePalette {library} onadd={addDevice} ondragstart={onPaletteDragStart} oncustomadd={addCustomTemplate} />
					{/if}
				</div>
			</div>
		</Pane>

		<Handle withHandle />

		<!-- Canvas + toolbar + status bar -->
		<Pane defaultSize={80}>
			<div class="h-full flex flex-col">
			<!-- Toolbar: Floor + Room + Row selection -->
			<div class="h-8 px-3 flex items-center gap-3 border-b border-gray-200 bg-white shrink-0 text-xs print:hidden">
				<!-- Floor -->
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

			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="flex-1 min-h-0" onclick={onCanvasClick} bind:this={canvasEl}>
				<Canvas bind:view width={canvasWidth} height={canvasHeight}>
					{@const wallW = 50}
					{@const roomW = settings.rightWallX - settings.leftWallX}
					{@const roomLeft = settings.leftWallX}

					<!-- Floor + Room label -->
					<div class="absolute pointer-events-none select-none"
						style:left={20 + roomLeft * SCALE + 'px'}
						style:top={(view.bottom - settings.ceilingLevel - 180) * SCALE + 'px'}
						style:font-size="24px">
						<span class="font-semibold text-gray-700">{fmt(floor)} — {roomLabel(room)}</span>
					</div>

					<!-- Slab (static, extends to outer wall edges) -->
					<Rect item={{ x: roomLeft - wallW, z: settings.slabLevel - 100, width: roomW + wallW * 2, height: 100 }} label="Slab FL+{settings.slabLevel}" {view} />

					<!-- Floor line (draggable, between walls) -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="absolute cursor-ns-resize group/fl select-none"
						style:left={roomLeft * SCALE + 'px'}
						style:top={(view.bottom - settings.floorLevel) * SCALE + 'px'}
						style:width={roomW * SCALE + 'px'}
						style:height={20 * SCALE + 'px'}
						onmousedown={e => startLineDrag(e, 'floorLevel')}>
						<div class="w-full h-full border border-slate-400/60 bg-slate-100/30 group-hover/fl:bg-slate-200/40 transition-colors"></div>
						{#if editingLine === 'floorLevel'}
							<!-- svelte-ignore a11y_autofocus -->
							<input type="number" class="absolute -top-5 left-1 w-20 h-5 px-1 text-[10px] bg-white border border-slate-400 rounded z-20"
								value={settings.floorLevel}
								autofocus
								onchange={e => { settings.floorLevel = parseInt(e.currentTarget.value) || 0; editingLine = null; logChange('update', 'settings', 'floorLevel') }}
								onkeydown={e => e.key === 'Escape' && (editingLine = null)}
								onblur={() => editingLine = null} />
						{:else}
							<span class="absolute -top-4 left-1 text-[10px] text-slate-500 whitespace-nowrap cursor-pointer"
								onclick={e => { e.stopPropagation(); editingLine = 'floorLevel' }}>Floor FL+{settings.floorLevel}</span>
						{/if}
					</div>

					<!-- Ceiling line (draggable, between walls) -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="absolute cursor-ns-resize group/cl select-none"
						style:left={roomLeft * SCALE + 'px'}
						style:top={(view.bottom - settings.ceilingLevel - 20) * SCALE + 'px'}
						style:width={roomW * SCALE + 'px'}
						style:height={20 * SCALE + 'px'}
						onmousedown={e => startLineDrag(e, 'ceilingLevel')}>
						<div class="w-full h-full border border-slate-400/60 bg-slate-100/30 group-hover/cl:bg-slate-200/40 transition-colors"></div>
						{#if editingLine === 'ceilingLevel'}
							<!-- svelte-ignore a11y_autofocus -->
							<input type="number" class="absolute -top-5 left-1 w-20 h-5 px-1 text-[10px] bg-white border border-slate-400 rounded z-20"
								value={settings.ceilingLevel}
								autofocus
								onchange={e => { settings.ceilingLevel = parseInt(e.currentTarget.value) || 0; editingLine = null; logChange('update', 'settings', 'ceilingLevel') }}
								onkeydown={e => e.key === 'Escape' && (editingLine = null)}
								onblur={() => editingLine = null} />
						{:else}
							<span class="absolute -top-4 left-1 text-[10px] text-slate-500 whitespace-nowrap cursor-pointer"
								onclick={e => { e.stopPropagation(); editingLine = 'ceilingLevel' }}>Ceiling FL+{settings.ceilingLevel}</span>
						{/if}
					</div>

					<!-- Left wall (draggable, 50mm thick, from slab top to above ceiling) -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="absolute cursor-ew-resize group/lw select-none"
						style:left={(settings.leftWallX - wallW) * SCALE + 'px'}
						style:top={(view.bottom - settings.ceilingLevel - 200) * SCALE + 'px'}
						style:width={wallW * SCALE + 'px'}
						style:height={(settings.ceilingLevel - settings.slabLevel + 200) * SCALE + 'px'}
						onmousedown={e => startLineDrag(e, 'leftWallX')}>
						<div class="w-full h-full bg-gray-300/60 group-hover/lw:bg-gray-400/70 transition-colors border border-gray-400/40"></div>
						<span class="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] text-gray-500 whitespace-nowrap">Wall</span>
					</div>

					<!-- Right wall (draggable, 50mm thick, from slab top to above ceiling) -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="absolute cursor-ew-resize group/rw select-none"
						style:left={settings.rightWallX * SCALE + 'px'}
						style:top={(view.bottom - settings.ceilingLevel - 200) * SCALE + 'px'}
						style:width={wallW * SCALE + 'px'}
						style:height={(settings.ceilingLevel - settings.slabLevel + 200) * SCALE + 'px'}
						onmousedown={e => startLineDrag(e, 'rightWallX')}>
						<div class="w-full h-full bg-gray-300/60 group-hover/rw:bg-gray-400/70 transition-colors border border-gray-400/40"></div>
						<span class="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] text-gray-500 whitespace-nowrap">Wall</span>
					</div>

					<!-- Rack frames -->
					{#each activeRacks as rack (rack.id)}
						<RackFrame {rack} {view} selected={selectedIds.has(rack.id)} overlaps={rackOverlaps.get(rack.id)} />
					{/each}

					<!-- Devices -->
					{#each devices.filter(d => activeRacks.some(r => r.id === d.rackId)) as device (device.id)}
						<Draggable {view} shape={deviceScreenRect(device)} item={device}
							selected={selectedIds.has(device.id)}
							onClick={e => { selectedIds = new Set([device.id]) }}
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

			<!-- Properties panel -->
			<PropertiesPanel {selectedRack} {selectedDevice}
				onupdaterack={updateRack} onupdatedevice={updateDevice} />

			<!-- Status bar with floor tabs -->
			<div class="h-7 flex items-stretch border-t border-gray-200 bg-gray-50 shrink-0 print:hidden">
				<!-- Floor tabs (left) -->
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

				<!-- Spacer + stats (right) -->
				<div class="flex-1"></div>
				<div class="flex items-center gap-4 px-3 text-[10px] text-gray-400">
					{#if innerWidth > 1200}
						<span class="text-gray-500">Ctrl+Scroll to zoom · Right-drag to pan</span>
					{/if}
					<span>{activeRacks.length} rack{activeRacks.length !== 1 ? 's' : ''} · {devices.length} device{devices.length !== 1 ? 's' : ''}</span>
					<span>Zoom: {Math.round(view.zoom * 100)}%</span>
				</div>
			</div>
			</div>
		</Pane>
	</PaneGroup>
</main>

<!-- Drag ghost (follows cursor) -->
{#if draggingTemplate}
	<div class="fixed pointer-events-none z-50 px-2 py-1 bg-blue-100 border border-blue-400 rounded text-xs font-medium text-blue-800 shadow-lg opacity-80 print:hidden"
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
