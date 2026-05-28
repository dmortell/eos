<script lang="ts">
	import { Titlebar } from '$lib'
	import type { FloorConfig } from '$lib/types/project'
	import type { Firestore } from '$lib/db.svelte'
	import Canvas from './parts/Canvas.svelte'
	import FloorBand from './parts/FloorBand.svelte'
	import RoomBox from './parts/RoomBox.svelte'
	import Ladder from './parts/Ladder.svelte'
	import PropertiesPanel from './parts/PropertiesPanel.svelte'
	import RiserToolbar from './parts/RiserToolbar.svelte'
	import {
		DEFAULT_RISER_SETTINGS,
		type RiserDocData,
		type RiserMode,
		type RiserRoom,
		type Ladder as LadderType,
		type ViewState,
	} from './parts/types'
	import type { ChangeDetail } from '$lib/logger'
	import {
		bandAtY,
		buildFloorBands,
		clampRange,
		nextId,
		svgPointFromClient,
		totalStackHeightMm,
	} from './parts/engine'

	let {
		data = null,
		floors = [],
		projectId: _projectId = '',
		projectName = '',
		floorFormat = 'L01',
		drawingId: _drawingId = '',
		db: _db,
		uid: _uid = '',
		onsave,
		onupdatefloors: _onupdatefloors,
		ondeletefloor: _ondeletefloor,
	}: {
		data?: RiserDocData | null
		floors?: FloorConfig[]
		projectId?: string
		projectName?: string
		floorFormat?: string
		drawingId?: string
		db: Firestore
		uid?: string
		onsave: (payload: Partial<RiserDocData>, changes: any[]) => void
		onupdatefloors?: (updated: FloorConfig[]) => void
		ondeletefloor?: (fl: number) => void
	} = $props()

	// ────────────────────────────────────────────────────────────────────
	// Doc state — defaults applied when no Firestore doc exists yet.
	// ────────────────────────────────────────────────────────────────────
	const floorNumbers = $derived(floors.map((f) => f.number))
	const defaultFrom = $derived(Math.min(...(floorNumbers.length ? floorNumbers : [1])))
	const defaultTo = $derived(Math.max(...(floorNumbers.length ? floorNumbers : [1])))

	let fromFloor = $state(data?.fromFloor ?? 1)
	let toFloor = $state(data?.toFloor ?? 1)
	let floorHeights = $state<Record<number, any>>(data?.floorHeights ?? {})
	let settings = $state(data?.settings ?? DEFAULT_RISER_SETTINGS)
	let rooms = $state(data?.rooms ?? [])
	let ladders = $state(data?.ladders ?? [])
	let cables = $state(data?.cables ?? [])
	let initialised = $state(!!data)

	// First-time initialisation: pick whole-building range if doc didn't exist.
	$effect(() => {
		if (!initialised && floorNumbers.length) {
			fromFloor = defaultFrom
			toFloor = defaultTo
			initialised = true
		}
	})

	// Keep range valid as floors change.
	$effect(() => {
		const r = clampRange(fromFloor, toFloor, floorNumbers)
		if (r.from !== fromFloor) fromFloor = r.from
		if (r.to !== toFloor) toFloor = r.to
	})

	// ────────────────────────────────────────────────────────────────────
	// Geometry — bands + size
	// ────────────────────────────────────────────────────────────────────
	const doc = $derived({
		projectId: _projectId,
		floorHeights,
		settings,
		fromFloor,
		toFloor,
		rooms,
		ladders,
		cables,
	} as RiserDocData)

	const bands = $derived(buildFloorBands(doc, fromFloor, toFloor))
	const stackHeightMm = $derived(totalStackHeightMm(bands))
	const buildingWidthMm = $derived(settings.widthMm)

	// SVG viewBox includes a left margin for the floor labels.
	const LEFT_MARGIN_MM = 1500
	const RIGHT_MARGIN_MM = 500
	const TOP_MARGIN_MM = 500
	const BOTTOM_MARGIN_MM = 500
	const svgWidthMm = $derived(LEFT_MARGIN_MM + buildingWidthMm + RIGHT_MARGIN_MM)
	const svgHeightMm = $derived(TOP_MARGIN_MM + stackHeightMm + BOTTOM_MARGIN_MM)

	// ────────────────────────────────────────────────────────────────────
	// Canvas viewport
	// ────────────────────────────────────────────────────────────────────
	let canvasEl: HTMLDivElement | null = $state(null)
	let canvasWidth = $state(800)
	let canvasHeight = $state(600)

	$effect(() => {
		if (!canvasEl) return
		const ro = new ResizeObserver((entries) => {
			for (const e of entries) {
				canvasWidth = e.contentRect.width
				canvasHeight = e.contentRect.height
			}
		})
		ro.observe(canvasEl)
		return () => ro.disconnect()
	})

	// Initial fit: scale so the full stack fits with some padding.
	let view = $state<ViewState>({
		x: 20,
		y: 20,
		zoom: 0.06,
		width: 0,
		height: 0,
		panning: false,
		button: 0,
	})

	let mode = $state<RiserMode>('select')

	// Fit-to-view
	function zoomFit() {
		if (!svgWidthMm || !svgHeightMm) return
		const padding = 40
		const sx = (canvasWidth - padding * 2) / pxFromMm(svgWidthMm)
		const sy = (canvasHeight - padding * 2) / pxFromMm(svgHeightMm)
		view.zoom = Math.max(0.001, Math.min(sx, sy))
		view.x = padding
		view.y = padding
	}

	// mm → px at zoom 1 (SVG viewBox units are mm; we scale visually via the wrapper).
	function pxFromMm(mm: number) {
		// We render SVG with width = svgWidthMm px (1mm = 1px in the SVG world),
		// then the Canvas transform scales it. So pxFromMm at zoom 1 == mm.
		return mm
	}

	function zoomIn() {
		view.zoom = Math.min(5, view.zoom * 1.2)
	}
	function zoomOut() {
		view.zoom = Math.max(0.001, view.zoom / 1.2)
	}

	// Re-fit when stack dimensions change meaningfully (only before the user
	// has interacted — afterwards, leave their zoom/pan alone).
	let userInteracted = $state(false)
	$effect(() => {
		// Touch dependencies so this effect fires when geometry changes.
		void svgWidthMm
		void svgHeightMm
		void canvasWidth
		void canvasHeight
		if (!userInteracted && canvasWidth > 0 && canvasHeight > 0) zoomFit()
	})
	$effect(() => {
		// Mark interaction on any pan / explicit zoom.
		if (view.panning) userInteracted = true
	})

	// ────────────────────────────────────────────────────────────────────
	// Persist + change logging
	// ────────────────────────────────────────────────────────────────────
	let saveTimer: ReturnType<typeof setTimeout> | null = null
	let pendingChanges: ChangeDetail[] = []

	function logChange(c: ChangeDetail) {
		pendingChanges.push(c)
	}

	function scheduleSave() {
		if (saveTimer) clearTimeout(saveTimer)
		saveTimer = setTimeout(() => {
			const changes = pendingChanges
			pendingChanges = []
			onsave(
				{
					fromFloor,
					toFloor,
					floorHeights,
					settings,
					rooms,
					ladders,
					cables,
				},
				changes,
			)
		}, 400)
	}

	$effect(() => {
		// Track all persisted fields.
		void fromFloor
		void toFloor
		void floorHeights
		void settings
		void rooms
		void ladders
		void cables
		if (initialised) scheduleSave()
	})

	// ────────────────────────────────────────────────────────────────────
	// Selection + interaction
	// ────────────────────────────────────────────────────────────────────
	let selection = $state<{ kind: 'room' | 'ladder'; id: string } | null>(null)
	let svgEl: SVGSVGElement | null = $state(null)

	// Drag state for moving rooms / ladders horizontally
	type DragState =
		| null
		| { kind: 'room'; id: string; startMmX: number; itemStartX: number; moved: boolean }
		| { kind: 'ladder'; id: string; startMmX: number; itemStartX: number; moved: boolean }
		| { kind: 'ladderDraft'; startMmX: number; startFloor: number; currentFloor: number; currentMmX: number }
	let drag = $state<DragState>(null)

	function clientToMm(e: MouseEvent) {
		if (!svgEl) return { x: 0, y: 0 }
		return svgPointFromClient(svgEl, e.clientX, e.clientY)
	}

	function selectRoom(id: string) { selection = { kind: 'room', id } }
	function selectLadder(id: string) { selection = { kind: 'ladder', id } }
	function clearSelection() { selection = null }

	function onRoomMouseDown(roomId: string, e: MouseEvent) {
		if (e.button !== 0) return
		e.stopPropagation()
		selectRoom(roomId)
		const room = rooms.find((r) => r.id === roomId)
		if (!room) return
		const start = clientToMm(e)
		drag = { kind: 'room', id: roomId, startMmX: start.x, itemStartX: room.xMm, moved: false }
		document.addEventListener('mousemove', onDragMove)
		document.addEventListener('mouseup', onDragEnd)
	}

	function onLadderMouseDown(ladderId: string, e: MouseEvent) {
		if (e.button !== 0) return
		e.stopPropagation()
		selectLadder(ladderId)
		const ladder = ladders.find((l) => l.id === ladderId)
		if (!ladder) return
		const start = clientToMm(e)
		drag = { kind: 'ladder', id: ladderId, startMmX: start.x, itemStartX: ladder.xMm, moved: false }
		document.addEventListener('mousemove', onDragMove)
		document.addEventListener('mouseup', onDragEnd)
	}

	function onSvgMouseDown(e: MouseEvent) {
		if (e.button !== 0) return
		const p = clientToMm(e)
		const band = bandAtY(bands, p.y)

		if (mode === 'addServer' || mode === 'addEps') {
			if (!band) return
			const kind = mode === 'addServer' ? 'server' : 'eps'
			const newRoom: RiserRoom = {
				id: nextId('room'),
				kind,
				floor: band.floor,
				xMm: Math.max(600, Math.min(buildingWidthMm - 600, p.x)),
				widthMm: kind === 'server' ? 1200 : 800,
				label: defaultRoomLabel(kind, band.floor),
			}
			rooms = [...rooms, newRoom]
			selectRoom(newRoom.id)
			logChange({ action: 'add', field: kind === 'server' ? 'server-room' : 'eps-room', to: newRoom.label, details: `floor ${band.floor}` })
			// Stay in add mode so multiple rooms can be dropped quickly.
			return
		}

		if (mode === 'addLadder') {
			if (!band) return
			drag = {
				kind: 'ladderDraft',
				startMmX: Math.max(0, Math.min(buildingWidthMm, p.x)),
				startFloor: band.floor,
				currentFloor: band.floor,
				currentMmX: p.x,
			}
			document.addEventListener('mousemove', onDragMove)
			document.addEventListener('mouseup', onDragEnd)
			return
		}

		// Select mode: background click clears selection.
		clearSelection()
	}

	function onDragMove(e: MouseEvent) {
		const d = drag
		if (!d) return
		const p = clientToMm(e)

		if (d.kind === 'room') {
			const idx = rooms.findIndex((r) => r.id === d.id)
			if (idx < 0) return
			const newX = Math.max(100, Math.min(buildingWidthMm - 100, d.itemStartX + (p.x - d.startMmX)))
			rooms[idx] = { ...rooms[idx], xMm: newX }
			d.moved = true
		} else if (d.kind === 'ladder') {
			const idx = ladders.findIndex((l) => l.id === d.id)
			if (idx < 0) return
			const newX = Math.max(50, Math.min(buildingWidthMm - 50, d.itemStartX + (p.x - d.startMmX)))
			ladders[idx] = { ...ladders[idx], xMm: newX }
			d.moved = true
		} else if (d.kind === 'ladderDraft') {
			const band = bandAtY(bands, p.y)
			d.currentFloor = band ? band.floor : d.currentFloor
			d.currentMmX = p.x
		}
	}

	function onDragEnd(_e: MouseEvent) {
		document.removeEventListener('mousemove', onDragMove)
		document.removeEventListener('mouseup', onDragEnd)
		const d = drag
		if (!d) return

		if (d.kind === 'room' && d.moved) {
			const r = rooms.find((x) => x.id === d.id)
			if (r) logChange({ action: 'update', field: 'room.xMm', to: r.xMm, details: r.label })
		} else if (d.kind === 'ladder' && d.moved) {
			const l = ladders.find((x) => x.id === d.id)
			if (l) logChange({ action: 'update', field: 'ladder.xMm', to: l.xMm, details: l.label })
		} else if (d.kind === 'ladderDraft') {
			const lo = Math.min(d.startFloor, d.currentFloor)
			const hi = Math.max(d.startFloor, d.currentFloor)
			const newLadder: LadderType = {
				id: nextId('ladder'),
				label: `RISER-${ladders.length + 1}`,
				xMm: Math.max(50, Math.min(buildingWidthMm - 50, d.startMmX)),
				fromFloor: lo,
				toFloor: hi,
				level: 'both',
				widthMm: 150,
			}
			ladders = [...ladders, newLadder]
			selectLadder(newLadder.id)
			logChange({ action: 'add', field: 'ladder', to: newLadder.label, details: `floors ${lo}–${hi}` })
		}
		drag = null
	}

	// Cleanup if component unmounts mid-drag.
	$effect(() => {
		return () => {
			document.removeEventListener('mousemove', onDragMove)
			document.removeEventListener('mouseup', onDragEnd)
		}
	})

	// ────────────────────────────────────────────────────────────────────
	// CRUD helpers (exposed to PropertiesPanel)
	// ────────────────────────────────────────────────────────────────────
	function defaultRoomLabel(kind: 'server' | 'eps', floor: number) {
		const fl = String(floor).padStart(2, '0')
		if (kind === 'server') {
			const existing = rooms.filter((r) => r.kind === 'server' && r.floor === floor).length
			const tag = ['A', 'B', 'C', 'D'][existing] ?? `${existing + 1}`
			return `SER${fl}-${tag}`
		}
		const existing = rooms.filter((r) => r.kind === 'eps' && r.floor === floor).length
		const tag = ['A', 'B', 'C', 'D'][existing] ?? `${existing + 1}`
		return `EPS${fl}-${tag}`
	}

	function updateRoom(id: string, patch: Partial<RiserRoom>) {
		const idx = rooms.findIndex((r) => r.id === id)
		if (idx < 0) return
		const before = rooms[idx]
		rooms[idx] = { ...before, ...patch }
		for (const [k, v] of Object.entries(patch)) {
			logChange({ action: 'update', field: `room.${k}`, from: (before as any)[k], to: v, details: before.label })
		}
	}

	function updateLadder(id: string, patch: Partial<LadderType>) {
		const idx = ladders.findIndex((l) => l.id === id)
		if (idx < 0) return
		const before = ladders[idx]
		ladders[idx] = { ...before, ...patch }
		for (const [k, v] of Object.entries(patch)) {
			logChange({ action: 'update', field: `ladder.${k}`, from: (before as any)[k], to: v, details: before.label })
		}
	}

	function deleteSelected() {
		if (!selection) return
		if (selection.kind === 'room') {
			const room = rooms.find((r) => r.id === selection!.id)
			rooms = rooms.filter((r) => r.id !== selection!.id)
			// Strip the room from any cables that referenced it.
			cables = cables
				.map((c) => ({ ...c, segments: c.segments.filter((s) => s.roomId !== selection!.id) }))
				.filter((c) => c.segments.length >= 2)
			if (room) logChange({ action: 'delete', field: 'room', from: room.label })
		} else {
			const ladder = ladders.find((l) => l.id === selection!.id)
			ladders = ladders.filter((l) => l.id !== selection!.id)
			cables = cables.map((c) => ({
				...c,
				segments: c.segments.map((s) => (s.ladderId === selection!.id ? { ...s, ladderId: undefined } : s)),
			}))
			if (ladder) logChange({ action: 'delete', field: 'ladder', from: ladder.label })
		}
		selection = null
	}

	function onKeyDown(e: KeyboardEvent) {
		const target = e.target as HTMLElement
		if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT') return
		if (e.key === 'Delete' || e.key === 'Backspace') {
			if (selection) {
				e.preventDefault()
				deleteSelected()
			}
		} else if (e.key === 'Escape') {
			clearSelection()
			drag = null
		}
	}

	$effect(() => {
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	})

	// ────────────────────────────────────────────────────────────────────
	// Ladder draft preview (during click-drag in addLadder mode)
	// ────────────────────────────────────────────────────────────────────
	const draftLadder = $derived.by(() => {
		if (!drag || drag.kind !== 'ladderDraft') return null
		const lo = Math.min(drag.startFloor, drag.currentFloor)
		const hi = Math.max(drag.startFloor, drag.currentFloor)
		const top = bands.find((b) => b.floor === hi)
		const bot = bands.find((b) => b.floor === lo)
		if (!top || !bot) return null
		return {
			x: drag.startMmX - 75,
			y: top.topMm,
			width: 150,
			height: bot.slabBottomMm - top.topMm,
		}
	})
