<script lang="ts">
	/**
	 * Risers viewport — read-only render of a building riser elevation inside
	 * the page editor frame. Mirrors the SVG body of Risers.svelte but without
	 * any interactivity, selection state, or editing affordances.
	 *
	 * Crop:
	 *   - The source carries `fromFloor` / `toFloor` / `hiddenFloors` so the
	 *     drawing only shows the relevant floors. Defaults to the project's
	 *     full range when omitted.
	 *   - The SVG is scaled to fit the viewport rect (via CSS transform on
	 *     the parent ViewportFrame); we render at source-mm = 1px so the
	 *     fit math stays simple.
	 */
	import type { Viewport } from '$lib/types/pages'
	import { Firestore } from '$lib'
	import { migrateFloors } from '$lib/utils/floor'
	import type { FloorConfig } from '$lib/types/project'
	import type { RiserDocData } from '../../../risers/parts/types'
	import { DEFAULT_RISER_SETTINGS } from '../../../risers/parts/types'
	import {
		buildFloorBands,
		clampRange,
		compressionBreaks,
		computeCableLanes,
		totalStackHeightMm,
	} from '../../../risers/parts/engine'
	import FloorBand from '../../../risers/parts/FloorBand.svelte'
	import Ladder from '../../../risers/parts/Ladder.svelte'
	import CablePath from '../../../risers/parts/CablePath.svelte'
	import RoomBox from '../../../risers/parts/RoomBox.svelte'
	import LabelNode from '../../../risers/parts/Label.svelte'

	let { viewport, db }: { viewport: Viewport; db: Firestore } = $props()

	const src = $derived(viewport.source.kind === 'risers' ? viewport.source : null)

	let riserData = $state<RiserDocData | null>(null)
	$effect(() => {
		const id = src?.risersDocId
		if (!id) { riserData = null; return }
		const unsub = db.subscribeOne('risers', id, (data: any) => (riserData = data ?? null))
		return () => unsub?.()
	})

	let floors = $state<FloorConfig[]>([])
	let floorFormat = $state<string>('L01')
	$effect(() => {
		const pid = src?.risersDocId
		if (!pid) return
		const unsub = db.subscribeOne('projects', pid, (data: any) => {
			if (Array.isArray(data?.floors) && data.floors.length) floors = migrateFloors(data.floors)
		})
		return () => unsub?.()
	})
	$effect(() => {
		const pid = src?.risersDocId
		if (!pid) return
		const unsub = db.subscribeOne('frames', `${pid}_F01`, (data: any) => {
			if (data?.floorFormat) floorFormat = data.floorFormat
		})
		return () => unsub?.()
	})

	// ── Geometry ──
	const floorNumbers = $derived((floors.length ? floors : (riserData?.rooms ?? []).map((r) => ({ number: r.floor }))).map((f) => f.number))
	const defaultFrom = $derived(floorNumbers.length ? Math.min(...floorNumbers) : 1)
	const defaultTo = $derived(floorNumbers.length ? Math.max(...floorNumbers) : 1)

	const range = $derived.by(() => {
		const reqFrom = src?.fromFloor ?? riserData?.fromFloor ?? defaultFrom
		const reqTo = src?.toFloor ?? riserData?.toFloor ?? defaultTo
		return clampRange(reqFrom, reqTo, floorNumbers)
	})
	const fromFloor = $derived(range.from)
	const toFloor = $derived(range.to)

	const settings = $derived(riserData?.settings ?? DEFAULT_RISER_SETTINGS)
	const rooms = $derived(riserData?.rooms ?? [])
	const ladders = $derived(riserData?.ladders ?? [])
	const cables = $derived(riserData?.cables ?? [])
	const labels = $derived(riserData?.labels ?? [])
	const hiddenFloors = $derived(src?.hiddenFloors ?? riserData?.hiddenFloors ?? [])

	const doc = $derived({
		projectId: src?.risersDocId ?? '',
		floorHeights: riserData?.floorHeights ?? {},
		settings,
		fromFloor,
		toFloor,
		hiddenFloors,
		rooms,
		ladders,
		cables,
		labels,
	} as RiserDocData)

	const bands = $derived(buildFloorBands(doc, fromFloor, toFloor))
	const breaks = $derived(compressionBreaks(bands))
	const stackHeightMm = $derived(totalStackHeightMm(bands))
	const buildingWidthMm = $derived(settings.widthMm)
	const wallY = $derived(bands[0]?.topMm ?? 0)
	const wallH = $derived(stackHeightMm)

	const cableLanes = $derived(computeCableLanes(cables, { rooms, ladders }))

	// SVG viewBox includes a left margin for the floor labels.
	const LEFT_MARGIN_MM = 1500
	const RIGHT_MARGIN_MM = 500
	const TOP_MARGIN_MM = 500
	const BOTTOM_MARGIN_MM = 500
	const svgWidthMm = $derived(LEFT_MARGIN_MM + buildingWidthMm + RIGHT_MARGIN_MM)
	const svgHeightMm = $derived(TOP_MARGIN_MM + stackHeightMm + BOTTOM_MARGIN_MM)

	const noSource = $derived(!src?.risersDocId)
</script>

<div class="absolute inset-0 overflow-hidden pointer-events-none bg-white">
	{#if noSource}
		<div class="w-full h-full flex items-center justify-center text-[10px] text-zinc-400 italic">
			Pick a risers source in the properties panel
		</div>
	{:else if !riserData}
		<div class="w-full h-full flex items-center justify-center text-[10px] text-zinc-400 italic">
			Loading…
		</div>
	{:else if bands.length === 0}
		<div class="w-full h-full flex items-center justify-center text-[10px] text-zinc-400 italic">
			No floors to render
		</div>
	{:else}
		<svg
			class="w-full h-full"
			viewBox="{-LEFT_MARGIN_MM} {-TOP_MARGIN_MM} {svgWidthMm} {svgHeightMm}"
			preserveAspectRatio="xMidYMid meet"
		>
			{#each bands as band (band.floor)}
				<FloorBand {band} widthMm={buildingWidthMm} {floors} {floorFormat} />
			{/each}

			<!-- Building walls -->
			<g class="wall left-wall">
				<line x1={0} y1={wallY} x2={0} y2={wallY + wallH} stroke="#374151" stroke-width="6" />
			</g>
			<g class="wall right-wall">
				<line x1={buildingWidthMm} y1={wallY} x2={buildingWidthMm} y2={wallY + wallH} stroke="#374151" stroke-width="6" />
			</g>

			{#each ladders as ladder (ladder.id)}
				<Ladder {ladder} {bands} {breaks} selected={false} />
			{/each}

			{#each cables as cable (cable.id)}
				{@const runs = cableLanes.get(cable.id) ?? []}
				<CablePath {cable} {runs} {rooms} {ladders} {bands} selected={false} />
			{/each}

			{#each rooms as room (room.id)}
				{@const band = bands.find((b) => b.floor === room.floor)}
				{#if band}
					<RoomBox {room} {band} selected={false} />
				{/if}
			{/each}

			{#each labels as label (label.id)}
				<LabelNode {label} selected={false} />
			{/each}
		</svg>
	{/if}
</div>
