<script lang="ts">
	import type { Viewport, ViewportSource } from '$lib/types/pages'
	import { Firestore, Icon } from '$lib'
	import TextViewport from './viewports/TextViewport.svelte'
	import ImageViewport from './viewports/ImageViewport.svelte'
	import RackElevationViewport from './viewports/RackElevationViewport.svelte'
	import RackPlanViewport from './viewports/RackPlanViewport.svelte'
	import FrameDetailViewport from './viewports/FrameDetailViewport.svelte'
	import FillrateViewport from './viewports/FillrateViewport.svelte'
	import FloorplanViewport from './viewports/FloorplanViewport.svelte'
	import PatchingViewport from './viewports/PatchingViewport.svelte'
	import OutletsViewport from './viewports/OutletsViewport.svelte'
	import RisersViewport from './viewports/RisersViewport.svelte'
	import SurveyViewport from './viewports/SurveyViewport.svelte'

	let { viewport, selected, active = false, pxPerMm, db, projectId, onselect, onactivate, onupdate, onhistory, onopensource, onfit }: {
		viewport: Viewport
		selected: boolean
		/** Activated (double-clicked into): content pans/zooms; frame move is locked. */
		active?: boolean
		/** Pixels per mm — canvas zoom factor. Used to convert mouse px deltas to mm. */
		pxPerMm: number
		/** Firestore wrapper — forwarded to source-subscribing viewport kinds. */
		db: Firestore
		/** Project id — needed to resolve staleness against the pinned source drawing. */
		projectId: string
		onselect: () => void
		/** Enter the viewport (double-click) so its content can be panned/zoomed. */
		onactivate?: () => void
		onupdate: (patch: Partial<Viewport>) => void
		/**
		 * Called once on commit of a frame move/resize, with the geometry *before*
		 * the edit, so the editor can push an undo entry. Not called for no-op
		 * clicks or content pans.
		 */
		onhistory?: (before: Partial<Viewport>) => void
		/** Open the underlying source (drawing/floorplan/etc.) in its owning tool. */
		onopensource?: () => void
		/** A content renderer reports the real 1:N that fits the frame (fit → fixed scale). */
		onfit?: (scale: number) => void
	} = $props()

	/** Effective drawing scale shown in the hint (debug); `fit` until a fit request resolves to 1:N. */
	let scaleLabel = $derived(viewport.scale > 0 ? `1:${viewport.scale}` : 'fit')

	/**
	 * When the viewport has a `sourcePin`, subscribe to the pinned DrawingDoc
	 * to detect whether newer revisions have shipped since the pin, and show
	 * how many revisions behind. Revision codes are monotonic single letters
	 * ('A', 'B', 'C', ...), so we diff their char codes directly rather than
	 * joining through version numbers — cheaper and just as accurate.
	 */
	let pinnedDrawing = $state<{ latestRevisionCode?: string } | null>(null)
	$effect(() => {
		const pin = viewport.sourcePin
		if (!pin) { pinnedDrawing = null; return }
		const unsub = db.subscribeOne(`projects/${projectId}/drawings`, pin.drawingId, (data: any) => {
			pinnedDrawing = data ?? null
		})
		return () => unsub?.()
	})
	let revisionsBehind = $derived.by(() => {
		if (!viewport.sourcePin || !pinnedDrawing?.latestRevisionCode) return 0
		const pinned = viewport.sourcePin.revisionCode.charCodeAt(0)
		const latest = pinnedDrawing.latestRevisionCode.charCodeAt(0)
		return Math.max(0, latest - pinned)
	})
	let isStale = $derived(revisionsBehind > 0)

	const MIN_MM = 10
	/** Screen-px a press must travel before it counts as a drag — kills accidental nudges. */
	const DRAG_THRESHOLD_PX = 4
	type Handle = 'nw' | 'ne' | 'sw' | 'se'
	type DragMode = 'move' | Handle | 'pan-content'

	let dragStart = $state<{
		mode: DragMode
		mouseX: number
		mouseY: number
		startX: number
		startY: number
		startW: number
		startH: number
		startOffsetX: number
		startOffsetY: number
		/** Becomes true once the press crosses DRAG_THRESHOLD_PX (move/resize only). */
		moved: boolean
	} | null>(null)

	function describe(src: ViewportSource): string {
		switch (src.kind) {
			case 'rack-elevation': return `rack-elevation (${src.face})${src.rowId ? ` · row ${src.rowId}` : ''}`
			case 'rack-plan':      return `rack-plan${src.rowIds?.length ? ` · ${src.rowIds.length} rows` : ''}`
			case 'frame-detail':   return `frame-detail · ${src.frameId || '(unset)'}`
			case 'fillrate':       return 'fillrate'
			case 'floorplan':      return `floorplan · p${src.pageNum}`
			case 'patching':       return 'patching'
			case 'outlets':        return 'outlets'
			case 'risers':         return `risers${src.fromFloor != null || src.toFloor != null ? ` · ${src.fromFloor ?? '?'}–${src.toFloor ?? '?'}` : ''}`
			case 'survey':         return `survey${src.mode === 'single' ? ' · single' : ' · album'}`
			case 'text':           return `text`
			case 'image':          return 'image'
		}
	}

	let hasCustomLabel = $derived(!!viewport.label && viewport.label.trim().length > 0)
	let displayLabel = $derived(viewport.label?.trim() || '')
	let labelFontPt = $derived(viewport.labelFontPt ?? 6)
	let offsetX = $derived(viewport.contentOffsetMm?.x ?? 0)
	let offsetY = $derived(viewport.contentOffsetMm?.y ?? 0)
	let isLocked = $derived(viewport.locked === true)

	function beginDrag(e: MouseEvent, mode: DragMode) {
		// Locked viewports block frame moves/resize but still allow Alt-drag
		// content panning so users can re-frame source content without unlocking.
		if (isLocked && mode !== 'pan-content') return
		e.stopPropagation()
		onselect()
		dragStart = {
			mode,
			mouseX: e.clientX,
			mouseY: e.clientY,
			startX: viewport.positionMm.x,
			startY: viewport.positionMm.y,
			startW: viewport.widthMm,
			startH: viewport.heightMm,
			startOffsetX: offsetX,
			startOffsetY: offsetY,
			// Content pans take effect immediately; frame move/resize wait for the threshold.
			moved: mode === 'pan-content',
		}
		window.addEventListener('mousemove', onMouseMove)
		window.addEventListener('mouseup', onMouseUp)
	}

	function onBodyMouseDown(e: MouseEvent) {
		if (e.button !== 0) return
		// Activated viewport: plain drag pans the content (no Alt needed); frame stays put.
		if (active) {
			e.preventDefault()
			beginDrag(e, 'pan-content')
			return
		}
		// Alt+drag pans the source content instead of moving the frame.
		if (e.altKey) {
			e.preventDefault()
			beginDrag(e, 'pan-content')
			return
		}
		// First click only selects — never moves. Moving requires a deliberate
		// drag on an already-selected viewport (past the threshold). This is the
		// anti-accidental-move guard. Locked frames also just select.
		if (!selected || isLocked) {
			e.stopPropagation()
			onselect()
			return
		}
		beginDrag(e, 'move')
	}

	function onHandleMouseDown(e: MouseEvent, handle: Handle) {
		if (e.button !== 0 || isLocked) return
		beginDrag(e, handle)
	}

	/**
	 * Alt+wheel on a selected viewport adjusts its scale, pivoting around the
	 * mouse cursor: the source-mm point under the cursor stays under the cursor.
	 *
	 * Math: the source-mm offset of the cursor relative to the viewport top-left
	 * is `offset + mouseInside_paperMm * scale`. To keep that source point fixed
	 * when scale changes from S1 → S2, we update offset so
	 *     offsetNew = offsetOld + mouseInside_paperMm * (S1 − S2)
	 * (smaller scale means fewer source-mm per paper-mm, so offset shifts less).
	 */
	function onBodyWheel(e: WheelEvent) {
		// Scale the content when activated (plain wheel) or via Alt on a selected
		// frame; otherwise let the canvas handle page zoom/pan.
		if (!active && !e.altKey) return
		e.preventDefault()
		e.stopPropagation()
		// `scale` is a ratio denominator (1:N), so wheel-up = zoom in = smaller N.
		const factor = e.deltaY < 0 ? 1 / 1.1 : 1.1
		const next = Math.max(1, Math.round(viewport.scale * factor))
		if (next === viewport.scale) return

		// Cursor position relative to viewport top-left, in paper-mm.
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
		const mouseMmX = (e.clientX - rect.left) / pxPerMm
		const mouseMmY = (e.clientY - rect.top) / pxPerMm

		const curOffX = viewport.contentOffsetMm?.x ?? 0
		const curOffY = viewport.contentOffsetMm?.y ?? 0
		const newOffX = curOffX + mouseMmX * (viewport.scale - next)
		const newOffY = curOffY + mouseMmY * (viewport.scale - next)

		onupdate({ scale: next, contentOffsetMm: { x: newOffX, y: newOffY } })
	}

	function onMouseMove(e: MouseEvent) {
		if (!dragStart) return
		// Hold off on frame move/resize until the press crosses the threshold, so a
		// click with a little jitter never nudges the viewport.
		if (!dragStart.moved) {
			if (Math.hypot(e.clientX - dragStart.mouseX, e.clientY - dragStart.mouseY) < DRAG_THRESHOLD_PX) return
			dragStart.moved = true
		}
		const dxMm = (e.clientX - dragStart.mouseX) / pxPerMm
		const dyMm = (e.clientY - dragStart.mouseY) / pxPerMm

		if (dragStart.mode === 'move') {
			onupdate({ positionMm: { x: dragStart.startX + dxMm, y: dragStart.startY + dyMm } })
			return
		}

		if (dragStart.mode === 'pan-content') {
			// Source pan in source-mm. dx px on paper → dx/scaleRatio in source-mm,
			// where scaleRatio = 1/viewport.scale (paper-mm per source-mm).
			// Dragging right shows content further left → offset decreases.
			const sourceDx = -dxMm * viewport.scale
			const sourceDy = -dyMm * viewport.scale
			onupdate({ contentOffsetMm: {
				x: dragStart.startOffsetX + sourceDx,
				y: dragStart.startOffsetY + sourceDy,
			} })
			return
		}

		let x = dragStart.startX
		let y = dragStart.startY
		let w = dragStart.startW
		let h = dragStart.startH

		if (dragStart.mode === 'nw' || dragStart.mode === 'sw') {
			x = dragStart.startX + dxMm
			w = dragStart.startW - dxMm
		} else {
			w = dragStart.startW + dxMm
		}
		if (dragStart.mode === 'nw' || dragStart.mode === 'ne') {
			y = dragStart.startY + dyMm
			h = dragStart.startH - dyMm
		} else {
			h = dragStart.startH + dyMm
		}

		if (w < MIN_MM) {
			if (dragStart.mode === 'nw' || dragStart.mode === 'sw') x = dragStart.startX + (dragStart.startW - MIN_MM)
			w = MIN_MM
		}
		if (h < MIN_MM) {
			if (dragStart.mode === 'nw' || dragStart.mode === 'ne') y = dragStart.startY + (dragStart.startH - MIN_MM)
			h = MIN_MM
		}

		onupdate({ positionMm: { x, y }, widthMm: w, heightMm: h })
	}

	function onMouseUp() {
		const d = dragStart
		dragStart = null
		window.removeEventListener('mousemove', onMouseMove)
		window.removeEventListener('mouseup', onMouseUp)
		// Record an undo entry only for a frame move/resize that actually changed
		// geometry (not content pans, not no-op clicks).
		if (d && d.moved && d.mode !== 'pan-content') {
			onhistory?.({
				positionMm: { x: d.startX, y: d.startY },
				widthMm: d.startW,
				heightMm: d.startH,
			})
		}
	}

	function onBodyDoubleClick(e: MouseEvent) {
		// Double-click enters the viewport (content pan/zoom). Open-source stays
		// available via the link button on the selected frame.
		e.stopPropagation()
		onactivate?.()
	}

	let leftPx = $derived(viewport.positionMm.x)
	let topPx  = $derived(viewport.positionMm.y)
	let wPx    = $derived(viewport.widthMm)
	let hPx    = $derived(viewport.heightMm)

	let bodyCursor = $derived.by(() => {
		if (dragStart?.mode === 'pan-content') return 'grabbing'
		if (active) return 'grab' // activated → drag pans content
		if (isLocked) return 'default'
		if (dragStart?.mode === 'move') return 'grabbing'
		if (!selected) return 'pointer' // click to select first
		return 'grab'
	})

	/**
	 * Rotation (0/90/180/270). The frame keeps its user-placed footprint
	 * (wPx × hPx); only the content container rotates. For 90°/270° the inner
	 * container is sized with swapped dimensions so after rotating around its
	 * centre it fills the frame exactly.
	 */
	let rot = $derived(((viewport.rotationDeg ?? 0) % 360 + 360) % 360)
	let isQuarterRot = $derived(rot === 90 || rot === 270)
	let innerW = $derived(isQuarterRot ? hPx : wPx)
	let innerH = $derived(isQuarterRot ? wPx : hPx)
	let innerOffsetX = $derived((wPx - innerW) / 2)
	let innerOffsetY = $derived((hPx - innerH) / 2)
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="absolute border bg-white/60 hover:bg-white/80 select-none"
	class:border-blue-500={selected || active}
	class:border-zinc-400={!selected && !active}
	class:ring-2={active}
	class:ring-blue-500={active}
	style:left="{leftPx}px"
	style:top="{topPx}px"
	style:width="{wPx}px"
	style:height="{hPx}px"
	style:cursor={bodyCursor}
	onmousedown={onBodyMouseDown}
	onwheel={onBodyWheel}
	ondblclick={onBodyDoubleClick}