</script>

<div class="page">
	<Titlebar title={projectName ? `Risers — ${projectName}` : 'Risers'} menu />

	<RiserToolbar
		bind:fromFloor
		bind:toFloor
		bind:mode
		{floors}
		{floorFormat}
		onZoomIn={zoomIn}
		onZoomOut={zoomOut}
		onZoomFit={() => {
			userInteracted = false
			zoomFit()
		}}
	/>

	<div class="body" class:cursor-crosshair={mode !== 'select'}>
		<div class="canvas-wrap" bind:this={canvasEl}>
			<Canvas bind:view width={canvasWidth} height={canvasHeight}>
				<svg
					bind:this={svgEl}
					width={svgWidthMm}
					height={svgHeightMm}
					viewBox="{-LEFT_MARGIN_MM} {-TOP_MARGIN_MM} {svgWidthMm} {svgHeightMm}"
					xmlns="http://www.w3.org/2000/svg"
					class="elevation-svg"
					onmousedown={onSvgMouseDown}
				>
					<!-- Optional grid -->
					{#if settings.showGrid}
						<defs>
							<pattern
								id="riser-grid"
								width="1000"
								height="1000"
								patternUnits="userSpaceOnUse"
							>
								<path
									d="M 1000 0 L 0 0 0 1000"
									fill="none"
									stroke="rgba(120,120,140,0.12)"
									stroke-width="2"
								/>
							</pattern>
						</defs>
						<rect
							x={-LEFT_MARGIN_MM}
							y={-TOP_MARGIN_MM}
							width={svgWidthMm}
							height={svgHeightMm}
							fill="url(#riser-grid)"
						/>
					{/if}

					<!-- Floor bands -->
					{#each bands as band (band.floor)}
						<FloorBand {band} widthMm={buildingWidthMm} {floors} {floorFormat} />
					{/each}

					<!-- Ladders (drawn before rooms so rooms read in front at the floor level) -->
					{#each ladders as ladder (ladder.id)}
						<Ladder
							{ladder}
							{bands}
							selected={selection?.kind === 'ladder' && selection.id === ladder.id}
							onmousedown={(e) => onLadderMouseDown(ladder.id, e)}
						/>
					{/each}

					<!-- Rooms -->
					{#each rooms as room (room.id)}
						{@const band = bands.find((b) => b.floor === room.floor)}
						{#if band}
							<RoomBox
								{room}
								{band}
								selected={selection?.kind === 'room' && selection.id === room.id}
								onmousedown={(e) => onRoomMouseDown(room.id, e)}
							/>
						{/if}
					{/each}

					<!-- Ladder draft preview -->
					{#if draftLadder}
						<rect
							x={draftLadder.x}
							y={draftLadder.y}
							width={draftLadder.width}
							height={draftLadder.height}
							class="draft-ladder"
						/>
					{/if}
				</svg>
			</Canvas>
		</div>

		<PropertiesPanel
			{selection}
			{rooms}
			{ladders}
			onUpdateRoom={updateRoom}
			onUpdateLadder={updateLadder}
			onDelete={deleteSelected}
		/>
	</div>

	<div class="status-bar">
		<span class="status-item">
			Floors {fromFloor === toFloor ? fromFloor : `${Math.min(fromFloor, toFloor)}–${Math.max(fromFloor, toFloor)}`}
		</span>
		<span class="status-sep">·</span>
		<span class="status-item">
			Stack {(stackHeightMm / 1000).toFixed(1)} m
		</span>
		<span class="status-grow"></span>
		<span class="status-item zoom-indicator" title="Click to fit">
			<button type="button" class="zoom-btn" onclick={() => { userInteracted = false; zoomFit() }}>
				Zoom {(view.zoom * 100).toFixed(view.zoom < 0.1 ? 2 : 0)}%
			</button>
		</span>
	</div>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		height: 100vh;
		overflow: hidden;
	}
	.body {
		flex: 1;
		display: flex;
		min-height: 0;
	}
	.body.cursor-crosshair {
		cursor: crosshair;
	}
	.canvas-wrap {
		position: relative;
		flex: 1;
		overflow: hidden;
		min-height: 0;
	}
	.elevation-svg {
		display: block;
		user-select: none;
	}
	.draft-ladder {
		fill: rgba(100, 70, 140, 0.3);
		stroke: rgb(100, 70, 140);
		stroke-width: 3;
		stroke-dasharray: 16 8;
		vector-effect: non-scaling-stroke;
		pointer-events: none;
	}
	.status-bar {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.25rem 0.7rem;
		border-top: 1px solid rgb(228, 228, 231);
		background: rgb(250, 250, 252);
		font-size: 0.75rem;
		color: rgb(82, 82, 91);
		font-variant-numeric: tabular-nums;
	}
	:global(.dark) .status-bar {
		background: rgb(24, 24, 27);
		border-top-color: rgb(39, 39, 42);
		color: rgb(161, 161, 170);
	}
	.status-sep { opacity: 0.4; }
	.status-grow { flex: 1; }
	.zoom-btn {
		background: none;
		border: none;
		color: inherit;
		font: inherit;
		font-variant-numeric: tabular-nums;
		cursor: pointer;
		padding: 0.05rem 0.35rem;
		border-radius: 0.25rem;
	}
	.zoom-btn:hover {
		background: rgba(120, 120, 140, 0.15);
		color: rgb(24, 24, 27);
	}
	:global(.dark) .zoom-btn:hover {
		background: rgba(180, 180, 200, 0.15);
		color: rgb(244, 244, 245);
	}
</style>
