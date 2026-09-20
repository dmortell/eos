<script lang="ts">
	// A sheet tab's paper page: an A3 sheet (fixed size) holding one Viewport + a
	// titleblock, like the Sheets tool / AutoCAD paper space. Two modes, AutoCAD-style:
	//  · Paper space (deactivated): the viewport is a floating FRAME. Select it by its
	//    BORDER (click the edge band) or by dragging a selection box across it — NOT by
	//    clicking the interior. Once selected, drag the border to move or a corner grip to
	//    resize (opposite corner fixed, like the rect tool). Double-click enters it.
	//  · Model space (activated): interact with the drawing inside; double-click on the
	//    paper outside the frame (or Esc / Exit) returns to paper space.
	import Viewport, { type Ent, type View, type Env } from '../ui/Viewport.svelte'
	import Handle from './Handle.svelte'
	import { HANDLE_PX, PAPER_W, PAPER_H } from '../constants'

	// Paper size in px (default A3 landscape). Driven by the status-bar paper-size / orientation.

	// A selected viewport frame reports its props (position/size/border/type) to the parent so
	// they can be edited in the Properties panel — with callbacks bound to this component's own
	// mutators, so the panel can edit without reaching into this child's state.
	export type FrameSel = { label: string; x: number; y: number; w: number; h: number;
		border: 'dashed' | 'solid' | 'none'; setBorder: (b: 'dashed' | 'solid' | 'none') => void; setRect: (r: Partial<{ x: number; y: number; w: number; h: number }>) => void }
	let { title = 'Sheet', drawingNo = '001', scale = '1:100', active = false, focused = true, tool = 'Select', env = {}, pw = PAPER_W, ph = PAPER_H, sizeLabel = 'A3', rev = '', revDate = '',
		entities = [], sel = [], view = { zoom: 1, x: 0, y: 0 }, onactivate, ondeactivate, onadd, onupdate, ondelete, onselect, onview, onframe, onstatus, oncoords }:
		{ title?: string; drawingNo?: string; scale?: string; active?: boolean; focused?: boolean; tool?: string; env?: Env; pw?: number; ph?: number; sizeLabel?: string; rev?: string; revDate?: string;
			entities?: Ent[]; sel?: string[]; view?: View; onactivate?: () => void; ondeactivate?: () => void; onadd?: (e: Ent) => void; onupdate?: (e: Ent) => void; ondelete?: (ids: string[]) => void; onselect?: (ids: string[]) => void; onview?: (v: View) => void; onframe?: (f: FrameSel | null) => void; onstatus?: (t: string) => void; oncoords?: (x: number, y: number) => void } = $props()
	const canvasZoom = $derived(env.canvasZoom ?? 1)

	let frameBorder = $state<'dashed' | 'solid' | 'none'>('dashed')
	// Emit the selection (or null) whenever the frame's selection / geometry / border changes.
	$effect(() => {
		onframe?.(selected && frame && !active
			? { label: 'Outlets · 33F', x: Math.round(frame.x), y: Math.round(frame.y), w: Math.round(frame.w), h: Math.round(frame.h),
				border: frameBorder, setBorder: (b) => (frameBorder = b),
				setRect: (r) => { if (frame) frame = { ...frame, ...r } } }
			: null)
	})
	// Clear the parent's frame handle when this PaperPage unmounts (tab switch remounts it via
	// {#key}); otherwise the Properties panel keeps a FrameSel whose setters write into a dead component.
	$effect(() => () => onframe?.(null))

	// The viewport frame in paper (unscaled) px, within the sheet drawing area.
	type Frame = { x: number; y: number; w: number; h: number }
	let sheetEl: HTMLDivElement | undefined = $state()
	let frame = $state<Frame | null>(null)
	let selected = $state(false)   // frame selected in paper space
	const MIN = 90

	// Fill the sheet area on first layout (with a small margin), then it's user-movable.
	$effect(() => {
		if (frame || !sheetEl) return
		frame = { x: 12, y: 12, w: sheetEl.offsetWidth - 24, h: sheetEl.offsetHeight - 24 }
	})

	// Paper px per screen px (the canvas CSS zoom lives above this element), from measured
	// vs layout size — so move/resize/marquee track the pointer at any canvas zoom.
	const scaleOf = () => sheetEl ? sheetEl.getBoundingClientRect().width / sheetEl.offsetWidth : 1
	function toSheet(cx: number, cy: number): { x: number; y: number } {
		const r = sheetEl!.getBoundingClientRect(), s = scaleOf()
		return { x: (cx - r.left) / s, y: (cy - r.top) / s }
	}

	// gi: 0 TL, 1 TR, 2 BR, 3 BL — mirrors the rect-tool corner grips (opposite corner fixed).
	let drag: { mode: 'move' | 'grip'; gi: number; sx: number; sy: number; base: Frame; s: number } | null = null
	function startDrag(e: PointerEvent, mode: 'move' | 'grip', gi = -1) {
		e.stopPropagation()
		if (active || !frame) return
		selected = true
		drag = { mode, gi, sx: e.clientX, sy: e.clientY, base: { ...frame }, s: scaleOf() }
		try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch { /* synthetic */ }
		window.addEventListener('pointermove', onDrag)
		window.addEventListener('pointerup', endDrag)
	}
	// Viewports move freely on an infinite canvas — no position clamp; pan to follow one that
	// has been dragged off the paper.
	function onDrag(e: PointerEvent) {
		if (!drag) return
		const dx = (e.clientX - drag.sx) / drag.s, dy = (e.clientY - drag.sy) / drag.s
		const b = drag.base
		if (drag.mode === 'move') {
			frame = { w: b.w, h: b.h, x: b.x + dx, y: b.y + dy }
			return
		}
		let { x, y, w, h } = b
		if (drag.gi === 0) { x = b.x + dx; y = b.y + dy; w = b.w - dx; h = b.h - dy }       // TL
		else if (drag.gi === 1) { y = b.y + dy; w = b.w + dx; h = b.h - dy }                 // TR
		else if (drag.gi === 2) { w = b.w + dx; h = b.h + dy }                               // BR
		else if (drag.gi === 3) { x = b.x + dx; w = b.w - dx; h = b.h + dy }                 // BL
		if (w < MIN) { if (drag.gi === 0 || drag.gi === 3) x = b.x + b.w - MIN; w = MIN }
		if (h < MIN) { if (drag.gi === 0 || drag.gi === 1) y = b.y + b.h - MIN; h = MIN }
		frame = { x, y, w, h }   // may extend beyond the sheet
	}
	function endDrag() {
		drag = null
		window.removeEventListener('pointermove', onDrag)
		window.removeEventListener('pointerup', endDrag)
	}

	// Selection marquee (paper space): drag a box across empty paper; if it touches the
	// frame, the frame is selected. This is the touch-friendly alternative to a border click.
	let marquee = $state<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
	function onSheetDown(e: PointerEvent) {
		if (active || e.button !== 0) return
		e.preventDefault()   // stop a native text/element drag starting after a double-click (shows a not-allowed cursor + leaves the marquee stuck)
		try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch { /* synthetic */ }
		selected = false
		const p = toSheet(e.clientX, e.clientY)
		marquee = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }
		window.addEventListener('pointermove', onMarquee)
		window.addEventListener('pointerup', endMarquee)
	}
	function onMarquee(e: PointerEvent) {
		if (!marquee) return
		const p = toSheet(e.clientX, e.clientY)
		marquee = { ...marquee, x1: p.x, y1: p.y }
	}
	function endMarquee() {
		window.removeEventListener('pointermove', onMarquee)
		window.removeEventListener('pointerup', endMarquee)
		const m = marquee; marquee = null
		if (!m || !frame) return
		const bx0 = Math.min(m.x0, m.x1), by0 = Math.min(m.y0, m.y1), bx1 = Math.max(m.x0, m.x1), by1 = Math.max(m.y0, m.y1)
		if (bx1 - bx0 < 3 && by1 - by0 < 3) return   // tiny → just a click (already deselected)
		const touches = bx0 <= frame.x + frame.w && bx1 >= frame.x && by0 <= frame.y + frame.h && by1 >= frame.y
		if (touches) selected = true
	}

	// Interior click (paper space) deselects; double-click anywhere on the paper outside the
	// frame exits model space.
	function onInteriorDown(e: PointerEvent) { e.stopPropagation(); selected = false }
	function onWrapDblclick(e: MouseEvent) {
		if (active && !(e.target as Element).closest?.('.vp-frame')) ondeactivate?.()
	}
	const CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]] as const   // TL, TR, BR, BL
	const CURSORS = ['nwse-resize', 'nesw-resize', 'nwse-resize', 'nesw-resize']
	let mq = $derived(marquee ? { x: Math.min(marquee.x0, marquee.x1), y: Math.min(marquee.y0, marquee.y1), w: Math.abs(marquee.x1 - marquee.x0), h: Math.abs(marquee.y1 - marquee.y0) } : null)
