<script lang="ts">
	import type { ViewportEditor } from "./viewports.svelte";
	import type { SheetViewport } from "./types";
	import { Dialog, Icon } from "$lib";
	import { portal } from "./edit/portal";
	import ViewportContent from "./ViewportContent.svelte";

	// Model-driven: the controller owns position/selection/active state; this component renders
	// one viewport and reports frame-clicks / handle-drags back. AutoCAD-style selection — you
	// pick a viewport by its FRAME or a marquee box, never by clicking the inactive interior.
	type Snap = { w: number; h: number; margins: number; grid?: number; tb?: { x: number; y: number; w: number; h: number } | null }
	let { vps, vp, zoom = 1, snap, num = 0, total = 1, onmodel }: { vps: ViewportEditor; vp: SheetViewport; zoom?: number; snap?: Snap; num?: number; total?: number; onmodel?: (id: string) => void } = $props()

	let selected = $derived(vps.isSelected(vp.id))
	let active = $derived(vps.activeId === vp.id)

	// Handle/frame sizes counter-scaled by the Canvas zoom so they stay a steady on-screen size.
	let H = $derived(9 / zoom)      // grip size (mm)
	let FRAME = $derived(7 / zoom)  // clickable frame-strip thickness (mm)

	const MIN = 20 // min viewport size (mm)
	const THRESHOLD = 4 // screen px before a move commits (anti-nudge)
	const SNAP_TOL = 6 // screen px within which a frame edge snaps to a guide (19d; Alt disables)
	// Scale choices for the frame-toolbar picker (mirrors the Viewport properties window). 0 = Fit.
	const VP_SCALES = [
		{ label: 'Fit', value: 0 }, { label: '1:2', value: 2 }, { label: '1:5', value: 5 }, { label: '1:10', value: 10 },
		{ label: '1:15', value: 15 }, { label: '1:20', value: 20 }, { label: '1:25', value: 25 }, { label: '1:50', value: 50 },
		{ label: '1:100', value: 100 }, { label: '1:150', value: 150 }, { label: '1:200', value: 200 }, { label: '1:500', value: 500 },
	]

	let el: HTMLDivElement
	type Corner = 'nw' | 'ne' | 'sw' | 'se'
	type Drag = { mode: 'move' | Corner; mx: number; my: number; x0: number; y0: number; w0: number; h0: number; scale: number; moved: boolean }
	let drag = $state<Drag | null>(null)

	function selectFrame(e: MouseEvent) {
		if (e.button !== 0) return
		e.stopPropagation() // we handle selection; don't let SheetEditor start a marquee
		vps.select(vp.id, e.shiftKey || e.ctrlKey || e.metaKey)
	}
	// Press on the frame edge: Shift/Ctrl = additive select; otherwise select + arm a move (a plain
	// click selects, a drag past THRESHOLD moves — so the frame itself is the move affordance and we
	// don't need a floating grip that looks like an annotation's rotate handle).
	function frameDown(e: MouseEvent) {
		if (e.button !== 0) return
		if (e.shiftKey || e.ctrlKey || e.metaKey) { selectFrame(e); return }
		start('move', e)
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
	// ── Snap (19d): paper edges / printable margin / title-block edges / 5mm grid. Alt disables. ──
	function xLines(): number[] {
		if (!snap) return []
		const L = [0, snap.margins, snap.w - snap.margins, snap.w]
		if (snap.tb) L.push(snap.tb.x, snap.tb.x + snap.tb.w)
		return L
	}
	function yLines(): number[] {
		if (!snap) return []
		const L = [0, snap.margins, snap.h - snap.margins, snap.h]
		if (snap.tb) L.push(snap.tb.y, snap.tb.y + snap.tb.h)
		return L
	}
	/** Smallest delta (mm) to add so one of `edges` lands on a guide line or grid multiple; 0 if none within tol. */
	function snapDelta(edges: number[], lines: number[], tolMm: number): number {
		const grid = snap?.grid ?? 0
		let best = 0, bestAbs = tolMm
		for (const e of edges) {
			for (const ln of lines) { const d = ln - e; if (Math.abs(d) < bestAbs) { bestAbs = Math.abs(d); best = d } }
			if (grid > 0) { const d = Math.round(e / grid) * grid - e; if (Math.abs(d) < bestAbs) { bestAbs = Math.abs(d); best = d } }
		}
		return best
	}

	function onMove(e: MouseEvent) {
		if (!drag) return
		if (!drag.moved) {
			if (Math.hypot(e.clientX - drag.mx, e.clientY - drag.my) < THRESHOLD) return
			drag.moved = true
		}
		const dx = (e.clientX - drag.mx) / drag.scale, dy = (e.clientY - drag.my) / drag.scale
		const doSnap = !!snap && !e.altKey
		const tolMm = SNAP_TOL / drag.scale
		if (drag.mode === 'move') {
			let x = drag.x0 + dx, y = drag.y0 + dy
			if (doSnap) { x += snapDelta([x, x + vp.w], xLines(), tolMm); y += snapDelta([y, y + vp.h], yLines(), tolMm) }
			vps.setRect(vp.id, { x, y, w: vp.w, h: vp.h }); return
		}
		const left = drag.mode === 'nw' || drag.mode === 'sw'
		const top = drag.mode === 'nw' || drag.mode === 'ne'
		let nx = drag.x0, ny = drag.y0
		let nw = left ? drag.w0 - dx : drag.w0 + dx
		let nh = top ? drag.h0 - dy : drag.h0 + dy
		if (left) nx = drag.x0 + dx
		if (top) ny = drag.y0 + dy
		if (doSnap) {
			// Snap only the edge(s) being dragged.
			if (left) { const d = snapDelta([nx], xLines(), tolMm); nx += d; nw -= d }
			else { const d = snapDelta([nx + nw], xLines(), tolMm); nw += d }
			if (top) { const d = snapDelta([ny], yLines(), tolMm); ny += d; nh -= d }
			else { const d = snapDelta([ny + nh], yLines(), tolMm); nh += d }
		}
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
		vp.scale && vp.scale > 0 ? `1:${Math.round(vp.scale*100)/100}`
			: lastView ? `1:${Math.round(lastView.den)} (fit)` : 'Fit'
	)

	// ── Scale picker dialog (a Dialog renders outside the zoomed canvas, so the list reads at normal
	// font size; the native <select> was tiny/invisible at the toolbar's counter-scaled font). ──
	let scaleDialogOpen = $state(false)
	let customScale = $state('')
	function openScaleDialog() {
		const cur = vp.scale ?? 0
		customScale = cur > 0 && !VP_SCALES.some(s => s.value === cur) ? String(cur) : ''
		scaleDialogOpen = true
	}
	function pickScale(v: number) { vps.setScale(vp.id, v); scaleDialogOpen = false }
	function applyCustom() {
		const n = Number(customScale)
		if (Number.isFinite(n) && n > 0) { vps.setScale(vp.id, n); scaleDialogOpen = false }
	}

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

	let scaleListOpen = $state(true)
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

	<!-- Label (prints at point size, above the frame). Viewports are numbered (by order) when a sheet
	     has more than one, for section/elevation references — number shown before any text label. -->
	{#if (total > 1 && num) || vp.label}
		<div class="absolute left-0 flex items-center gap-[0.4em] whitespace-nowrap leading-none text-zinc-700 pointer-events-none"
			style:top="{-labelMm * 1.4}px" style:font-size="{labelMm}px">
			{#if total > 1 && num}<span class="font-semibold">{num}</span>{/if}
			{#if vp.label}<span>{vp.label}</span>{/if}
		</div>
	{/if}
	<!-- Frame toolbar (top-right corner of the frame): scale readout + (when active) a content
	     pan/zoom toggle and the model-mode button. Sizes counter-scale via the container font-size
	     so the whole toolbar stays a steady on-screen size at any canvas zoom. -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class={["absolute right-1 top-0.5 px-1 text-[6px] flex gap-1 items-center whitespace-nowrap print:hidden ",
		(selected || active) && "bg-white rounded border border-slate-400 shadow-sm"
	]}
		style:pointer-events={selected || active ? 'auto' : 'none'}
	>
		{#if selected || active}
			<!-- Scale: opens a Dialog (list + custom input). A dialog reads at normal font size, unlike
			     the old native <select> which was tiny/invisible at the toolbar's counter-scaled font. -->
			<button class="flex items-center gap-[0.2em] rounded px-[0.3em] text-zinc-600 hover:bg-zinc-100" title="Set viewport scale"
				onmousedown={e => e.stopPropagation()} onclick={e => { e.stopPropagation(); openScaleDialog() }}>
				{scaleText}
				<Icon size={8} name="chevronDown" />
			</button>
		{:else}
			<span class="text-zinc-400 tabular-nums">{scaleText}</span>
		{/if}
		{#if active}
			<button class={['rounded px-[0.3em] xxpy-[0.1em]', navContent ? 'bg-blue-600 text-white' : 'text-zinc-600 hover:bg-zinc-100']}
				title="Pan/zoom viewport content (middle/right-drag + wheel)"
				onclick={e => { e.stopPropagation(); navContent = !navContent }}>✥</button>
			{#if onmodel}
				<button class="rounded px-[0.3em] py-[0.1em] text-blue-600 hover:bg-zinc-100" title="Open in model mode"
					onclick={e => { e.stopPropagation(); onmodel?.(vp.id) }}>⤢</button>
			{/if}
		{/if}
	</div>

	{#if selected || active}
		<!-- Scale dialog (portalled out of the zoomed canvas so it renders at normal size). -->
		<div use:portal>
			<Dialog title="Viewport scale" bind:open={scaleDialogOpen}>
				<div class="grid grid-cols-3 gap-2">
					{#each VP_SCALES as s (s.value)}
						<button class="rounded border px-2 py-1.5 text-sm {(vp.scale ?? 0) === s.value ? 'border-blue-600 bg-blue-600 text-white' : 'border-zinc-300 hover:bg-slate-100'}" onclick={() => pickScale(s.value)}>{s.label}</button>
					{/each}
				</div>
				<div class="mt-4 flex items-center gap-2">
					<span class="shrink-0 text-sm text-zinc-600">Custom 1:</span>
					<input type="number" min="1" step="any" class="w-28 rounded border border-zinc-300 px-2 py-1 text-sm" placeholder="e.g. 75"
						bind:value={customScale} onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') applyCustom() }} />
					<button class="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-500" onclick={applyCustom}>Set</button>
				</div>
				<p class="mt-2 text-xs text-zinc-400">Fit = auto-fit the content to the viewport.</p>
			</Dialog>
		</div>
	{/if}

	{#if !active}
		<!-- Clickable frame: four thin edge strips so the interior stays click-through. Click selects;
		     drag moves (no separate grip — keeps the top-centre clear for a future rotate handle). -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="vp-frame absolute" style:inset="0" style:pointer-events="none">
			<div class="absolute left-0 right-0 top-0" style:height="{FRAME}px" style:pointer-events="auto" style:cursor="move" onmousedown={frameDown}></div>
			<div class="absolute left-0 right-0 bottom-0" style:height="{FRAME}px" style:pointer-events="auto" style:cursor="move" onmousedown={frameDown}></div>
			<div class="absolute top-0 bottom-0 left-0" style:width="{FRAME}px" style:pointer-events="auto" style:cursor="move" onmousedown={frameDown}></div>
			<div class="absolute top-0 bottom-0 right-0" style:width="{FRAME}px" style:pointer-events="auto" style:cursor="move" onmousedown={frameDown}></div>
		</div>
	{/if}

	{#if selected && !active}
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
