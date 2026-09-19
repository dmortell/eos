<script lang="ts">
	// A sheet tab's paper page: an A3 sheet (fixed size) holding one Viewport + a
	// titleblock, like the Sheets tool / AutoCAD paper space. Two modes, AutoCAD-style:
	//  · Paper space (deactivated): the viewport is a floating FRAME you can select
	//    (click its border), move (drag body) and resize (corner grips — same pattern as
	//    the rect tool: drag a corner, opposite corner stays put). Double-click enters it.
	//  · Model space (activated): interact with the drawing inside; double-click on the
	//    paper outside the frame (or Esc / Exit) returns to paper space.
	import Viewport, { type Ent, type View } from '../ui/Viewport.svelte'

	let { title = 'Sheet', drawingNo = '001', scale = '1:100', active = false, tool = 'Select',
		entities = [], sel = [], view = { zoom: 1, x: 0, y: 0 }, onactivate, ondeactivate, onadd, onupdate, onselect, onview }:
		{ title?: string; drawingNo?: string; scale?: string; active?: boolean; tool?: string;
			entities?: Ent[]; sel?: string[]; view?: View; onactivate?: () => void; ondeactivate?: () => void; onadd?: (e: Ent) => void; onupdate?: (e: Ent) => void; onselect?: (ids: string[]) => void; onview?: (v: View) => void } = $props()

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
	// vs layout size — so move/resize track the pointer at any canvas zoom.
	const scaleOf = () => sheetEl ? sheetEl.getBoundingClientRect().width / sheetEl.offsetWidth : 1
	const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

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
	function onDrag(e: PointerEvent) {
		if (!drag || !sheetEl) return
		const dx = (e.clientX - drag.sx) / drag.s, dy = (e.clientY - drag.sy) / drag.s
		const b = drag.base, W = sheetEl.offsetWidth, H = sheetEl.offsetHeight
		if (drag.mode === 'move') {
			frame = { w: b.w, h: b.h, x: clamp(b.x + dx, 0, W - b.w), y: clamp(b.y + dy, 0, H - b.h) }
			return
		}
		let { x, y, w, h } = b
		if (drag.gi === 0) { x = b.x + dx; y = b.y + dy; w = b.w - dx; h = b.h - dy }       // TL
		else if (drag.gi === 1) { y = b.y + dy; w = b.w + dx; h = b.h - dy }                 // TR
		else if (drag.gi === 2) { w = b.w + dx; h = b.h + dy }                               // BR
		else if (drag.gi === 3) { x = b.x + dx; w = b.w - dx; h = b.h + dy }                 // BL
		// keep a minimum size and hold the opposite edge fixed
		if (w < MIN) { if (drag.gi === 0 || drag.gi === 3) x = b.x + b.w - MIN; w = MIN }
		if (h < MIN) { if (drag.gi === 0 || drag.gi === 1) y = b.y + b.h - MIN; h = MIN }
		frame = { x: clamp(x, 0, W - MIN), y: clamp(y, 0, H - MIN), w: Math.min(w, W - x), h: Math.min(h, H - y) }
	}
	function endDrag() {
		drag = null
		window.removeEventListener('pointermove', onDrag)
		window.removeEventListener('pointerup', endDrag)
	}

	// Paper background: single click deselects the frame; double-click (outside the frame)
	// while active exits model space.
	function onPaperDown() { if (!active) selected = false }
	function onPaperDblclick(e: MouseEvent) {
		if (active && !(e.target as Element).closest?.('.vp-frame')) ondeactivate?.()
	}
	const CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]] as const   // TL, TR, BR, BL
	const CURSORS = ['nwse-resize', 'nesw-resize', 'nwse-resize', 'nesw-resize']
</script>

<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
<div class="paper-wrap">
	<div class="paper">
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="sheet-area" bind:this={sheetEl} onpointerdown={onPaperDown} ondblclick={onPaperDblclick}>
			{#if frame}
				<div class="vp-frame" class:selected={selected && !active} class:active
					style="left:{frame.x}px; top:{frame.y}px; width:{frame.w}px; height:{frame.h}px">
					<Viewport kind="floorplan" label="Outlets · 33F" {scale} {active} {tool} {entities} {sel} {view}
						{onactivate} {ondeactivate} {onadd} {onupdate} {onselect} {onview} />
					{#if !active}
						<!-- paper-space cover: click selects, drag moves, double-click enters model space -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="vp-cover" class:selected onpointerdown={(e) => startDrag(e, 'move')} ondblclick={() => onactivate?.()}></div>
						{#if selected}
							{#each CORNERS as [cx, cy], i (i)}
								<div class="vp-grip" style="left:{frame.x + cx * frame.w}px; top:{frame.y + cy * frame.h}px; cursor:{CURSORS[i]}"
									onpointerdown={(e) => startDrag(e, 'grip', i)}></div>
							{/each}
						{/if}
					{/if}
				</div>
			{/if}
		</div>
		<!-- titleblock (right vertical strip, like EOS) -->
		<div class="tb">
			<div class="tb-logo">J</div>
			<div class="tb-cell"><span>PROJECT</span><b>Hibiya Midtown</b></div>
			<div class="tb-cell"><span>TITLE</span><b>{title}</b></div>
			<div class="tb-grid">
				<div class="tb-cell"><span>SCALE</span>{scale}</div>
				<div class="tb-cell"><span>SIZE</span>A3</div>
				<div class="tb-cell"><span>DRAWN</span>DM</div>
				<div class="tb-cell"><span>DWG №</span>{drawingNo}</div>
			</div>
		</div>
	</div>
</div>

<style>
	.paper-wrap { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; overflow:hidden; }
	/* Paper is always white/light — it's paper, independent of the app theme. */
	/* Fixed on-screen size (A3 landscape, 420:297) like a real CAD sheet — you zoom/pan
	   the canvas over it rather than the paper auto-fitting the window. Fit-to-view (View ›
	   Fit) frames it. Print overrides these to true A3 mm via the @media-print rules. */
	.paper {
		width:960px; height:679px;
		background:#fff; color:#1f2937; box-shadow:0 10px 40px #0006;
		display:flex; gap:6px; padding:10px; transform-origin:center; flex:none;
	}
	.sheet-area { position:relative; flex:1; min-width:0; }
	/* The floating viewport frame (paper space). */
	.vp-frame { position:absolute; }
	/* Cover intercepts paper-space interaction so the drawing underneath stays inert. */
	.vp-cover { position:absolute; inset:0; cursor:pointer; touch-action:none; }
	.vp-cover.selected { cursor:move; }
	.vp-frame.selected { outline:1.5px solid #0e7490; outline-offset:1px; }
	/* Move/resize grips — same look as the rect-tool grips. */
	.vp-grip {
		position:absolute; width:12px; height:12px; transform:translate(-50%,-50%);
		background:#fff; border:1.5px solid #0e7490; border-radius:2px; touch-action:none; z-index:2;
	}
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
