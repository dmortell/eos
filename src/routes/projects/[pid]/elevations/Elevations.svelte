<script lang="ts">
	/**
	 * Elevations tool shell (Phase 1: row elevation with Racks-parity editing).
	 * All state + CRUD live in ElevationsEditor; this component wires the layout,
	 * DOM-level drag handling, keyboard, and print. See elevations-plan.md.
	 */
	import { Icon, Titlebar, Firestore } from '$lib'
	import { onMount, onDestroy, untrack } from 'svelte'
	import VersionPanel from '../parts/VersionPanel.svelte'
	import { PaneGroup, Pane, Handle } from '$lib/components/ui/resizable'
	import type { ChangeDetail } from '$lib/logger'
	import type { DeviceTemplate, DeviceConfig, RackSettings } from '../racks/parts/types'
	import { SCALE, RU_HEIGHT_MM, RACK_19IN_MM, DEVICE_W_MM } from '../racks/parts/constants'
	import RackList from '../racks/parts/RackList.svelte'
	import RowEditor from '../racks/parts/RowEditor.svelte'
	import DevicePalette from '../racks/parts/DevicePalette.svelte'
	import RackDevices from '../racks/parts/RackDevices.svelte'
	import CatalogBrowser from '../racks/parts/CatalogBrowser.svelte'
	import BOMPanel from '../racks/parts/BOMPanel.svelte'
	import RackElevationRenderer from '../racks/parts/RackElevationRenderer.svelte'
	import FloorTabs from '../racks/parts/FloorTabs.svelte'
	import PanZoomCanvas from '$lib/panzoom/PanZoomCanvas.svelte'
	import Inspector from './parts/Inspector.svelte'
	import PortsLayer from './parts/PortsLayer.svelte'
	import CordsLayer from './parts/CordsLayer.svelte'
	import PanelDetailStrip from './parts/PanelDetailStrip.svelte'
	import PatchListPane from '../patching/parts/PatchListPane.svelte'
	import PatchSettingsDialog from '../patching/parts/SettingsDialog.svelte'
	import { CABLE_TYPES } from '../patching/parts/constants'
	import { exportPatchExcel, importCordIds } from '../patching/parts/exportExcel'
	import ConfigPanel from '../frames/parts/ConfigPanel.svelte'
	import LocationList from '../frames/parts/LocationList.svelte'
	import { ElevationsEditor, type SidebarTab } from './editor.svelte'
	import { subscribeCatalog, saveCustomProduct, deleteCustomProduct } from '$lib/catalog/service'
	import type { CatalogProduct } from '$lib/catalog/types'
	import FloorManagerDialog from '$lib/components/FloorManagerDialog.svelte'
	import { DEFAULT_LOC_TYPES } from '../frames/parts/types'
	import type { ZoneConfig } from '../frames/parts/types'
	import { LOC_TYPE_COLORS, LOC_TYPE_LABELS } from '$lib/elevation/loc-colors'
	import { generatePortLabels, generateRacks } from '../frames/parts/engine'
	import { deriveFramesFromRacks } from '$lib/elevation/portmap'
	import { exportToExcel as exportFrameLabels } from '../frames/parts/exportExcel'
	import { fmtFloor } from '$lib/utils/floor'
	import type { FloorConfig } from '$lib/types/project'

	let { data = null, framesData = null, patchingData = null, library = [], floor, room, floors = [], projectId = '', projectName = '', floorFormat = 'L01', drawingId = '', db = new Firestore(), uid = '', onsave, onsaveframes, onsavepatching, onlibrarychange, onfloorchange, onroomchange, onupdatefloors, ondeletefloor, bare = false }: {
		data?: any
		framesData?: any
		patchingData?: any
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
		onsave?: (payload: any, changes: ChangeDetail[]) => void
		onsaveframes?: (payload: any, changes: ChangeDetail[]) => void
		onsavepatching?: (payload: any, changes: ChangeDetail[]) => void
		onlibrarychange?: (templates: DeviceTemplate[]) => void
		onfloorchange?: (floor: number) => void
		onroomchange?: (room: string) => void
		onupdatefloors?: (floors: FloorConfig[]) => void
		ondeletefloor?: (floor: number) => void
		/** When embedded (workspace / sheet viewport), skip standalone chrome. */
		bare?: boolean
	} = $props()

	const editor = new ElevationsEditor({
		onsave: (payload, changes) => onsave?.(payload, changes),
		onsaveframes: (payload, changes) => onsaveframes?.(payload, changes),
		onsavepatching: (payload, changes) => onsavepatching?.(payload, changes),
	})

	// Keep editor context + remote data in sync. Track only the props — the
	// editor methods read AND write their own $state, which inside a tracking
	// effect is an infinite loop (effect_update_depth_exceeded).
	$effect(() => {
		const p = projectId, f = floor, r = room
		untrack(() => editor.setLocation(p, f, r))
	})
	$effect(() => {
		const d = data
		untrack(() => editor.sync(d))
	})
	$effect(() => {
		const fd = framesData
		untrack(() => editor.syncFrames(fd))
	})
	$effect(() => {
		const pd = patchingData
		untrack(() => editor.syncPatching(pd))
	})
	$effect(() => {
		const cfg = floors.find(f => f.number === floor)?.serverRoomCount ?? 1
		const ff = floorFormat
		untrack(() => { editor.serverRoomCountCfg = cfg; editor.floorFormat = ff })
	})
	$effect(() => {
		const unsub = subscribeCatalog(db, list => { editor.catalog = list })
		return () => unsub?.()
	})

	// ── UI state owned by the shell ──
	let sidebarTab = $state<SidebarTab>('devices')
	$effect(() => {
		try { localStorage.setItem(`elevations-tab-${projectId}`, sidebarTab) } catch {}
	})
	onMount(() => {
		try {
			const saved = localStorage.getItem(`elevations-tab-${projectId}`) as SidebarTab | null
			if (saved) sidebarTab = saved
		} catch {}
	})
	let floorManagerOpen = $state(false)
	let versionPanelOpen = $state(false)
	let listPaneOpen = $state(false)
	/** Cords visibility toggle — Patch mode always shows them regardless. */
	let showCords = $state(true)
	onMount(() => {
		try { showCords = localStorage.getItem(`elevations-cords-${projectId}`) !== '0' } catch {}
	})
	$effect(() => {
		try { localStorage.setItem(`elevations-cords-${projectId}`, showCords ? '1' : '0') } catch {}
	})
	let cordsVisible = $derived(showCords || editor.mode === 'patch')
	let patchSettingsOpen = $state(false)
	let importStatus = $state<string | null>(null)
	let importInput: HTMLInputElement | undefined = $state()

	/** Frames-style panel label sheet export — same pipeline as the port labels. */
	function exportLabelSheets() {
		const fd = editor.framesData
		const labelFormat = fd?.labelFormat
			? {
				separator: fd.labelFormat.separator ?? 'legacy',
				includeZone: fd.labelFormat.includeZone ?? true,
				includeRoom: fd.labelFormat.includeRoom ?? false,
			}
			: undefined
		const zoneLetters = Object.keys(editor.zoneLocations).filter(z => editor.zoneLocations[z]?.length > 0).sort()
		const zoneConfigs: ZoneConfig[] = zoneLetters.map(z => ({
			floor, zone: z, serverRoomCount: editor.serverRoomCountCfg, locations: editor.zoneLocations[z],
		}))
		const labels = zoneConfigs.flatMap(zc => generatePortLabels(zc, floorFormat, labelFormat as any))
		const frames = deriveFramesFromRacks(
			{ [room]: { racks: $state.snapshot(editor.racks), devices: $state.snapshot(editor.devices) } },
			'front', fd?.frames,
		)
		const racksData = generateRacks(
			labels, editor.serverRoomCountCfg,
			frames.length > 0 ? frames : undefined,
			editor.reservationMap.size > 0 ? editor.reservationMap : undefined,
		)
		exportFrameLabels(racksData, zoneConfigs, fd?.excelGroupByRoom ?? true, floorFormat,
			editor.reservationMap.size > 0 ? editor.reservationMap : undefined)
	}

	async function handleCordIdImport(e: Event) {
		const input = e.target as HTMLInputElement
		const file = input.files?.[0]
		if (!file) return
		try {
			const cordMap = await importCordIds(file, $state.snapshot(editor.connections) as any)
			const updated = cordMap.size ? editor.applyCordIds(cordMap) : 0
			importStatus = updated ? `Imported ${updated} cord ID${updated !== 1 ? 's' : ''}` : 'No cord IDs found'
		} catch (err) {
			importStatus = `Import failed: ${err instanceof Error ? err.message : 'unknown error'}`
		}
		input.value = ''
		setTimeout(() => importStatus = null, 4000)
	}
	let confirmingDeleteRow = $state<string | null>(null)
	let confirmingDeleteRacks = $state(false)

	// Window dimensions (hint text only)
	let innerWidth = $state(1200)
	let innerHeight = $state(800)
	// Canvas viewport size — measured from the actual flex container, so the
	// canvas never overflows the Inspector/detail strip when panes resize.
	let canvasWidth = $state(800)
	let canvasHeight = $state(600)

	// ── Viewport: restore per floor+room, keep bottom reference in sync ──
	let viewKey = $derived(`elevations-view-${projectId}-F${floor}-R${room}`)
	$effect(() => {
		const key = viewKey
		untrack(() => {
			try {
				const saved = localStorage.getItem(key)
				if (saved) {
					const { x, y, zoom, focus } = JSON.parse(saved)
					editor.view.x = x; editor.view.y = y; editor.view.zoom = zoom
					// Restore the last focus so switching tools returns to the same rack view
					editor.focus = Array.isArray(focus) && focus.length ? { rackIds: focus } : null
				}
			} catch {}
		})
	})
	$effect(() => {
		editor.view.bottom = Math.max(editor.settings.ceilingLevel + 500, editor.maxRackHeight + 500)
	})
	let viewSaveTimer: ReturnType<typeof setTimeout> | null = null
	$effect(() => {
		const { x, y, zoom } = editor.view
		const focus = editor.focus?.rackIds ?? []
		const key = viewKey
		if (viewSaveTimer) clearTimeout(viewSaveTimer)
		viewSaveTimer = setTimeout(() => {
			try { localStorage.setItem(key, JSON.stringify({ x, y, zoom, focus })) } catch {}
		}, 300)
	})

	// ── Focus navigation ──
	let faceRacks = $derived(editor.face === 'rear' ? editor.rearRacks : editor.activeRacks)

	function unionRect(racks: { _x: number; _z: number; widthMm: number; heightMm: number }[]) {
		if (!racks.length) return null
		let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
		for (const r of racks) {
			const rr = screenRect(r)
			left = Math.min(left, rr.left); top = Math.min(top, rr.top)
			right = Math.max(right, rr.left + rr.width); bottom = Math.max(bottom, rr.top + rr.height)
		}
		return { left, top, width: right - left, height: bottom - top }
	}

	function fitRow() {
		const r = unionRect(faceRacks)
		if (r) editor.fitRect({ ...r, top: r.top - 100, height: r.height + 150 }, canvasWidth, canvasHeight)
	}

	function fitFocus() {
		if (!editor.focus) return
		const focused = faceRacks.filter(r => editor.focusedRackIds.has(r.id))
		const r = unionRect(focused)
		if (r) editor.fitRect(r, canvasWidth, canvasHeight, 30)
	}

	function onCanvasDblClick(e: MouseEvent) {
		const hit = hitTestRack(e.clientX, e.clientY, 1)
		if (hit) {
			editor.focusRack(hit.rack.id, e.shiftKey)
			fitFocus()
		}
	}

	/** Switch face keeping the same physical rack centered at the SAME zoom:
	 *  the rear layout is the front layout mirrored around the row extent, so
	 *  mirror the viewport centre with it — pan/zoom otherwise untouched. */
	function toggleFace(to?: 'front' | 'rear') {
		const list = faceRacks
		const last = list[list.length - 1]
		const rowEndPx = last ? (last._x + last.widthMm) * SCALE : 0
		const cx = (canvasWidth / 2 - editor.view.x) / editor.view.zoom
		editor.face = to ?? (editor.face === 'front' ? 'rear' : 'front')
		if (rowEndPx > 0) {
			editor.view.x = canvasWidth / 2 - (rowEndPx - cx) * editor.view.zoom
		}
	}

	const fmt = (fl: number) => fmtFloor(fl, floorFormat, floors)
	function roomLabel(rm: string): string {
		const floorCfg = floors.find(f => f.number === floor)
		return floorCfg?.roomNames?.[rm] || `Room ${rm}`
	}
	let availableRooms = $derived.by(() => {
		const cfg = floors.find(f => f.number === floor)
		return ['A', 'B', 'C', 'D'].slice(0, cfg?.serverRoomCount ?? 1)
	})

	// ── Palette drag-to-canvas (ported from Racks.svelte) ──
	let canvasEl: HTMLDivElement | undefined = $state()
	let draggingTemplate = $state<DeviceTemplate | null>(null)
	let ghostPos = $state({ x: 0, y: 0 })
	let dropGhost = $state<{ left: number; top: number; width: number; height: number } | null>(null)
	let paletteDragMoved = false

	function screenRect(rack: any) {
		return {
			left: rack._x * SCALE,
			top: (editor.view.bottom - rack._z - rack.heightMm) * SCALE,
			width: rack.widthMm * SCALE,
			height: rack.heightMm * SCALE,
		}
	}

	function hitTestRack(clientX: number, clientY: number, heightU: number) {
		if (!canvasEl) return null
		const rect = canvasEl.getBoundingClientRect()
		const cx = (clientX - rect.left - editor.view.x) / editor.view.zoom
		const cy = (clientY - rect.top - editor.view.y) / editor.view.zoom
		// Only the current face's layout — front and rear lists share the same
		// coordinate space (both start at x=0), so checking both hit the
		// mirrored rack and dropped devices on the wrong side of the row.
		const isRear = editor.face === 'rear'
		const allRacks = (isRear ? editor.rearRacks : editor.activeRacks).map(r => ({ rack: r, isRear }))
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
			editor.placeDevice(draggingTemplate, hit.rack.id, hit.snappedRU, hit.isRear ? { mounting: 'rear' } : undefined)
		}
		draggingTemplate = null
	}

	// ── Device drag within canvas (renderer callbacks) ──
	const isRUType = (t: string) => t !== 'desk' && t !== 'shelf' && t !== 'vcm'

	function snapOffsetX(rect: any, rr: any): number {
		const devMidX = rect.left + rect.width / 2
		const rackCenterX = rr.left + rr.width / 2
		return Math.round((devMidX - rackCenterX) / SCALE / 25) * 25
	}

	function findDropRack(midX: number, midY: number) {
		// Current face only — see hitTestRack comment (mirrored-rack drop bug).
		const isRear = editor.face === 'rear'
		for (const rack of (isRear ? editor.rearRacks : editor.activeRacks)) {
			const rr = screenRect(rack)
			if (midX >= rr.left && midX <= rr.left + rr.width && midY >= rr.top && midY <= rr.top + rr.height)
				return { rack, rr, isRear }
		}
		return null
	}

	function onDeviceDrag(rect: any, _mouse: any, item: any) {
		const midX = rect.left + rect.width / 2
		const midY = rect.top + rect.height / 2
		const devW = (item.widthMm ?? DEVICE_W_MM) * SCALE
		const hit = findDropRack(midX, midY)
		if (hit) {
			const { rack, rr, isRear } = hit
			const ruFromBottom = (rr.top + rr.height - rect.top - rect.height) / SCALE / RU_HEIGHT_MM
			const maxRU = isRUType(rack.type)
				? rack.heightU - item.heightU + 1
				: Math.floor(rack.heightMm / RU_HEIGHT_MM) - item.heightU + 1
			const snappedRU = Math.max(1, Math.min(maxRU, Math.round(ruFromBottom)))
			const ox = snapOffsetX(rect, rr) * (isRear ? -1 : 1)
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
		const devW = (device.widthMm ?? DEVICE_W_MM) * SCALE
		const hit = findDropRack(rect.left + rect.width / 2, rect.top + rect.height / 2)
		if (!hit) return
		const { rack, rr, isRear } = hit
		const ruFromBottom = (rr.top + rr.height - rect.top - rect.height) / SCALE / RU_HEIGHT_MM
		const maxRU = isRUType(rack.type)
			? rack.heightU - device.heightU + 1
			: Math.floor(rack.heightMm / RU_HEIGHT_MM) - device.heightU + 1
		const snappedRU = Math.max(1, Math.min(maxRU, Math.round(ruFromBottom)))
		const ox = snapOffsetX(rect, rr) * (isRear ? -1 : 1)
		if (copy) {
			editor.copyDevice(device, rack.id, snappedRU, ox)
		} else {
			editor.updateDevice(device.id, { rackId: rack.id, positionU: snappedRU, offsetX: ox })
		}
	}

	// ── Reference-line drags (floor / ceiling / walls) — one undo step per drag ──
	let editingLine = $state<string | null>(null)
	let lineDragField: 'floorLevel' | 'ceilingLevel' | 'leftWallX' | 'rightWallX' | null = null
	let lineDragStartVal = 0
	let lineDragStartMouse = 0

	function startLineDrag(e: MouseEvent, field: typeof lineDragField) {
		if (e.button !== 0) return
		e.preventDefault()
		e.stopPropagation()
		lineDragField = field
		lineDragStartVal = editor.settings[field!]
		const isHorizontal = field === 'leftWallX' || field === 'rightWallX'
		lineDragStartMouse = isHorizontal ? e.clientX : e.clientY
		document.body.style.userSelect = 'none'
		document.addEventListener('mousemove', onLineDragMove)
		document.addEventListener('mouseup', onLineDragEnd)
	}

	function onLineDragMove(e: MouseEvent) {
		if (!lineDragField) return
		const isHorizontal = lineDragField === 'leftWallX' || lineDragField === 'rightWallX'
		const delta = isHorizontal
			? (e.clientX - lineDragStartMouse) / (editor.view.zoom * SCALE)
			: -(e.clientY - lineDragStartMouse) / (editor.view.zoom * SCALE)
		editor.setSettingLive(lineDragField, Math.round(lineDragStartVal + delta))
	}

	function onLineDragEnd() {
		document.body.style.userSelect = ''
		document.removeEventListener('mousemove', onLineDragMove)
		document.removeEventListener('mouseup', onLineDragEnd)
		if (lineDragField) editor.commitSetting(lineDragField, lineDragStartVal)
		lineDragField = null
	}

	// ── Keyboard ──
	function onKeydown(e: KeyboardEvent) {
		const t = e.target as HTMLElement | null
		if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t?.isContentEditable) return
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
			e.preventDefault()
			e.shiftKey ? editor.redo() : editor.undo()
			return
		}
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
			e.preventDefault()
			editor.redo()
			return
		}
		if (e.key === 'f' || e.key === 'F') {
			toggleFace()
			return
		}
		if (e.key === '1') { fitRow(); return }
		if (e.key === '2') { if (editor.focus) fitFocus(); return }
		if (e.key === 'p' || e.key === 'P') { editor.mode = 'patch'; return }
		if (e.key === 'v' || e.key === 'V') { editor.mode = 'select'; editor.patchArm = null; editor.statusHint = null; return }
		if (e.key === 'Delete' || e.key === 'Backspace') {
			if (editor.selectedPorts.size > 0) {
				editor.removeReservation()
			} else if (editor.selectedConnectionId) {
				editor.deleteConnections([editor.selectedConnectionId])
			} else if (editor.selectedRacks.length > 0) {
				// Racks cascade their devices — confirm first.
				confirmingDeleteRacks = true
			} else if (editor.selectedDevices.length > 0) {
				editor.deleteSelection()
			}
			return
		}
		if (e.key === 'Escape') {
			// Cascade: dialog → patch arm → selection/port/cord → focus (row view)
			if (confirmingDeleteRacks) { confirmingDeleteRacks = false; return }
			if (editor.patchArm || editor.rerouteState) { editor.patchArm = null; editor.rerouteState = null; editor.statusHint = null; return }
			if (editor.selectedPorts.size > 0) { editor.clearPortBlock(); return }
			if (editor.selection.size > 0 || editor.selectedPort || editor.selectedConnectionId) { editor.clearSelection(); return }
			if (editor.focus) { editor.popFocus(); fitRow() }
		}
	}

	/** Track cursor in unscaled canvas coords for the patch rubber band. */
	function onCanvasMouseMove(e: MouseEvent) {
		if (!editor.patchArm || !canvasEl) return
		const rect = canvasEl.getBoundingClientRect()
		editor.cursor = {
			x: (e.clientX - rect.left - editor.view.x) / editor.view.zoom,
			y: (e.clientY - rect.top - editor.view.y) / editor.view.zoom,
		}
	}

	// ── Print (A3 landscape fit, ported from Racks) ──
	let printSavedView: { x: number; y: number; zoom: number; title: string } | null = null

	function setPrinting() {
		const wallW = 50, pad = 60
		const s = editor.settings
		const canvasLeft = (s.leftWallX - wallW - pad) * SCALE
		const canvasRight = (s.rightWallX + wallW + pad) * SCALE
		const canvasTop = (editor.view.bottom - s.ceilingLevel - 200 - pad) * SCALE
		const canvasBottom = (editor.view.bottom - s.slabLevel + 100 + pad) * SCALE
		const contentW = canvasRight - canvasLeft
		const contentH = canvasBottom - canvasTop
		const pageWmm = 420, pageHmm = 297, marginMm = 10
		const pxPerMm = 96 / 25.4
		const usableWpx = (pageWmm - 2 * marginMm) * pxPerMm
		const usableHpx = (pageHmm - 2 * marginMm) * pxPerMm
		const marginPx = marginMm * pxPerMm
		const printZoom = Math.min(usableWpx / contentW, usableHpx / contentH)
		printSavedView = { x: editor.view.x, y: editor.view.y, zoom: editor.view.zoom, title: document.title }
		document.title = `${projectName} - ${fmt(floor)} - ${roomLabel(room)} Elevation`
		editor.view.zoom = printZoom
		editor.view.x = marginPx - canvasLeft * printZoom
		editor.view.y = marginPx - canvasTop * printZoom
		updatePrintStyles()
	}

	function clrPrinting() {
		if (printSavedView) {
			document.title = printSavedView.title
			editor.view.x = printSavedView.x
			editor.view.y = printSavedView.y
			editor.view.zoom = printSavedView.zoom
			printSavedView = null
		}
	}

	function updatePrintStyles() {
		const id = 'elevations-print-style'
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
		document.getElementById('elevations-print-style')?.remove()
	})
