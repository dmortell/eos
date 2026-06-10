<script lang="ts">
	import type { ViewportEditor } from "./viewports.svelte";
	import type { SheetViewport } from "./types";
	import ViewportContent from "./ViewportContent.svelte";

	// Model-driven: the controller owns position/selection/active state; this component renders
	// one viewport and reports frame-clicks / handle-drags back. AutoCAD-style selection — you
	// pick a viewport by its FRAME or a marquee box, never by clicking the inactive interior.
	let { vps, vp, zoom = 1, onmodel }: { vps: ViewportEditor; vp: SheetViewport; zoom?: number; onmodel?: (id: string) => void } = $props()

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
		if (drag.mode === 'move') { vps.setRect(vp.id, { x: drag.x0 + dx, y: drag.y0 + dy, w: vp.w, h: vp.h }); return }
		const left = drag.mode === 'nw' || drag.mode === 'sw'
		const top = drag.mode === 'nw' || drag.mode === 'ne'
		let nx = drag.x0, ny = drag.y0
		let nw = left ? drag.w0 - dx : drag.w0 + dx
		let nh = top ? drag.h0 - dy : drag.h0 + dy
		if (left) nx = drag.x0 + dx
		if (top) ny = drag.y0 + dy
		if (nw < MIN) { if (left) nx = drag.x0 + (drag.w0 - MIN); nw = MIN }
		if (nh < MIN) { if (top) ny = drag.y0 + (drag.h0 - MIN); nh = MIN }
		vps.setRect(vp.id, { x: nx, y: ny, w: nw, h: nh })
	}
	function onUp() {
		const moved = drag?.moved
		drag = null
		window.removeEventListener('mousemove', onMove)
		window.removeEventListener('mouseup', onUp)
		if (moved) vps.notify() // geometry changed → persist (Stage C)
	}
	$effect(() => () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) })

	// Label (prints at point size) + scale readout (screen-only debug).
	const LABEL_PT = 8
	const PT_TO_MM = 25.4 / 72
	let labelMm = $derived(LABEL_PT * PT_TO_MM)

	// The active tool render reports its effective view (real-mm window + scale denominator),
	// so the readout can show the computed scale even in Fit mode, and pan/zoom can seed from it.
	let lastView = $state<{ x: number; y: number; w: number; h: number; den: number } | null>(null)
	let scaleText = $derived(
		vp.scale && vp.scale > 0 ? `1:${Math.round(vp.scale)}`
			: lastView ? `1:${Math.round(lastView.den)} (fit)` : 'Fit'
	)

	// ── Content pan / zoom (only when this viewport is active) ──
	// Pan adjusts contentOffsetMm; wheel adjusts scale around the cursor. Both lock the viewport
	// to an explicit scale (out of Fit) and persist via vps.notify().
	let contentEl: HTMLDivElement | undefined = $state()
	let contentPanning = $state(false)
	let cpx = 0, cpy = 0, cox = 0, coy = 0, cden = 0
	// Content pan/zoom is OFF by default so middle/right-drag + wheel pan/zoom the whole sheet as
	// usual (otherwise a full-screen active viewport would trap the gesture). Toggle it on per
	// viewport via the frame toolbar; it resets when the viewport is deactivated.
	let navContent = $state(false)
	$effect(() => { if (!active) navContent = false })

	const curDen = () => (vp.scale && vp.scale > 0 ? vp.scale : (lastView?.den ?? 0))
	const curOffset = () => vp.contentOffsetMm ?? { x: lastView?.x ?? 0, y: lastView?.y ?? 0 }

	function contentDown(e: MouseEvent) {
		// Middle/right-drag pans the viewport content; left is reserved for editing/selection.
		if (!(e.button === 1 || e.button === 2) || !lastView) return
		e.stopPropagation(); e.preventDefault()
		contentPanning = true
		cpx = e.clientX; cpy = e.clientY; cden = curDen()
		const o = curOffset(); cox = o.x; coy = o.y
		window.addEventListener('mousemove', contentMove)
		window.addEventListener('mouseup', contentUp)
	}
	function contentMove(e: MouseEvent) {
		if (!contentPanning) return
		const f = cden / zoom // real-mm per screen px
		vps.setContentView(vp.id, cden, { x: cox - (e.clientX - cpx) * f, y: coy - (e.clientY - cpy) * f })
	}
	function contentUp() {
		if (!contentPanning) return
		contentPanning = false
		window.removeEventListener('mousemove', contentMove)
		window.removeEventListener('mouseup', contentUp)
		vps.notify()
	}
	function contentWheel(e: WheelEvent) {
		if (!lastView || !contentEl) return
		e.preventDefault(); e.stopPropagation()
		const den0 = curDen(); const o = curOffset()
		const rect = contentEl.getBoundingClientRect()
		const px = (e.clientX - rect.left), py = (e.clientY - rect.top) // screen px in viewport
		const mmX = o.x + px * den0 / zoom, mmY = o.y + py * den0 / zoom // real-mm under cursor
		const factor = e.deltaY < 0 ? 1 / 1.1 : 1.1
		const den1 = Math.min(100000, Math.max(0.5, den0 * factor))
		const offset = { x: mmX - px * den1 / zoom, y: mmY - py * den1 / zoom }
		vps.setContentView(vp.id, den1, offset)
		vps.notify()
		// If zooming mid-pan (right-button held), re-baseline the pan so it doesn't snap back to the
		// pre-wheel scale/offset on the next mousemove.
		if (contentPanning) { cpx = e.clientX; cpy = e.clientY; cden = den1; cox = offset.x; coy = offset.y }
	}

	// Attach content gestures non-passively while active (so preventDefault works and the outer
	// Canvas doesn't also pan/zoom).
	$effect(() => {
		const elc = contentEl
		if (!elc || !active || !navContent) return // only when content nav is toggled on
		const noctx = (e: Event) => e.preventDefault() // right-drag pans; don't pop the context menu
		elc.addEventListener('wheel', contentWheel, { passive: false })
		elc.addEventListener('mousedown', contentDown)
		elc.addEventListener('contextmenu', noctx)
		return () => {
			elc.removeEventListener('wheel', contentWheel)
			elc.removeEventListener('mousedown', contentDown)
			elc.removeEventListener('contextmenu', noctx)
			window.removeEventListener('mousemove', contentMove)
			window.removeEventListener('mouseup', contentUp)
		}
	})
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- Root is pointer-events:none so empty-interior drags fall through to the Canvas / marquee.
     The frame strips, handles, and (when active) the content re-enable pointer events. -->
