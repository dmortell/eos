<script lang="ts">
	import { SCALE, RACK_GAP_PX } from './constants'
	import type { RackRow, RackConfig, ViewState } from './types'

	let {
		view,
		rows,
		racks,
		selectedIds,
		activeRowId,
		planTopPx = 0,
		onmoverow,
		onselectrack,
		onselectrow,
	}: {
		view: ViewState
		rows: RackRow[]
		racks: RackConfig[]
		selectedIds: Set<string>
		activeRowId: string
		planTopPx?: number
		onmoverow?: (rowId: string, originMm: { x: number; y: number }) => void
		onselectrack?: (id: string, multi?: boolean) => void
		onselectrow?: (rowId: string) => void
	} = $props()

	const GRID_MM = 100
	const RACK_GAP_MM = RACK_GAP_PX / SCALE

	function snap(v: number) { return Math.round(v / GRID_MM) * GRID_MM }

	function rowOrigin(row: RackRow): { x: number; y: number } {
		return row.plan?.originMm ?? { x: 0, y: 0 }
	}

	/**
	 * Racks for this row with cumulative X offset and front-aligned Y offset (mm).
	 *
	 * Plan convention: hot aisle at y=0 (top of diagram), cold aisle at larger y
	 * (bottom). All items align their rack-front edge at y=rackFrontDepth, so
	 * shallower items sit flush with the rack fronts. Items with
	 * `frontProtrusionMm > 0` (typically VCMs — Panduit PR2V/PE2V protrude 224mm
	 * past the rack rails) extend BELOW the rack-front line by that amount.
	 */
	function rowRacks(row: RackRow) {
		const items = racks
			.filter(r => r.rowId === row.id)
			.sort((a, b) => a.order - b.order)
		// rackFrontDepth = deepest rack (not counting VCM protrusion).
		// Fall back to deepest item if no racks (all VCMs).
		const rackItems = items.filter(r => r.type !== 'vcm')
		const rackFrontDepth = rackItems.length
			? rackItems.reduce((m, r) => Math.max(m, r.depthMm), 0)
			: items.reduce((m, r) => Math.max(m, r.depthMm), 0)
		const maxProtrusion = items.reduce((m, r) => Math.max(m, r.frontProtrusionMm ?? 0), 0)
		const rowDepth = rackFrontDepth + maxProtrusion
		let x = 0
		return items.map(r => {
			const protrusion = r.frontProtrusionMm ?? 0
			// Item front edge = rackFrontDepth + protrusion. Item top = front - item depth.
			const yMm = rackFrontDepth + protrusion - r.depthMm
			const out = { rack: r, xMm: x, yMm, rackFrontDepth, rowDepth }
			x += r.widthMm + RACK_GAP_MM
			return out
		})
	}

	// ── Row drag ──
	let dragRowId: string | null = null
	let dragStartOrigin: { x: number; y: number } | null = null
	let dragStartMouse: { x: number; y: number } | null = null

	function startRowDrag(e: MouseEvent, row: RackRow) {
		if (e.button !== 0) return
		e.preventDefault()
		e.stopPropagation()
		dragRowId = row.id
		dragStartOrigin = rowOrigin(row)
		dragStartMouse = { x: e.clientX, y: e.clientY }
		onselectrow?.(row.id)
		document.addEventListener('mousemove', onDragMove)
		document.addEventListener('mouseup', onDragEnd)
	}

	function onDragMove(e: MouseEvent) {
		if (!dragRowId || !dragStartOrigin || !dragStartMouse) return
		const dxPx = e.clientX - dragStartMouse.x
		const dyPx = e.clientY - dragStartMouse.y
		// Undo the canvas zoom + fixed SCALE to convert screen px back to mm
		const dxMm = dxPx / (view.zoom * SCALE)
		const dyMm = dyPx / (view.zoom * SCALE)
		onmoverow?.(dragRowId, {
			x: dragStartOrigin.x + dxMm,
			y: dragStartOrigin.y + dyMm,
		})
	}

	function onDragEnd() {
		if (dragRowId) {
			const row = rows.find(r => r.id === dragRowId)
			const origin = row ? rowOrigin(row) : null
			if (origin) {
				onmoverow?.(dragRowId, { x: snap(origin.x), y: snap(origin.y) })
			}
		}
		dragRowId = null
		dragStartOrigin = null
		dragStartMouse = null
		document.removeEventListener('mousemove', onDragMove)
		document.removeEventListener('mouseup', onDragEnd)
	}

	function rackFillColor(rack: RackConfig): string {
		if (rack.type === 'vcm') return '#c0392b'
		if (rack.type === 'cabinet') return '#334155'
		return '#0fa958'
	}
