<script lang="ts">
	import { Titlebar } from '$lib'
	import type { FloorConfig } from '$lib/types/project'
	import type { Firestore } from '$lib/db.svelte'
	import Canvas from './parts/Canvas.svelte'
	import FloorBand from './parts/FloorBand.svelte'
	import RiserToolbar from './parts/RiserToolbar.svelte'
	import {
		DEFAULT_RISER_SETTINGS,
		type RiserDocData,
		type RiserMode,
		type ViewState,
	} from './parts/types'
	import { buildFloorBands, clampRange, totalStackHeightMm } from './parts/engine'

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
	// Persist range changes
	// ────────────────────────────────────────────────────────────────────
	let saveTimer: ReturnType<typeof setTimeout> | null = null
	function scheduleSave() {
		if (saveTimer) clearTimeout(saveTimer)
		saveTimer = setTimeout(() => {
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
				[],
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

	<div class="canvas-wrap" bind:this={canvasEl}>
		<Canvas bind:view width={canvasWidth} height={canvasHeight}>
			<svg
				width={svgWidthMm}
				height={svgHeightMm}
				viewBox="{-LEFT_MARGIN_MM} {-TOP_MARGIN_MM} {svgWidthMm} {svgHeightMm}"
				xmlns="http://www.w3.org/2000/svg"
				class="elevation-svg"
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

				<!-- Phase 2+: rooms, ladders, cables go here -->
			</svg>
		</Canvas>
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
	.canvas-wrap {
		position: relative;
		flex: 1;
		overflow: hidden;
		min-height: 0;
	}
	.elevation-svg {
		display: block;
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