<div
	bind:this={el}
	class={[
		'vp absolute select-none print:ring-0',
		// Screen editing affordance: blue when active/selected; otherwise reflect vp.border.
		active ? 'border border-blue-600 ring-2 ring-inset ring-blue-500/40'
			: selected ? 'border border-blue-500'
			: vp.border === 'none' ? '' : 'border border-black',
		// Printed frame reflects vp.border only (nothing is selected/active when printing).
		vp.border === 'none' ? 'print:border-0' : 'print:border print:border-black',
	]}
	style:left="{vp.x}px" style:top="{vp.y}px" style:width="{vp.w}px" style:height="{vp.h}px"
	style:pointer-events="none"
>
	<div bind:this={contentEl} class="absolute inset-0 overflow-hidden"
		style:pointer-events={active ? 'auto' : 'none'}
		style:cursor={active && navContent ? (contentPanning ? 'grabbing' : 'grab') : null}>
		<ViewportContent {vp} {vps} {zoom} {active} onview={(v) => lastView = v} />
	</div>

	<!-- Label (prints at point size, above the frame) -->
	{#if vp.label}
		<div class="absolute left-0 whitespace-nowrap leading-none text-zinc-700 pointer-events-none"
			style:top="{-labelMm * 1.4}px" style:font-size="{labelMm}px">{vp.label}</div>
	{/if}
	<!-- Frame toolbar (top-right, above the frame): scale readout + (when active) a content
	     pan/zoom toggle and the model-mode button. Sizes counter-scale via the container font-size
	     so the whole toolbar stays a steady on-screen size at any canvas zoom. -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class={['absolute right-0 flex items-center gap-[0.3em] whitespace-nowrap leading-none print:hidden',
			selected || active ? 'rounded bg-white/90 px-[0.4em] py-[0.15em] shadow-sm ring-1 ring-zinc-300' : '']}
		style:top="{-26 / zoom}px" style:font-size="{11 / zoom}px"
		style:pointer-events={selected || active ? 'auto' : 'none'}
		onmousedown={e => e.stopPropagation()}>
		<span class={selected || active ? 'text-zinc-600 tabular-nums' : 'text-zinc-400 tabular-nums'}>{scaleText}</span>
		{#if active}
			<button class={['rounded px-[0.3em] py-[0.1em]', navContent ? 'bg-blue-600 text-white' : 'text-zinc-600 hover:bg-zinc-100']}
				title="Pan/zoom viewport content (middle/right-drag + wheel). Off = pan/zoom the sheet."
				onclick={e => { e.stopPropagation(); navContent = !navContent }}>✥</button>
			{#if onmodel}
				<button class="rounded px-[0.3em] py-[0.1em] text-blue-600 hover:bg-zinc-100" title="Open in model mode"
					onclick={e => { e.stopPropagation(); onmodel?.(vp.id) }}>⤢</button>
			{/if}
		{/if}
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
