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
	import SurveyViewport from './viewports/SurveyViewport.svelte'

	let { viewport, selected, pxPerMm, db, projectId, onselect, onupdate, onopensource }: {
		viewport: Viewport
		selected: boolean
		/** Pixels per mm — canvas zoom factor. Used to convert mouse px deltas to mm. */
		pxPerMm: number
		/** Firestore wrapper — forwarded to source-subscribing viewport kinds. */
		db: Firestore
		/** Project id — needed to resolve staleness against the pinned source drawing. */
		projectId: string
		onselect: () => void
		onupdate: (patch: Partial<Viewport>) => void
		/** Open the underlying source (drawing/floorplan/etc.) in its owning tool. */
		onopensource?: () => void
	} = $props()

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

	function beginDrag(e: MouseEvent, mode: DragMode) {
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
		}
		window.addEventListener('mousemove', onMouseMove)
		window.addEventListener('mouseup', onMouseUp)
	}

	function onBodyMouseDown(e: MouseEvent) {
		if (e.button !== 0) return
		// Alt+drag pans the source content instead of moving the frame.
		if (e.altKey) {
			e.preventDefault()
			beginDrag(e, 'pan-content')
			return
		}
		beginDrag(e, 'move')
	}

	function onHandleMouseDown(e: MouseEvent, handle: Handle) {
		if (e.button !== 0) return
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
		if (!e.altKey) return // let canvas handle regular zoom/pan
		e.preventDefault()
		e.stopPropagation()
		const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
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
		dragStart = null
		window.removeEventListener('mousemove', onMouseMove)
		window.removeEventListener('mouseup', onMouseUp)
	}

	function onBodyDoubleClick(e: MouseEvent) {
		if (!onopensource) return
		e.stopPropagation()
		onopensource()
	}

	let leftPx = $derived(viewport.positionMm.x)
	let topPx  = $derived(viewport.positionMm.y)
	let wPx    = $derived(viewport.widthMm)
	let hPx    = $derived(viewport.heightMm)

	let bodyCursor = $derived.by(() => {
		if (dragStart?.mode === 'pan-content') return 'grabbing'
		if (dragStart?.mode === 'move') return 'grabbing'
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
	class:border-blue-500={selected}
	class:border-zinc-400={!selected}
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
			<OutletsViewport {viewport} {db} />
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
		<!-- Open-source icon — positioned above the frame so it doesn't overlap the NE resize handle. -->
		{#if onopensource}
			<button
				class="absolute right-1 top-1 w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center shadow hover:bg-blue-500"
				title="Open underlying source (double-click also works)"
				onmousedown={e => e.stopPropagation()}
				onclick={e => { e.stopPropagation(); onopensource() }}>
				<Icon name="link" size={9} />
			</button>
		{/if}

		<!-- Resize handles -->
		{#each (['nw','ne','sw','se'] as const) as h}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="absolute w-2 h-2 bg-white border border-blue-500 rounded-sm"
				style:left={h === 'nw' || h === 'sw' ? '-4px' : undefined}
				style:right={h === 'ne' || h === 'se' ? '-4px' : undefined}
				style:top={h === 'nw' || h === 'ne' ? '-4px' : undefined}
				style:bottom={h === 'sw' || h === 'se' ? '-4px' : undefined}
				style:cursor={h === 'nw' || h === 'se' ? 'nwse-resize' : 'nesw-resize'}
				onmousedown={e => onHandleMouseDown(e, h)}
			></div>
		{/each}

		<!-- Hint line — shown briefly when selected -->
		<div class="absolute top-full left-0 mt-0.5 text-[8px] text-blue-500/70 pointer-events-none whitespace-nowrap">
			Alt+drag pan · Alt+wheel scale · dbl-click opens source · arrows nudge · Ctrl/⌘-D dup · Del removes
		</div>
	{/if}
</div>
