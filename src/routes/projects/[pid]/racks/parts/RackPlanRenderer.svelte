<script lang="ts">
	import { untrack, onMount, onDestroy } from 'svelte'
	import { SCALE, RACK_GAP_PX } from './constants'
	import type { RackRow, RackConfig, ViewState, RoomObject } from './types'
	import type { PlanMode } from './PlanToolbar.svelte'

	let {
		view,
		rows,
		racks,
		roomObjects = [],
		selectedIds,
		activeRowId,
		planTopPx = 0,
		planMode = 'select',
		selectedRoomObjectId = null,
		readonly = false,
		onmoverow,
		onselectrack,
		onselectrow,
		onaddroomobject,
		onselectroomobject,
		ondeleteroomobject,
	}: {
		view: ViewState
		rows: RackRow[]
		racks: RackConfig[]
		roomObjects?: RoomObject[]
		selectedIds: Set<string>
		activeRowId: string
		planTopPx?: number
		planMode?: PlanMode
		selectedRoomObjectId?: string | null
		/** When true, all interactive affordances are suppressed — used for page viewports. */
		readonly?: boolean
		onmoverow?: (rowId: string, originMm: { x: number; y: number }) => void
		onselectrack?: (id: string, multi?: boolean) => void
		onselectrow?: (rowId: string) => void
		onaddroomobject?: (obj: RoomObject) => void
		onselectroomobject?: (id: string | null) => void
		ondeleteroomobject?: (id: string) => void
	} = $props()

	let interactive = $derived(!readonly)

	const GRID_MM = 100
	const RACK_GAP_MM = RACK_GAP_PX / SCALE

	function snap(v: number) { return Math.round(v / GRID_MM) * GRID_MM }

	function rowOrigin(row: RackRow): { x: number; y: number } {
		return row.plan?.originMm ?? { x: 0, y: 0 }
	}

	function rowRacks(row: RackRow) {
		const items = racks
			.filter(r => r.rowId === row.id)
			.sort((a, b) => a.order - b.order)
		const rackItems = items.filter(r => r.type !== 'vcm')
		const rackFrontDepth = rackItems.length
			? rackItems.reduce((m, r) => Math.max(m, r.depthMm), 0)
			: items.reduce((m, r) => Math.max(m, r.depthMm), 0)
		const maxProtrusion = items.reduce((m, r) => Math.max(m, r.frontProtrusionMm ?? 0), 0)
		const rowDepth = rackFrontDepth + maxProtrusion
		let x = 0
		return items.map(r => {
			const protrusion = r.frontProtrusionMm ?? 0
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
		if (e.button !== 0 || !interactive || !onmoverow) return
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
		if (!dragRowId || !dragStartOrigin || !dragStartMouse || !onmoverow) return
		const dxPx = e.clientX - dragStartMouse.x
		const dyPx = e.clientY - dragStartMouse.y
		const dxMm = dxPx / (view.zoom * SCALE)
		const dyMm = dyPx / (view.zoom * SCALE)
		onmoverow(dragRowId, {
			x: dragStartOrigin.x + dxMm,
			y: dragStartOrigin.y + dyMm,
		})
	}

	function onDragEnd() {
		if (dragRowId && onmoverow) {
			const row = rows.find(r => r.id === dragRowId)
			const origin = row ? rowOrigin(row) : null
			if (origin) onmoverow(dragRowId, { x: snap(origin.x), y: snap(origin.y) })
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

	// ── Room-object drawing ──
	const PLAN_CANVAS_MM = 20000

	let overlayEl = $state<HTMLDivElement | null>(null)
	let drawStart = $state<{ x: number; y: number } | null>(null)
	let hoverPoint = $state<{ x: number; y: number } | null>(null)
	let rectDragging = $state(false)

	function clientToPlanMm(clientX: number, clientY: number): { x: number; y: number } {
		if (!overlayEl) return { x: 0, y: 0 }
		const rect = overlayEl.getBoundingClientRect()
		const mmX = (clientX - rect.left) / (view.zoom * SCALE)
		const mmY = (clientY - rect.top) / (view.zoom * SCALE)
		return { x: snap(mmX), y: snap(mmY) }
	}

	function onOverlayClick(e: MouseEvent) {
		if (!interactive || !onaddroomobject || e.button !== 0) return
		const p = clientToPlanMm(e.clientX, e.clientY)
		if (planMode === 'wall') {
			if (!drawStart) {
				drawStart = p
			} else {
				if (p.x === drawStart.x && p.y === drawStart.y) return
				onaddroomobject({
					id: `obj-${Date.now()}`,
					kind: 'wall',
					position: drawStart,
					endPosition: p,
					thicknessMm: 100,
				})
				drawStart = null
			}
		} else if (planMode === 'door') {
			onaddroomobject({
				id: `obj-${Date.now()}`,
				kind: 'door',
				position: p,
				widthMm: 900,
				depthMm: 100,
				rotationDeg: 0,
				swing: 'left',
			})
		}
	}

	function onOverlayMouseMove(e: MouseEvent) {
		if (!interactive) return
		hoverPoint = clientToPlanMm(e.clientX, e.clientY)
	}

	function onOverlayMouseDown(e: MouseEvent) {
		if (!interactive || planMode !== 'rect' || e.button !== 0) return
		e.preventDefault()
		drawStart = clientToPlanMm(e.clientX, e.clientY)
		hoverPoint = drawStart
		rectDragging = true
		document.addEventListener('mousemove', onRectDragMove)
		document.addEventListener('mouseup', onRectDragEnd)
	}

	function onRectDragMove(e: MouseEvent) {
		if (!rectDragging) return
		hoverPoint = clientToPlanMm(e.clientX, e.clientY)
	}

	function onRectDragEnd(e: MouseEvent) {
		document.removeEventListener('mousemove', onRectDragMove)
		document.removeEventListener('mouseup', onRectDragEnd)
		if (!rectDragging || !drawStart) { rectDragging = false; drawStart = null; hoverPoint = null; return }
		const end = clientToPlanMm(e.clientX, e.clientY)
		const x = Math.min(drawStart.x, end.x)
		const y = Math.min(drawStart.y, end.y)
		const w = Math.abs(end.x - drawStart.x)
		const h = Math.abs(end.y - drawStart.y)
		if (w > 0 && h > 0 && onaddroomobject) {
			onaddroomobject({
				id: `obj-${Date.now()}`,
				kind: 'rect',
				position: { x, y },
				widthMm: w,
				depthMm: h,
				label: 'Object',
			})
		}
		rectDragging = false
		drawStart = null
		hoverPoint = null
	}

	function cancelDraw() {
		drawStart = null
		hoverPoint = null
	}

	$effect(() => {
		planMode
		untrack(() => {
			drawStart = null
			hoverPoint = null
		})
	})

	function onKeyDown(e: KeyboardEvent) {
		if (!interactive) return
		const t = e.target as HTMLElement | null
		if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
		if (e.key === 'Escape') { cancelDraw(); return }
		if ((e.key === 'Delete' || e.key === 'Backspace') && selectedRoomObjectId) {
			ondeleteroomobject?.(selectedRoomObjectId)
		}
	}

	onMount(() => { if (interactive) window.addEventListener('keydown', onKeyDown) })
	onDestroy(() => window.removeEventListener('keydown', onKeyDown))
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
		{@const rowBgCls = isActive
			? 'bg-blue-600'
			: interactive && onmoverow ? 'bg-gray-500 hover:bg-gray-600' : 'bg-gray-500'}
		{@const rowCursorCls = interactive && onmoverow ? 'cursor-move' : ''}
		<div class="absolute"
			style:left="{origin.x * SCALE}px"
			style:top="{origin.y * SCALE}px"
			style:transform="rotate({row.plan?.rotationDeg ?? 0}deg)"
			style:transform-origin="0 0">

			<!-- Drag handle -->
			<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
			<div
				class="absolute select-none px-1.5 py-0.5 rounded-t text-[10px] font-medium text-white whitespace-nowrap {rowBgCls} {rowCursorCls}"
				style:left="0"
				style:top="-18px"
				onmousedown={interactive && onmoverow ? (e => startRowDrag(e, row)) : undefined}
				title={interactive ? 'Drag to move row' : row.label}>
				{row.label}
				{#if row.plan}
					<span class="ml-1 opacity-80 text-[9px]">({Math.round(origin.x)}, {Math.round(origin.y)})</span>
				{/if}
			</div>

			<!-- Rack footprints -->
			{#each rr as { rack, xMm, yMm } (rack.id)}
				{@const selected = selectedIds.has(rack.id)}
				{@const rackBorderCls = selected
					? 'ring-2 ring-blue-500 border-blue-700'
					: interactive && onselectrack ? 'border-gray-700/60 hover:border-gray-900' : 'border-gray-700/60'}
				{@const rackCursorCls = interactive && onselectrack ? 'cursor-pointer' : ''}
				<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
				<div
					class="absolute border flex items-center justify-center text-[10px] font-mono text-white {rackBorderCls} {rackCursorCls}"
					style:left="{xMm * SCALE}px"
					style:top="{yMm * SCALE}px"
					style:width="{rack.widthMm * SCALE}px"
					style:height="{rack.depthMm * SCALE}px"
					style:background={rackFillColor(rack)}
					onclick={interactive && onselectrack ? (e => { e.stopPropagation(); onselectrack(rack.id, e.shiftKey || e.metaKey || e.ctrlKey) }) : undefined}
					title="{rack.label} · {rack.widthMm}×{rack.depthMm}mm">
					<span class="px-0.5 truncate">{rack.label}</span>
				</div>
			{/each}

			<!-- Row outline + rack-front indicator -->
			{#if rr.length > 0}
				{@const totalWidthMm = rr.reduce((s, x) => s + x.rack.widthMm + RACK_GAP_MM, 0) - RACK_GAP_MM}
				{@const rackFrontDepthMm = rr[0].rackFrontDepth}
				{@const rowDepthMm = rr[0].rowDepth}
				<div class="absolute pointer-events-none border border-dashed
					{isActive ? 'border-blue-400/80' : 'border-gray-400/50'}"
					style:left="-4px"
					style:top="-4px"
					style:width="{totalWidthMm * SCALE + 8}px"
					style:height="{rowDepthMm * SCALE + 8}px"></div>
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

	<!-- Room objects (walls, doors, rects) -->
	<svg
		class="absolute top-0 left-0 pointer-events-none"
		style:width="{PLAN_CANVAS_MM * SCALE}px"
		style:height="{PLAN_CANVAS_MM * SCALE}px"
		viewBox="0 0 {PLAN_CANVAS_MM} {PLAN_CANVAS_MM}"
		preserveAspectRatio="xMinYMin meet">
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		{#each roomObjects as obj (obj.id)}
			{@const isSelected = selectedRoomObjectId === obj.id}
			{@const stroke = isSelected ? '#2563eb' : (obj.color ?? '#64748b')}
			{@const clickable = interactive && !!onselectroomobject && planMode === 'select'}
			{#if obj.kind === 'wall' && obj.endPosition}
				<line
					x1={obj.position.x} y1={obj.position.y}
					x2={obj.endPosition.x} y2={obj.endPosition.y}
					stroke={stroke}
					stroke-width={obj.thicknessMm ?? 100}
					stroke-linecap="round"
					class={clickable ? 'cursor-pointer pointer-events-auto' : ''}
					onclick={clickable ? (e => { e.stopPropagation(); onselectroomobject!(obj.id) }) : undefined} />
			{:else if obj.kind === 'door'}
				{@const w = obj.widthMm ?? 900}
				{@const d = obj.depthMm ?? 100}
				{@const rot = obj.rotationDeg ?? 0}
				{@const swingSign = obj.swing === 'right' ? -1 : 1}
				<g transform="translate({obj.position.x} {obj.position.y}) rotate({rot})"
					class={clickable ? 'cursor-pointer pointer-events-auto' : ''}>
					<rect x="0" y="0" width={w} height={d} fill="none" stroke={stroke} stroke-width="40"
						onclick={clickable ? (e => { e.stopPropagation(); onselectroomobject!(obj.id) }) : undefined} />
					<path d="M 0 0 L {w} 0 A {w} {w} 0 0 {swingSign === 1 ? 1 : 0} 0 {swingSign * w} Z"
						fill="none" stroke={stroke} stroke-width="20" stroke-dasharray="50 50" opacity="0.6" />
				</g>
			{:else if obj.kind === 'rect'}
				{@const w = obj.widthMm ?? 100}
				{@const d = obj.depthMm ?? 100}
				<g class={clickable ? 'cursor-pointer pointer-events-auto' : ''}>
					<rect x={obj.position.x} y={obj.position.y} width={w} height={d}
						fill={obj.color ?? 'rgba(148, 163, 184, 0.25)'}
						stroke={stroke} stroke-width={isSelected ? 40 : 30}
						onclick={clickable ? (e => { e.stopPropagation(); onselectroomobject!(obj.id) }) : undefined} />
					{#if obj.label}
						<text x={obj.position.x + w / 2} y={obj.position.y + d / 2}
							text-anchor="middle" dominant-baseline="middle"
							font-size={Math.min(w, d) / 6} fill="#475569"
							pointer-events="none">{obj.label}</text>
					{/if}
				</g>
			{/if}
		{/each}

		<!-- Draw previews (only while interactively drawing) -->
		{#if interactive && planMode === 'wall' && drawStart && hoverPoint}
			<line x1={drawStart.x} y1={drawStart.y} x2={hoverPoint.x} y2={hoverPoint.y}
				stroke="#2563eb" stroke-width="100" stroke-linecap="round" opacity="0.5" />
		{/if}
		{#if interactive && planMode === 'wall' && drawStart}
			<circle cx={drawStart.x} cy={drawStart.y} r="80" fill="#2563eb" opacity="0.6" />
		{/if}
		{#if interactive && planMode === 'rect' && rectDragging && drawStart && hoverPoint}
			{@const rx = Math.min(drawStart.x, hoverPoint.x)}
			{@const ry = Math.min(drawStart.y, hoverPoint.y)}
			{@const rw = Math.abs(hoverPoint.x - drawStart.x)}
			{@const rh = Math.abs(hoverPoint.y - drawStart.y)}
			<rect x={rx} y={ry} width={rw} height={rh}
				fill="rgba(37, 99, 235, 0.15)" stroke="#2563eb" stroke-width="40" stroke-dasharray="80 40" />
		{/if}
	</svg>

	<!-- Drawing overlay — catches clicks in plan-mode for non-select modes -->
	{#if interactive && planMode !== 'select'}
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div
			bind:this={overlayEl}
			class="absolute top-0 left-0 cursor-crosshair"
			style:width="{PLAN_CANVAS_MM * SCALE}px"
			style:height="{PLAN_CANVAS_MM * SCALE}px"
			style:z-index="5"
			onclick={onOverlayClick}
			onmousemove={onOverlayMouseMove}
			onmousedown={onOverlayMouseDown}></div>
	{:else}
		<div bind:this={overlayEl}
			class="absolute top-0 left-0 pointer-events-none"
			style:width="{PLAN_CANVAS_MM * SCALE}px"
			style:height="{PLAN_CANVAS_MM * SCALE}px"></div>
	{/if}
</div>
