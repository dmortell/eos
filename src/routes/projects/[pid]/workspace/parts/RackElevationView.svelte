<script lang="ts">
	import { Firestore } from '$lib'
	import {
		RackElevation,
		SCALE,
		RACK_GAP_PX,
		DEFAULT_SETTINGS,
		rackHeightMm,
		type RackConfig,
		type DeviceConfig,
		type RackSettings,
		type ViewState,
		type ElevationFace,
	} from '$lib/rack'
	import { getWorkspace } from '../state.svelte'

	const ws = getWorkspace()
	const db = new Firestore()

	/** Workspace selection drives which racks doc we subscribe to. */
	const docId = $derived.by(() => {
		if (!ws) return null
		const m = ws.selectedNodeMeta
		if (!m?.floor || !m?.room) return null
		const fl = String(m.floor).padStart(2, '0')
		return `${ws.pid}_F${fl}_R${m.room}`
	})

	let rackDoc = $state<any>(null)
	$effect(() => {
		const id = docId
		if (!id) {
			rackDoc = null
			return
		}
		const unsub = db.subscribeOne('racks', id, (data: any) => {
			rackDoc = data ?? null
		})
		return () => unsub?.()
	})

	const isRUType = (t: string) => t !== 'desk' && t !== 'shelf' && t !== 'vcm'
	const hydrateRack = (r: any) => ({
		...r,
		heightMm: isRUType(r.type) ? rackHeightMm(r.heightU ?? 42) : (r.heightMm ?? 1600),
	})

	const settings = $derived<RackSettings>({ ...DEFAULT_SETTINGS, ...(rackDoc?.settings ?? {}) })
	const allRacks = $derived<RackConfig[]>((rackDoc?.racks ?? []).map(hydrateRack))
	const devices = $derived<DeviceConfig[]>(rackDoc?.devices ?? [])
	const rows = $derived(rackDoc?.rows ?? [])

	/** Which racks to render. Driven by the tree selection kind:
	 *   - `rack`  → just that one rack
	 *   - `row`   → all racks in that row
	 *   - `serverRoom` → all racks in the room (all rows) */
	const visibleRackIds = $derived.by(() => {
		const m = ws.selectedNodeMeta
		const kind = ws.selectedNodeKind
		if (!m) return new Set<string>(allRacks.map((r) => r.id))
		if (kind === 'rack' && m.rackId) return new Set([m.rackId])
		if (kind === 'row' && m.rowId) {
			return new Set(allRacks.filter((r) => r.rowId === m.rowId).map((r) => r.id))
		}
		return new Set<string>(allRacks.map((r) => r.id))
	})

	const RACK_GAP_MM = RACK_GAP_PX / SCALE

	const activeRacks = $derived.by(() => {
		const rowIds: string[] = rows.length ? rows.map((r: any) => r.id) : [undefined as unknown as string]
		const out: (RackConfig & { _x: number; _z: number })[] = []
		let x = 0
		for (const rowId of rowIds) {
			const rowRacks = allRacks
				.filter((r) => (rowId ? r.rowId === rowId : true))
				.filter((r) => visibleRackIds.has(r.id))
				.sort((a, b) => a.order - b.order)
			for (const rack of rowRacks) {
				out.push({ ...rack, _x: x, _z: settings.floorLevel })
				x += rack.widthMm + RACK_GAP_MM
			}
		}
		return out
	})

	const contentWidthMm = $derived(activeRacks.reduce((max, r) => Math.max(max, r._x + r.widthMm), 0))

	let containerEl = $state<HTMLDivElement | null>(null)
	let containerSize = $state({ w: 0, h: 0 })
	$effect(() => {
		if (!containerEl) return
		const ro = new ResizeObserver(() => {
			if (!containerEl) return
			containerSize = { w: containerEl.clientWidth, h: containerEl.clientHeight }
		})
		ro.observe(containerEl)
		return () => ro.disconnect()
	})

	const slopMm = 200
	const syntheticView = $derived<ViewState>({
		x: 0,
		y: 0,
		zoom: 1,
		scale: SCALE,
		grid: 100,
		width: containerSize.w,
		height: containerSize.h,
		showGrid: false,
		panning: false,
		dragging: false,
		button: 0,
		bottom: settings.ceilingLevel + slopMm,
	})

	/** Fit-to-view scale chosen so the laid-out content occupies most of the
	 *  container width at workspace zoom = 1. The user's pan/zoom is applied as
	 *  an outer transform on top of this so the math stays decoupled. */
	const fitScale = $derived.by(() => {
		if (containerSize.w === 0 || contentWidthMm === 0) return 1
		const contentPx = contentWidthMm * SCALE
		const margin = 80
		const target = Math.max(200, containerSize.w - margin)
		return Math.min(1.5, target / contentPx)
	})

	const fitTranslateX = $derived(-settings.leftWallX * SCALE + 40)
	const fitTranslateY = $derived(0)

	// ── Pan / zoom gestures ─────────────────────────────────────────────────

	let panning = $state(false)
	let panLast = { x: 0, y: 0 }
	let panButton = 0

	function onPointerDown(e: PointerEvent) {
		// Right (2) or middle (1) button starts a pan. Left button is reserved
		// for selection / interaction in views that overlay on top.
		if (e.button !== 1 && e.button !== 2) return
		e.preventDefault()
		panning = true
		panButton = e.button
		panLast = { x: e.clientX, y: e.clientY }
		containerEl?.setPointerCapture(e.pointerId)
	}

	function onPointerMove(e: PointerEvent) {
		if (!panning) return
		const dx = e.clientX - panLast.x
		const dy = e.clientY - panLast.y
		panLast = { x: e.clientX, y: e.clientY }
		ws.viewport = {
			...ws.viewport,
			x: ws.viewport.x + dx,
			y: ws.viewport.y + dy,
		}
	}

	function onPointerUp(e: PointerEvent) {
		if (!panning) return
		panning = false
		try {
			containerEl?.releasePointerCapture(e.pointerId)
		} catch {
			// pointer already released
		}
	}

	/** Wheel: ctrl/alt/meta or right-button-held = zoom around cursor; otherwise pan. */
	$effect(() => {
		if (!containerEl) return
		const el = containerEl

		function onWheel(e: WheelEvent) {
			const isZoom = e.ctrlKey || e.altKey || e.metaKey || (panning && panButton === 2)
			e.preventDefault()
			if (isZoom) {
				const rect = el.getBoundingClientRect()
				const cx = e.clientX - rect.left
				const cy = e.clientY - rect.top
				const step = Math.exp(-e.deltaY * 0.0015)
				const newZoom = Math.max(0.1, Math.min(20, ws.viewport.zoom * step))
				const factor = newZoom / ws.viewport.zoom
				ws.viewport = {
					x: cx - factor * (cx - ws.viewport.x),
					y: cy - factor * (cy - ws.viewport.y),
					zoom: newZoom,
				}
			} else {
				// Plain wheel pans. Shift+wheel pans horizontally (browser convention).
				const dx = e.shiftKey ? e.deltaY : e.deltaX
				const dy = e.shiftKey ? 0 : e.deltaY
				ws.viewport = {
					...ws.viewport,
					x: ws.viewport.x - dx,
					y: ws.viewport.y - dy,
				}
			}
		}

		el.addEventListener('wheel', onWheel, { passive: false })
		return () => el.removeEventListener('wheel', onWheel)
	})

	function onContextMenu(e: MouseEvent) {
		// Right-click is reserved for pan; suppress the browser context menu over
		// the canvas so panning doesn't pop a menu on mouse-up.
		e.preventDefault()
	}

	function resetView() {
		ws.viewport = { x: 0, y: 0, zoom: 1 }
	}
