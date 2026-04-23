<script lang="ts">
	/**
	 * Frame-detail viewport — full port-grid fidelity.
	 *
	 * Subscribes to:
	 *   - `frames/{frameDocId}` for zoneLocations + floorFormat + portReservations
	 *     + customLocationTypes + serverRoomCount + legacy frames
	 *   - All 4 rooms' `racks/{frameDocId}_R{A..D}` docs so we can derive the
	 *     current FrameConfig[] via `deriveFramesFromRacks` (the frames tool's
	 *     runtime-derived shape — no direct storage)
	 *
	 * Then replicates the Frames.svelte pipeline
	 * (`generatePortLabels` → `generateRacks`) to get the full `RackData[]`,
	 * filters to the requested `frameId`, and mounts the existing
	 * `FrameDrawing.svelte` read-only, scaled to fit the viewport.
	 *
	 * Reusing `FrameDrawing.svelte` gives the page the same port-grid visual
	 * authors see inside the frames tool — labels, high-level ports, slots,
	 * opposite-face panel hatching etc. — without reimplementing any of it.
	 */
	import type { Viewport } from '$lib/types/pages'
	import type { PortLabel, RackData, PortReservation, LocType, FrameConfig, ZoneConfig } from '../../../frames/parts/types'
	import { portPosKey } from '../../../frames/parts/types'
	import { deriveFramesFromRacks, generatePortLabels, generateRacks } from '../../../frames/parts/engine'
	import { Firestore } from '$lib'
	import FrameDrawing from '../../../frames/parts/FrameDrawing.svelte'

	let { viewport, db }: { viewport: Viewport; db: Firestore } = $props()

	let src = $derived(viewport.source.kind === 'frame-detail' ? viewport.source : null)

	let framesDoc = $state<any>(null)
	$effect(() => {
		const id = src?.frameDocId
		if (!id) { framesDoc = null; return }
		const unsub = db.subscribeOne('frames', id, (data: any) => { framesDoc = data ?? null })
		return () => unsub?.()
	})

	/**
	 * Subscribe to all four room racks docs for the frame's floor. `frameDocId`
	 * is `{pid}_F{NN}`; racks live at `{pid}_F{NN}_R{room}`. Re-run whenever the
	 * frameDocId changes so switching sources cleans up stale subscriptions.
	 */
	let racksData = $state<Record<string, any>>({})
	$effect(() => {
		const base = src?.frameDocId
		if (!base) { racksData = {}; return }
		racksData = {}
		const rooms = ['A', 'B', 'C', 'D']
		const unsubs = rooms.map(rm => db.subscribeOne('racks', `${base}_R${rm}`, (data: any) => {
			racksData = { ...racksData, [rm]: data }
		}))
		return () => { unsubs.forEach(u => u?.()) }
	})

	/** Front/rear view — defaults to front (FrameDrawing also defaults to front). */
	const frameFace: 'front' | 'rear' = 'front'

	let derivedFrames = $derived<FrameConfig[]>(
		deriveFramesFromRacks(racksData, frameFace, framesDoc?.frames),
	)

	let serverRoomCount = $derived<number>(framesDoc?.serverRoomCount ?? 1)
	let floorFormat = $derived<string>(framesDoc?.floorFormat ?? 'L01')
	let zoneLocations = $derived<Record<string, any[]>>(framesDoc?.zoneLocations ?? {})

	/**
	 * Extract the floor number from `frameDocId` ({pid}_F{NN}) so the port-label
	 * engine can stamp it into each label. Falls back to 1 if the doc id doesn't
	 * match the expected pattern.
	 */
	let floor = $derived.by<number>(() => {
		const m = src?.frameDocId?.match(/_F(\d+)/)
		return m ? Number(m[1]) : 1
	})

	/** Zones that actually contain locations — skip the empty ones. */
	let zoneLetters = $derived<string[]>(
		Object.keys(zoneLocations).filter(k => zoneLocations[k]?.length > 0).sort(),
	)

	/** Flatten labels across zones; the engine handles each zone independently. */
	let allLabels = $derived<PortLabel[]>(
		zoneLetters.flatMap(z => generatePortLabels(
			{ floor, zone: z, serverRoomCount, locations: zoneLocations[z] } as ZoneConfig,
			floorFormat,
		)),
	)

	let reservationMap = $derived<Map<string, LocType>>(
		new Map(
			((framesDoc?.portReservations ?? []) as PortReservation[]).flatMap(r =>
				r.ports.map(p => [portPosKey(p), r.type] as [string, LocType]),
			),
		),
	)

	let racks = $derived<RackData[]>(
		generateRacks(
			allLabels,
			serverRoomCount,
			derivedFrames.length > 0 ? derivedFrames : undefined,
			reservationMap.size > 0 ? reservationMap : undefined,
		),
	)

	/**
	 * Visible racks — filtered to the single frame requested by the source.
	 * `FrameDrawing` also accepts a `selectedFrameId` filter, but we pre-filter
	 * here so the natural-width CSS layout only reflects the target frame
	 * (keeps the inner-scale math simple).
	 */
	let targetRacks = $derived<RackData[]>(
		src?.frameId ? racks.filter(r => r.frame.id === src.frameId) : racks,
	)

	/**
	 * The frames tool's rack card renders at a natural width around
	 * 24 cols × ~16px ≈ 400 px. We scale the entire card down to fit the
	 * viewport, keeping the aspect ratio. If content is taller than fits,
	 * overflow-hidden clips it — users can adjust `contentOffsetMm` to pan.
	 */
	const NATURAL_WIDTH_PX = 420
	let innerScale = $derived(viewport.widthMm / NATURAL_WIDTH_PX)
	let contentOffsetX = $derived(viewport.contentOffsetMm?.x ?? 0)
	let contentOffsetY = $derived(viewport.contentOffsetMm?.y ?? 0)

	let noSource = $derived(!src?.frameDocId || !src?.frameId)
</script>

<div class="absolute inset-0 overflow-hidden pointer-events-none bg-white">
	{#if noSource}
		<div class="w-full h-full flex items-center justify-center text-[10px] text-zinc-400 italic">
			Pick a frame source in the properties panel
		</div>
	{:else if !framesDoc}
		<div class="w-full h-full flex items-center justify-center text-[10px] text-zinc-400 italic">
			Loading…
		</div>
	{:else if targetRacks.length === 0}
		<div class="w-full h-full flex items-center justify-center text-[10px] text-red-500 italic px-2 text-center">
			Frame <span class="font-mono">{src?.frameId}</span> not found in this floor's racks
		</div>
	{:else}
		<div class="absolute top-0 left-0"
			style:width="{NATURAL_WIDTH_PX}px"
			style:transform="scale({innerScale}) translate({-contentOffsetX}px, {-contentOffsetY}px)"
			style:transform-origin="top left">
			<FrameDrawing
				racks={targetRacks}
				selectedFrameId={src?.frameId}
				selectedLocations={new Set()}
				selectedPorts={new Set()}
				{reservationMap}
				{frameFace} />
		</div>
	{/if}
</div>