</script>

<svelte:window bind:innerHeight bind:innerWidth onkeydown={onKeydown} />

<!-- Row delete confirmation -->
{#if confirmingDeleteRow}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="fixed inset-0 bg-black/30 z-50 flex items-center justify-center print:hidden" onclick={() => confirmingDeleteRow = null}>
		<div class="bg-white rounded-lg shadow-xl border border-gray-200 p-4 w-72" onclick={e => e.stopPropagation()}>
			<p class="text-sm text-gray-700 mb-3">Delete <strong>{editor.rows.find(r => r.id === confirmingDeleteRow)?.label}</strong>? All racks and devices in this row will be removed.</p>
			<div class="flex gap-2 justify-end">
				<button class="px-3 py-1.5 text-xs rounded border border-gray-200 hover:bg-gray-50" onclick={() => confirmingDeleteRow = null}>Cancel</button>
				<button class="px-3 py-1.5 text-xs rounded bg-red-600 text-white hover:bg-red-500" onclick={() => { editor.deleteRow(confirmingDeleteRow!); confirmingDeleteRow = null }}>Delete</button>
			</div>
		</div>
	</div>
{/if}

<!-- Rack delete confirmation (Delete key on selected racks) -->
{#if confirmingDeleteRacks}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="fixed inset-0 bg-black/30 z-50 flex items-center justify-center print:hidden" onclick={() => confirmingDeleteRacks = false}>
		<div class="bg-white rounded-lg shadow-xl border border-gray-200 p-4 w-72" onclick={e => e.stopPropagation()}>
			<p class="text-sm text-gray-700 mb-3">
				Delete {editor.selectedRacks.length} rack{editor.selectedRacks.length !== 1 ? 's' : ''}{editor.selectedDevices.length ? ` and ${editor.selectedDevices.length} device(s)` : ''}?
				Devices mounted in deleted racks are removed too.
			</p>
			<div class="flex gap-2 justify-end">
				<button class="px-3 py-1.5 text-xs rounded border border-gray-200 hover:bg-gray-50" onclick={() => confirmingDeleteRacks = false}>Cancel</button>
				<button class="px-3 py-1.5 text-xs rounded bg-red-600 text-white hover:bg-red-500" onclick={() => { editor.deleteSelection(); confirmingDeleteRacks = false }}>Delete</button>
			</div>
		</div>
	</div>
{/if}

<main class="{bare ? 'h-full' : 'h-dvh'} w-full overflow-hidden flex flex-col">
	{#if !bare}
		<Titlebar menu={true} title={projectName ? `${projectName} — Elevations` : 'Elevations'}>
			{#if drawingId}
				<button class="flex items-center gap-1 px-2 py-0.5 rounded text-xs hover:bg-white/20 transition-colors"
					onclick={() => versionPanelOpen = !versionPanelOpen} title="Version History">
					<Icon name="history" size={14} /> Versions
				</button>
			{/if}
		</Titlebar>
	{/if}

	<PaneGroup direction="horizontal" class="flex-1 min-h-0">
		<!-- Sidebar -->
		<Pane defaultSize={20} minSize={15} maxSize={35}>
			<div class="h-full border-r border-gray-200 flex flex-col print:hidden">
				<div class="flex border-b border-gray-200 shrink-0">
					{#each [['racks', 'Racks'], ['devices', 'Devices'], ['library', 'Library'], ['catalog', 'Catalog'], ['locations', 'Locations'], ['bom', 'BOM']] as [tab, label]}
						<button
							class="flex-1 py-1.5 text-[11px] font-medium transition-colors
								{sidebarTab === tab ? 'text-blue-600 border-b-2 border-blue-500 bg-white' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}"
							onclick={() => sidebarTab = tab as SidebarTab}
						>{label}</button>
					{/each}
				</div>

				<div class="flex-1 min-h-0 overflow-y-auto">
					{#if sidebarTab === 'racks'}
						{@const activeRow = editor.rows.find(r => r.id === editor.activeRowId)}
						{#if activeRow}
							<RowEditor
								row={activeRow}
								racks={editor.racks}
								catalog={editor.catalog}
								onrename={label => editor.renameRow(activeRow.id, label)}
								onupdate={partial => editor.updateRowDefaults(activeRow.id, partial as any)}
								onquickfill={(kind, pid) => editor.quickFillRow(activeRow.id, kind, pid)}
								onaddn={(pid, count) => editor.addRacksFromCatalog(activeRow.id, pid, count)}
								oncopyrowdefaults={() => editor.copyRowDefaultsToAllRacks(activeRow.id)} />
						{/if}
						<RackList racks={editor.racks} rows={editor.rows} activeRowId={editor.activeRowId} selectedIds={editor.selection}
							onadd={form => editor.addRack(form)}
							onselect={(id, multi) => editor.select(id, multi)}
							onrangeselect={ids => editor.rangeSelect(ids)}
							ondelete={id => editor.deleteRack(id)}
							onaddrow={() => editor.addRow()}
							onreorder={ids => editor.reorderRacks(ids)} />
					{:else if sidebarTab === 'devices'}
						<RackDevices racks={editor.activeRacks} devices={editor.devices} selectedIds={editor.selection}
							onselect={(id, multi) => editor.select(id, multi)}
							onrangeselect={ids => editor.rangeSelect(ids)}
							ondelete={id => editor.deleteDevice(id)} />
					{:else if sidebarTab === 'library'}
						<DevicePalette {library} ondragstart={onPaletteDragStart}
							oncustomadd={template => {
								const exists = library.some(item => item.id === template.id)
								const updated = exists
									? library.map(item => item.id === template.id ? template : item)
									: [...library, template]
								onlibrarychange?.(updated)
								editor.logChange(exists ? 'update' : 'add', 'library', template.label)
							}} />
					{:else if sidebarTab === 'catalog'}
						<CatalogBrowser
							products={editor.catalog}
							contextRow={editor.rows.find(r => r.id === editor.activeRowId)}
							onadd={p => editor.addRackFromCatalog(p)}
							onaddcustom={async (product: Omit<CatalogProduct, 'seeded'>) => { await saveCustomProduct(db, product, uid, projectId) }}
							ondelete={async (id: string) => { await deleteCustomProduct(db, id) }} />
					{:else if sidebarTab === 'locations'}
						<div class="p-2 space-y-2">
							<div class="relative flex items-center gap-1.5 text-[11px] text-gray-500 whitespace-nowrap">
								<span class="font-semibold uppercase tracking-wide">Zone locations</span>
								<div class="flex-1"></div>
								<!-- Absolute: appearing/disappearing must never reflow the list -->
								{#if editor.framesAutosave.status !== 'saved'}
									<span class="absolute right-12 top-1/2 -translate-y-1/2 text-[10px] text-amber-500 bg-white/90 px-1 rounded pointer-events-none">Unsaved</span>
								{/if}
								<button class="px-1.5 h-5 rounded border border-gray-200 bg-white hover:bg-gray-100 text-[10px] text-gray-600"
									title="Export panel label sheets to Excel (Frames format)"
									onclick={exportLabelSheets}>Export</button>
							</div>
							<ConfigPanel
								{floor}
								serverRoomCount={editor.serverRoomCountCfg}
								activeZone={editor.activeZone}
								locations={editor.zoneLocations[editor.activeZone] ?? []}
								floorLabel={fmt(floor)}
								onserverrooms={() => {}}
								onzone={z => editor.setActiveZone(z)}
								ongenerate={count => editor.generateLocations(count)} />
							<LocationList
								locations={editor.zoneLocations[editor.activeZone] ?? []}
								hasTwoRooms={editor.serverRoomCountCfg > 1}
								selectedLocations={editor.locationSelection}
								customTypes={editor.framesData?.customLocationTypes ?? []}
								zoneForLoc={() => editor.activeZone}
								onupdate={(i, loc) => editor.updateLocation(i, loc)}
								onselect={(key, e) => editor.selectLocation(key, e)} />
						</div>
					{:else if sidebarTab === 'bom'}
						<BOMPanel rows={editor.rows} racks={editor.racks} activeRowId={editor.activeRowId} catalog={editor.catalog}
							{projectName}
							floorLabel={fmt(floor)}
							roomLabel={roomLabel(room)} />
					{/if}
				</div>
			</div>
		</Pane>

		<Handle withHandle />

		<!-- Toolbar + canvas + inspector + status bar -->
		<Pane defaultSize={80}>
			<div class="h-full flex flex-col">
				<!-- Toolbar: rooms · rows · face · undo/redo · save status -->
				<div class="h-8 px-2 flex items-center gap-3 border-b border-gray-200 bg-gray-50 shrink-0 print:hidden">
					<div class="flex items-center gap-1">
						<span class="text-[10px] text-gray-400 uppercase tracking-wide">Room</span>
						{#each availableRooms as rm}
							<button
								class="px-2 h-6 rounded text-[11px] font-medium transition-colors
									{room === rm ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-200'}"
								onclick={() => onroomchange?.(rm)}
							>{roomLabel(rm)}</button>
						{/each}
					</div>

					<div class="w-px h-4 bg-gray-200"></div>

					<div class="flex items-center gap-1 min-w-0 overflow-x-auto">
						<span class="text-[10px] text-gray-400 uppercase tracking-wide">Row</span>
						{#each editor.rows as row (row.id)}
							<div class="group relative flex items-center">
								<button
									class="px-2 h-6 rounded text-[11px] font-medium transition-colors whitespace-nowrap
										{editor.activeRowId === row.id ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-200'}"
									onclick={() => editor.activeRowId = row.id}
								>{row.label}</button>
								{#if editor.rows.length > 1}
									<button
										class="hidden group-hover:flex absolute -top-1 -right-1 w-3.5 h-3.5 items-center justify-center rounded-full bg-gray-300 hover:bg-red-500 text-white text-[9px] leading-none"
										title="Delete row"
										onclick={() => confirmingDeleteRow = row.id}
									>×</button>
								{/if}
							</div>
						{/each}
						<button class="px-1.5 h-6 rounded text-gray-400 hover:bg-gray-200" title="Add row" onclick={() => editor.addRow()}>
							<Icon name="plus" size={12} />
						</button>
					</div>

					<div class="w-px h-4 bg-gray-200"></div>

					<!-- Mode -->
					<div class="flex rounded border border-gray-200 overflow-hidden" role="radiogroup" aria-label="Mode">
						{#each [['select', 'Select', 'V'], ['patch', 'Patch', 'P']] as [m, label, key]}
							<button
								class="px-2.5 h-6 text-[11px] font-medium transition-colors
									{editor.mode === m ? (m === 'patch' ? 'bg-emerald-500 text-white' : 'bg-blue-500 text-white') : 'bg-white text-gray-500 hover:bg-gray-100'}"
								title="{label} mode ({key})"
								onclick={() => { editor.mode = m as 'select' | 'patch'; editor.patchArm = null; editor.statusHint = null }}
							>{label}</button>
						{/each}
					</div>

					{#if editor.mode === 'patch'}
						<select class="h-6 px-1 text-[11px] border border-gray-200 rounded bg-white max-w-32"
							title="Cable type for new cords"
							value={editor.stickyCable.type}
							onchange={e => editor.stickyCable = { ...editor.stickyCable, type: e.currentTarget.value }}>
							{#each CABLE_TYPES as ct}
								<option value={ct.id}>{ct.label}</option>
							{/each}
							{#each editor.customCableTypes as ct}
								<option value={ct.id}>{ct.label}</option>
							{/each}
						</select>
						<select class="h-6 px-1 text-[11px] border border-gray-200 rounded bg-white"
							title="Status for new cords"
							value={editor.stickyCable.status}
							onchange={e => editor.stickyCable = { ...editor.stickyCable, status: e.currentTarget.value as any }}>
							<option value="add">Add</option>
							<option value="installed">Installed</option>
						</select>
					{/if}

					<div class="flex-1"></div>

					<!-- Face toggle -->
					<div class="flex rounded border border-gray-200 overflow-hidden" role="radiogroup" aria-label="Face">
						{#each [['front', 'Front'], ['rear', 'Rear']] as [f, label]}
							<button
								class="px-2.5 h-6 text-[11px] font-medium transition-colors
									{editor.face === f ? 'bg-blue-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-100'}"
								title="{label} view (F)"
								onclick={() => { if (editor.face !== f) toggleFace(f as 'front' | 'rear') }}
							>{label}</button>
						{/each}
					</div>

					<div class="w-px h-4 bg-gray-200"></div>

					<button class="p-1 rounded transition-colors {cordsVisible ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100' : 'text-gray-400 hover:bg-gray-200'}"
						title={editor.mode === 'patch'
							? 'Patch cords (always shown in Patch mode)'
							: showCords ? 'Hide patch cords' : 'Show patch cords'}
						onclick={() => showCords = !showCords}>
						<Icon name="cable" size={14} />
					</button>

					<button class="p-1 rounded text-gray-500 hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-transparent"
						disabled={!editor.history.canUndo} title="Undo (Ctrl+Z)" onclick={() => editor.undo()}>
						<Icon name="undo" size={14} />
					</button>
					<button class="p-1 rounded text-gray-500 hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-transparent"
						disabled={!editor.history.canRedo} title="Redo (Ctrl+Shift+Z)" onclick={() => editor.redo()}>
						<Icon name="redo" size={14} />
					</button>

					<span class="text-[10px] w-12 text-right
						{editor.autosave.status === 'saved' ? 'text-gray-300' : editor.autosave.status === 'saving' ? 'text-blue-400' : 'text-amber-500'}">
						{editor.autosave.status === 'saved' ? 'Saved' : editor.autosave.status === 'saving' ? 'Saving…' : 'Unsaved'}
					</span>
				</div>

				<!-- Breadcrumb (focus navigation) -->
				{#if editor.focus}
					<div class="h-6 px-2 flex items-center gap-1.5 border-b border-gray-200 bg-blue-50/50 text-[11px] shrink-0 print:hidden">
						<span class="text-gray-500">{roomLabel(room)}</span>
						<span class="text-gray-300">▸</span>
						<span class="text-gray-500">{editor.rows.find(r => r.id === editor.activeRowId)?.label ?? ''}</span>
						<span class="text-gray-300">▸</span>
						{#each editor.focus.rackIds as rid (rid)}
							{@const r = editor.racks.find(r => r.id === rid)}
							<span class="flex items-center gap-0.5 pl-1.5 pr-0.5 h-4.5 rounded bg-blue-100 text-blue-700 font-medium">
								{r?.label ?? rid}
								<button class="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-blue-200 leading-none"
									title="Remove from focus"
									onclick={() => { editor.unfocusRack(rid); editor.focus ? fitFocus() : fitRow() }}>×</button>
							</span>
						{/each}
						<div class="flex-1"></div>
						<span class="text-gray-400">Esc: back to row · Shift+dbl-click: add rack</span>
					</div>
				{/if}

				<!-- Block-assign bar: appears while ports are multi-selected (Ctrl+click) -->
				{#if editor.selectedPorts.size > 0}
					<div class="h-7 px-2 flex items-center gap-1.5 border-b border-purple-200 bg-purple-50 text-[11px] shrink-0 print:hidden">
						<span class="font-semibold text-purple-700">{editor.selectedPorts.size} port{editor.selectedPorts.size !== 1 ? 's' : ''}</span>
						<span class="text-purple-400">reserve as:</span>
						{#each [...DEFAULT_LOC_TYPES.filter(t => t !== 'N/A'), ...(editor.framesData?.customLocationTypes ?? [])] as t}
							<button
								class="px-1.5 h-5 rounded border text-[10px] font-mono {LOC_TYPE_COLORS[t] ?? 'bg-gray-100 border-gray-200 text-gray-600'} hover:brightness-95"
								title={LOC_TYPE_LABELS[t] ?? t}
								onclick={() => editor.assignReservation(t)}
							>{t}</button>
						{/each}
						<div class="w-px h-4 bg-purple-200"></div>
						<button class="px-1.5 h-5 rounded border border-red-200 bg-white text-red-600 hover:bg-red-50 text-[10px]"
							title="Remove reservation from selected ports (Del)"
							onclick={() => editor.removeReservation()}>Remove</button>
						<button class="px-1.5 h-5 rounded border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 text-[10px]"
							onclick={() => editor.clearPortBlock()}>Deselect</button>
						<div class="flex-1"></div>
						<span class="text-purple-300">Ctrl+click add · Shift+click range · reservations steer label allocation</span>
					</div>
				{/if}

				<div class="flex-1 min-h-0 flex">
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="flex-1 min-w-0 relative overflow-hidden" onclick={() => { if (!editor.view.dragging) editor.clearSelection() }}
						ondblclick={onCanvasDblClick} onmousemove={onCanvasMouseMove} bind:this={canvasEl}
						bind:clientWidth={canvasWidth} bind:clientHeight={canvasHeight}>
						<PanZoomCanvas bind:view={editor.view} width={canvasWidth} height={canvasHeight}
							singleTouchPan canPanAt={(t) => !(t as Element | null)?.closest?.('.drag')}
							onBackgroundTap={() => { if (!editor.view.dragging) editor.clearSelection() }}>
							<RackElevationRenderer view={editor.view} settings={editor.settings}
								activeRacks={editor.activeRacks} rearRacks={editor.rearRacks} face={editor.face}
								devices={editor.devices} selectedIds={editor.selection} {dropGhost}
								rackOverlaps={editor.rackOverlaps} {editingLine}
								floorLabel={fmt(floor)} roomLabel={roomLabel(room)}
								onstarttlinedrag={startLineDrag}
								oneditline={field => editingLine = field}
								oncleareditline={() => editingLine = null}
								onsettingchange={(field, value) => {
									const before = editor.settings[field as keyof RackSettings] as number
									editor.setSettingLive(field as keyof RackSettings, value as number)
									editor.commitSetting(field as keyof RackSettings, before)
								}}
								ondevicedrag={onDeviceDrag}
								ondevicedragged={onDeviceDragged}
								ondeletedevice={id => editor.deleteDevice(id)}
								onselectdevice={id => editor.select(id)} />
							<PortsLayer {editor} />
							<CordsLayer {editor} visible={cordsVisible} />
							<!-- Focus dimming: non-focused racks fade; pointer-events pass through -->
							{#if editor.focus}
								{#each faceRacks.filter(r => !editor.focusedRackIds.has(r.id)) as rack (rack.id)}
									{@const rr = screenRect(rack)}
									<div class="absolute bg-white/65 pointer-events-none" style:z-index="4"
										style:left="{rr.left - 2}px" style:top="{rr.top - 26}px"
										style:width="{rr.width + 4}px" style:height="{rr.height + 28}px"></div>
								{/each}
							{/if}
						</PanZoomCanvas>
					</div>

					<Inspector {editor} onopenlocations={zone => {
						sidebarTab = 'locations'
						if (zone) editor.setActiveZone(zone)
					}} />
				</div>

				<PanelDetailStrip {editor} onclose={() => editor.clearSelection()} />

				<!-- Patch list (collapsible bottom panel) -->
				<div class="border-t border-gray-200 bg-white shrink-0 print:hidden">
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="w-full h-6 px-2 flex items-center gap-2 text-[11px] bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer select-none"
						onclick={() => listPaneOpen = !listPaneOpen}>
						<Icon name={listPaneOpen ? 'chevronDown' : 'chevronUp'} size={12} />
						<span class="font-semibold text-gray-600">Patch list</span>
						<span class="text-gray-400">{editor.connections.length} cord{editor.connections.length !== 1 ? 's' : ''}{editor.removedCount ? ` · ${editor.removedCount} marked remove` : ''}</span>
						<div class="flex-1"></div>
						{#if importStatus}
							<span class="text-blue-500">{importStatus}</span>
						{/if}
						{#if editor.orphanedIds.size > 0}
							<span class="text-amber-500">{editor.orphanedIds.size} orphaned</span>
						{/if}
						<span class="flex items-center gap-1.5" onclick={e => e.stopPropagation()}>
							<button class="px-1.5 h-4.5 rounded border border-gray-200 bg-white hover:bg-gray-100 text-[10px] text-gray-600"
								title="Export patch schedule + BOM to Excel"
								onclick={() => exportPatchExcel({
									connections: $state.snapshot(editor.connections) as any,
									racks: $state.snapshot(editor.racks),
									devices: $state.snapshot(editor.devices),
									customCableTypes: $state.snapshot(editor.customCableTypes) as any,
									projectName, floor, room,
									portInfoMap: editor.portInfo,
								})}>Export</button>
							<button class="px-1.5 h-4.5 rounded border border-gray-200 bg-white hover:bg-gray-100 text-[10px] text-gray-600"
								title="Import vendor cord IDs from a returned Excel file"
								onclick={() => importInput?.click()}>Import IDs</button>
							<button class="px-1 h-4.5 rounded text-gray-400 hover:bg-gray-100" title="Patching settings & custom cable types"
								onclick={() => patchSettingsOpen = true}>
								<Icon name="settings" size={11} />
							</button>
						</span>
					</div>
					<input type="file" accept=".xlsx" class="hidden" bind:this={importInput} onchange={handleCordIdImport} />
					{#if listPaneOpen}
						<div class="h-56 overflow-hidden">
							<PatchListPane
								connections={editor.connections}
								racks={editor.racks}
								devices={editor.devices}
								customCableTypes={editor.customCableTypes}
								orphanedIds={editor.orphanedIds}
								selectedConnectionId={editor.selectedConnectionId}
								removedCount={editor.removedCount}
								portInfoMap={editor.portInfo}
								onselect={id => editor.selectConnection(id)}
								ontoggle={() => listPaneOpen = false}
								onsetstatus={(ids, s) => editor.setConnectionStatus(ids, s)}
								ondelete={ids => editor.deleteConnections(ids)}
								onrestore={ids => editor.restoreConnections(ids)}
								onpurge={() => editor.purgeRemoved()}
								onupdate={(id, u) => editor.updateConnection(id, u)} />
						</div>
					{/if}
				</div>

				<!-- Status bar -->
				<div class="h-7 flex items-stretch border-t border-gray-200 bg-gray-50 shrink-0 print:hidden">
					<FloorTabs {floors} {floor} {floorFormat} {onfloorchange} onmanage={() => floorManagerOpen = true} />
					<div class="flex-1"></div>
					<div class="flex items-center gap-4 px-3 text-[10px] text-gray-400">
						{#if editor.statusHint}
							<span class="text-emerald-600 font-medium">{editor.statusHint}</span>
						{:else if editor.mode === 'patch'}
							<span class="text-emerald-600">Patch mode — click two labeled ports to connect · Esc to exit</span>
						{:else if innerWidth > 1200}
							<span class="text-gray-500">Ctrl+Scroll zoom · Right-drag pan · F front/rear · P patch mode · Ctrl+drag copies</span>
						{/if}
						<span>{editor.activeRacks.length} rack{editor.activeRacks.length !== 1 ? 's' : ''} · {editor.devices.length} device{editor.devices.length !== 1 ? 's' : ''}</span>
						<span>Zoom: {Math.round(editor.view.zoom * 100)}%</span>
					</div>
				</div>
			</div>
		</Pane>
	</PaneGroup>
</main>

<!-- Palette drag ghost (follows cursor) -->
{#if draggingTemplate}
	<div class="fixed pointer-events-none z-50 px-2 py-1 bg-blue-100 border border-blue-400 rounded text-xs font-medium text-blue-800 shadow-lg opacity-80 print:hidden"
		style:left={ghostPos.x + 12 + 'px'} style:top={ghostPos.y - 10 + 'px'}>
		{draggingTemplate.label} ({draggingTemplate.heightU}U)
	</div>
{/if}

<PatchSettingsDialog
	open={patchSettingsOpen}
	settings={editor.patchSettings}
	customCableTypes={editor.customCableTypes}
	onclose={() => patchSettingsOpen = false}
	onsavesettings={s => editor.savePatchSettings(s)}
	onsavecabletypes={types => editor.saveCustomCableTypes(types)}
/>

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
		currentSnapshot={() => ({
			floor, room,
			rows: $state.snapshot(editor.rows),
			racks: $state.snapshot(editor.racks),
			devices: $state.snapshot(editor.devices),
			library,
			settings: $state.snapshot(editor.settings),
			roomObjects: $state.snapshot(editor.roomObjects),
		})}
		onrestore={(snapshot: any) => {
			editor.mutate('restore', 'version', undefined, () => {
				if (snapshot.rows) editor.rows = snapshot.rows
				if (snapshot.racks) editor.racks = snapshot.racks
				if (snapshot.devices) editor.devices = snapshot.devices
				if (snapshot.settings) editor.settings = snapshot.settings
				if (Array.isArray(snapshot.roomObjects)) editor.roomObjects = snapshot.roomObjects
			})
			editor.autosave.flush()
		}}
	/>
{/if}