>
	<!--
		Rotation wrapper — content container rotates around its centre; the
		frame's bounds stay axis-aligned. At 90°/270° the inner box is sized
		with swapped dimensions so after rotation it fills the frame exactly.
	-->
	<div
		class="absolute"
		style:left="{innerOffsetX}px"
		style:top="{innerOffsetY}px"
		style:width="{innerW}px"
		style:height="{innerH}px"
		style:transform={rot ? `rotate(${rot}deg)` : undefined}
		style:transform-origin="center center"
	>
		<!-- Source content -->
		{#if viewport.source.kind === 'text'}
			<TextViewport {viewport} />
		{:else if viewport.source.kind === 'image'}
			<ImageViewport {viewport} />
		{:else if viewport.source.kind === 'rack-elevation'}
			<RackElevationViewport {viewport} {db} />
		{:else if viewport.source.kind === 'rack-plan'}
			<RackPlanViewport {viewport} {db} />
		{:else if viewport.source.kind === 'frame-detail'}
			<FrameDetailViewport {viewport} {db} />
		{:else if viewport.source.kind === 'fillrate'}
			<FillrateViewport {viewport} {db} />
		{:else if viewport.source.kind === 'floorplan'}
			<FloorplanViewport {viewport} {db} />
		{:else if viewport.source.kind === 'patching'}
			<PatchingViewport {viewport} {db} />
		{:else if viewport.source.kind === 'outlets'}
			<OutletsViewport {viewport} {db} {onfit} />
		{:else if viewport.source.kind === 'risers'}
			<RisersViewport {viewport} {db} />
		{:else if viewport.source.kind === 'survey'}
			<SurveyViewport {viewport} {db} />
		{:else}
			<div class="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-500 pointer-events-none px-2 text-center leading-tight">
				<span>{describe(viewport.source)}</span>
			</div>
		{/if}
	</div>

	<!-- Viewport label — always shown if set -->
	{#if hasCustomLabel}
		<div
			class="absolute left-0 -top-0.5 px-0.5 text-zinc-700 pointer-events-none whitespace-nowrap leading-none"
			style:font-size="{labelFontPt}pt"
			style:transform="translateY(-100%)">
			{displayLabel}
		</div>
	{/if}

	<!-- Stale source badge — shown when the pinned source has a newer revision. -->
	{#if isStale && viewport.sourcePin}
		<div class="absolute top-0 right-0 m-0.5 px-1 py-px rounded-sm bg-amber-500 text-white text-[8px] font-medium pointer-events-none whitespace-nowrap"
			title="Pinned at rev {viewport.sourcePin.revisionCode} · source now at rev {pinnedDrawing?.latestRevisionCode}">
			{revisionsBehind} rev{revisionsBehind === 1 ? '' : 's'} behind
		</div>
	{/if}

	{#if selected}
		<!-- Top-right action buttons. Lock toggles frame edit-lock; open-source jumps to source tool. -->
		<div class="absolute right-1 top-1 flex items-center gap-0.5 print:hidden">
			<button
				class="w-4 h-4 rounded-full text-white flex items-center justify-center shadow hover:opacity-90
					{isLocked ? 'bg-amber-500' : 'bg-zinc-400'}"
				title={isLocked ? 'Unlock — allow drag/resize/rotate' : 'Lock — freeze size + position'}
				onmousedown={e => e.stopPropagation()}
				onclick={e => { e.stopPropagation(); onupdate({ locked: !isLocked }) }}>
				<Icon name={isLocked ? 'lock' : 'lockOpen'} size={9} />
			</button>
			{#if onopensource}
				<button
					class="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center shadow hover:bg-blue-500"
					title="Open underlying source (double-click also works)"
					onmousedown={e => e.stopPropagation()}
					onclick={e => { e.stopPropagation(); onopensource() }}>
					<Icon name="link" size={9} />
				</button>
			{/if}
		</div>

		<!-- Resize handles — hidden on locked viewports and while activated. -->
		{#if !isLocked && !active}
			{#each (['nw','ne','sw','se'] as const) as h}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="absolute w-2 h-2 bg-white border border-blue-500 rounded-sm print:hidden"
					style:left={h === 'nw' || h === 'sw' ? '-4px' : undefined}
					style:right={h === 'ne' || h === 'se' ? '-4px' : undefined}
					style:top={h === 'nw' || h === 'ne' ? '-4px' : undefined}
					style:bottom={h === 'sw' || h === 'se' ? '-4px' : undefined}
					style:cursor={h === 'nw' || h === 'se' ? 'nwse-resize' : 'nesw-resize'}
					onmousedown={e => onHandleMouseDown(e, h)}
				></div>
			{/each}
		{/if}

		<!-- Hint line — shown when selected -->
		<div class="absolute top-full left-0 mt-0.5 text-[8px] text-blue-500/70 pointer-events-none whitespace-nowrap print:hidden">
			{#if active}
				{scaleLabel} · Drag pans content · wheel scales · dbl-click empty / Esc exits
			{:else}
				{scaleLabel} · Drag moves · handles resize · dbl-click enters · Ctrl/⌘-Z undo · Del removes
			{/if}
		</div>
	{/if}
</div>
