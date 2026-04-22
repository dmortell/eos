<script lang="ts">

	import { Button, Icon, Titlebar, Firestore } from '$lib'
	import { onMount, onDestroy } from 'svelte'
	import VersionPanel from '../parts/VersionPanel.svelte'
	import { PaneGroup, Pane, Handle } from '$lib/components/ui/resizable'
	import type { ChangeDetail } from '$lib/logger'
	import type { RackConfig, DeviceConfig, DeviceTemplate, RackRow, RackSettings, ViewState, ElevationFace } from './parts/types'
	import { VIEW_FRONT, VIEW_REAR, VIEW_PLAN, VIEW_DEFAULT } from './parts/types'
	import { DEFAULT_SETTINGS, SCALE, RU_HEIGHT_MM, RACK_GAP_PX, RACK_19IN_MM, rackHeightMm } from './parts/constants'
	import RackList from './parts/RackList.svelte'
	import RowEditor from './parts/RowEditor.svelte'
	import DevicePalette from './parts/DevicePalette.svelte'
	import RackDevices from './parts/RackDevices.svelte'
	import Canvas from './parts/Canvas.svelte'
	import RackElevations from './parts/RackElevations.svelte'
	import RackPlan from './parts/RackPlan.svelte'
	import CatalogBrowser from './parts/CatalogBrowser.svelte'
	import BOMPanel from './parts/BOMPanel.svelte'
	import PropertiesPanel from './parts/PropertiesPanel.svelte'
	import DeviceProperties from './parts/DeviceProperties.svelte'
	import FloorTabs from './parts/FloorTabs.svelte'
	import RoomSelector from './parts/RoomSelector.svelte'
	import { subscribeCatalog, saveCustomProduct, deleteCustomProduct, rackFromCatalog } from '$lib/catalog/service'
	import type { CatalogProduct } from '$lib/catalog/types'
	import FloorManagerDialog from '$lib/components/FloorManagerDialog.svelte'
	import { fmtFloor } from '$lib/utils/floor'
	import type { FloorConfig } from '$lib/types/project'

	let { data = null, library = [], floor, room, floors = [], projectId = '', projectName = '', floorFormat = 'L01', drawingId = '', db = new Firestore(), uid = '', initialViewMask, onsave, onlibrarychange, onfloorchange, onroomchange, onupdatefloors, ondeletefloor }: {
		data?: any
		library?: DeviceTemplate[]
		floor: number
		room: string
		floors?: FloorConfig[]
		projectId?: string
		projectName?: string
		floorFormat?: string
		drawingId?: string
		db?: Firestore
		uid?: string
		initialViewMask?: number
		onsave?: (payload: any, changes: ChangeDetail[]) => void
		onlibrarychange?: (templates: DeviceTemplate[]) => void
		onfloorchange?: (floor: number) => void
		onroomchange?: (room: string) => void
		onupdatefloors?: (floors: FloorConfig[]) => void
		ondeletefloor?: (floor: number) => void
	} = $props()

	let versionPanelOpen = $state(false)

	function getCurrentSnapshot(): unknown {
		return {
			floor, room, rows,
			racks: racks.map(({ _x, _z, ...r }: any) => r),
			devices, library, settings,
		}
	}

	function handleRestore(snapshot: unknown) {
		const s = snapshot as any
		if (s.rows) rows = s.rows
		if (s.racks) racks = s.racks.map(hydrateRack)
		if (s.devices) devices = s.devices
		if (s.settings) settings = { ...DEFAULT_SETTINGS, ...s.settings }
		doSave()
	}

	// ── State ──
	let rows = $state<RackRow[]>(data?.rows ?? [{ id: 'default', label: 'Row A' }])
	const isRUType = (t: string) => t !== 'desk' && t !== 'shelf' && t !== 'vcm'
	const hydrateRack = (r: any) => ({ ...r, heightMm: isRUType(r.type) ? rackHeightMm(r.heightU ?? 42) : (r.heightMm ?? 1600) })
	let racks = $state<RackConfig[]>((data?.racks ?? []).map(hydrateRack))
	let devices = $state<DeviceConfig[]>(data?.devices ?? [])
	let settings = $state<RackSettings>({ ...DEFAULT_SETTINGS, ...(data?.settings ?? {}) })
	let activeRowId = $state<string>(rows[0]?.id ?? 'default')
	let sidebarTab = $state<'racks' | 'devices' | 'library' | 'catalog' | 'bom'>('devices')
	let catalog = $state<CatalogProduct[]>([])
	let selectedIds = $state(new Set<string>())
	let viewMask = $state(initialViewMask ?? VIEW_DEFAULT)
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

	// ── Subscribe to the global catalog (seed + Firestore customs) ──
	$effect(() => {
		const unsub = subscribeCatalog(db, list => { catalog = list })
		return () => unsub?.()
	})

	// ── Back-fill: every rack must belong to a row. Legacy data may have
	//    orphaned rowIds — move those racks into the first row. ──
	$effect(() => {
		const validIds = new Set(rows.map(r => r.id))
		const orphaned = racks.filter(r => !validIds.has(r.rowId))
		if (orphaned.length === 0) return
		if (rows.length === 0) {
			rows = [{ id: 'default', label: 'Row A' }]
			validIds.add('default')
		}
		const target = rows[0].id
		racks = racks.map(r => validIds.has(r.rowId) ? r : { ...r, rowId: target })
		logChange('update', 'rack', `Moved ${orphaned.length} unassigned rack(s) to ${rows[0].label}`)
	})

	// Rear elevation: reversed rack order, bottom-aligned below front view
	const REAR_GAP_MM = 600
	const PLAN_GAP_MM = 1500
	let rearRacks = $derived.by(() => {
		if (!(viewMask & VIEW_REAR) || activeRacks.length === 0) return []
		const tallest = Math.max(...activeRacks.map(r => r.heightMm))
		const rearBottom = settings.floorLevel - REAR_GAP_MM - tallest
		return [...activeRacks].reverse().map((rack, idx, arr) => {
			let x = 0
			for (let i = 0; i < idx; i++) x += arr[i].widthMm + RACK_GAP_PX / SCALE
			return { ...rack, _x: x, _z: rearBottom, _face: 'rear' as ElevationFace }
		})
	})

	// ── Plan view: place below elevations (or at top of canvas if no elevations) ──
	let planTopPx = $derived.by(() => {
		if (!(viewMask & VIEW_PLAN)) return 0
		const hasFront = viewMask & VIEW_FRONT
		const hasRear = viewMask & VIEW_REAR
		if (!hasFront && !hasRear) return 0
		// Canvas Y (in mm from top of canvas) of the lowest elevation content
		let bottomMm: number
		if (hasRear && racks.length > 0) {
			const tallest = Math.max(...racks.map(r => r.heightMm))
			bottomMm = view.bottom - settings.floorLevel + REAR_GAP_MM + tallest
		} else {
			bottomMm = view.bottom - settings.floorLevel + 100
		}
		return (bottomMm + PLAN_GAP_MM) * SCALE
	})

	function moveRow(rowId: string, originMm: { x: number; y: number }) {
		rows = rows.map(r => r.id === rowId
			? { ...r, plan: { originMm, rotationDeg: r.plan?.rotationDeg ?? 0 } }
			: r)
		logChange('update', 'row', rowId)
	}

	// Selected item helpers
	let selectedRacks = $derived(
		racks.filter(r => selectedIds.has(r.id))
	)
	let selectedRack = $derived(selectedRacks[0] ?? null)
	let selectedDevices = $derived(
		devices.filter(d => selectedIds.has(d.id))
	)
	let selectedDevice = $derived(selectedDevices[0] ?? null)

	/** Per-rack set of RU positions occupied by more than one device.
	 *  Excludes devices wider than the 19″ internal frame (e.g. vertical PDUs)
	 *  and uses mounting position (front/rear/both/none) to determine conflicts:
	 *  two devices only overlap if they share at least one rail (front or rear). */
	let rackOverlaps = $derived.by(() => {
		const map = new Map<string, Set<number>>()
		// Track front and rear rail occupancy separately per rack
		const frontCounts = new Map<string, Map<number, number>>()
		const rearCounts = new Map<string, Map<number, number>>()
		for (const d of devices) {
			const ox = d.offsetX ?? 0
			if (ox < -446/2 || ox>446/2) continue

			const mounting = d.mounting ?? 'both'
			if (mounting === 'none') continue
			const usesFront = mounting === 'front' || mounting === 'both'
			const usesRear = mounting === 'rear' || mounting === 'both'
			if (usesFront) {
				if (!frontCounts.has(d.rackId)) frontCounts.set(d.rackId, new Map())
				const counts = frontCounts.get(d.rackId)!
				for (let u = d.positionU; u < d.positionU + d.heightU; u++) {
					counts.set(u, (counts.get(u) ?? 0) + 1)
				}
			}
			if (usesRear) {
				if (!rearCounts.has(d.rackId)) rearCounts.set(d.rackId, new Map())
				const counts = rearCounts.get(d.rackId)!
				for (let u = d.positionU; u < d.positionU + d.heightU; u++) {
					counts.set(u, (counts.get(u) ?? 0) + 1)
				}
			}
		}
		// A RU overlaps if either front or rear rail has >1 device
		const allRackIds = new Set([...frontCounts.keys(), ...rearCounts.keys()])
		for (const rackId of allRackIds) {
			const overlapping = new Set<number>()
			const fc = frontCounts.get(rackId)
			const rc = rearCounts.get(rackId)
			if (fc) for (const [u, count] of fc) { if (count > 1) overlapping.add(u) }
			if (rc) for (const [u, count] of rc) { if (count > 1) overlapping.add(u) }
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
			sku: form?.sku,
			productRef: form?.productRef,
			color: form?.color,
			adjustable: form?.adjustable,
			minDepthMm: form?.minDepthMm,
			maxDepthMm: form?.maxDepthMm,
			frontProtrusionMm: form?.frontProtrusionMm,
			containmentCapability: form?.containmentCapability,
		}
		racks = [...racks, newRack]
		normalizeRowOrders(activeRowId)
		logChange('add', 'rack', label)
	}

	function addRackFromCatalog(product: CatalogProduct) {
		const base = rackFromCatalog(product)
		addRack({
			...base,
			type: product.kind === 'vcm' ? 'vcm' : '4-post',
			label: product.sku,
			frontProtrusionMm: base.frontProtrusionMm,
		})
	}

	async function addCustomProduct(product: Omit<CatalogProduct, 'seeded'>) {
		await saveCustomProduct(db, product, uid, projectId)
	}

	async function deleteCatalogProduct(id: string) {
		await deleteCustomProduct(db, id)
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

	function reorderRacks(orderedIds: string[]) {
		racks = racks.map(r => {
			const idx = orderedIds.indexOf(r.id)
			return idx >= 0 ? { ...r, order: idx } : r
		})
		logChange('update', 'rack', 'reorder')
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
		const allRacks: { rack: typeof activeRacks[number]; isRear: boolean }[] = [
			...activeRacks.map(r => ({ rack: r, isRear: false })),
			...rearRacks.map(r => ({ rack: r, isRear: true })),
		]
		for (const { rack, isRear } of allRacks) {
			const rr = screenRect(rack)
			if (cx >= rr.left && cx <= rr.left + rr.width && cy >= rr.top && cy <= rr.top + rr.height) {
				const ruFromBottom = (rr.top + rr.height - cy) / SCALE / RU_HEIGHT_MM
				const snappedRU = Math.max(1, Math.min(rack.heightU - heightU + 1, Math.round(ruFromBottom)))
				const innerLeft = rr.left + ((rack.widthMm - RACK_19IN_MM) / 2) * SCALE
				const ruBottom = rr.top + rr.height - snappedRU * RU_HEIGHT_MM * SCALE
				return {
					rack, snappedRU, isRear,
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
			if (hit.isRear) {
				// Device dropped in rear view — set mounting to rear
				const lastDev = devices[devices.length - 1]
				if (lastDev) updateDevice(lastDev.id, { mounting: 'rear' })
			}
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

	function selectDevice(deviceId: string, multi = false) {
		if (multi) {
			const next = new Set(selectedIds)
			if (next.has(deviceId)) next.delete(deviceId)
			else next.add(deviceId)
			selectedIds = next
		} else {
			selectedIds = new Set([deviceId])
		}
	}

	function rangeSelectDevices(ids: string[]) {
		const next = new Set(selectedIds)
		for (const id of ids) next.add(id)
		selectedIds = next
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

	function renameRow(rowId: string, label: string) {
		rows = rows.map(r => r.id === rowId ? { ...r, label } : r)
		logChange('update', 'row', `rename ${rowId}`)
	}

	/** Partial update to row.defaults. `undefined` values clear the field. */
	function updateRowDefaults(rowId: string, partial: Record<string, unknown>) {
		rows = rows.map(r => {
			if (r.id !== rowId) return r
			const next = { ...(r.defaults ?? {}) }
			for (const [k, v] of Object.entries(partial)) {
				if (v === undefined) delete (next as any)[k]
				else (next as any)[k] = v
			}
			return { ...r, defaults: Object.keys(next).length ? next : undefined }
		})
		logChange('update', 'row', `defaults ${rowId}`)
	}

	/** Apply a catalog product to all racks of matching kind in the row. */
	function quickFillRow(rowId: string, kind: 'rack' | 'vcm', productId: string) {
		const product = catalog.find(p => p.id === productId)
		if (!product) return
		const base = rackFromCatalog(product)
		const targetType = kind === 'vcm' ? 'vcm' : '4-post'
		const isTargetKind = (r: RackConfig) => kind === 'vcm' ? r.type === 'vcm' : r.type !== 'vcm'
		let count = 0
		racks = racks.map(r => {
			if (r.rowId !== rowId || !isTargetKind(r)) return r
			count++
			return {
				...r,
				...base,
				type: targetType as any,
				heightMm: kind === 'vcm' ? r.heightMm : rackHeightMm(base.heightU),
				frontProtrusionMm: base.frontProtrusionMm,
			}
		})
		if (count > 0) logChange('update', 'row', `quick-fill ${count} ${kind}(s) with ${product.sku}`)
	}

	/**
	 * Re-assign `order` values in a row to produce the V-R-V-R-...-V interleave
	 * pattern (Panduit convention). Preserves relative ordering within each kind,
	 * so user drag-reorders still work — we only reshuffle racks vs VCMs.
	 * Racks end up at odd orders (1, 3, 5, …), VCMs at even (0, 2, 4, …). Extra
	 * VCMs beyond R+1 land past the last rack.
	 */
	function normalizeRowOrders(rowId: string) {
		const items = racks.filter(r => r.rowId === rowId).sort((a, b) => a.order - b.order)
		if (items.length === 0) return
		const rackItems = items.filter(r => r.type !== 'vcm')
		const vcmItems = items.filter(r => r.type === 'vcm')
		const R = rackItems.length
		const updates = new Map<string, number>()
		rackItems.forEach((r, i) => updates.set(r.id, 2 * i + 1))
		vcmItems.forEach((v, i) => {
			const pos = i <= R ? 2 * i : 2 * R + 2 * (i - R)
			updates.set(v.id, pos)
		})
		racks = racks.map(r =>
			updates.has(r.id) && updates.get(r.id) !== r.order
				? { ...r, order: updates.get(r.id)! }
				: r
		)
	}

	/** Create N new racks/VCMs in a row from a catalog product. */
	function addRacksFromCatalog(rowId: string, productId: string, count: number) {
		const product = catalog.find(p => p.id === productId)
		if (!product || count < 1) return
		if (product.kind !== 'rack' && product.kind !== 'vcm') return
		const base = rackFromCatalog(product)
		const isVcm = product.kind === 'vcm'
		const targetType = isVcm ? 'vcm' : '4-post'
		const heightMm = rackHeightMm(base.heightU)
		const prefix = isVcm ? 'V' : 'R'
		const now = Date.now()
		let order = racks.filter(r => r.rowId === rowId).length
		const newRacks: RackConfig[] = []
		for (let i = 0; i < count; i++) {
			order++
			newRacks.push({
				id: `rack-${now}-${i}`,
				label: `${prefix}${String(order).padStart(2, '0')}`,
				rowId,
				order: order - 1, // 0-based within row
				heightU: base.heightU,
				heightMm,
				widthMm: base.widthMm,
				depthMm: base.depthMm,
				type: targetType as any,
				serverRoom: room,
				maker: base.maker,
				model: base.model,
				sku: base.sku,
				productRef: base.productRef,
				color: base.color,
				adjustable: base.adjustable,
				minDepthMm: base.minDepthMm,
				maxDepthMm: base.maxDepthMm,
				frontProtrusionMm: base.frontProtrusionMm,
				containmentCapability: base.containmentCapability,
			})
		}
		racks = [...racks, ...newRacks]
		normalizeRowOrders(rowId)
		logChange('add', 'rack', `Added ${count} × ${product.sku}`)
	}

	/** Force all racks in the row to match row.defaults — irreversible without undo. */
	function copyRowDefaultsToAllRacks(rowId: string) {
		const row = rows.find(r => r.id === rowId)
		const d = row?.defaults
		if (!d) return
		let count = 0
		racks = racks.map(r => {
			if (r.rowId !== rowId) return r
			const updates: Partial<RackConfig> = {}
			if (d.heightU != null && r.type !== 'vcm' && r.heightU !== d.heightU) {
				updates.heightU = d.heightU
				updates.heightMm = rackHeightMm(d.heightU)
			}
			if (d.color && r.color !== d.color) updates.color = d.color
			if (d.depthMm != null && r.depthMm !== d.depthMm) updates.depthMm = d.depthMm
			if (Object.keys(updates).length === 0) return r
			count++
			return { ...r, ...updates }
		})
		if (count > 0) logChange('update', 'row', `apply defaults to ${count} rack(s)`)
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

	function snapOffsetX(rect: any, rr: any, devW: number): number {
		const devMidX = rect.left + rect.width / 2
		const rackCenterX = rr.left + rr.width / 2
		const offsetPx = devMidX - rackCenterX
		return Math.round(offsetPx / SCALE / 25) * 25
	}

	/** Find which rack (front or rear) a drop rect lands in, checking both X and Y */
	function findDropRack(midX: number, midY: number): { rack: typeof activeRacks[number]; rr: ReturnType<typeof screenRect>; isRear: boolean } | null {
		for (const rack of activeRacks) {
			const rr = screenRect(rack)
			if (midX >= rr.left && midX <= rr.left + rr.width && midY >= rr.top && midY <= rr.top + rr.height)
				return { rack, rr, isRear: false }
		}
		for (const rack of rearRacks) {
			const rr = screenRect(rack)
			if (midX >= rr.left && midX <= rr.left + rr.width && midY >= rr.top && midY <= rr.top + rr.height)
				return { rack, rr, isRear: true }
		}
		return null
	}

	function onDeviceDrag(rect: any, _mouse: any, item: any) {
		const midX = rect.left + rect.width / 2
		const midY = rect.top + rect.height / 2
		const devW = (item.widthMm ?? RACK_19IN_MM) * SCALE
		const hit = findDropRack(midX, midY)
		if (hit) {
			const { rack, rr, isRear } = hit
			const ruFromBottom = (rr.top + rr.height - rect.top - rect.height) / SCALE / RU_HEIGHT_MM
			const maxRU = isRUType(rack.type)
				? rack.heightU - item.heightU + 1
				: Math.floor(rack.heightMm / RU_HEIGHT_MM) - item.heightU + 1
			const snappedRU = Math.max(1, Math.min(maxRU, Math.round(ruFromBottom)))
			const ox = snapOffsetX(rect, rr, devW) * (isRear ? -1 : 1)
			const centerLeft = rr.left + (rr.width - devW) / 2 + ox * (isRear ? -1 : 1) * SCALE
			const ruBottom = rr.top + rr.height - snappedRU * RU_HEIGHT_MM * SCALE
			dropGhost = {
				left: centerLeft,
				top: ruBottom - item.heightU * RU_HEIGHT_MM * SCALE,
				width: devW,
				height: item.heightU * RU_HEIGHT_MM * SCALE,
			}
			return
		}
		dropGhost = null
	}

	function onDeviceDragged(rect: any, device: DeviceConfig, copy?: boolean) {
		dropGhost = null
		const devW = (device.widthMm ?? RACK_19IN_MM) * SCALE
		const midX = rect.left + rect.width / 2
		const midY = rect.top + rect.height / 2
		const hit = findDropRack(midX, midY)
		if (!hit) return
		const { rack, rr, isRear } = hit
		const ruFromBottom = (rr.top + rr.height - rect.top - rect.height) / SCALE / RU_HEIGHT_MM
		const maxRU = isRUType(rack.type)
			? rack.heightU - device.heightU + 1
			: Math.floor(rack.heightMm / RU_HEIGHT_MM) - device.heightU + 1
		const snappedRU = Math.max(1, Math.min(maxRU, Math.round(ruFromBottom)))
		const ox = snapOffsetX(rect, rr, devW) * (isRear ? -1 : 1)
		if (copy) {
			const id = `dev-${Date.now()}`
			const { id: _, ...rest } = device
			devices = [...devices, { ...rest, id, rackId: rack.id, positionU: snappedRU, offsetX: ox }]
			selectedIds = new Set([id])
			logChange('copy', 'device', `${device.label} to ${rack.label} RU${snappedRU}`)
		} else {
			updateDevice(device.id, { rackId: rack.id, positionU: snappedRU, offsetX: ox })
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

	// ── Print support ──
	let printSavedView: { x: number; y: number; zoom: number; title: string } | null = null

	function setPrinting() {
		const wallW = 50
		const pad = 60 // mm padding for labels

		// Content bounds in canvas coords (pre-zoom pixels)
		const canvasLeft = (settings.leftWallX - wallW - pad) * SCALE
		const canvasRight = (settings.rightWallX + wallW + pad) * SCALE
		const canvasTop = (view.bottom - settings.ceilingLevel - 200 - pad) * SCALE
		const canvasBottom = (view.bottom - settings.slabLevel + 100 + pad) * SCALE

		const contentW = canvasRight - canvasLeft
		const contentH = canvasBottom - canvasTop

		// A3 landscape: 420mm x 297mm, 10mm visual margin
		const pageWmm = 420, pageHmm = 297, marginMm = 10
		const pxPerMm = 96 / 25.4
		const usableWpx = (pageWmm - 2 * marginMm) * pxPerMm
		const usableHpx = (pageHmm - 2 * marginMm) * pxPerMm
		const marginPx = marginMm * pxPerMm
		const printZoom = Math.min(usableWpx / contentW, usableHpx / contentH)

		printSavedView = { x: view.x, y: view.y, zoom: view.zoom, title: document.title }
		document.title = `${projectName} - ${fmt(floor)} - ${roomLabel(room)} Elevation`
		view.zoom = printZoom
		view.x = marginPx - canvasLeft * printZoom
		view.y = marginPx - canvasTop * printZoom

		updatePrintStyles()
	}

	function clrPrinting() {
		if (printSavedView) {
			document.title = printSavedView.title
			view.x = printSavedView.x
			view.y = printSavedView.y
			view.zoom = printSavedView.zoom
			printSavedView = null
		}
	}

	function updatePrintStyles() {
		const id = 'racks-print-style'
		let style = document.getElementById(id) as HTMLStyleElement
		if (!style) { style = document.createElement('style'); style.id = id; document.head.appendChild(style) }
		style.textContent = `@page { size: A3 landscape; margin: 0; }
@media print {
	html, body { margin: 0; padding: 0; overflow: visible !important; }
	.panzoom { position: fixed !important; top: 0; left: 0; width: 420mm !important; height: 297mm !important; background: white !important; overflow: visible !important; z-index: 9999; }
}`
	}

	onMount(() => {
		window.addEventListener('beforeprint', setPrinting)
		window.addEventListener('afterprint', clrPrinting)
	})

	onDestroy(() => {
		window.removeEventListener('beforeprint', setPrinting)
		window.removeEventListener('afterprint', clrPrinting)
		document.getElementById('racks-print-style')?.remove()
	})
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
	<Titlebar menu={true} title={projectName ? `${projectName} — Rack Elevations` : 'Rack Elevations'}>
		{#if drawingId}
			<button class="flex items-center gap-1 px-2 py-0.5 rounded text-xs hover:bg-white/20 transition-colors"
				onclick={() => versionPanelOpen = !versionPanelOpen} title="Version History">
				<Icon name="history" size={14} /> Versions
			</button>
		{/if}
	</Titlebar>

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
					<button
						class="flex-1 py-1.5 text-[11px] font-medium transition-colors
							{sidebarTab === 'catalog' ? 'text-blue-600 border-b-2 border-blue-500 bg-white' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}"
						onclick={() => sidebarTab = 'catalog'}
					>Catalog</button>
					<button
						class="flex-1 py-1.5 text-[11px] font-medium transition-colors
							{sidebarTab === 'bom' ? 'text-blue-600 border-b-2 border-blue-500 bg-white' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}"
						onclick={() => sidebarTab = 'bom'}
					>BOM</button>
				</div>

				<!-- Sidebar content -->
				<div class="flex-1 min-h-0 overflow-y-auto">
					{#if sidebarTab === 'racks'}
						{@const activeRow = rows.find(r => r.id === activeRowId)}
						{#if activeRow}
							<RowEditor
								row={activeRow}
								{racks}
								{catalog}
								onrename={label => renameRow(activeRow.id, label)}
								onupdate={partial => updateRowDefaults(activeRow.id, partial as any)}
								onquickfill={(kind, pid) => quickFillRow(activeRow.id, kind, pid)}
								onaddn={(pid, count) => addRacksFromCatalog(activeRow.id, pid, count)}
								oncopyrowdefaults={() => copyRowDefaultsToAllRacks(activeRow.id)} />
						{/if}
						<RackList {racks} {rows} {activeRowId} {selectedIds} onadd={addRack} onselect={selectRack} onrangeselect={rangeSelectRacks} ondelete={deleteRack} onaddrow={addRow} onreorder={reorderRacks} />
					{:else if sidebarTab === 'devices'}
						<RackDevices racks={activeRacks} {devices} {selectedIds} onselect={selectDevice} onrangeselect={rangeSelectDevices} ondelete={deleteDevice} />
					{:else if sidebarTab === 'library'}
						<DevicePalette {library} onadd={addDevice} ondragstart={onPaletteDragStart} oncustomadd={addCustomTemplate} />
					{:else if sidebarTab === 'catalog'}
						<CatalogBrowser
							products={catalog}
							contextRow={rows.find(r => r.id === activeRowId)}
							onadd={addRackFromCatalog}
							onaddcustom={addCustomProduct}
							ondelete={deleteCatalogProduct} />
					{:else if sidebarTab === 'bom'}
						<BOMPanel {rows} {racks} {activeRowId} {catalog}
							{projectName}
							floorLabel={fmt(floor)}
							roomLabel={roomLabel(room)} />
					{/if}
				</div>
			</div>
		</Pane>

		<Handle withHandle />

		<!-- Canvas + toolbar + status bar -->
		<Pane defaultSize={80}>
			<div class="h-full flex flex-col">
			<RoomSelector {floors} {floor} {room} {floorFormat} {rows} {activeRowId} {viewMask}
				{onfloorchange} {onroomchange}
				onactiverowchange={id => activeRowId = id}
				onaddrow={addRow}
				ondeleterow={id => confirmingDeleteRow = id}
				onmanagefloors={() => floorManagerOpen = true}
				onviewmaskchange={m => viewMask = m} />

			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="flex-1 min-h-0" onclick={onCanvasClick} bind:this={canvasEl}>
				<Canvas bind:view width={canvasWidth} height={canvasHeight}>
					{#if viewMask & (VIEW_FRONT | VIEW_REAR)}
						<RackElevations {view} {settings} {activeRacks} {rearRacks} {viewMask} {devices} {selectedIds} {dropGhost} {rackOverlaps} {editingLine}
							floorLabel={fmt(floor)} roomLabel={roomLabel(room)}
							onstarttlinedrag={startLineDrag}
							oneditline={field => editingLine = field}
							oncleareditline={() => editingLine = null}
							onsettingchange={(field, value) => { settings[field as keyof RackSettings] = value as never; logChange('update', 'settings', field) }}
							ondevicedrag={onDeviceDrag}
							ondevicedragged={onDeviceDragged}
							ondeletedevice={deleteDevice}
							onselectdevice={id => selectedIds = new Set([id])} />
					{/if}
					{#if viewMask & VIEW_PLAN}
						<RackPlan {view} {rows} {racks} {selectedIds} {activeRowId} {planTopPx}
							onmoverow={moveRow}
							onselectrack={selectRack}
							onselectrow={id => activeRowId = id} />
					{/if}
				</Canvas>
			</div>

			<!-- Properties panel -->
			<PropertiesPanel {selectedRacks} {projectId} {floor} onupdaterack={updateRack} />
			<DeviceProperties devices={selectedDevices} onupdate={updateDevice} />

			<!-- Status bar with floor tabs -->
			<div class="h-7 flex items-stretch border-t border-gray-200 bg-gray-50 shrink-0 print:hidden">
				<FloorTabs {floors} {floor} {floorFormat} {onfloorchange} onmanage={() => floorManagerOpen = true} />

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

{#if drawingId}
	<VersionPanel
		bind:open={versionPanelOpen}
		projectId={projectId ?? ''}
		{drawingId}
		{uid}
		{db}
		currentSnapshot={getCurrentSnapshot}
		onrestore={handleRestore}
	/>
{/if}
