<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte'
	import { Icon } from '$lib'
	import { PdfState } from '../../uploads/parts/PdfState.svelte.ts'
	import type { OutletConfig, PageCalibration, Point, ToolMode, RackPlacement, SidebarTab } from './types'
	import type { RackConfig } from '../../racks/parts/types'
	import { OUTLET_RADIUS_MM, USAGE_COLORS } from './constants'
	import type { TrunkConfig, TrunkNode, TrunkSegment } from '../trunks/types'
	import { trunkWidthMm } from '../trunks/types'
	import { hitTestNode, hitTestSegment, hitTestTrunkBody, constrainAngle, generateTrunkPolygons, genId, snapToNearby, snapToGrid, dist, type SnapTarget } from '../trunks/geometry'
	import { SNAP_THRESHOLD_MM } from '../trunks/constants'
	import TrunkRenderer from '../trunks/TrunkRenderer.svelte'
	import OutletShape from './OutletShape.svelte'
	import OutletRack from './OutletRack.svelte'
	import type TrunkPalette from '../trunks/TrunkPalette.svelte'
	import { PrintToolbar, triggerPrint, updatePrintStyles, removePrintStyles, paperDimsMm, type PrintSettings, DEFAULT_PRINT_SETTINGS } from '$lib/ui/print'

	let { file, page = 1, viewKey = '', calibration, outlets, selectedIds, activeTool=$bindable(), sidebarTab = 'outlets',
		rackPlacements = [], rackConfigs = [], selectedRackIds = new Set(),
		trunks = [], secondaryRoutes = [], nodeFillMap = new Map(), selectedTrunkIds = new Set(), selectedNodeIds = new Set(), trunkPalette,
		outletTypeCounts = { wall: 0, floor: 0, box: 0 },
		legendPos = $bindable({ x: 12, y: 12 }),
		printSettings = $bindable({ ...DEFAULT_PRINT_SETTINGS }),
		projectName = '', floor = 0,
		gridMm = 0,
		toPx, toMm, onadd, onselect, onclear, onmove, onmoveend, ondelete,
		onselectrack, onmoveracks, onmoveracksend, onplacerack, onremoveracks, onrotateracks,
		onaddtrunk, ontrunkdrawingchange, onselecttrunk, onselecttrunknode, onmovetrunknodes, onmovetrunknodesend, ondeletetrunks, onsplittrunksegment, ondisconnecttrunknode,
		onexport, onzoomchange }: {
		file: any
		page: number
		viewKey?: string
		calibration: PageCalibration | null
		outlets: OutletConfig[]
		selectedIds: Set<string>
		activeTool: ToolMode
		sidebarTab?: SidebarTab
		rackPlacements?: RackPlacement[]
		rackConfigs?: (RackConfig & { room: string })[]
		selectedRackIds?: Set<string>
		trunks?: TrunkConfig[]
		secondaryRoutes?: { outletId: string; from: Point; to: Point; room: string; color: string; trunkId: string; cableCount: number }[]
		nodeFillMap?: Map<string, { cableCount: number; cableAreaMm2: number; trunkAreaMm2: number; fillRatio: number; byType: Record<string, number> }>
		selectedTrunkIds?: Set<string>
		selectedNodeIds?: Set<string>
		trunkPalette?: TrunkPalette
		outletTypeCounts?: { wall: number; floor: number; box: number }
		legendPos?: Point
		printSettings?: PrintSettings
		projectName?: string
		floor?: number
		gridMm?: number
		toPx: (mm: Point) => Point
		toMm: (px: Point) => Point
		onadd: (pagePosPixels: Point) => void
		onselect: (id: string, multi: boolean) => void
		onclear: () => void
		onmove: (ids: Set<string>, dxMm: number, dyMm: number, copying: boolean) => void
		onmoveend: (ids: Set<string>, copying: boolean) => void
		ondelete: () => void
		onselectrack?: (rackId: string, multi: boolean) => void
		onmoveracks?: (ids: Set<string>, dxMm: number, dyMm: number, absolute?: boolean) => void
		onmoveracksend?: (ids: Set<string>) => void
		onplacerack?: (rackId: string, room: string, position: Point) => void
		onremoveracks?: () => void
		onrotateracks?: () => void
		onaddtrunk?: (nodes: TrunkNode[], segments: TrunkSegment[], snaps?: Map<string, { trunkId: string; nodeId: string }>) => void
		ontrunkdrawingchange?: (active: boolean) => void
		onselecttrunk?: (trunkId: string, multi: boolean) => void
		onselecttrunknode?: (nodeId: string, multi: boolean) => void
		onmovetrunknodes?: (trunkId: string, nodeIds: Set<string>, dxMm: number, dyMm: number, independent?: boolean, absolute?: boolean) => void
		onmovetrunknodesend?: (trunkId: string, nodeIds: Set<string>, independent?: boolean) => void
		ondeletetrunks?: () => void
		onsplittrunksegment?: (trunkId: string, segmentId: string, point: Point) => void
		ondisconnecttrunknode?: (trunkId: string, nodeId: string, segmentId: string) => string | null
		onexport?: () => void
		onzoomchange?: (zoom: number) => void
	} = $props()

	let containerEl: HTMLDivElement
	let canvasEl: HTMLCanvasElement
	let pdf: PdfState | null = null

	// ── View visibility bitmask ──
	const VIEW_LOW_OUTLETS  = 1 << 0  // 1
	const VIEW_HIGH_OUTLETS = 1 << 1  // 2
	const VIEW_LOW_TRUNKS   = 1 << 2  // 4
	const VIEW_HIGH_TRUNKS  = 1 << 3  // 8
	const VIEW_ROUTES       = 1 << 4  // 16
	const VIEW_LABELS       = 1 << 5  // 32
	const VIEW_LEGEND       = 1 << 6  // 64
	const VIEW_RACKS        = 1 << 7  // 128
	const VIEW_TITLEBLOCK   = 1 << 8  // 256
	const VIEW_ALL = VIEW_LOW_OUTLETS | VIEW_HIGH_OUTLETS | VIEW_LOW_TRUNKS | VIEW_HIGH_TRUNKS | VIEW_ROUTES | VIEW_LABELS | VIEW_LEGEND | VIEW_RACKS | VIEW_TITLEBLOCK
	const VIEW_DEFAULT = VIEW_LOW_OUTLETS | VIEW_HIGH_OUTLETS | VIEW_LOW_TRUNKS | VIEW_HIGH_TRUNKS | VIEW_ROUTES | VIEW_LEGEND | VIEW_RACKS | VIEW_TITLEBLOCK

	function viewStorageKeyView() { return viewKey ? `outlets-view-flags:${viewKey}` : '' }

	let viewFlags = $state(VIEW_DEFAULT)
	let viewMenuOpen = $state(false)

	// Restore view flags from localStorage
	$effect(() => {
		const key = viewStorageKeyView()
		if (!key) return
		try {
			const raw = localStorage.getItem(key)
			if (raw != null) viewFlags = parseInt(raw) || VIEW_ALL
		} catch {}
	})

	// Persist view flags
	$effect(() => {
		const key = viewStorageKeyView()
		if (!key) return
		try { localStorage.setItem(key, String(viewFlags)) } catch {}
	})

	function toggleViewFlag(flag: number) { viewFlags ^= flag }
	function hasViewFlag(flag: number): boolean { return (viewFlags & flag) !== 0 }

	const VIEW_MENU_ITEMS = [
		{ flag: VIEW_LOW_OUTLETS,  label: 'Low outlets' },
		{ flag: VIEW_HIGH_OUTLETS, label: 'High outlets' },
		{ flag: VIEW_LOW_TRUNKS,   label: 'Low trunks' },
		{ flag: VIEW_HIGH_TRUNKS,  label: 'High trunks' },
		{ flag: VIEW_LABELS,       label: 'Trunk labels' },
		{ flag: VIEW_ROUTES,       label: 'Secondary routes' },
		{ flag: VIEW_RACKS,        label: 'Racks' },
		{ flag: VIEW_LEGEND,       label: 'Legend' },
		{ flag: VIEW_TITLEBLOCK,   label: 'Title block' },
	]

	// ── Printing state ──
	let printing = $state(false)

	/**
	 * paperScale: the CSS zoom level for printing.
	 * Container is sized in mm (e.g. 420mm for A3 landscape).
	 * In CSS, 1mm = 96/25.4 px. So container = paperW * 96/25.4 CSS px.
	 * Paper covers paperW * scale mm real world = paperW * scale / sf PDF pixels.
	 * zoom = containerCSSPx / pdfPixels = (paperW * 96/25.4) / (paperW * scale / sf)
	 *      = 96 * sf / (25.4 * scale)
	 */
	const CSS_PX_PER_MM = 96 / 25.4

	function getPaperScale(): number {
		if (!calibration) return 1
		const effectiveScale = printSettings.scale || 100
		return CSS_PX_PER_MM * calibration.scaleFactor / effectiveScale
	}

	function handlePrint() {
		triggerPrint(printSettings, '.print-canvas-container')
	}

	/** Center paper on current viewport */
	function handleSetView() {
		if (!calibration) return
		const ps = paperScreenDims()
		if (!ps) return
		// Compute mm at the center of the viewport, offset by half paper size
		const centerPageX = ((containerEl?.clientWidth ?? cw) / 2 - vx) / zoom
		const centerPageY = ((containerEl?.clientHeight ?? ch) / 2 - vy) / zoom
		const centerMm = toMm({ x: centerPageX, y: centerPageY })
		const dims = paperDimsMm(printSettings)
		const effectiveScale = printSettings.scale || 100
		printSettings = { ...printSettings, drawingOffset: {
			x: centerMm.x - dims.w * effectiveScale / 2,
			y: centerMm.y - dims.h * effectiveScale / 2,
		}}
	}

	/** Paper dimensions in screen pixels (zoom-dependent) */
	function paperScreenDims(): { w: number; h: number; mPx: number } | null {
		if (!calibration) return null
		const dims = paperDimsMm(printSettings)
		const effectiveScale = printSettings.scale || 100
		const sf = calibration.scaleFactor
		return {
			w: (dims.w * effectiveScale / sf) * zoom,
			h: (dims.h * effectiveScale / sf) * zoom,
			mPx: (printSettings.margins * effectiveScale / sf) * zoom,
		}
	}

	/** Paper screen rect — moves with drawing via drawingOffset + vx/vy/zoom */
	let paperScreen = $derived.by(() => {
		if (!calibration || !printSettings.showPaper) return null
		const ps = paperScreenDims()
		if (!ps) return null
		const off = printSettings.drawingOffset
		const pxPos = toPx(off)
		return {
			x: pxPos.x * zoom + vx,
			y: pxPos.y * zoom + vy,
			w: ps.w, h: ps.h,
			mx: ps.mPx, my: ps.mPx,
			mw: ps.w - ps.mPx * 2, mh: ps.h - ps.mPx * 2,
		}
	})

	// ── Paper drag ──
	let paperDragging = $state(false)
	let paperDragStart: { x: number; y: number; offX: number; offY: number } | null = null

	function onPaperMouseDown(e: MouseEvent) {
		if (e.button !== 0 || !calibration) return
		e.preventDefault()
		e.stopPropagation()
		paperDragging = true
		paperDragStart = {
			x: e.clientX, y: e.clientY,
			offX: printSettings.drawingOffset.x,
			offY: printSettings.drawingOffset.y,
		}
		document.addEventListener('mousemove', onPaperDragMove)
		document.addEventListener('mouseup', onPaperDragUp)
	}

	function onPaperDragMove(e: MouseEvent) {
		if (!paperDragStart || !calibration) return
		const dxMm = (e.clientX - paperDragStart.x) / zoom * calibration.scaleFactor
		const dyMm = (e.clientY - paperDragStart.y) / zoom * calibration.scaleFactor
		printSettings = { ...printSettings, drawingOffset: {
			x: paperDragStart.offX + dxMm,
			y: paperDragStart.offY + dyMm,
		}}
	}

	function onPaperDragUp() {
		paperDragging = false
		paperDragStart = null
		document.removeEventListener('mousemove', onPaperDragMove)
		document.removeEventListener('mouseup', onPaperDragUp)
	}

	// Saved view state for restoring after print
	let savedPrintView: { vx: number; vy: number; zoom: number } | null = null

	$effect(() => {
		const onBefore = () => {
			printing = true
			if (!calibration) return

			// Save current view
			savedPrintView = { vx, vy, zoom }

			// Inject comprehensive print CSS with mm-based sizing
			updatePrintStyles(printSettings, '.print-canvas-container')

			// Set zoom = paperScale so drawing coordinates map correctly to paper mm
			const paperScale = getPaperScale()
			const off = printSettings.drawingOffset
			const offPx = toPx(off)

			zoom = paperScale
			// Position so drawingOffset maps to container origin (0,0)
			vx = -offPx.x * paperScale
			vy = -offPx.y * paperScale
		}
		const onAfter = () => {
			printing = false
			removePrintStyles()
			if (savedPrintView) {
				vx = savedPrintView.vx
				vy = savedPrintView.vy
				zoom = savedPrintView.zoom
				savedPrintView = null
			}
		}
		window.addEventListener('beforeprint', onBefore)
		window.addEventListener('afterprint', onAfter)
		return () => {
			window.removeEventListener('beforeprint', onBefore)
			window.removeEventListener('afterprint', onAfter)
		}
	})

	// Modifier key tracking
	let ctrlKey = $state(false)

	// Snap highlight during node drag or drawing (px coordinates for rendering)
	let dragSnapHighlight = $state<Point | null>(null)
	let drawingSnapHighlight = $state<Point | null>(null)

	// Pan/zoom state
	let vx = $state(0)
	let vy = $state(0)
	let zoom = $state(1)
	let panning = $state(false)
	let grayscale = $state(true)
	let viewRestored = false

	function viewStorageKey() { return viewKey ? `outlets-view:${viewKey}` : '' }

	function saveView() {
		const key = viewStorageKey()
		if (!key) return
		try { localStorage.setItem(key, JSON.stringify({ vx, vy, zoom, grayscale })) } catch {}
	}

	function restoreView(): boolean {
		const key = viewStorageKey()
		if (!key) return false
		try {
			const raw = localStorage.getItem(key)
			if (!raw) return false
			const v = JSON.parse(raw)
			if (typeof v.vx === 'number') { vx = v.vx; vy = v.vy; zoom = v.zoom }
			if (typeof v.grayscale === 'boolean') grayscale = v.grayscale
			return true
		} catch { return false }
	}

	// Persist view changes (debounced)
	let viewSaveTimer: ReturnType<typeof setTimeout> | null = null
	$effect(() => {
		void vx; void vy; void zoom; void grayscale
		if (!viewRestored) return
		if (viewSaveTimer) clearTimeout(viewSaveTimer)
		viewSaveTimer = setTimeout(saveView, 500)
	})

	$effect(() => { onzoomchange?.(zoom) })

	// Page dimensions at RENDER_SCALE
	let pageW = $state(0)
	let pageH = $state(0)

	// Container dimensions
	let cw = $state(800)
	let ch = $state(600)

	const RENDER_SCALE = 2

	// Drag state
	let dragging = $state(false)
	let dragMoved = false
	let dragStart = $state<{ x: number; y: number; outletPositions: Map<string, Point> } | null>(null)

	// Rack drag state
	let draggingRack = $state(false)
	let rackDragMoved = false
	let rackDragStart: { startX: number; startY: number; originMm: Point } | null = null

	// Drag-select
	let dragSelecting = $state(false)
	let dragSelectRect = $state<{ x1: number; y1: number; x2: number; y2: number } | null>(null)

	// Drop target state for drag-from-list
	let dropTarget = $state(false)
	let legendDragging = $state(false)
	let legendDragStart: { x: number; y: number; startX: number; startY: number } | null = null

	// Track current file URL to detect changes
	let currentUrl = ''

	// Attach wheel listener when container becomes available
	let prevContainer: HTMLDivElement | null = null
	$effect(() => {
		if (containerEl && containerEl !== prevContainer) {
			prevContainer?.removeEventListener('wheel', onWheel)
			containerEl.addEventListener('wheel', onWheel, { passive: false })
			prevContainer = containerEl
		}
	})

	onDestroy(() => {
		prevContainer?.removeEventListener('wheel', onWheel)
		document.removeEventListener('mousemove', onLegendDragMove)
		document.removeEventListener('mouseup', onLegendDragUp)
		document.removeEventListener('mousemove', onPaperDragMove)
		document.removeEventListener('mouseup', onPaperDragUp)
		pdf?.destroy()
	})

	// Load PDF when file changes
	$effect(() => {
		const url = file?.url
		if (!url || url === currentUrl) return
		currentUrl = url
		loadPdf(url)
	})

	// Re-render when page changes
	$effect(() => {
		const p = page
		if (pdf?.pdfDoc && p >= 1) renderPage(p)
	})

	async function loadPdf(url: string) {
		pdf?.destroy()
		pdf = new PdfState()
		try {
			await pdf.load(url)
			await renderPage(page)
		} catch (e) {
			console.error('Failed to load PDF:', e)
		}
	}

	async function renderPage(p: number) {
		if (!pdf?.pdfDoc || !canvasEl) return
		if (p < 1 || p > pdf.totalPages) return
		const dims = await pdf.getPageDimensions(p)
		pageW = Math.floor(dims.width)
		pageH = Math.floor(dims.height)
		if (!restoreView()) fitToView()
		viewRestored = true
		await tick()
		await pdf.render({ canvas: canvasEl, page: p, scale: RENDER_SCALE })
	}

	/** Test if a line segment (ax,ay)→(bx,by) intersects an axis-aligned rect [rx1,ry1,rx2,ry2] */
	function segmentIntersectsRect(ax: number, ay: number, bx: number, by: number, rx1: number, ry1: number, rx2: number, ry2: number): boolean {
		// If either endpoint is inside the rect, it intersects
		if (ax >= rx1 && ax <= rx2 && ay >= ry1 && ay <= ry2) return true
		if (bx >= rx1 && bx <= rx2 && by >= ry1 && by <= ry2) return true
		// Check intersection with each edge of the rect
		return segmentsIntersect(ax, ay, bx, by, rx1, ry1, rx2, ry1) || // top
			segmentsIntersect(ax, ay, bx, by, rx1, ry2, rx2, ry2) ||    // bottom
			segmentsIntersect(ax, ay, bx, by, rx1, ry1, rx1, ry2) ||    // left
			segmentsIntersect(ax, ay, bx, by, rx2, ry1, rx2, ry2)       // right
	}

	function segmentsIntersect(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
		const d1 = cross(cx, cy, dx, dy, ax, ay)
		const d2 = cross(cx, cy, dx, dy, bx, by)
		const d3 = cross(ax, ay, bx, by, cx, cy)
		const d4 = cross(ax, ay, bx, by, dx, dy)
		if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
		if (d1 === 0 && onSegment(cx, cy, dx, dy, ax, ay)) return true
		if (d2 === 0 && onSegment(cx, cy, dx, dy, bx, by)) return true
		if (d3 === 0 && onSegment(ax, ay, bx, by, cx, cy)) return true
		if (d4 === 0 && onSegment(ax, ay, bx, by, dx, dy)) return true
		return false
	}

	function cross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
		return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
	}

	function onSegment(ax: number, ay: number, bx: number, by: number, px: number, py: number): boolean {
		return Math.min(ax, bx) <= px && px <= Math.max(ax, bx) && Math.min(ay, by) <= py && py <= Math.max(ay, by)
	}

	// ── Coordinate helpers ──

	function getPagePos(e: MouseEvent): Point {
		const rect = containerEl.getBoundingClientRect()
		return {
			x: (e.clientX - rect.left - vx) / zoom,
			y: (e.clientY - rect.top - vy) / zoom,
		}
	}

	function getWorldPos(e: MouseEvent): Point {
		return toMm(getPagePos(e))
	}

	/** Convert outlet mm position to PDF pixels for SVG rendering */
	function outletPx(outlet: OutletConfig): Point {
		return toPx(outlet.position)
	}

	/** Outlet radius in PDF pixels (fixed mm size) */
	let radiusPx = $derived(calibration ? OUTLET_RADIUS_MM / calibration.scaleFactor : 10)

	/** Crop rect in PDF pixels, or full page if no crop */
	let crop = $derived(calibration?.crop ?? { x: 0, y: 0, width: pageW, height: pageH })
	/**
	 * Legend: mm-based position, paper-scale sizing.
	 * Dimensions are fixed in "paper mm" (how they appear on print),
	 * multiplied by scale to get real-world mm, then /sf to get PDF pixels.
	 * E.g. 60mm on paper at 1:100 = 6000mm real = 6000/sf PDF px.
	 */
	let legendGeom = $derived.by(() => {
		if (!calibration) return null
		const sf = calibration.scaleFactor
		const effectiveScale = printSettings.scale || 100
		const u = effectiveScale / sf // 1 "paper mm" in PDF pixels
		const pos = toPx(legendPos)
		const lx = pos.x
		const ly = pos.y
		const rowH = 5 * u
		const fontSize = 2.8 * u
		const padTop = 8 * u
		return {
			lx, ly, rowH, fontSize, u,
			symbolX: lx + 4 * u,
			symbolW: 7 * u,
			textX: lx + 10 * u,
			legendW: 60 * u,
			legendH: 35 * u,
			y1: ly + padTop,
			y2: ly + padTop + rowH,
			y3: ly + padTop + rowH * 2,
			y4: ly + padTop + rowH * 3,
			y5: ly + padTop + rowH * 4,
		}
	})

	/**
	 * Title block + border geometry — rendered in the SVG inside the transform.
	 * All coordinates are in PDF pixel space (same as outlets/trunks).
	 * The border sits at the margin inset of the paper.
	 * The title block sits on the right side of the border.
	 */
	let titleBlockGeom = $derived.by(() => {
		if (!calibration || !printSettings.showPaper) return null
		const sf = calibration.scaleFactor
		const effectiveScale = printSettings.scale || 100
		const u = effectiveScale / sf // 1 paper-mm in PDF pixels
		const dims = paperDimsMm(printSettings)
		const m = printSettings.margins
		const off = printSettings.drawingOffset

		// Convert paper corners to PDF pixels via toPx (same as outlets/trunks)
		const tlMm = { x: off.x + m * effectiveScale, y: off.y + m * effectiveScale }
		const brMm = { x: off.x + (dims.w - m) * effectiveScale, y: off.y + (dims.h - m) * effectiveScale }
		const borderTopLeft = toPx(tlMm)
		const borderBottomRight = toPx(brMm)
		const bx = borderTopLeft.x
		const by = borderTopLeft.y
		const bw = borderBottomRight.x - borderTopLeft.x
		const bh = borderBottomRight.y - borderTopLeft.y

		// Title block on right side — 60mm wide on paper
		const tbPaperW = 60
		const tbW = tbPaperW * u
		const tbX = bx + bw - tbW
		const tbY = by
		const tbH = bh

		// Title block sections
		const sections = [
			{ h: 8, name: '', title: projectName || 'DRAWING TITLE', subtitle: `Floor ${floor}` },
			{ h: 0, name: 'REVISIONS', title: '' },
			{ h: 2, name: 'PROJECT', title: projectName || '' },
			{ h: 4, name: 'DRAWING', title: `F${floor} FLOOR CABLING`, subtitle: '' },
			{ h: 2, name: 'SCALE', title: `1:${effectiveScale}` },
			{ h: 2, name: 'PAPER', title: `${printSettings.paperSize} ${printSettings.orientation}` },
		]

		const fixedWeight = sections.reduce((sum, sec) => sum + (sec.h || 0), 0)
		const expandableCount = sections.filter(sec => !sec.h || sec.h === 0).length
		const sy = fixedWeight > 0
			? (expandableCount > 0 ? tbH * 0.8 / fixedWeight : tbH / fixedWeight)
			: 0
		const expandedHeight = expandableCount > 0 ? (tbH - fixedWeight * sy) / expandableCount : 0

		const rows: { y: number; h: number; name: string; title: string; subtitle: string }[] = []
		let currentY = tbY
		for (const sec of sections) {
			const sectionH = (sec.h && sec.h > 0) ? sec.h * sy : expandedHeight
			rows.push({ y: currentY, h: sectionH, name: sec.name || '', title: sec.title || '', subtitle: sec.subtitle || '' })
			currentY += sectionH
		}

		const fontSize = 2.8 * u
		const sw = 0.3 * u

		return { bx, by, bw, bh, tbX, tbY, tbW, tbH, rows, fontSize, sw, u }
	})

	// ── Rack helpers ──

	function getRackConfig(rackId: string): (RackConfig & { room: string }) | undefined {
		return rackConfigs.find(r => r.id === rackId)
	}

	/** Get rack rendering data in PDF pixels. Position is the anchor (top-left before rotation). */
	function rackPxRect(placement: RackPlacement) {
		const cfg = getRackConfig(placement.rackId)
		if (!cfg || !calibration) return null
		const pos = toPx(placement.position)
		const w = cfg.widthMm / calibration.scaleFactor
		const h = cfg.depthMm / calibration.scaleFactor
		return { x: pos.x, y: pos.y, w, h, cfg, rotation: placement.rotation }
	}

	/** Hit-test a point against placed racks (rotation-aware). Returns rackId or null. */
	function hitTestRack(pos: Point): string | null {
		for (let i = rackPlacements.length - 1; i >= 0; i--) {
			const p = rackPlacements[i]
			const rect = rackPxRect(p)
			if (!rect) continue
			// Transform test point into rack-local coords (undo rotation around anchor)
			const cx = rect.x + rect.w / 2
			const cy = rect.y + rect.h / 2
			const rad = -rect.rotation * Math.PI / 180
			const cos = Math.cos(rad), sin = Math.sin(rad)
			const dx = pos.x - cx, dy = pos.y - cy
			const lx = dx * cos - dy * sin + rect.w / 2
			const ly = dx * sin + dy * cos + rect.h / 2
			if (lx >= 0 && lx <= rect.w && ly >= 0 && ly <= rect.h) return p.rackId
		}
		return null
	}

	// ── View controls ──

	export function fitToView() {
		if (!pageW || !pageH) return
		const c = calibration?.crop ?? { x: 0, y: 0, width: pageW, height: pageH }
		if (!c.width || !c.height) return
		const pad = 40
		zoom = Math.min((cw - pad) / c.width, (ch - pad) / c.height, 4)
		vx = (cw - c.width * zoom) / 2 - c.x * zoom
		vy = (ch - c.height * zoom) / 2 - c.y * zoom
	}

	function onWheel(e: WheelEvent) {
		e.preventDefault()
		if (e.ctrlKey || e.altKey || e.metaKey || e.buttons === 2) {
			doZoom(e)
		} else if (e.shiftKey || e.deltaX) {
			vx += (e.deltaY || e.deltaX) > 0 ? -80 : 80
		} else {
			vy += e.deltaY > 0 ? -80 : 80
		}
	}

	function doZoom(e: WheelEvent) {
		const rect = containerEl.getBoundingClientRect()
		const mx = e.clientX - rect.left
		const my = e.clientY - rect.top
		const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
		const newZoom = Math.min(8, Math.max(0.05, zoom * factor))
		const s = newZoom / zoom
		vx = mx - (mx - vx) * s
		vy = my - (my - vy) * s
		zoom = newZoom
	}

	export function zoomIn() {
		const cx = cw / 2, cy = ch / 2
		const newZoom = Math.min(8, zoom * 1.3)
		const s = newZoom / zoom
		vx = cx - (cx - vx) * s
		vy = cy - (cy - vy) * s
		zoom = newZoom
	}

	export function zoomOut() {
		const cx = cw / 2, cy = ch / 2
		const newZoom = Math.max(0.05, zoom / 1.3)
		const s = newZoom / zoom
		vx = cx - (cx - vx) * s
		vy = cy - (cy - vy) * s
		zoom = newZoom
	}

	// ── Mouse handling ──

	function onMouseDown(e: MouseEvent) {
		e.preventDefault()

		// Right-click on trunk node: disconnect last segment
		if (e.button === 2 && calibration && ondisconnecttrunknode) {
			const mmPos = toMm(getPagePos(e))
			const hit = hitTestTrunks(mmPos)
			if (hit?.type === 'node') {
				const trunk = trunks.find(t => t.id === hit.trunkId)
				const connectedSegs = trunk?.segments.filter(s => s.nodes[0] === hit.nodeId || s.nodes[1] === hit.nodeId)
				if (trunk && connectedSegs && connectedSegs.length >= 2) {
					// Disconnect the last segment from this node
					const seg = connectedSegs[connectedSegs.length - 1]
					const newNodeId = ondisconnecttrunknode(hit.trunkId, hit.nodeId!, seg.id)
					if (newNodeId) {
						// Start dragging the new node independently
						if (!selectedTrunkIds.has(hit.trunkId)) onselecttrunk?.(hit.trunkId, false)
						onselecttrunknode?.(newNodeId, false)
						draggingTrunkNode = true
						trunkNodeDragMoved = false
						// New node is at the same position as the original node
						const origNode = trunk.nodes.find(n => n.id === hit.nodeId)!
						const originMm = { ...origNode.position }
						// Neighbor is the other end of the disconnected segment
						const otherEndId = seg.nodes[0] === hit.nodeId ? seg.nodes[1] : seg.nodes[0]
						const otherEnd = trunk.nodes.find(n => n.id === otherEndId)
						const neighborMm = otherEnd ? { ...otherEnd.position } : null
						const pos = getPagePos(e)
						trunkNodeDragStart = { startX: pos.x, startY: pos.y, lastX: pos.x, lastY: pos.y, trunkId: hit.trunkId, originMm, neighborMm, forceIndependent: true }
						document.addEventListener('mousemove', onTrunkNodeDragMove)
						document.addEventListener('mouseup', onTrunkNodeDragUp)
						return
					}
				}
			}
		}

		// Middle/right click = pan
		if (e.button === 1 || e.button === 2) {
			panning = true
			document.addEventListener('mousemove', onPanMove)
			document.addEventListener('mouseup', onPanUp)
			return
		}

		if (e.button !== 0) return

		const pos = getPagePos(e)

		// Outlet tool: place outlet
		if (activeTool === 'outlet' && calibration && sidebarTab === 'outlets') {
			onadd(pos)
			return
		}

		// Trunk tool: click to add nodes
		if (activeTool === 'trunk' && calibration && sidebarTab === 'trunks') {
			handleTrunkClick(e)
			return
		}

		// Select tool: check trunks (nodes, segments, bodies)
		if (calibration && onselecttrunk) {
			const mmPos = toMm(pos)
			const hit = hitTestTrunks(mmPos)
			if (hit) {
				if (hit.type === 'node' && onselecttrunknode) {
					// Select the trunk first if not already
					if (!selectedTrunkIds.has(hit.trunkId)) onselecttrunk(hit.trunkId, e.ctrlKey || e.metaKey || e.shiftKey)
					onselecttrunknode(hit.nodeId!, e.ctrlKey || e.metaKey || e.shiftKey)

					// Start node drag — capture origin and nearest connected neighbor for Shift-constrain
					draggingTrunkNode = true
					trunkNodeDragMoved = false
					const dragTrunk = trunks.find(t => t.id === hit.trunkId)
					const dragNode = dragTrunk?.nodes.find(n => n.id === hit.nodeId)
					const originMm = dragNode ? { ...dragNode.position } : { x: 0, y: 0 }
					let neighborMm: Point | null = null
					if (dragTrunk && dragNode) {
						// Find first connected neighbor node
						for (const seg of dragTrunk.segments) {
							const otherId = seg.nodes[0] === dragNode.id ? seg.nodes[1] : seg.nodes[1] === dragNode.id ? seg.nodes[0] : null
							if (otherId) {
								const other = dragTrunk.nodes.find(n => n.id === otherId)
								if (other) { neighborMm = { ...other.position }; break }
							}
						}
					}
					trunkNodeDragStart = { startX: pos.x, startY: pos.y, lastX: pos.x, lastY: pos.y, trunkId: hit.trunkId, originMm, neighborMm }
					document.addEventListener('mousemove', onTrunkNodeDragMove)
					document.addEventListener('mouseup', onTrunkNodeDragUp)
					return
				}
				if (hit.type === 'segment' && (e.ctrlKey || e.metaKey) && onsplittrunksegment) {
					// Ctrl+click segment: split
					onsplittrunksegment(hit.trunkId, hit.segmentId!, mmPos)
					return
				}
				if (hit.type === 'segment' && onselecttrunknode) {
					// Select trunk and both endpoint nodes, start segment drag
					if (!selectedTrunkIds.has(hit.trunkId)) onselecttrunk(hit.trunkId, false)
					const dragTrunk = trunks.find(t => t.id === hit.trunkId)
					const seg = dragTrunk?.segments.find(s => s.id === hit.segmentId)
					if (dragTrunk && seg) {
						onselecttrunknode(seg.nodes[0], false)
						onselecttrunknode(seg.nodes[1], true)  // multi-select both nodes
						const segNodeIds = new Set(seg.nodes)
						draggingTrunkNode = true
						trunkNodeDragMoved = false
						// Use midpoint of segment as origin for shift-constrain reference
						const nodeA = dragTrunk.nodes.find(n => n.id === seg.nodes[0])
						const nodeB = dragTrunk.nodes.find(n => n.id === seg.nodes[1])
						const originMm = nodeA ? { ...nodeA.position } : { x: 0, y: 0 }
						trunkNodeDragStart = { startX: pos.x, startY: pos.y, lastX: pos.x, lastY: pos.y, trunkId: hit.trunkId, originMm, neighborMm: null }
						document.addEventListener('mousemove', onTrunkNodeDragMove)
						document.addEventListener('mouseup', onTrunkNodeDragUp)
					}
					return
				}
				if (hit.type === 'body') {
					onselecttrunk(hit.trunkId, e.ctrlKey || e.metaKey || e.shiftKey)
					return
				}
			}
		}

		// Select tool: check racks first (if in rack mode or always)
		const hitRackId = hitTestRack(pos)
		if (hitRackId && onselectrack) {
			const alreadySelected = selectedRackIds.has(hitRackId)
			if (e.ctrlKey || e.metaKey) {
				onselectrack(hitRackId, true)
			} else if (!alreadySelected) {
				onselectrack(hitRackId, false)
			}

			// Start rack drag
			draggingRack = true
			rackDragMoved = false
			const firstRack = rackPlacements.find(p => selectedRackIds.has(p.rackId))
			const originMm = firstRack ? { ...firstRack.position } : { x: 0, y: 0 }
			rackDragStart = { startX: pos.x, startY: pos.y, originMm }
			document.addEventListener('mousemove', onRackDragMove)
			document.addEventListener('mouseup', onRackDragUp)
			return
		}

		// Check if clicking an outlet
		const hitId = hitTest(pos)
		if (hitId) {
			const alreadySelected = selectedIds.has(hitId)
			if (e.ctrlKey || e.metaKey) {
				onselect(hitId, true)
			} else if (!alreadySelected) {
				onselect(hitId, false)
			}

			// Start drag
			dragging = true
			dragMoved = false
			dragStart = {
				x: pos.x, y: pos.y,
				outletPositions: new Map(
					outlets.filter(o => selectedIds.has(o.id) || o.id === hitId).map(o => [o.id, { ...o.position }])
				),
			}
			document.addEventListener('mousemove', onDragMove)
			document.addEventListener('mouseup', onDragUp)
			return
		}

		// Click on empty space: start drag-select or clear
		if (!(e.ctrlKey || e.metaKey)) onclear()

		dragSelecting = true
		dragSelectRect = { x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y }
		document.addEventListener('mousemove', onDragSelectMove)
		document.addEventListener('mouseup', onDragSelectUp)
	}

	function hitTest(pos: Point): string | null {
		const r = radiusPx * 1.5
		for (let i = outlets.length - 1; i >= 0; i--) {
			const o = outlets[i]
			const px = outletPx(o)
			const dx = pos.x - px.x
			const dy = pos.y - px.y
			if (dx * dx + dy * dy <= r * r) return o.id
		}
		return null
	}

	// Pan
	function onPanMove(e: MouseEvent) {
		vx += e.movementX
		vy += e.movementY
	}

	function onPanUp() {
		panning = false
		document.removeEventListener('mousemove', onPanMove)
		document.removeEventListener('mouseup', onPanUp)
	}

	// Outlet drag
	let dragCopying = $state(false)

	function onDragMove(e: MouseEvent) {
		if (!dragStart || !calibration) return
		const pos = getPagePos(e)
		const dxPx = pos.x - dragStart.x
		const dyPx = pos.y - dragStart.y
		const dxMm = dxPx * calibration.scaleFactor
		const dyMm = dyPx * calibration.scaleFactor
		const copying = e.ctrlKey || e.metaKey
		dragCopying = copying

		dragMoved = true
		const ids = new Set(dragStart.outletPositions.keys())
		onmove(ids, dxMm, dyMm, copying)

		dragStart.x = pos.x
		dragStart.y = pos.y
	}

	function onDragUp(e: MouseEvent) {
		const copying = e.ctrlKey || e.metaKey
		if (dragMoved && dragStart) {
			onmoveend(new Set(dragStart.outletPositions.keys()), copying)
		}
		dragging = false
		dragStart = null
		dragMoved = false
		dragCopying = false
		document.removeEventListener('mousemove', onDragMove)
		document.removeEventListener('mouseup', onDragUp)
	}

	// Rack drag on canvas
	function onRackDragMove(e: MouseEvent) {
		if (!rackDragStart || !calibration || !onmoveracks) return
		const pos = getPagePos(e)
		const totalDxMm = (pos.x - rackDragStart.startX) * calibration.scaleFactor
		const totalDyMm = (pos.y - rackDragStart.startY) * calibration.scaleFactor
		let targetMm = { x: rackDragStart.originMm.x + totalDxMm, y: rackDragStart.originMm.y + totalDyMm }
		targetMm = snapToGrid(targetMm, gridMm)
		const dxMm = targetMm.x - rackDragStart.originMm.x
		const dyMm = targetMm.y - rackDragStart.originMm.y

		rackDragMoved = true
		onmoveracks(selectedRackIds, dxMm, dyMm, true)
	}

	function onRackDragUp() {
		if (rackDragMoved && onmoveracksend) {
			onmoveracksend(selectedRackIds)
		}
		draggingRack = false
		rackDragStart = null
		rackDragMoved = false
		document.removeEventListener('mousemove', onRackDragMove)
		document.removeEventListener('mouseup', onRackDragUp)
	}

	// Drag-select
	function onDragSelectMove(e: MouseEvent) {
		if (!dragSelectRect) return
		const pos = getPagePos(e)
		dragSelectRect = { ...dragSelectRect, x2: pos.x, y2: pos.y }
	}

	function onDragSelectUp() {
		if (dragSelectRect) {
			const x1 = Math.min(dragSelectRect.x1, dragSelectRect.x2)
			const x2 = Math.max(dragSelectRect.x1, dragSelectRect.x2)
			const y1 = Math.min(dragSelectRect.y1, dragSelectRect.y2)
			const y2 = Math.max(dragSelectRect.y1, dragSelectRect.y2)

			if (x2 - x1 > 3 && y2 - y1 > 3) {
				// Select outlets in rect
				const outletHits: string[] = []
				for (const o of outlets) {
					const px = outletPx(o)
					if (px.x >= x1 && px.x <= x2 && px.y >= y1 && px.y <= y2) {
						outletHits.push(o.id)
					}
				}
				if (outletHits.length > 0) {
					for (const id of outletHits) onselect(id, true)
				}

				// Select racks in rect
				if (onselectrack) {
					for (const p of rackPlacements) {
						const rect = rackPxRect(p)
						if (!rect) continue
						const cx = rect.x + rect.w / 2
						const cy = rect.y + rect.h / 2
						if (cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2) {
							onselectrack(p.rackId, true)
						}
					}
				}

				// Select trunks in rect (node center or segment intersection)
				if (onselecttrunk && calibration) {
					for (const trunk of trunks) {
						if (trunk.visible === false) continue
						// Check if any node center is in rect
						const hasNodeInRect = trunk.nodes.some(n => {
							const px = toPx(n.position)
							return px.x >= x1 && px.x <= x2 && px.y >= y1 && px.y <= y2
						})
						if (hasNodeInRect) { onselecttrunk(trunk.id, true); continue }
						// Check if any segment intersects the rect
						const nodeMap = new Map(trunk.nodes.map(n => [n.id, n]))
						const hasSegmentHit = trunk.segments.some(seg => {
							const nA = nodeMap.get(seg.nodes[0])
							const nB = nodeMap.get(seg.nodes[1])
							if (!nA || !nB) return false
							const pA = toPx(nA.position)
							const pB = toPx(nB.position)
							return segmentIntersectsRect(pA.x, pA.y, pB.x, pB.y, x1, y1, x2, y2)
						})
						if (hasSegmentHit) onselecttrunk(trunk.id, true)
					}
				}
			}
		}
		dragSelecting = false
		dragSelectRect = null
		document.removeEventListener('mousemove', onDragSelectMove)
		document.removeEventListener('mouseup', onDragSelectUp)
	}

	// ── Drag-and-drop from sidebar list ──
	function onDrop(e: DragEvent) {
		e.preventDefault()
		dropTarget = false
		if (!calibration || !onplacerack) return

		const data = e.dataTransfer?.getData('text/plain')
		if (!data) return

		const rackIds = data.split(',')
		const pos = getPagePos(e as unknown as MouseEvent)
		const mm = snapToGrid(toMm(pos), gridMm)

		// Place each rack, offset horizontally
		for (let i = 0; i < rackIds.length; i++) {
			const rackId = rackIds[i]
			const cfg = getRackConfig(rackId)
			if (!cfg) continue
			const offset = i * ((cfg.widthMm ?? 600) + 200)
			onplacerack(rackId, cfg.room, { x: mm.x + offset, y: mm.y })
		}
	}

	function onDragOver(e: DragEvent) {
		e.preventDefault()
		dropTarget = true
		e.dataTransfer!.dropEffect = 'copy'
	}

	function onDragLeave() {
		dropTarget = false
	}

	// Touch support
	let pinchLastDist: number | null = null
	let lastPanMid: { x: number; y: number } | null = null

	function onTouchStart(e: TouchEvent) {
		if (e.touches.length === 2) {
			const [a, b] = e.touches
			pinchLastDist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
			lastPanMid = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }
		} else if (e.touches.length === 1) {
			panning = true
			lastPanMid = { x: e.touches[0].clientX, y: e.touches[0].clientY }
		}
	}

	function onTouchMove(e: TouchEvent) {
		if (e.touches.length === 2 && lastPanMid && pinchLastDist) {
			e.preventDefault()
			const [a, b] = e.touches
			const newMid = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }
			const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
			vx += newMid.x - lastPanMid.x
			vy += newMid.y - lastPanMid.y
			lastPanMid = newMid
			const scaleFactor = dist / pinchLastDist
			pinchLastDist = dist
			const newZoom = Math.min(8, Math.max(0.05, zoom * scaleFactor))
			const rect = containerEl.getBoundingClientRect()
			const mx = newMid.x - rect.left
			const my = newMid.y - rect.top
			const s = newZoom / zoom
			vx = mx - (mx - vx) * s
			vy = my - (my - vy) * s
			zoom = newZoom
		} else if (e.touches.length === 1 && panning && lastPanMid) {
			const t = e.touches[0]
			vx += t.clientX - lastPanMid.x
			vy += t.clientY - lastPanMid.y
			lastPanMid = { x: t.clientX, y: t.clientY }
		}
	}

	function onTouchEnd(e: TouchEvent) {
		if (e.touches.length < 2) pinchLastDist = null
		if (e.touches.length === 0) { panning = false; lastPanMid = null }
	}

	// ── Trunk drawing state ──
	let drawingNodes = $state<TrunkNode[]>([])
	let drawingSegments = $state<TrunkSegment[]>([])
	let rubberBandTarget = $state<Point | null>(null)

	// Precomputed polygons for trunk hit-testing (in mm coords)
	let trunkPolygonCache = $derived.by(() => {
		const cache = new Map<string, Point[][]>()
		for (const trunk of trunks) {
			if (trunk.visible === false) continue
			cache.set(trunk.id, generateTrunkPolygons(trunk))
		}
		return cache
	})

	function isDrawingTrunk(): boolean {
		return activeTool === 'trunk' && drawingNodes.length > 0
	}

	/** Build snap targets from existing trunk nodes, outlets, and racks.
	 *  Excludes drawing nodes except the first one (to allow closing loops with 3+ segments). */
	function buildSnapTargets(): SnapTarget[] {
		const targets: SnapTarget[] = []
		const drawingNodeIds = new Set(drawingNodes.map(n => n.id))
		for (const trunk of trunks) {
			for (const node of trunk.nodes) {
				if (!drawingNodeIds.has(node.id)) {
					targets.push({ position: node.position, id: node.id, type: 'node', trunkId: trunk.id })
				}
			}
		}
		// Include first drawing node as snap target to allow closing loops (need 3+ nodes for a valid loop)
		if (drawingNodes.length >= 3) {
			const first = drawingNodes[0]
			targets.push({ position: first.position, id: first.id, type: 'node', trunkId: '__drawing__' })
		}
		for (const outlet of outlets) {
			targets.push({ position: outlet.position, id: outlet.id, type: 'outlet' })
		}
		for (const rp of rackPlacements) {
			const cfg = getRackConfig(rp.rackId)
			if (cfg) {
				// Snap to center of each edge of the rack (accounting for rotation)
				const w = cfg.widthMm, d = cfg.depthMm
				const cx = rp.position.x + w / 2, cy = rp.position.y + d / 2
				const rot = (rp.rotation ?? 0) * Math.PI / 180
				const cos = Math.cos(rot), sin = Math.sin(rot)
				const rotPt = (lx: number, ly: number): Point => ({
					x: cx + (lx - cx) * cos - (ly - cy) * sin,
					y: cy + (lx - cx) * sin + (ly - cy) * cos,
				})
				// Four edge midpoints
				targets.push({ position: rotPt(cx, rp.position.y), id: rp.rackId, type: 'rack' })           // top
				targets.push({ position: rotPt(cx, rp.position.y + d), id: rp.rackId, type: 'rack' })        // bottom
				targets.push({ position: rotPt(rp.position.x, cy), id: rp.rackId, type: 'rack' })            // left
				targets.push({ position: rotPt(rp.position.x + w, cy), id: rp.rackId, type: 'rack' })        // right
			} else {
				targets.push({ position: rp.position, id: rp.rackId, type: 'rack' })
			}
		}
		return targets
	}

	/** Maps drawing node IDs that snapped to existing trunk nodes: drawingNodeId → { trunkId, nodeId } */
	let drawingSnaps = $state<Map<string, { trunkId: string; nodeId: string }>>(new Map())

	function handleTrunkClick(e: MouseEvent) {
		if (!calibration) return
		const pos = getPagePos(e)
		let mmPos = toMm(pos)

		// Shift-constrain to 15° angles from last node (skip grid snap to preserve angle)
		if (e.shiftKey && drawingNodes.length > 0) {
			mmPos = constrainAngle(drawingNodes[drawingNodes.length - 1].position, mmPos)
		} else {
			// Grid snap only when not angle-constrained
			mmPos = snapToGrid(mmPos, gridMm)
		}

		// Snap to nearby targets (overrides grid snap)
		const snap = snapToNearby(mmPos, buildSnapTargets(), SNAP_THRESHOLD_MM)
		if (snap) mmPos = snap.snappedPos

		// If snapped to an existing trunk node, reuse that node's ID
		const snappedToExistingNode = snap?.target.type === 'node' && snap.target.trunkId
		const snappedToDrawingNode = snappedToExistingNode && snap!.target.trunkId === '__drawing__'
		let nodeId: string
		let newNode: TrunkNode

		if (snappedToDrawingNode) {
			// Closing a loop — snap to first drawing node
			nodeId = snap!.target.id
			const prevNode = drawingNodes[drawingNodes.length - 1]
			if (prevNode.id === nodeId) return
			const segId = genId('ts')
			const seg: TrunkSegment = { id: segId, nodes: [prevNode.id, nodeId] }
			drawingSegments = [...drawingSegments, seg]
			finishTrunkDrawing()
			return
		} else if (snappedToExistingNode) {
			// Reuse existing node — find it in the trunk
			const trunk = trunks.find(t => t.id === snap!.target.trunkId)
			const existingNode = trunk?.nodes.find(n => n.id === snap!.target.id)
			nodeId = snap!.target.id
			newNode = existingNode
				? { ...existingNode }
				: { id: nodeId, position: mmPos, z: trunkPalette?.currentZ() ?? 0 }
		} else {
			nodeId = genId('tn')
			newNode = { id: nodeId, position: mmPos, z: trunkPalette?.currentZ() ?? 0 }
			// Set connection IDs when snapping to racks or outlets
			if (snap?.target.type === 'rack') newNode.connectedRackId = snap.target.id
			else if (snap?.target.type === 'outlet') newNode.connectedOutletId = snap.target.id
		}

		if (drawingNodes.length === 0) {
			// First node
			drawingNodes = [newNode]
			ontrunkdrawingchange?.(true)
			if (snappedToExistingNode) {
				drawingSnaps = new Map([[nodeId, { trunkId: snap!.target.trunkId!, nodeId }]])
			}
		} else {
			// Don't add a node at the same position as an existing drawing node
			const prevNode = drawingNodes[drawingNodes.length - 1]
			if (prevNode.id === nodeId) return
			if (drawingNodes.some(n => n.position.x === mmPos.x && n.position.y === mmPos.y)) return

			const segId = genId('ts')
			const seg: TrunkSegment = { id: segId, nodes: [prevNode.id, nodeId] }
			drawingNodes = [...drawingNodes, newNode]
			drawingSegments = [...drawingSegments, seg]

			if (snappedToExistingNode) {
				const updated = new Map(drawingSnaps)
				updated.set(nodeId, { trunkId: snap!.target.trunkId!, nodeId })
				drawingSnaps = updated
			}
		}
	}

	function finishTrunkDrawing() {
		// Remove duplicate last node (caused by dblclick firing after the second click)
		if (drawingNodes.length >= 2) {
			const last = drawingNodes[drawingNodes.length - 1]
			const prev = drawingNodes[drawingNodes.length - 2]
			if (last.position.x === prev.position.x && last.position.y === prev.position.y) {
				drawingNodes = drawingNodes.slice(0, -1)
				drawingSegments = drawingSegments.filter(s => s.nodes[0] !== last.id && s.nodes[1] !== last.id)
				drawingSnaps.delete(last.id)
			}
		}
		if (drawingNodes.length >= 2 && drawingSegments.length > 0 && onaddtrunk) {
			onaddtrunk(drawingNodes, drawingSegments, drawingSnaps.size > 0 ? drawingSnaps : undefined)
		}
		drawingNodes = []
		drawingSegments = []
		drawingSnaps = new Map()
		rubberBandTarget = null
		drawingSnapHighlight = null
		ontrunkdrawingchange?.(false)
	}

	function cancelTrunkDrawing() {
		drawingNodes = []
		drawingSegments = []
		drawingSnaps = new Map()
		rubberBandTarget = null
		drawingSnapHighlight = null
		ontrunkdrawingchange?.(false)
	}

	function handleTrunkMouseMove(e: MouseEvent) {
		if (!calibration || drawingNodes.length === 0) return
		const pos = getPagePos(e)
		let mmPos = toMm(pos)
		if (e.shiftKey) {
			mmPos = constrainAngle(drawingNodes[drawingNodes.length - 1].position, mmPos)
		} else {
			mmPos = snapToGrid(mmPos, gridMm)
		}
		const snap = snapToNearby(mmPos, buildSnapTargets(), SNAP_THRESHOLD_MM)
		rubberBandTarget = snap ? snap.snappedPos : mmPos
		drawingSnapHighlight = snap ? toPx(snap.snappedPos) : null
	}

	// Trunk node drag state
	let draggingTrunkNode = $state(false)
	let trunkNodeDragMoved = false
	let trunkNodeDragStart: { startX: number; startY: number; lastX: number; lastY: number; trunkId: string; originMm: Point; neighborMm: Point | null; forceIndependent?: boolean } | null = null

	function hitTestTrunks(mmPos: Point): { type: 'node' | 'segment' | 'body'; trunkId: string; nodeId?: string; segmentId?: string; t?: number } | null {
		// Priority: nodes > segments > body
		for (const trunk of trunks) {
			if (trunk.visible === false) continue
			const nodeHit = hitTestNode(mmPos, trunk.nodes, Math.max(trunkWidthMm(trunk) / 2, 200))
			if (nodeHit) return { type: 'node', trunkId: trunk.id, nodeId: nodeHit.id }
		}
		for (const trunk of trunks) {
			if (trunk.visible === false) continue
			const segHit = hitTestSegment(mmPos, trunk.nodes, trunk.segments, trunkWidthMm(trunk))
			if (segHit) return { type: 'segment', trunkId: trunk.id, segmentId: segHit.segment.id, t: segHit.t }
		}
		for (const trunk of trunks) {
			if (trunk.visible === false) continue
			const polys = trunkPolygonCache.get(trunk.id)
			if (polys && hitTestTrunkBody(mmPos, polys)) return { type: 'body', trunkId: trunk.id }
		}
		return null
	}

	function onTrunkNodeDragMove(e: MouseEvent) {
		if (!trunkNodeDragStart || !calibration || !onmovetrunknodes) return
		const pos = getPagePos(e)

		// Compute target position from drag start
		const totalDxMm = (pos.x - trunkNodeDragStart.startX) * calibration.scaleFactor
		const totalDyMm = (pos.y - trunkNodeDragStart.startY) * calibration.scaleFactor
		let targetMm = { x: trunkNodeDragStart.originMm.x + totalDxMm, y: trunkNodeDragStart.originMm.y + totalDyMm }

		// Shift: constrain angle relative to connected neighbor
		if (e.shiftKey && trunkNodeDragStart.neighborMm) {
			targetMm = constrainAngle(trunkNodeDragStart.neighborMm, targetMm)
		} else {
			targetMm = snapToGrid(targetMm, gridMm)
		}

		// Snap to nearby node, rack, or outlet (overrides grid snap)
		dragSnapHighlight = null
		let bestSnapDist = SNAP_THRESHOLD_MM
		let bestSnapPos: Point | null = null
		for (const trunk of trunks) {
			if (trunk.visible === false) continue
			for (const node of trunk.nodes) {
				if (selectedNodeIds.has(node.id)) continue
				const d = dist(targetMm, node.position)
				if (d <= bestSnapDist) { bestSnapDist = d; bestSnapPos = node.position }
			}
		}
		for (const rp of rackPlacements) {
			const cfg = getRackConfig(rp.rackId)
			if (cfg) {
				const w = cfg.widthMm, dp = cfg.depthMm
				const cx = rp.position.x + w / 2, cy = rp.position.y + dp / 2
				const rot = (rp.rotation ?? 0) * Math.PI / 180
				const cos = Math.cos(rot), sin = Math.sin(rot)
				const rotPt = (lx: number, ly: number): Point => ({
					x: cx + (lx - cx) * cos - (ly - cy) * sin,
					y: cy + (lx - cx) * sin + (ly - cy) * cos,
				})
				for (const ep of [rotPt(cx, rp.position.y), rotPt(cx, rp.position.y + dp), rotPt(rp.position.x, cy), rotPt(rp.position.x + w, cy)]) {
					const d2 = dist(targetMm, ep)
					if (d2 <= bestSnapDist) { bestSnapDist = d2; bestSnapPos = ep }
				}
			} else {
				const d2 = dist(targetMm, rp.position)
				if (d2 <= bestSnapDist) { bestSnapDist = d2; bestSnapPos = rp.position }
			}
		}
		for (const outlet of outlets) {
			const d = dist(targetMm, outlet.position)
			if (d <= bestSnapDist) { bestSnapDist = d; bestSnapPos = outlet.position }
		}
		if (bestSnapPos) {
			targetMm = bestSnapPos
			dragSnapHighlight = toPx(bestSnapPos)
		}

		// Delta from original position
		const dxMm = targetMm.x - trunkNodeDragStart.originMm.x
		const dyMm = targetMm.y - trunkNodeDragStart.originMm.y

		trunkNodeDragMoved = true
		// Use absolute delta from origin (reset to snapshot first, then apply)
		const independent = e.altKey || trunkNodeDragStart.forceIndependent
		onmovetrunknodes(trunkNodeDragStart.trunkId, selectedNodeIds, dxMm, dyMm, independent, true)
		trunkNodeDragStart = { ...trunkNodeDragStart, lastX: pos.x, lastY: pos.y }
	}

	function onTrunkNodeDragUp(e: MouseEvent) {
		if (trunkNodeDragMoved && trunkNodeDragStart && onmovetrunknodesend) {
			const independent = e.altKey || trunkNodeDragStart.forceIndependent
			onmovetrunknodesend(trunkNodeDragStart.trunkId, selectedNodeIds, independent)
		}
		draggingTrunkNode = false
		trunkNodeDragStart = null
		trunkNodeDragMoved = false
		dragSnapHighlight = null
		document.removeEventListener('mousemove', onTrunkNodeDragMove)
		document.removeEventListener('mouseup', onTrunkNodeDragUp)
	}

	/** Build a TrunkConfig shell for the drawing preview */
	let drawingPreviewSpec = $derived.by((): TrunkConfig | null => {
		if (!trunkPalette || drawingNodes.length < 2) return null
		return {
			id: 'drawing-preview',
			shape: trunkPalette.currentShape(),
			location: trunkPalette.currentLocation(),
			spec: trunkPalette.currentSpec(),
			nodes: drawingNodes,
			segments: drawingSegments,
			isPrimary: true,
		}
	})

	function onCanvasKeyDown(e: KeyboardEvent) {
		const tag = (e.target as HTMLElement).tagName
		if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
		if (e.key === '+' || e.key === '=') zoomIn()
		else if (e.key === '-') zoomOut()
		else if (e.key === 'Home') fitToView()
		else if (e.key === 'Escape' && isDrawingTrunk()) { finishTrunkDrawing() }
	}

	function onCanvasDblClick(e: MouseEvent) {
		if (isDrawingTrunk()) {
			e.preventDefault()
			finishTrunkDrawing()
		}
	}

	function onLegendMouseDown(e: MouseEvent) {
		if (e.button !== 0) return
		e.preventDefault()
		e.stopPropagation()
		legendDragging = true
		legendDragStart = { x: e.clientX, y: e.clientY, startX: legendPos.x, startY: legendPos.y }
		document.addEventListener('mousemove', onLegendDragMove)
		document.addEventListener('mouseup', onLegendDragUp)
	}

	function onLegendDragMove(e: MouseEvent) {
		if (!legendDragStart || !calibration) return
		// Convert screen pixel delta to mm delta
		const dxMm = (e.clientX - legendDragStart.x) / zoom * calibration.scaleFactor
		const dyMm = (e.clientY - legendDragStart.y) / zoom * calibration.scaleFactor
		legendPos = {
			x: legendDragStart.startX + dxMm,
			y: legendDragStart.startY + dyMm,
		}
	}

	function onLegendDragUp() {
		legendDragging = false
		legendDragStart = null
		document.removeEventListener('mousemove', onLegendDragMove)
		document.removeEventListener('mouseup', onLegendDragUp)
	}

	/** Room colors for rack outlines */
	const ROOM_COLORS: Record<string, string> = {
		A: '#3b82f6', B: '#10b981', C: '#f59e0b', D: '#ef4444',
	}

	function trianglePoints(cx: number, cy: number, r: number): string {
		const angle1 = Math.PI / 2
		const angle2 = Math.PI / 2 + (2 * Math.PI) / 3
		const angle3 = Math.PI / 2 + (4 * Math.PI) / 3
		const x1 = cx + r * Math.cos(angle1)
		const y1 = cy + r * Math.sin(angle1)
		const x2 = cx + r * Math.cos(angle2)
		const y2 = cy + r * Math.sin(angle2)
		const x3 = cx + r * Math.cos(angle3)
		const y3 = cy + r * Math.sin(angle3)
		return `${x1},${y1} ${x2},${y2} ${x3},${y3}`
	}

	function squarePoints(cx: number, cy: number, r: number): string {
		const side = r * Math.sqrt(2)
		const half = side / 2
		return `${cx - half},${cy - half} ${cx + half},${cy - half} ${cx + half},${cy + half} ${cx - half},${cy + half}`
	}