</script>

<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
<div class="paper-wrap" ondblclick={onWrapDblclick}>
	<div class="paper" style:width="{pw}px" style:height="{ph}px">
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="sheet-area" bind:this={sheetEl} onpointerdown={onSheetDown}>
			{#if frame}
				<div class="vp-frame" class:selected={selected && !active} class:active
					style="left:{frame.x}px; top:{frame.y}px; width:{frame.w}px; height:{frame.h}px">
					<Viewport kind="floorplan" label="Outlets · 33F" {scale} {active} {focused} {tool} {env} border={frameBorder} {entities} {sel} {view}
						boxW={frame.w} boxH={frame.h}
						{onactivate} {ondeactivate} {onadd} {onupdate} {ondelete} {onselect} {onview} {onstatus} {oncoords} />
					{#if !active}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<!-- Border band selects + moves; the interior child leaves the middle inert. -->
						<div class="vp-band" onpointerdown={(e) => startDrag(e, 'move')} ondblclick={() => onactivate?.()}>
							<div class="vp-interior" onpointerdown={onInteriorDown} ondblclick={() => onactivate?.()}></div>
						</div>
						{#if selected}
							<!-- corner grips as an SVG overlay, sharing Handle.svelte with the entity grips -->
							<svg class="frame-handles">
								{#each CORNERS as [cx, cy], i (i)}
									<Handle cx={cx * frame.w} cy={cy * frame.h} size={HANDLE_PX / (canvasZoom || 1)} cursor={CURSORS[i]} strokeWidth={1.2 / (canvasZoom || 1)}
										onpointerdown={(e) => startDrag(e, 'grip', i)} />
								{/each}
							</svg>
						{/if}
					{/if}
				</div>
			{/if}
			{#if mq}
				<div class="vp-marquee" style="left:{mq.x}px; top:{mq.y}px; width:{mq.w}px; height:{mq.h}px"></div>
			{/if}
		</div>
		<!-- titleblock (right vertical strip, like EOS) -->
		<div class="tb">
			<div class="tb-logo">J</div>
			<div class="tb-cell"><span>PROJECT</span><b>Hibiya Midtown</b></div>
			<div class="tb-cell"><span>TITLE</span><b>{title}</b></div>
			<div class="tb-grid">
				<div class="tb-cell"><span>SCALE</span>{scale}</div>
				<div class="tb-cell"><span>SIZE</span>{sizeLabel}</div>
				<div class="tb-cell"><span>REV</span>{rev || '—'}</div>
				<div class="tb-cell"><span>DATE</span>{revDate || '—'}</div>
				<div class="tb-cell"><span>DRAWN</span>DM</div>
				<div class="tb-cell"><span>DWG №</span>{drawingNo}</div>
			</div>
		</div>
	</div>
</div>

<style>
	/* No overflow clip here: the pane (.canvas) already clips at the real screen edge. A clip
	   on this transformed wrapper would move/scale with the canvas and cut off viewports moved
	   away from the paper — the canvas is meant to be infinite (pan to follow). */
	/* Pin the paper at the content origin (0,0) — NOT flex-centred — so fitPane's centring translate
	   is correct and the world origin is stable when the pane resizes (was double-offset before). */
	.paper-wrap { position:absolute; inset:0; }
	/* Paper is always white/light — it's paper, independent of the app theme. */
	/* Fixed on-screen size (A3 landscape, 420:297) like a real CAD sheet — you zoom/pan
	   the canvas over it rather than the paper auto-fitting the window. Fit-to-view (View ›
	   Fit) frames it. Print overrides these to true A3 mm via the @media-print rules. */
	.paper {
		/* size set inline from pw/ph; print overrides to true mm. Pinned at (0,0). */
		position:absolute; left:0; top:0;
		background:#fff; color:#1f2937; box-shadow:0 10px 40px #0006;
		display:flex; gap:6px; padding:10px; transform-origin:0 0; flex:none;
	}
	.sheet-area { position:relative; flex:1; min-width:0; user-select:none; -webkit-user-select:none; touch-action:none; }
	/* The floating viewport frame (paper space). */
	.vp-frame { position:absolute; }
	.vp-frame.selected { outline:1.5px solid #0e7490; outline-offset:1px; }
	/* Border band = the only region that selects/moves the frame; interior stays inert. */
	.vp-band { position:absolute; inset:0; border:11px solid transparent; box-sizing:border-box; cursor:move; touch-action:none; }
	.vp-interior { position:absolute; inset:0; cursor:default; touch-action:none; }
	/* Corner-grip overlay: fills the frame, only the handles catch pointer events. */
	.frame-handles { position:absolute; inset:0; width:100%; height:100%; overflow:visible; pointer-events:none; z-index:2; }
	/* Paper-space selection box. */
	.vp-marquee { position:absolute; background:#3b82f61f; border:1px solid #3b82f6; pointer-events:none; }
	/* Titleblock */
	.tb { width:16%; min-width:78px; display:flex; flex-direction:column; border:1px solid #64748b; }
	.tb-logo {
		height:34px; display:flex; align-items:center; justify-content:center;
		font-family:Georgia, serif; font-size:18px; font-weight:700; color:#1f2937; border-bottom:1px solid #94a3b8;
	}
	.tb-cell { border-bottom:1px solid #cbd5e1; padding:3px 5px; font-size:9px; color:#1f2937; min-width:0; overflow:hidden; }
	.tb-cell span { display:block; font-size:6px; letter-spacing:.08em; color:#94a3b8; }
	.tb-cell b { font-weight:600; }
	.tb-grid { margin-top:auto; display:grid; grid-template-columns:1fr 1fr; }
	.tb-grid .tb-cell { border-right:1px solid #cbd5e1; }
	.tb-grid .tb-cell:nth-child(even) { border-right:none; }
</style>
