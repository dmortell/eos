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

	/** Lay out the visible racks along the x-axis. Same approach as the drawings
	 *  RackElevationViewport: target rows in `rows` order, racks sorted by `order`. */
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

	/** Total source-mm width of laid-out racks (for centering / fit-to-view). */
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

	/** Synthesize a ViewState the renderer expects. `bottom` (in source-mm) is
	 *  the y-origin used by the coordinate flip; ceiling + slop keeps the top
	 *  margin visible. */
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

	/** Fit-to-view: scale the renderer's output (in SCALE-px) so the laid-out
	 *  content fits the container, with a small margin. Workspace viewport zoom
	 *  multiplies on top so the user can still zoom in/out. */
	const fitScale = $derived.by(() => {
		if (containerSize.w === 0 || contentWidthMm === 0) return 1
		const contentPx = contentWidthMm * SCALE
		const margin = 80
		const target = Math.max(200, containerSize.w - margin)
		return Math.min(1.5, target / contentPx)
	})

	const innerScale = $derived(fitScale * ws.viewport.zoom)
	const xTranslate = $derived(-settings.leftWallX * SCALE + 40 + ws.viewport.x)
	const yTranslate = $derived(ws.viewport.y)
</script>

<div
	bind:this={containerEl}
	class="absolute inset-0 overflow-hidden bg-zinc-50 dark:bg-zinc-900"
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
			style:transform="scale({innerScale}) translate({xTranslate}px, {yTranslate}px)"
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
	{/if}
</div>
