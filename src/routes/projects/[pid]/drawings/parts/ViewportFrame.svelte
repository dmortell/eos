<script lang="ts">
	import type { Viewport, ViewportSource } from '$lib/types/pages'

	let { viewport, selected, pxPerMm, onselect, onupdate }: {
		viewport: Viewport
		selected: boolean
		/** Pixels per mm — canvas zoom factor. Used to convert mouse px deltas to mm. */
		pxPerMm: number
		onselect: () => void
		onupdate: (patch: Partial<Viewport>) => void
	} = $props()

	const MIN_MM = 10
	type Handle = 'nw' | 'ne' | 'sw' | 'se'

	let dragStart = $state<{
		mode: 'move' | Handle
		mouseX: number
		mouseY: number
		startX: number
		startY: number
		startW: number
		startH: number
	} | null>(null)

	function describe(src: ViewportSource): string {
		switch (src.kind) {
			case 'rack-elevation': return `rack-elevation (${src.face})${src.rowId ? ` · row ${src.rowId}` : ''}`
			case 'rack-plan':      return `rack-plan${src.rowIds?.length ? ` · ${src.rowIds.length} rows` : ''}`
			case 'frame-detail':   return `frame-detail · ${src.frameId || '(unset)'}`
			case 'fillrate':       return 'fillrate'
			case 'floorplan':      return `floorplan · p${src.pageNum}`
			case 'text':           return `text`
			case 'image':          return 'image'
		}
	}

	let label = $derived(viewport.label || describe(viewport.source))

	function onBodyMouseDown(e: MouseEvent) {
		if (e.button !== 0) return
		e.stopPropagation()
		onselect()
		dragStart = {
			mode: 'move',
			mouseX: e.clientX,
			mouseY: e.clientY,
			startX: viewport.positionMm.x,
			startY: viewport.positionMm.y,
			startW: viewport.widthMm,
			startH: viewport.heightMm,
		}
		window.addEventListener('mousemove', onMouseMove)
		window.addEventListener('mouseup', onMouseUp)
	}

	function onHandleMouseDown(e: MouseEvent, handle: Handle) {
		if (e.button !== 0) return
		e.stopPropagation()
		onselect()
		dragStart = {
			mode: handle,
			mouseX: e.clientX,
			mouseY: e.clientY,
			startX: viewport.positionMm.x,
			startY: viewport.positionMm.y,
			startW: viewport.widthMm,
			startH: viewport.heightMm,
		}
		window.addEventListener('mousemove', onMouseMove)
		window.addEventListener('mouseup', onMouseUp)
	}

	function onMouseMove(e: MouseEvent) {
		if (!dragStart) return
		const dxMm = (e.clientX - dragStart.mouseX) / pxPerMm
		const dyMm = (e.clientY - dragStart.mouseY) / pxPerMm

		if (dragStart.mode === 'move') {
			onupdate({ positionMm: { x: dragStart.startX + dxMm, y: dragStart.startY + dyMm } })
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

	// In mm → px for final sizing. The parent's transform already applies canvas zoom,
	// so we render at a fixed 1 px per mm here; the container scales us up.
	let leftPx = $derived(viewport.positionMm.x)
	let topPx  = $derived(viewport.positionMm.y)
	let wPx    = $derived(viewport.widthMm)
	let hPx    = $derived(viewport.heightMm)
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="absolute border {selected ? 'border-blue-500' : 'border-zinc-400'} bg-white/60 hover:bg-white/80 select-none"
	style:left="{leftPx}px"
	style:top="{topPx}px"
	style:width="{wPx}px"
	style:height="{hPx}px"
	style:cursor={dragStart?.mode === 'move' ? 'grabbing' : 'grab'}
	onmousedown={onBodyMouseDown}
>
	<!-- Viewport label -->
	<div class="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-500 pointer-events-none px-2 text-center leading-tight">
		<span>{label}</span>
	</div>

	{#if selected}
		<!-- Resize handles. Scaled by canvas zoom so they stay usable at different zooms. -->
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
	{/if}
</div>