</script>

<svelte:window bind:innerWidth={cw} bind:innerHeight={ch}
	onkeydown={e => { ctrlKey = e.ctrlKey || e.metaKey; onCanvasKeyDown(e) }}
	onkeyup={e => { ctrlKey = e.ctrlKey || e.metaKey }}
	onclick={() => { viewMenuOpen = false }} />

{#if !file?.url}
	<div class="h-full flex items-center justify-center bg-gray-50 print:hidden print-hidden">
		<div class="text-center text-gray-400">
			<Icon name="fileText" class="h-10 w-10 mx-auto mb-2 text-gray-300" />
			<p class="text-sm">Select a floorplan from the sidebar</p>
		</div>
	</div>
{:else}
	<!-- Toolbar -->
	<div class="h-8 px-3 flex items-center gap-2 border-b border-gray-200 bg-white shrink-0 text-xs print-hidden" data-no-print>
		<!-- Tool buttons -->
		<button
			class="flex items-center gap-1 px-2 py-1 rounded transition-colors
				{activeTool === 'select' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}"
			onclick={() => activeTool = 'select'}
			title="Select (Esc)">
			<Icon name="select" size={13} />
		</button>
		{#if sidebarTab === 'outlets'}
			<button
				class="flex items-center gap-1 px-2 py-1 rounded transition-colors
					{activeTool === 'outlet' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}"
				onclick={() => activeTool = 'outlet'}
				title="Place outlet (O)">
				<Icon name="ellipse" size={13} />
				Outlet
			</button>
		{:else if sidebarTab === 'trunks'}
			<button
				class="flex items-center gap-1 px-2 py-1 rounded transition-colors
					{activeTool === 'trunk' ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:bg-gray-100'}"
				onclick={() => activeTool = activeTool === 'trunk' ? 'select' : 'trunk'}
				title="Draw trunk (T)">
				<Icon name="route" size={13} />
				Trunk
			</button>
			{#if isDrawingTrunk()}
				<button
					class="flex items-center gap-1 px-2 py-1 rounded text-green-600 hover:bg-green-50 transition-colors"
					onclick={finishTrunkDrawing}
					title="Finish trunk (Esc/Dblclick)">
					<Icon name="check" size={13} /> Finish
				</button>
				<button
					class="flex items-center gap-1 px-2 py-1 rounded text-red-400 hover:bg-red-50 transition-colors"
					onclick={cancelTrunkDrawing}
					title="Cancel (Right-click)">
					<Icon name="x" size={13} />
				</button>
				<span class="text-[10px] text-gray-400">{drawingNodes.length} pts</span>
			{/if}
		{/if}

		{#if !calibration}
			<span class="text-amber-600 text-[10px] ml-2">Page not calibrated — set origin and scale in
				<a href="uploads" class="underline hover:text-amber-800">uploads</a></span>
		{/if}

		<div class="flex-1"></div>

		<!-- Rack actions in toolbar -->
		{#if selectedRackIds.size > 0}
			<button class="flex items-center gap-1 text-gray-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50 text-[11px]"
				onclick={() => onrotateracks?.()} title="Rotate 90° (R)">
				<Icon name="rotateRight" size={12} /> Rotate
			</button>
			<button class="flex items-center gap-1 text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 text-[11px] whitespace-nowrap"
				onclick={() => onremoveracks?.()} title="Remove from floorplan (Del)">
				<Icon name="trash" size={12} />
				{selectedRackIds.size}
			</button>
			<div class="w-px h-4 bg-gray-200"></div>
		{/if}

		<!-- View menu -->
		<div class="relative">
			<button
				class="flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors text-gray-500 hover:bg-gray-100"
				onclick={(e) => { e.stopPropagation(); viewMenuOpen = !viewMenuOpen }}>
				<Icon name="eye" size={12} /> View
			</button>
			{#if viewMenuOpen}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div class="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 w-44"
					onclick={(e) => e.stopPropagation()}>
					{#each VIEW_MENU_ITEMS as item}
						<button class="w-full flex items-center gap-2 px-3 py-1 text-[11px] text-left hover:bg-gray-50 transition-colors"
							onclick={() => toggleViewFlag(item.flag)}>
							<span class="w-4 text-center {hasViewFlag(item.flag) ? 'text-blue-600' : 'text-gray-300'}">
								{hasViewFlag(item.flag) ? '✓' : ''}
							</span>
							<!-- <span class="{hasViewFlag(item.flag) ? 'text-gray-700' : 'text-gray-400'}">{item.label}</span> -->
							<span>{item.label}</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Print preview -->
		<PrintToolbar bind:settings={printSettings} onprint={handlePrint} onsetview={handleSetView} />

		<div class="w-px h-4 bg-gray-200"></div>

		{#if onexport}
			<button
				class="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-gray-500 hover:text-green-600 hover:bg-green-50 transition-colors"
				title="Export outlets to Excel"
				onclick={() => onexport?.()}
			><Icon name="download" size={11} /> Excel</button>
			<div class="w-px h-4 bg-gray-200"></div>
		{/if}
		<button title="Toggle grayscale floorplan (G)"
			class="flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors {grayscale ? 'bg-gray-200 text-gray-700' : 'text-gray-400 hover:bg-gray-100'}"
			onclick={() => grayscale = !grayscale}>
			{grayscale ? 'Color' : 'B/W'}
		</button>

		{#if selectedIds.size > 0}
			<div class="w-px h-4 bg-gray-200"></div>
			<button class="flex items-center gap-1 text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 text-[11px] whitespace-nowrap"
				onclick={() => ondelete()} title="Delete selected (Del)">
				<Icon name="trash" size={12} />
				{selectedIds.size}
			</button>
		{/if}
	</div>

	<!-- Canvas area -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div bind:this={containerEl}
		class="relative flex-1 overflow-hidden bg-gray-100 print-canvas-container print:overflow-visible print:bg-white
			{(activeTool === 'outlet' && calibration && sidebarTab === 'outlets') || (activeTool === 'trunk' && calibration && sidebarTab === 'trunks') ? 'cursor-crosshair' : panning ? 'cursor-grabbing' : 'cursor-default'}
			{dropTarget ? 'ring-2 ring-inset ring-blue-400 bg-blue-50/20' : ''}"
		onmousedown={onMouseDown}
		onmousemove={e => { if (activeTool === 'trunk' && drawingNodes.length > 0) handleTrunkMouseMove(e) }}
		oncontextmenu={e => { e.preventDefault(); if (isDrawingTrunk()) cancelTrunkDrawing() }}
		ondblclick={onCanvasDblClick}
		ontouchstart={onTouchStart}
		ontouchmove={onTouchMove}
		ontouchend={onTouchEnd}
		ondrop={onDrop}
		ondragover={onDragOver}
		ondragleave={onDragLeave}>

		<!-- Paper overlay (moves with drawing, draggable to reposition) -->
		{#if paperScreen && !printing}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="absolute border-2 border-blue-400/60"
				style:left="{paperScreen.x}px" style:top="{paperScreen.y}px"
				style:width="{paperScreen.w}px" style:height="{paperScreen.h}px"
				style:cursor={paperDragging ? 'grabbing' : 'grab'}
				style:pointer-events="auto"
				onmousedown={onPaperMouseDown}>
				<!-- Margin dashes -->
				<div class="absolute border border-dashed border-blue-300/40 pointer-events-none"
					style:left="{paperScreen.mx}px" style:top="{paperScreen.my}px"
					style:width="{paperScreen.mw}px" style:height="{paperScreen.mh}px"></div>
				<!-- Label -->
				<span class="absolute top-1 left-2 text-[10px] text-blue-400/70 select-none pointer-events-none">
					{printSettings.paperSize} {printSettings.orientation} 1:{printSettings.scale || 'Fit'}
				</span>
			</div>
		{/if}

		<div style:transform="translate({vx}px, {vy}px) scale({zoom})" style:transform-origin="0 0" class="relative">
			<!-- PDF canvas with optional crop -->
			<div style:overflow={calibration?.crop ? 'hidden' : undefined}
				style:width={calibration?.crop ? `${crop.width}px` : undefined}
				style:height={calibration?.crop ? `${crop.height}px` : undefined}
				style:position={calibration?.crop ? 'relative' : undefined}
				style:left={calibration?.crop ? `${crop.x}px` : undefined}
				style:top={calibration?.crop ? `${crop.y}px` : undefined}>
				<canvas bind:this={canvasEl} class="will-change-transform" style:filter={grayscale ? 'grayscale(0.8)' : 'none'}
					style:margin-left={calibration?.crop ? `-${crop.x}px` : undefined}
					style:margin-top={calibration?.crop ? `-${crop.y}px` : undefined}></canvas>
			</div>

			<!-- SVG overlay -->
			<svg class="absolute top-0 left-0 pointer-events-none" width={pageW} height={pageH} style:overflow="visible">
				<!-- Trunks -->
				<TrunkRenderer
					trunks={trunks.filter(t => {
						const high = t.location === 'ceiling-plenum' || t.location === 'ceiling-tray'
						return high ? hasViewFlag(VIEW_HIGH_TRUNKS) : hasViewFlag(VIEW_LOW_TRUNKS)
					})}
					{calibration}
					{zoom}
					nodeFillMap={hasViewFlag(VIEW_LABELS) ? nodeFillMap : new Map()}
					{selectedTrunkIds}
					{selectedNodeIds}
					{drawingNodes}
					{drawingSegments}
					drawingSpec={drawingPreviewSpec}
					{rubberBandTarget}
					{ctrlKey}
					{toPx}
				/>

				<!-- Secondary routes (outlet → nearest trunk) -->
				{#if hasViewFlag(VIEW_ROUTES)}
					{#each secondaryRoutes as route (route.outletId + route.room)}
						{@const fromPx = toPx(route.from)}
						{@const toPxPt = toPx(route.to)}
						<line x1={fromPx.x} y1={fromPx.y} x2={toPxPt.x} y2={toPxPt.y}
							stroke={route.color} stroke-width={2 / zoom} opacity="0.5"
							class="pointer-events-none" />
					{/each}
				{/if}

				<!-- Snap highlight ring during node drag or drawing -->
				{#if dragSnapHighlight}
					<circle cx={dragSnapHighlight.x} cy={dragSnapHighlight.y} r={8 / zoom}
						fill="none" stroke="#06b6d4" stroke-width={2 / zoom}
						stroke-dasharray="{4 / zoom} {2 / zoom}" class="pointer-events-none" />
				{/if}
				{#if drawingSnapHighlight}
					<circle cx={drawingSnapHighlight.x} cy={drawingSnapHighlight.y} r={8 / zoom}
						fill="none" stroke="#8b5cf6" stroke-width={2 / zoom}
						stroke-dasharray="{4 / zoom} {2 / zoom}" class="pointer-events-none" />
				{/if}

				<!-- Placed racks -->
				{#if hasViewFlag(VIEW_RACKS)}
					{#each rackPlacements as placement (placement.rackId)}
						{@const rect = rackPxRect(placement)}
						{#if rect}
							{@const selected = selectedRackIds.has(placement.rackId)}
							<OutletRack
								{rect}
								{selected}
								{zoom}
								roomColor={ROOM_COLORS[placement.room] ?? '#6b7280'}
								onmousedown={e => { if (e.button === 0) { e.stopPropagation(); onMouseDown(e) }}}
							/>
						{/if}
					{/each}
				{/if}

				<!-- Copy-drag ghosts: show originals at pre-drag positions -->
				{#if dragCopying && dragStart}
					<g opacity="0.4">
						{#each outlets as outlet (outlet.id)}
							{#if dragStart.outletPositions.has(outlet.id)}
								{@const origPx = toPx(dragStart.outletPositions.get(outlet.id)!)}
								<OutletShape {outlet} px={origPx} {radiusPx} {zoom} selected={false} {activeTool} />
							{/if}
						{/each}
					</g>
				{/if}

				<!-- Outlets -->
				{#each outlets as outlet (outlet.id)}
					{#if outlet.level === 'high' ? hasViewFlag(VIEW_HIGH_OUTLETS) : hasViewFlag(VIEW_LOW_OUTLETS)}
						{@const px = outletPx(outlet)}
						{@const selected = selectedIds.has(outlet.id)}
						<OutletShape {outlet} {px} {radiusPx} {zoom} {selected} {activeTool}
							onmousedown={e => { if (e.button === 0 && activeTool === 'select') { e.stopPropagation(); onMouseDown(e) }}}
						/>
					{/if}
				{/each}

				<!-- Origin crosshair (if calibrated) -->
				{#if calibration}
					{@const ox = calibration.origin.x}
					{@const oy = calibration.origin.y}
					<circle cx={ox} cy={oy} r={12 / zoom} fill="none" stroke="#3b82f6" stroke-width={1 / zoom} opacity="0.5" />
					<line x1={ox - 18 / zoom} y1={oy} x2={ox + 18 / zoom} y2={oy} stroke="#3b82f6" stroke-width={0.5 / zoom} opacity="0.5" />
					<line x1={ox} y1={oy - 18 / zoom} x2={ox} y2={oy + 18 / zoom} stroke="#3b82f6" stroke-width={0.5 / zoom} opacity="0.5" />
				{/if}

				<!-- Drawing legend (paper-scale sizing — scales with drawing) -->
				{#if hasViewFlag(VIEW_LEGEND) && legendGeom}
				{@const u = legendGeom.u}
				{@const sw = 0.3 * u}
				{@const symOff = 1 * u}
				{@const symR = 1.5 * u}
				{@const fill = 'none'}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<g class="pointer-events-auto" style:cursor={legendDragging ? 'grabbing' : 'grab'} onmousedown={onLegendMouseDown}>
					<rect x={legendGeom.lx} y={legendGeom.ly} width={legendGeom.legendW} height={legendGeom.legendH}
						rx={1 * u} fill="white" stroke="#d1d5db" stroke-width={sw} opacity="0.95" />
					<text x={legendGeom.lx + 2.5 * u} y={legendGeom.ly + 3.5 * u} font-size={legendGeom.fontSize * 1.1} font-weight="700" fill="#111827">Legend</text>

					<!-- Wall outlets -->
					<polygon points={trianglePoints(legendGeom.symbolX, legendGeom.y1 - symOff, symR)}
						{fill} stroke="#374151" stroke-width={sw} />
					<text x={legendGeom.textX} y={legendGeom.y1} font-size={legendGeom.fontSize} fill="#111827">Wall outlet (qty: {outletTypeCounts.wall})</text>

					<!-- Floor outlets -->
					<polygon points={squarePoints(legendGeom.symbolX, legendGeom.y2 - symOff, symR * 1.2)}
						{fill} stroke="#374151" stroke-width={sw} />
					<polygon points={trianglePoints(legendGeom.symbolX, legendGeom.y2 - symOff, symR * 0.9)}
						fill="none" stroke="#374151" stroke-width={sw} opacity="0.75" />
					<text x={legendGeom.textX} y={legendGeom.y2} font-size={legendGeom.fontSize} fill="#111827">Floor outlet (qty: {outletTypeCounts.floor})</text>

					<!-- Box outlets -->
					<circle cx={legendGeom.symbolX} cy={legendGeom.y3 - symOff} r={symR}
						{fill} stroke="#374151" stroke-width={sw} />
					<polygon points={trianglePoints(legendGeom.symbolX, legendGeom.y3 - symOff, symR * 0.8)}
						fill="none" stroke="#374151" stroke-width={sw} opacity="0.75" />
					<text x={legendGeom.textX} y={legendGeom.y3} font-size={legendGeom.fontSize} fill="#111827">Box outlet (qty: {outletTypeCounts.box})</text>

					<!-- High/low trunk symbols -->
					<line x1={legendGeom.symbolX - legendGeom.symbolW / 2} y1={legendGeom.y4 - symOff} x2={legendGeom.symbolX + legendGeom.symbolW / 2} y2={legendGeom.y4 - symOff}
						stroke="#374151" stroke-width={0.4 * u} stroke-dasharray={`${1.5 * u} ${1 * u}`} />
					<text x={legendGeom.textX} y={legendGeom.y4} font-size={legendGeom.fontSize} fill="#111827">High level trunk</text>

					<line x1={legendGeom.symbolX - legendGeom.symbolW / 2} y1={legendGeom.y5 - symOff} x2={legendGeom.symbolX + legendGeom.symbolW / 2} y2={legendGeom.y5 - symOff}
						stroke="#374151" stroke-width={0.4 * u} />
					<text x={legendGeom.textX} y={legendGeom.y5} font-size={legendGeom.fontSize} fill="#111827">Low level trunk</text>
				</g>
				{/if}

				<!-- Title block + border (inside paper margin) -->
				{#if hasViewFlag(VIEW_TITLEBLOCK) && titleBlockGeom}
				{@const tb = titleBlockGeom}
				<g class="pointer-events-none">
					<!-- Border rect at margin inset -->
					<rect x={tb.bx} y={tb.by} width={tb.bw} height={tb.bh}
						fill="none" stroke="#333" stroke-width={tb.sw * 2} />

					<!-- Title block background -->
					<rect x={tb.tbX} y={tb.tbY} width={tb.tbW} height={tb.tbH}
						fill="white" stroke="#333" stroke-width={tb.sw * 3} />

					<!-- Title block sections -->
					{#each tb.rows as row, idx}
						<!-- Section rect -->
						<rect x={tb.tbX} y={row.y} width={tb.tbW} height={row.h}
							fill="none" stroke="#333" stroke-width={tb.sw} />

						<!-- Section label (small gray, top-left) -->
						{#if row.name}
							<text x={tb.tbX + 2 * tb.u} y={row.y + tb.fontSize * 1.3}
								font-size={tb.fontSize * 0.8} fill="#666" font-family="sans-serif">{row.name}:</text>
						{/if}

						<!-- Section title -->
						{#if row.title}
							{@const isFullWidth = !row.name}
							<text x={isFullWidth ? tb.tbX + tb.tbW / 2 : tb.tbX + 2 * tb.u}
								y={row.y + tb.fontSize * (row.name ? 2.8 : 2.5)}
								font-size={tb.fontSize * (isFullWidth ? 1.2 : 1)} fill="#333" font-family="sans-serif"
								text-anchor={isFullWidth ? 'middle' : 'start'}
								font-weight={isFullWidth ? 'bold' : 'normal'}>{row.title}</text>
						{/if}

						<!-- Section subtitle -->
						{#if row.subtitle}
							{@const isFullWidth = !row.name}
							<text x={isFullWidth ? tb.tbX + tb.tbW / 2 : tb.tbX + 2 * tb.u}
								y={row.y + tb.fontSize * 4}
								font-size={tb.fontSize * 0.85} fill="#666" font-family="sans-serif"
								text-anchor={isFullWidth ? 'middle' : 'start'}>{row.subtitle}</text>
						{/if}
					{/each}
				</g>
				{/if}

				<!-- Drag-select rectangle -->
				{#if dragSelectRect}
					{@const x = Math.min(dragSelectRect.x1, dragSelectRect.x2)}
					{@const y = Math.min(dragSelectRect.y1, dragSelectRect.y2)}
					{@const w = Math.abs(dragSelectRect.x2 - dragSelectRect.x1)}
					{@const h = Math.abs(dragSelectRect.y2 - dragSelectRect.y1)}
					<rect {x} {y} width={w} height={h}
						fill="rgba(6, 182, 212, 0.1)" stroke="#06b6d4" stroke-width={1 / zoom}
						stroke-dasharray="{4 / zoom} {3 / zoom}" />
				{/if}
			</svg>
		</div>
	</div>
{/if}

<style>
	@media print {
		:global(.print-hidden) { display: none !important; }
		:global(.panzoom) { background-image: none !important; }
	}
</style>
