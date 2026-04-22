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

	/** Racks for this row with cumulative X offset (mm) from row origin */
	function rowRacks(row: RackRow) {
		let x = 0
		return racks
			.filter(r => r.rowId === row.id)
			.sort((a, b) => a.order - b.order)
			.map(r => {
				const out = { rack: r, xMm: x }
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

			<!-- Rack footprints -->
			{#each rr as { rack, xMm } (rack.id)}
				{@const selected = selectedIds.has(rack.id)}
				<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
				<div
					class="absolute border cursor-pointer flex items-center justify-center text-[10px] font-mono text-white
						{selected ? 'ring-2 ring-blue-500 border-blue-700' : 'border-gray-700/60 hover:border-gray-900'}"
					style:left="{xMm * SCALE}px"
					style:top="0"
					style:width="{rack.widthMm * SCALE}px"
					style:height="{rack.depthMm * SCALE}px"
					style:background={rackFillColor(rack)}
					onclick={e => { e.stopPropagation(); onselectrack?.(rack.id, e.shiftKey || e.metaKey || e.ctrlKey) }}
					title="{rack.label} · {rack.widthMm}×{rack.depthMm}mm">
					<span class="px-0.5 truncate">{rack.label}</span>
				</div>
			{/each}

			<!-- Row outline (if any racks) -->
			{#if rr.length > 0}
				{@const totalWidthMm = rr.reduce((s, x) => s + x.rack.widthMm + RACK_GAP_MM, 0) - RACK_GAP_MM}
				{@const maxDepthMm = Math.max(...rr.map(x => x.rack.depthMm))}
				<div class="absolute pointer-events-none border border-dashed
					{isActive ? 'border-blue-400/80' : 'border-gray-400/50'}"
					style:left="-4px"
					style:top="-4px"
					style:width="{totalWidthMm * SCALE + 8}px"
					style:height="{maxDepthMm * SCALE + 8}px"></div>
			{/if}
		</div>
	{/each}
</div>