</script>

<div class="absolute left-0" style:top="{planTopPx}px">
	<!-- Section label -->
	<div class="absolute text-[10px] font-semibold text-gray-500 uppercase tracking-wider pointer-events-none whitespace-nowrap"
		style:left="0" style:top="-28px">
		Plan View (top-down)
	</div>

	{#each rows as row (row.id)}
		{@const origin = rowOrigin(row)}
		{@const isActive = activeRowId === row.id}
		{@const rr = rowRacks(row)}
		<div class="absolute"
			style:left="{origin.x * SCALE}px"
			style:top="{origin.y * SCALE}px"
			style:transform="rotate({row.plan?.rotationDeg ?? 0}deg)"
			style:transform-origin="0 0">

			<!-- Drag handle -->
			<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
			<div
				class="absolute select-none cursor-move px-1.5 py-0.5 rounded-t text-[10px] font-medium text-white whitespace-nowrap
					{isActive ? 'bg-blue-600' : 'bg-gray-500 hover:bg-gray-600'}"
				style:left="0"
				style:top="-18px"
				onmousedown={e => startRowDrag(e, row)}
				title="Drag to move row">
				{row.label}
				{#if row.plan}
					<span class="ml-1 opacity-80 text-[9px]">({Math.round(origin.x)}, {Math.round(origin.y)})</span>
				{/if}
			</div>

			<!-- Rack footprints (front edges aligned at bottom / cold aisle) -->
			{#each rr as { rack, xMm, yMm } (rack.id)}
				{@const selected = selectedIds.has(rack.id)}
				<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
				<div
					class="absolute border cursor-pointer flex items-center justify-center text-[10px] font-mono text-white
						{selected ? 'ring-2 ring-blue-500 border-blue-700' : 'border-gray-700/60 hover:border-gray-900'}"
					style:left="{xMm * SCALE}px"
					style:top="{yMm * SCALE}px"
					style:width="{rack.widthMm * SCALE}px"
					style:height="{rack.depthMm * SCALE}px"
					style:background={rackFillColor(rack)}
					onclick={e => { e.stopPropagation(); onselectrack?.(rack.id, e.shiftKey || e.metaKey || e.ctrlKey) }}
					title="{rack.label} · {rack.widthMm}×{rack.depthMm}mm">
					<span class="px-0.5 truncate">{rack.label}</span>
				</div>
			{/each}

			<!-- Row outline + rack-front indicator (if any racks) -->
			{#if rr.length > 0}
				{@const totalWidthMm = rr.reduce((s, x) => s + x.rack.widthMm + RACK_GAP_MM, 0) - RACK_GAP_MM}
				{@const rackFrontDepthMm = rr[0].rackFrontDepth}
				{@const rowDepthMm = rr[0].rowDepth}
				<!-- Outline wraps the full row including any VCM protrusion -->
				<div class="absolute pointer-events-none border border-dashed
					{isActive ? 'border-blue-400/80' : 'border-gray-400/50'}"
					style:left="-4px"
					style:top="-4px"
					style:width="{totalWidthMm * SCALE + 8}px"
					style:height="{rowDepthMm * SCALE + 8}px"></div>
				<!-- Rack-front line (VCMs protrude past this toward cold aisle) -->
				<div class="absolute pointer-events-none border-b-2 border-blue-500/60"
					style:left="0"
					style:top="{rackFrontDepthMm * SCALE}px"
					style:width="{totalWidthMm * SCALE}px"
					style:height="0"></div>
				<div class="absolute pointer-events-none text-[9px] text-blue-600 whitespace-nowrap"
					style:left="0"
					style:top="{rackFrontDepthMm * SCALE + 2}px">rack front</div>
			{/if}
		</div>
	{/each}
</div>
