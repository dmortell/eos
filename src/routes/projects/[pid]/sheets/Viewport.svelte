<script lang="ts">
	import type { ViewportEditor } from "./viewports.svelte";
	import type { SheetViewport } from "./types";
	import ViewportContent from "./ViewportContent.svelte";

	// Model-driven: the controller owns position/selection/active state; this component renders
	// one viewport and reports frame-clicks / handle-drags back. AutoCAD-style selection — you
	// pick a viewport by its FRAME or a marquee box, never by clicking the inactive interior.
	let { vps, vp, zoom = 1 }: { vps: ViewportEditor; vp: SheetViewport; zoom?: number } = $props()

	let selected = $derived(vps.isSelected(vp.id))
	let active = $derived(vps.activeId === vp.id)

	// Handle/frame sizes counter-scaled by the Canvas zoom so they stay a steady on-screen size.
	let H = $derived(9 / zoom)      // grip size (mm)
	let FRAME = $derived(7 / zoom)  // clickable frame-strip thickness (mm)

	const MIN = 20 // min viewport size (mm)
	const THRESHOLD = 4 // screen px before a move commits (anti-nudge)

	let el: HTMLDivElement
	type Corner = 'nw' | 'ne' | 'sw' | 'se'
	type Drag = { mode: 'move' | Corner; mx: number; my: number; x0: number; y0: number; w0: number; h0: number; scale: number; moved: boolean }
	let drag = $state<Drag | null>(null)

	function selectFrame(e: MouseEvent) {
		if (e.button !== 0) return
		e.stopPropagation() // we handle selection; don't let SheetEditor start a marquee
		vps.select(vp.id, e.shiftKey || e.ctrlKey || e.metaKey)
	}

	// A screen-pixel delta is `scale` mm; derive scale from the element's rendered size
	// (rect.width === vp.w * zoom) so we don't need to know the Canvas zoom directly.
	function start(mode: Drag['mode'], e: MouseEvent) {
		if (e.button !== 0) return
		e.preventDefault(); e.stopPropagation()
		vps.select(vp.id)
		const rect = el.getBoundingClientRect()
		drag = { mode, mx: e.clientX, my: e.clientY, x0: vp.x, y0: vp.y, w0: vp.w, h0: vp.h, scale: vp.w > 0 ? rect.width / vp.w : 1, moved: mode !== 'move' }
		window.addEventListener('mousemove', onMove)
		window.addEventListener('mouseup', onUp)
	}
	function onMove(e: MouseEvent) {
		if (!drag) return
		if (!drag.moved) {
			if (Math.hypot(e.clientX - drag.mx, e.clientY - drag.my) < THRESHOLD) return
			drag.moved = true
		}
		const dx = (e.clientX - drag.mx) / drag.scale, dy = (e.clientY - drag.my) / drag.scale
		if (drag.mode === 'move') { vp.x = drag.x0 + dx; vp.y = drag.y0 + dy; return }
		const left = drag.mode === 'nw' || drag.mode === 'sw'
		const top = drag.mode === 'nw' || drag.mode === 'ne'
		let nx = drag.x0, ny = drag.y0
		let nw = left ? drag.w0 - dx : drag.w0 + dx
		let nh = top ? drag.h0 - dy : drag.h0 + dy
		if (left) nx = drag.x0 + dx
		if (top) ny = drag.y0 + dy
		if (nw < MIN) { if (left) nx = drag.x0 + (drag.w0 - MIN); nw = MIN }
		if (nh < MIN) { if (top) ny = drag.y0 + (drag.h0 - MIN); nh = MIN }
		vp.x = nx; vp.y = ny; vp.w = nw; vp.h = nh
	}
	function onUp() {
		const moved = drag?.moved
		drag = null
		window.removeEventListener('mousemove', onMove)
		window.removeEventListener('mouseup', onUp)
		if (moved) vps.notify() // geometry changed → persist (Stage C)
	}
	$effect(() => () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) })
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- Root is pointer-events:none so empty-interior drags fall through to the Canvas / marquee.
     The frame strips, handles, and (when active) the content re-enable pointer events. -->
<div
	bind:this={el}
	class={[
		'vp absolute select-none border',
		active ? 'border-blue-600 ring-2 ring-inset ring-blue-500/40 print:border-black print:ring-0'
			: selected ? 'border-blue-500 print:border-black'
			: 'border-black',
		vp.border === 'none' && 'print:border-0', // hide the frame on the printed page
	]}
	style:left="{vp.x}px" style:top="{vp.y}px" style:width="{vp.w}px" style:height="{vp.h}px"
	style:pointer-events="none"
>
	<div class="absolute inset-0 overflow-hidden" style:pointer-events={active ? 'auto' : 'none'}>
		<ViewportContent {vp} {zoom} />
	</div>

	{#if !active}
		<!-- Clickable frame: four thin edge strips so the interior stays click-through. -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="vp-frame absolute" style:inset="0" style:pointer-events="none">
			<div class="absolute left-0 right-0 top-0" style:height="{FRAME}px" style:pointer-events="auto" style:cursor="pointer" onmousedown={selectFrame}></div>
			<div class="absolute left-0 right-0 bottom-0" style:height="{FRAME}px" style:pointer-events="auto" style:cursor="pointer" onmousedown={selectFrame}></div>
			<div class="absolute top-0 bottom-0 left-0" style:width="{FRAME}px" style:pointer-events="auto" style:cursor="pointer" onmousedown={selectFrame}></div>
			<div class="absolute top-0 bottom-0 right-0" style:width="{FRAME}px" style:pointer-events="auto" style:cursor="pointer" onmousedown={selectFrame}></div>
		</div>
	{/if}

	{#if selected && !active}
		<!-- Move grip, centred above the top edge. -->
		<div
			class="absolute bg-blue-500 print:hidden"
			style:width="{H}px" style:height="{H}px"
			style:left="calc(50% - {H / 2}px)" style:top="{-H * 1.6}px"
			style:pointer-events="auto" style:cursor={drag?.mode === 'move' ? 'grabbing' : 'move'}
			onmousedown={e => start('move', e)}
			role="button" tabindex="-1" aria-label="Move viewport"
		></div>
		<!-- Corner resize handles. -->
		{#each (['nw','ne','sw','se'] as const) as corner (corner)}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="absolute bg-white border border-blue-500 print:hidden"
				style:width="{H}px" style:height="{H}px"
				style:left={corner === 'nw' || corner === 'sw' ? `${-H / 2}px` : undefined}
				style:right={corner === 'ne' || corner === 'se' ? `${-H / 2}px` : undefined}
				style:top={corner === 'nw' || corner === 'ne' ? `${-H / 2}px` : undefined}
				style:bottom={corner === 'sw' || corner === 'se' ? `${-H / 2}px` : undefined}
				style:pointer-events="auto"
				style:cursor={corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize'}
				onmousedown={e => start(corner, e)}
			></div>
		{/each}
	{/if}
</div>
