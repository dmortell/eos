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
		onupdateroomobject,
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
		onupdateroomobject?: (id: string, patch: Partial<RoomObject>) => void
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

	/**
	 * Architectural-style rack palette — light fills with strong borders so the
	 * plan reads like a CAD plan rather than a saturated block diagram. Each
	 * rack type gets a distinct hue plus a subtle diagonal stripe pattern for
	 * non-rack items (VCMs, cabinets) so type differences still register at a
	 * glance when labels are too small to read.
	 */
	interface RackStyle {
		fill: string
		border: string
		text: string
		pattern?: string // CSS linear-gradient for diagonal stripes, optional
	}
	function rackStyle(rack: RackConfig): RackStyle {
		if (rack.type === 'vcm') {
			return {
				fill: '#fef2f2',
				border: '#dc2626',
				text: '#7f1d1d',
				pattern: 'repeating-linear-gradient(45deg, transparent 0 4px, rgba(220,38,38,0.18) 4px 6px)',
			}
		}
		if (rack.type === 'cabinet') {
			return {
				fill: '#f1f5f9',
				border: '#334155',
				text: '#0f172a',
				pattern: 'repeating-linear-gradient(-45deg, transparent 0 6px, rgba(51,65,85,0.16) 6px 8px)',
			}
		}
		if (rack.type === 'desk' || rack.type === 'shelf') {
			return { fill: '#fefce8', border: '#a16207', text: '#713f12' }
		}
		return { fill: '#ecfdf5', border: '#059669', text: '#064e3b' }
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

	// ── Room-object drag (whole-body + wall endpoints) ──

	/**
	 * Active drag op on an existing room object:
	 *   - 'body' moves the object (walls translate both endpoints together,
	 *     doors / rects translate `position`).
	 *   - 'wall-start' / 'wall-end' move a single wall endpoint.
	 *   - 'rect-resize' resizes from one corner. `corner` is used to decide
	 *     which side of (position, widthMm, depthMm) the drag anchors to.
	 */
	let objDrag = $state<{
		id: string
		mode: 'body' | 'wall-start' | 'wall-end' | 'rect-resize'
		startMouseMm: { x: number; y: number }
		startObj: RoomObject
		corner?: 'nw' | 'ne' | 'sw' | 'se'
	} | null>(null)

	function startObjDrag(e: MouseEvent, obj: RoomObject, mode: 'body' | 'wall-start' | 'wall-end' | 'rect-resize', corner?: 'nw' | 'ne' | 'sw' | 'se') {
		if (!interactive || !onupdateroomobject || planMode !== 'select' || e.button !== 0) return
		e.preventDefault()
		e.stopPropagation()
		onselectroomobject?.(obj.id)
		objDrag = {
			id: obj.id,
			mode,
			startMouseMm: clientToPlanMm(e.clientX, e.clientY),
			// `$state.snapshot` yields a non-reactive deep copy safe to hold for
			// the duration of the drag. Plain `structuredClone` fails on Svelte
			// state proxies (DataCloneError on the Proxy).
			startObj: $state.snapshot(obj) as RoomObject,
			corner,
		}
		document.addEventListener('mousemove', onObjDragMove)
		document.addEventListener('mouseup', onObjDragEnd)
	}

	function onObjDragMove(e: MouseEvent) {
		if (!objDrag || !onupdateroomobject) return
		const now = clientToPlanMm(e.clientX, e.clientY)
		const dx = now.x - objDrag.startMouseMm.x
		const dy = now.y - objDrag.startMouseMm.y
		const o = objDrag.startObj

		if (objDrag.mode === 'body') {
			if (o.kind === 'wall' && o.endPosition) {
				onupdateroomobject(o.id, {
					position: { x: o.position.x + dx, y: o.position.y + dy },
					endPosition: { x: o.endPosition.x + dx, y: o.endPosition.y + dy },
				})
			} else {
				onupdateroomobject(o.id, { position: { x: o.position.x + dx, y: o.position.y + dy } })
			}
			return
		}
		if (objDrag.mode === 'wall-start') {
			onupdateroomobject(o.id, { position: { x: o.position.x + dx, y: o.position.y + dy } })
			return
		}
		if (objDrag.mode === 'wall-end' && o.endPosition) {
			onupdateroomobject(o.id, { endPosition: { x: o.endPosition.x + dx, y: o.endPosition.y + dy } })
			return
		}
		if (objDrag.mode === 'rect-resize' && o.kind === 'rect' && objDrag.corner) {
			const startW = o.widthMm ?? 100
			const startD = o.depthMm ?? 100
			let x = o.position.x
			let y = o.position.y
			let w = startW
			let h = startD
			if (objDrag.corner === 'nw' || objDrag.corner === 'sw') { x = o.position.x + dx; w = startW - dx }
			else { w = startW + dx }
			if (objDrag.corner === 'nw' || objDrag.corner === 'ne') { y = o.position.y + dy; h = startD - dy }
			else { h = startD + dy }
			// Keep non-negative dimensions — if the user drags past the opposite
			// corner, flip position + clamp width/height to at least the grid step.
			const minMm = GRID_MM
			if (w < minMm) { x = o.position.x + startW - minMm; w = minMm }
			if (h < minMm) { y = o.position.y + startD - minMm; h = minMm }
			onupdateroomobject(o.id, { position: { x, y }, widthMm: w, depthMm: h })
			return
		}
	}

	function onObjDragEnd() {
		// Snap the final position so dragging feels consistent with grid
		// placement when drawing new objects. Only emit one final update per
		// field that was actively being dragged.
		if (objDrag && onupdateroomobject) {
			const id = objDrag.id
			const current = roomObjects.find(r => r.id === id)
			if (current) {
				const patch: Partial<RoomObject> = {}
				if (objDrag.mode === 'body' || objDrag.mode === 'wall-start' || objDrag.mode === 'rect-resize') {
					patch.position = { x: snap(current.position.x), y: snap(current.position.y) }
				}
				if ((objDrag.mode === 'body' || objDrag.mode === 'wall-end') && current.endPosition) {
					patch.endPosition = { x: snap(current.endPosition.x), y: snap(current.endPosition.y) }
				}
				if (objDrag.mode === 'rect-resize') {
					if (current.widthMm != null) patch.widthMm = snap(current.widthMm)
					if (current.depthMm != null) patch.depthMm = snap(current.depthMm)
				}
				onupdateroomobject(id, patch)
			}
		}
		objDrag = null
		document.removeEventListener('mousemove', onObjDragMove)
		document.removeEventListener('mouseup', onObjDragEnd)
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
	<div class="absolute text-[16px] font-semibold text-gray-500 uppercase tracking-wider pointer-events-none whitespace-nowrap"
		style:left="0" style:top="-28px">
		Plan View
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
				class="absolute select-none px-1.5 py-0.5 rounded-t text-[16px] font-medium text-white whitespace-nowrap {rowBgCls} {rowCursorCls}"
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
				{@const rs = rackStyle(rack)}
				{@const rackCursorCls = interactive && onselectrack ? 'cursor-pointer' : ''}
				<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="absolute flex items-center justify-center text-[24px] font-mono font-semibold tracking-tight transition-shadow {rackCursorCls}"
					class:ring-2={selected}
					class:ring-blue-500={selected}
					class:shadow-sm={!selected}
					style:left="{xMm * SCALE}px"
					style:top="{yMm * SCALE}px"
					style:width="{rack.widthMm * SCALE}px"
					style:height="{rack.depthMm * SCALE}px"
					style:background-color={rs.fill}
					style:background-image={rs.pattern}
					style:border="1.5px solid {selected ? '#1d4ed8' : rs.border}"
					style:color={rs.text}
					onclick={interactive && onselectrack ? (e => { e.stopPropagation(); onselectrack(rack.id, e.shiftKey || e.metaKey || e.ctrlKey) }) : undefined}
					title="{rack.label} · {rack.widthMm}×{rack.depthMm}mm">
					<span class="px-0.5 truncate drop-shadow-[0_0_2px_rgba(255,255,255,0.9)]">{rack.label}</span>
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
				<div class="absolute pointer-events-none text-[16px] text-blue-600 whitespace-nowrap"
					style:left="0"
					style:top="{rackFrontDepthMm * SCALE + 2}px">FRONT</div>
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

		<!--
			Drawable-area boundary + origin marker. Without this indicator users
			can't tell that draws only work within the 0,0 → PLAN_CANVAS_MM × _MM
			box, and accidentally clicking to the top-left of origin was silently
			ignored. The rect is subtle (dashed gray) and `vector-effect` keeps
			its stroke at a constant screen px weight regardless of zoom.
		-->
		<rect x="0" y="0" width={PLAN_CANVAS_MM} height={PLAN_CANVAS_MM}
			fill="none" stroke="#94a3b8" stroke-width="8"
			stroke-dasharray="40 20"
			vector-effect="non-scaling-stroke"
			opacity="0.6" class="pointer-events-none" />

		<!-- Origin crosshair + label, sized in source-mm so it stays aligned at any zoom. -->
		<!-- <g pointer-events="none" opacity="0.8">
			<line x1="-200" y1="0" x2="200" y2="0" stroke="#64748b" stroke-width="1" vector-effect="non-scaling-stroke" />
			<line x1="0" y1="-200" x2="0" y2="200" stroke="#64748b" stroke-width="1" vector-effect="non-scaling-stroke" />
			<circle cx="0" cy="0" r="40" fill="none" stroke="#64748b" stroke-width="1" vector-effect="non-scaling-stroke" />
			<text x="80" y="-80" font-size="160" fill="#64748b" font-family="ui-monospace, monospace">0,0</text>
		</g> -->

		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		{#each roomObjects as obj (obj.id)}
			{@const isSelected = selectedRoomObjectId === obj.id}
			{@const stroke = isSelected ? '#2563eb' : (obj.color ?? '#64748b')}
			{@const clickable = interactive && !!onselectroomobject && planMode === 'select'}
			{@const draggable = interactive && !!onupdateroomobject && planMode === 'select'}
			{@const bodyCursor = draggable ? 'move' : (clickable ? 'pointer' : 'default')}
			{#if obj.kind === 'wall' && obj.endPosition}
				<!-- Wall body: drag moves both endpoints together. -->
				<line
					x1={obj.position.x} y1={obj.position.y}
					x2={obj.endPosition.x} y2={obj.endPosition.y}
					stroke={stroke}
					stroke-width={obj.thicknessMm ?? 100}
					stroke-linecap="butt"
					class={clickable ? 'pointer-events-auto' : ''}
					style:cursor={bodyCursor}
					onmousedown={draggable ? (e => startObjDrag(e, obj, 'body')) : undefined}
					onclick={clickable ? (e => { e.stopPropagation(); onselectroomobject!(obj.id) }) : undefined} />
				<!-- Endpoint handles (only when selected + interactive). -->
				{#if isSelected && draggable}
					<circle cx={obj.position.x} cy={obj.position.y} r="70"
						fill="white" stroke="#2563eb" stroke-width="20"
						class="pointer-events-auto cursor-move"
						onmousedown={e => startObjDrag(e, obj, 'wall-start')} />
					<circle cx={obj.endPosition.x} cy={obj.endPosition.y} r="70"
						fill="white" stroke="#2563eb" stroke-width="20"
						class="pointer-events-auto cursor-move"
						onmousedown={e => startObjDrag(e, obj, 'wall-end')} />
				{/if}
			{:else if obj.kind === 'door'}
				{@const w = obj.widthMm ?? 900}
				{@const d = obj.depthMm ?? 100}
				{@const rot = obj.rotationDeg ?? 0}
				{@const swingSign = obj.swing === 'right' ? -1 : 1}
				<g transform="translate({obj.position.x} {obj.position.y}) rotate({rot})"
					class={clickable ? 'pointer-events-auto' : ''}
					style:cursor={bodyCursor}>
					<rect x="0" y="0" width={w} height={d} fill="none" stroke={stroke} stroke-width="40"
						onmousedown={draggable ? (e => startObjDrag(e, obj, 'body')) : undefined}
						onclick={clickable ? (e => { e.stopPropagation(); onselectroomobject!(obj.id) }) : undefined} />
					<path d="M 0 0 L {w} 0 A {w} {w} 0 0 {swingSign === 1 ? 1 : 0} 0 {swingSign * w} Z"
						fill="none" stroke={stroke} stroke-width="20" stroke-dasharray="50 50" opacity="0.6" />
				</g>
			{:else if obj.kind === 'rect'}
				{@const w = obj.widthMm ?? 100}
				{@const d = obj.depthMm ?? 100}
				{@const thick = obj.thicknessMm ?? 30}
				<g class={clickable ? 'pointer-events-auto' : ''}>
					<rect x={obj.position.x} y={obj.position.y} width={w} height={d}
						fill={obj.color ?? 'rgba(148, 163, 184, 0.25)'}
						stroke={stroke} stroke-width={isSelected ? Math.max(thick, 40) : thick}
						style:cursor={bodyCursor}
						onmousedown={draggable ? (e => startObjDrag(e, obj, 'body')) : undefined}
						onclick={clickable ? (e => { e.stopPropagation(); onselectroomobject!(obj.id) }) : undefined} />
					{#if isSelected && draggable}
						<!--
							Four corner resize handles — small circles sized in source-mm so
							they stay visible at any canvas zoom. Each anchors a specific
							corner; opposite corners stay fixed during resize.
						-->
						{#each [
							{ c: 'nw' as const, x: obj.position.x,     y: obj.position.y     },
							{ c: 'ne' as const, x: obj.position.x + w, y: obj.position.y     },
							{ c: 'sw' as const, x: obj.position.x,     y: obj.position.y + d },
							{ c: 'se' as const, x: obj.position.x + w, y: obj.position.y + d },
						] as h}
							<circle cx={h.x} cy={h.y} r="60"
								fill="white" stroke="#2563eb" stroke-width="20"
								class="pointer-events-auto"
								style:cursor={h.c === 'nw' || h.c === 'se' ? 'nwse-resize' : 'nesw-resize'}
								onmousedown={e => startObjDrag(e, obj, 'rect-resize', h.c)} />
						{/each}
					{/if}
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
				stroke="#2563eb" stroke-width="100" stroke-linecap="butt" opacity="0.5" />
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
