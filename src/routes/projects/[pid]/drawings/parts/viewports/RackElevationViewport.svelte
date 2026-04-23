<script lang="ts">
	import type { Viewport } from '$lib/types/pages'
	import type { RackConfig, DeviceConfig, RackSettings, ViewState } from '../../../racks/parts/types'
	import { DEFAULT_SETTINGS, SCALE, RACK_GAP_PX, rackHeightMm } from '../../../racks/parts/constants'
	import { Firestore } from '$lib'
	import RackElevationRenderer from '../../../racks/parts/RackElevationRenderer.svelte'

	let { viewport, db }: { viewport: Viewport; db: Firestore } = $props()

	let src = $derived(viewport.source.kind === 'rack-elevation' ? viewport.source : null)

	let rackDoc = $state<any>(null)
	$effect(() => {
		const id = src?.rackDocId
		if (!id) { rackDoc = null; return }
		const unsub = db.subscribeOne('racks', id, (data: any) => { rackDoc = data ?? null })
		return () => unsub?.()
	})

	const isRUType = (t: string) => t !== 'desk' && t !== 'shelf' && t !== 'vcm'
	const hydrateRack = (r: any) => ({
		...r,
		heightMm: isRUType(r.type) ? rackHeightMm(r.heightU ?? 42) : (r.heightMm ?? 1600),
	})

	let settings = $derived<RackSettings>({ ...DEFAULT_SETTINGS, ...(rackDoc?.settings ?? {}) })
	let rawRacks = $derived<RackConfig[]>((rackDoc?.racks ?? []).map(hydrateRack))
	let devices = $derived<DeviceConfig[]>(rackDoc?.devices ?? [])
	let rows = $derived(rackDoc?.rows ?? [])

	/**
	 * Lay out racks with `_x`/`_z` for the renderer. Two modes:
	 *   - `source.rowId` set → single row at x=0…Σ widths
	 *   - `source.rowId` unset → every row in `rows` order, separated by
	 *     `ROW_GAP_MM` so multi-row pages show the full room elevation.
	 *
	 * The gap keeps rows visually distinct without needing label chrome.
	 */
	const ROW_GAP_MM = 600
	const RACK_GAP_MM = RACK_GAP_PX / SCALE

	let activeRacks = $derived.by(() => {
		const requestedRow = src?.rowId
		const targetRowIds: string[] = requestedRow
			? [requestedRow]
			: (rows.length ? rows.map((r: any) => r.id) : [undefined as unknown as string])
		const out: (RackConfig & { _x: number; _z: number })[] = []
		let x = 0
		for (const rowId of targetRowIds) {
			const rowRacks = rawRacks
				.filter(r => rowId ? r.rowId === rowId : true)
				.sort((a, b) => a.order - b.order)
			for (const rack of rowRacks) {
				out.push({ ...rack, _x: x, _z: settings.floorLevel })
				x += rack.widthMm + RACK_GAP_MM
			}
			x += ROW_GAP_MM
		}
		return out
	})

	let rearRacks = $derived.by(() => {
		if (src?.face !== 'rear' || activeRacks.length === 0) return []
		// Reverse the laid-out order; re-compute sequential _x so rear-face racks
		// render left-to-right in visual order (mirror of front).
		const reversed = [...activeRacks].reverse()
		const out: (RackConfig & { _x: number; _z: number; _face: 'rear' })[] = []
		let x = 0
		for (const rack of reversed) {
			out.push({ ...rack, _x: x, _z: settings.floorLevel, _face: 'rear' as const })
			x += rack.widthMm + RACK_GAP_MM
		}
		return out
	})

	/**
	 * Scale factor from RackElevationRenderer output (0.5 px per source-mm) to
	 * page-canvas px (1 px per paper-mm at zoom=1). A viewport.scale of 100
	 * means 1 source-mm → 0.01 paper-mm, so the renderer output (source_mm × 0.5)
	 * needs to shrink by (2 / viewport.scale) to match paper-px.
	 */
	let innerScale = $derived(viewport.scale > 0 ? 2 / viewport.scale : 0.02)

	/** Synthesize a view so the ceiling sits near the top of the viewport. */
	let slopMm = 200
	let syntheticView = $derived<ViewState>({
		x: 0, y: 0, zoom: 1, scale: SCALE, grid: 100,
		width: viewport.widthMm, height: viewport.heightMm,
		showGrid: false, panning: false, dragging: false, button: 0,
		bottom: settings.ceilingLevel + slopMm,
	})

	/** Translate so the left wall maps to x=0 in the scaled frame, plus any user-specified content offset (source-mm). */
	let offX = $derived(viewport.contentOffsetMm?.x ?? 0)
	let offY = $derived(viewport.contentOffsetMm?.y ?? 0)
	let xTranslate = $derived((-settings.leftWallX - offX) * SCALE)
	let yTranslate = $derived(-offY * SCALE)
	let noSource = $derived(!src?.rackDocId)
</script>

<div class="absolute inset-0 overflow-hidden pointer-events-none">
	{#if noSource}
		<div class="w-full h-full flex items-center justify-center text-[10px] text-zinc-400 italic">
			Pick a rack source in the properties panel
		</div>
	{:else if !rackDoc}
		<div class="w-full h-full flex items-center justify-center text-[10px] text-zinc-400 italic">
			Loading…
		</div>
	{:else}
		<div class="absolute top-0 left-0"
			style:transform="scale({innerScale}) translate({xTranslate}px, {yTranslate}px)"
			style:transform-origin="top left">
			<RackElevationRenderer
				view={syntheticView}
				{settings}
				{activeRacks}
				{rearRacks}
				face={src?.face ?? 'front'}
				{devices}
				selectedIds={new Set()}
				rackOverlaps={new Map()}
				floorLabel=""
				roomLabel=""
				readonly={true} />
		</div>
	{/if}
</div>
