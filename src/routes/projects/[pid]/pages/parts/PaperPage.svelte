<script lang="ts">
	// A sheet tab's paper page: an A3 sheet (fixed size) holding one Viewport + a
	// titleblock, like the Sheets tool / AutoCAD paper space. Two modes, AutoCAD-style:
	//  · Paper space (deactivated): the viewport is a floating FRAME. Select it by its
	//    BORDER (click the edge band) or by dragging a selection box across it — NOT by
	//    clicking the interior. Once selected, drag the border to move or a corner grip to
	//    resize (opposite corner fixed, like the rect tool). Double-click enters it.
	//  · Model space (activated): interact with the drawing inside; double-click on the
	//    paper outside the frame (or Esc / Exit) returns to paper space.
	import Viewport, { type Env, type VpOn } from '../ui/Viewport.svelte'
	import { noopEditor, type Editor } from '../ui/editor'
	import type { Ent, View } from '../ui/geometry'
	import Handle from './Handle.svelte'
	import { beginPointerDrag, DragRegistry } from '../ui/gestures'
	import { HANDLE_PX, PAPER_W, PAPER_H } from '../constants'
	import type { ElevDir } from '../ui/geometry'
	import type { SheetFrame } from '../types'

	// Paper size in px (default A3 landscape). Driven by the status-bar paper-size / orientation.
	type VKind = 'plan' | 'iso' | ElevDir
	let { title = 'Sheet', drawingNo = '001', scale = '1:100', focused = true, tool = 'Select', env = {}, pw = PAPER_W, ph = PAPER_H, sizeLabel = 'A3', rev = '', revDate = '',
		entities = [], entsForModel = undefined, tabModelId = undefined,
		frames = [], selFrame = null, frameKind = (p: string) => p as VKind, isFrameActive = () => false, frameView = () => ({ zoom: 1, x: 0, y: 0 }), frameEnv = {},
		frameOrbit = () => ({ yaw: 0, pitch: 0 }), makeFrameOn = () => ({}), makeFrameEditor = () => noopEditor, onseed, onaddframe, onframegeom, onframecommit, onselectframe, ondeactivate }:
		{ title?: string; drawingNo?: string; scale?: string; focused?: boolean; tool?: string; env?: Env; pw?: number; ph?: number; sizeLabel?: string; rev?: string; revDate?: string;
			entities?: Ent[]; entsForModel?: (mid?: number) => Ent[]; tabModelId?: number;
			frames?: SheetFrame[]; selFrame?: string | null; frameKind?: (p: string) => VKind; isFrameActive?: (id: string) => boolean; frameView?: (id: string, proj: string) => View; frameEnv?: Env;
			frameOrbit?: (id: string, proj: string) => { yaw: number; pitch: number }; makeFrameOn?: (f: SheetFrame) => VpOn; makeFrameEditor?: (f: SheetFrame) => Editor; onseed?: (x: number, y: number, w: number, h: number) => void; onaddframe?: (x: number, y: number, w: number, h: number) => void;
			onframegeom?: (id: string, g: { x: number; y: number; w: number; h: number }) => void; onframecommit?: () => void; onselectframe?: (id: string | null) => void; ondeactivate?: () => void } = $props()
	const canvasZoom = $derived(env.canvasZoom ?? 1)

	// Frame geometry in paper (unscaled) px, within the sheet drawing area.
	type Frame = { x: number; y: number; w: number; h: number }
	let sheetEl: HTMLDivElement | undefined = $state()
	const MIN = 90

	// Seed the page's default viewport (fills the sheet, small margin) the first time the sheet is measured
	// and it has no frames — the parent creates it in the page model.
	$effect(() => {
		if (frames.length || !sheetEl) return
		onseed?.(12, 12, sheetEl.offsetWidth - 24, sheetEl.offsetHeight - 24)
	})

	// Paper px per screen px (the canvas CSS zoom lives above this element), from measured
	// vs layout size — so move/resize/marquee track the pointer at any canvas zoom.
	const scaleOf = () => sheetEl ? sheetEl.getBoundingClientRect().width / sheetEl.offsetWidth : 1
	function toSheet(cx: number, cy: number): { x: number; y: number } {
		const r = sheetEl!.getBoundingClientRect(), s = scaleOf()
		return { x: (cx - r.left) / s, y: (cy - r.top) / s }
	}

	// gi: 0 TL, 1 TR, 2 BR, 3 BL — mirrors the rect-tool corner grips (opposite corner fixed). `set`
	// reports the new geometry up (onframegeom); `commit` records one history step at the end.
	// beginPointerDrag-managed (ui/gestures.ts) with a 4 px move threshold (B19): a jittery click on a frame
	// border no longer records a 'Move viewport' step — same threshold the Sheets tool uses.
	type FrameDrag = { mode: 'move' | 'grip'; gi: number; sx: number; sy: number; base: Frame; s: number; set: (f: Frame) => void; commit?: boolean }
	const reg = new DragRegistry()
	function startDrag(e: PointerEvent, mode: 'move' | 'grip', gi: number, base: Frame, set: (f: Frame) => void, commit = false) {
		e.stopPropagation()
		beginPointerDrag<FrameDrag>(e, { mode, gi, sx: e.clientX, sy: e.clientY, base: { ...base }, s: scaleOf(), set, commit },
			{ onMove: onDrag, onUp: (_e, d, moved) => { if (d.commit && moved) onframecommit?.() } }, reg, { thresholdPx: 4 })   // one history step per extra-frame move/resize
	}
	// Viewports move freely on an infinite canvas — no position clamp; pan to follow one that
	// has been dragged off the paper.
	function onDrag(e: PointerEvent, drag: FrameDrag) {
		const dx = (e.clientX - drag.sx) / drag.s, dy = (e.clientY - drag.sy) / drag.s
		const b = drag.base
		if (drag.mode === 'move') { drag.set({ w: b.w, h: b.h, x: b.x + dx, y: b.y + dy }); return }
		let { x, y, w, h } = b
		if (drag.gi === 0) { x = b.x + dx; y = b.y + dy; w = b.w - dx; h = b.h - dy }       // TL
		else if (drag.gi === 1) { y = b.y + dy; w = b.w + dx; h = b.h - dy }                 // TR
		else if (drag.gi === 2) { w = b.w + dx; h = b.h + dy }                               // BR
		else if (drag.gi === 3) { x = b.x + dx; w = b.w - dx; h = b.h + dy }                 // BL
		if (w < MIN) { if (drag.gi === 0 || drag.gi === 3) x = b.x + b.w - MIN; w = MIN }
		if (h < MIN) { if (drag.gi === 0 || drag.gi === 1) y = b.y + b.h - MIN; h = MIN }
		drag.set({ x, y, w, h })   // may extend beyond the sheet
	}

	// Selection marquee (paper space): drag a box across empty paper; if it touches the
	// frame, the frame is selected. This is the touch-friendly alternative to a border click.
	let marquee = $state<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
	let placingFrame = $state(false)   // dragging out a NEW viewport frame (the Viewport tool)
	function onSheetDown(e: PointerEvent) {
		// A pointerdown INSIDE an active viewport is that viewport's (drawing/editing) — the sheet must not
		// also start a paper-space marquee/frame-placement (that hijacked drawing after the primary was
		// removed). Only handle presses on the bare paper. The Viewport tool disables frame bands, so its
		// press lands on the sheet and is handled here.
		if (e.button !== 0 || (tool !== 'Viewport' && (e.target as Element).closest?.('.vp.active'))) return
		e.preventDefault()   // stop a native text/element drag starting after a double-click (shows a not-allowed cursor + leaves the marquee stuck)
		try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch { /* synthetic */ }
		if (tool !== 'Viewport') onselectframe?.(null)   // clicking empty paper deselects any frame
		placingFrame = tool === 'Viewport'
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
		const wasPlacing = placingFrame; placingFrame = false
		if (!m) return
		const bx0 = Math.min(m.x0, m.x1), by0 = Math.min(m.y0, m.y1), bx1 = Math.max(m.x0, m.x1), by1 = Math.max(m.y0, m.y1)
		if (wasPlacing) {   // Viewport tool: the marquee box becomes a NEW viewport frame
			if (bx1 - bx0 > 20 && by1 - by0 > 20) onaddframe?.(bx0, by0, bx1 - bx0, by1 - by0)
			return
		}
		if (bx1 - bx0 < 3 && by1 - by0 < 3) return   // tiny → just a click (already deselected)
		// marquee selects the topmost frame it touches
		const touches = (f: { x: number; y: number; w: number; h: number }) => bx0 <= f.x + f.w && bx1 >= f.x && by0 <= f.y + f.h && by1 >= f.y
		const ef = [...frames].reverse().find(touches)
		if (ef) onselectframe?.(ef.id)
	}
	// Double-click on the paper outside any frame → exit the active viewport + deselect.
	function onWrapDblclick(e: MouseEvent) {
		if (!(e.target as Element).closest?.('.vp-frame')) { onselectframe?.(null); ondeactivate?.() }
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
			<!-- The sheet's viewport frames (the page model). Each is a window onto the model at its own
			     projection + scale; select by the border band (interior inert), double-click to edit inside,
			     corner grips resize. The Viewport tool disables the bands so a new frame can be dragged out
			     over an existing one. Frame[0] is the seeded default; there is no special "primary". -->
			{#each frames as f (f.id)}
				{@const fon = makeFrameOn(f)}
				{@const feditor = makeFrameEditor(f)}
				{@const fa = isFrameActive(f.id)}
				<div class="vp-frame" class:selected={selFrame === f.id && !fa} class:active={fa}
					style="left:{f.x}px; top:{f.y}px; width:{f.w}px; height:{f.h}px">
					<Viewport kind={frameKind(f.proj)} label={f.label} scale={f.scale} active={fa} {focused} {tool} env={frameEnv} on={fon} editor={feditor} border={f.border} frameId={f.id} modelId={f.modelId ?? tabModelId}
						entities={entsForModel ? entsForModel(f.modelId ?? tabModelId) : entities} view={frameView(f.id, f.proj)} clip={f.clip} yaw={frameOrbit(f.id, f.proj).yaw} pitch={frameOrbit(f.id, f.proj).pitch}
						boxW={f.w} boxH={f.h} />
					{#if !fa}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="vp-band" style:pointer-events={tool === 'Viewport' ? 'none' : undefined} onpointerdown={(e) => { onselectframe?.(f.id); startDrag(e, 'move', -1, f, (g) => onframegeom?.(f.id, g), true); }} ondblclick={() => fon.activate?.()}>
							<!-- interior is inert: select via the border band, double-click to enter -->
							<div class="vp-interior" onpointerdown={(e) => { e.stopPropagation(); onselectframe?.(null); }} ondblclick={() => fon.activate?.()}></div>
						</div>
						{#if selFrame === f.id}
							<svg class="frame-handles">
								{#each CORNERS as [cx, cy], i (i)}
									<Handle cx={cx * f.w} cy={cy * f.h} size={HANDLE_PX / (canvasZoom || 1)} cursor={CURSORS[i]} strokeWidth={1.2 / (canvasZoom || 1)}
										onpointerdown={(e) => startDrag(e, 'grip', i, f, (g) => onframegeom?.(f.id, g), true)} />
								{/each}
							</svg>
						{/if}
					{/if}
				</div>
			{/each}
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