</script>

<div
	bind:this={containerEl}
	class="absolute inset-0 overflow-hidden bg-zinc-50 dark:bg-zinc-900 select-none"
	style:cursor={panning ? 'grabbing' : 'default'}
	style:touch-action="none"
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointercancel={onPointerUp}
	oncontextmenu={onContextMenu}
	role="img"
	aria-label="Rack elevation"
>
	{#if !docId}
		<div class="absolute inset-0 grid place-items-center text-xs text-zinc-400">
			Select a rack, row, or server room in the navigator.
		</div>
	{:else if !rackDoc}
		<div class="absolute inset-0 grid place-items-center text-xs text-zinc-400">
			Loading rack data…
		</div>
	{:else if activeRacks.length === 0}
		<div class="absolute inset-0 grid place-items-center text-xs text-zinc-400">
			No racks to render for this selection.
		</div>
	{:else}
		<div
			class="absolute top-0 left-0 origin-top-left"
			style:transform="translate({ws.viewport.x}px, {ws.viewport.y}px) scale({ws.viewport.zoom})"
		>
			<div
				class="absolute top-0 left-0 origin-top-left"
				style:transform="scale({fitScale}) translate({fitTranslateX}px, {fitTranslateY}px)"
			>
				<RackElevation
					view={syntheticView}
					{settings}
					{activeRacks}
					rearRacks={[]}
					face={'front' as ElevationFace}
					{devices}
					selectedIds={new Set<string>()}
					rackOverlaps={new Map<string, Set<number>>()}
					floorLabel=""
					roomLabel=""
					readonly={true}
				/>
			</div>
		</div>

		<!-- Reset / zoom indicator (bottom-left) -->
		<div class="absolute bottom-2 left-2 flex items-center gap-2 text-[10px] font-mono text-zinc-500 bg-white/70 dark:bg-zinc-900/70 rounded px-2 py-1 backdrop-blur">
			<button
				class="hover:text-zinc-900 dark:hover:text-zinc-100"
				onclick={resetView}
				title="Reset view (pan to 0,0, zoom 1×)"
			>reset</button>
			<span>{(ws.viewport.zoom * 100).toFixed(0)}%</span>
		</div>
	{/if}
</div>
