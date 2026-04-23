<script lang="ts">
	import type { Viewport } from '$lib/types/pages'
	import type { RackConfig, ViewState, RoomObject, RackRow } from '../../../racks/parts/types'
	import { DEFAULT_SETTINGS, SCALE, rackHeightMm } from '../../../racks/parts/constants'
	import { Firestore } from '$lib'
	import RackPlanRenderer from '../../../racks/parts/RackPlanRenderer.svelte'

	let { viewport, db }: { viewport: Viewport; db: Firestore } = $props()

	let src = $derived(viewport.source.kind === 'rack-plan' ? viewport.source : null)

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

	let rawRows = $derived<RackRow[]>(rackDoc?.rows ?? [])
	let rows = $derived.by(() => {
		const ids = src?.rowIds
		return ids && ids.length ? rawRows.filter(r => ids.includes(r.id)) : rawRows
	})
	let racks = $derived<RackConfig[]>((rackDoc?.racks ?? []).map(hydrateRack))
	let roomObjects = $derived<RoomObject[]>(rackDoc?.roomObjects ?? [])

	/** Same scale derivation as the elevation viewport. */
	let innerScale = $derived(viewport.scale > 0 ? 2 / viewport.scale : 0.02)

	let syntheticView = $derived<ViewState>({
		x: 0, y: 0, zoom: 1, scale: SCALE, grid: 100,
		width: viewport.widthMm, height: viewport.heightMm,
		showGrid: false, panning: false, dragging: false, button: 0,
		bottom: DEFAULT_SETTINGS.ceilingLevel,
	})

	let noSource = $derived(!src?.rackDocId)
	/** User-specified content pan in source-mm. Applied before the scale transform. */
	let offX = $derived(viewport.contentOffsetMm?.x ?? 0)
	let offY = $derived(viewport.contentOffsetMm?.y ?? 0)
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
			style:transform="scale({innerScale}) translate({-offX * SCALE}px, {-offY * SCALE}px)"
			style:transform-origin="top left">
			<RackPlanRenderer
				view={syntheticView}
				{rows}
				{racks}
				{roomObjects}
				selectedIds={new Set()}
				activeRowId=""
				planTopPx={0}
				planMode="select"
				readonly={true} />
		</div>
	{/if}
</div>
