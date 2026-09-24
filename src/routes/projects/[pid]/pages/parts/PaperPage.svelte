<script lang="ts">
	// A sheet tab's paper page: an A3 sheet (fixed size) holding one Viewport + a
	// titleblock, like the Sheets tool / AutoCAD paper space. Two modes, AutoCAD-style:
	//  · Paper space (deactivated): the viewport is a floating FRAME. Select it by its
	//    BORDER (click the edge band) or by dragging a selection box across it — NOT by
	//    clicking the interior. Once selected, drag the border to move or a corner grip to
	//    resize (opposite corner fixed, like the rect tool). Double-click enters it.
	//  · Model space (activated): interact with the drawing inside; double-click on the
	//    paper outside the frame (or Esc / Exit) returns to paper space.
	import Viewport from '../ui/Viewport.svelte'
	import type { Env, VpOn } from '../ui/vpTypes'
	import { noopEditor, type Editor } from '../ui/editor'
	import { singleOfKind } from '../ui/selection'
	import type { Ent, Pt, View } from '../ui/geometry'
	import Handle from './Handle.svelte'
	import { beginPointerDrag, DragRegistry } from '../ui/gestures'
	import { inBox, marqueeSelect } from '../ui/hit'
	import { gripsLocal, constrainGrip } from '../ui/grips'
	import { PAPER_SNAP_STEP, paperSnapLines, frameSnapDelta } from '../ui/snap'
	import type { ViewCtx } from '../ui/view'
	import { HANDLE_PX, PAPER_W, PAPER_H, PAPER_PX_PER_MM } from '../constants'
	import type { ElevDir } from '../ui/geometry'
	import type { SheetFrame } from '../types'
	import { fillTitleBlock, DEFAULT_TITLE_BLOCK, type TbCell } from '../titleBlock'

	// Paper size in px (default A3 landscape). Driven by the status-bar paper-size / orientation.
	type VKind = 'plan' | 'iso' | ElevDir
	let { title = 'Sheet', drawingNo = '001', scale = '1:100', focused = true, tool = 'Select', env = {}, pw = PAPER_W, ph = PAPER_H, sizeLabel = 'A3', rev = '', revDate = '', marginMm = 0, tb = undefined,
		entities = [], entsForModel = undefined, tabModelId = undefined,
		frames = [], editor = noopEditor, frameKind = (p: string) => p as VKind, isFrameActive = () => false, frameView = () => ({ zoom: 1, x: 0, y: 0 }), frameEnv = {},
		frameOrbit = () => ({ yaw: 0, pitch: 0 }), makeFrameOn = () => ({}), makeFrameEditor = () => noopEditor, onseed, onaddframe, onframegeom, onframecommit, ondeactivate }:
		{ title?: string; drawingNo?: string; scale?: string; focused?: boolean; tool?: string; env?: Env; pw?: number; ph?: number; sizeLabel?: string; rev?: string; revDate?: string;
			/** The filled title block (titleBlock.ts); absent → the default template from the props above. */ tb?: { logo?: string; cells: TbCell[] };
			/** XP7: paper margin (mm) — a dashed guide (screen only) and frame snap lines. */ marginMm?: number;
			entities?: Ent[]; entsForModel?: (mid?: string) => Ent[]; tabModelId?: string;
			// R3 commit 3 (review.md §R3): a NEW page-level `editor` — distinct from `makeFrameEditor` (which
			// builds one PER-FRAME editor for entity/obj/guide/section/node editing INSIDE that frame's
			// viewport). This one's `sel` holds the 'frame' kind only: which viewport FRAME is selected in
			// PAPER space (border/marquee click, grips, Properties). Both share the same per-viewport
			// selStore — the page editor is keyed by the TAB id (a slot no per-frame editor ever writes to).
			frames?: SheetFrame[]; editor?: Editor; frameKind?: (p: string) => VKind; isFrameActive?: (id: string) => boolean; frameView?: (id: string, proj: string) => View; frameEnv?: Env;
			frameOrbit?: (id: string, proj: string) => { yaw: number; pitch: number }; makeFrameOn?: (f: SheetFrame) => VpOn; makeFrameEditor?: (f: SheetFrame) => Editor; onseed?: (x: number, y: number, w: number, h: number) => void; onaddframe?: (x: number, y: number, w: number, h: number) => void;
			onframegeom?: (id: string, g: { x: number; y: number; w: number; h: number }) => void; onframecommit?: () => void; ondeactivate?: () => void } = $props()
	const canvasZoom = $derived(env.canvasZoom ?? 1)
	const tbShown = $derived(tb ?? { logo: DEFAULT_TITLE_BLOCK.logo, cells: fillTitleBlock(undefined, { title, scale, size: sizeLabel, rev, date: revDate, number: drawingNo }) })
	const selFrame = $derived(singleOfKind(editor.sel.get(), 'frame')?.id ?? null)
	const selectFrame = (id: string) => editor.sel.only([{ kind: 'frame', id }])
	const clearFrameSel = () => editor.sel.clear()

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
	// PaperPage's own corner order (CORNERS below: TL,TR,BR,BL = gi 0-3) doesn't match grips.ts's rect-branch
	// output order (TL,BR,BL,TR = index 0-3, grips.ts's rect branch) — GRIP_IDX reindexes one to the other.
	// LEFT_GI/TOP_GI say which corners clamp x/y against the MIN size (matches the old hand-rolled clamp:
	// only a corner ON that edge repositions when the drag would shrink the frame below MIN).
	const GRIP_IDX = [0, 3, 1, 2]   // PaperPage gi -> grips.ts rect-grip array index
	const LEFT_GI = new Set([0, 3]), TOP_GI = new Set([0, 1])

	// Frame snap (R8-lite), ported from sheets/Viewport.svelte's own
	// frame-snap/Alt convention per Dave's ask to match it: paper edges + a 5mm grid, Alt disables.
	// `PAPER_SNAP_STEP` (snap.ts) is real paper mm — GRID_STEP_PX converts it ONCE to paper px (frame
	// geometry's actual unit, see BAND_PX above). `SNAP_TOL_PX` is SCREEN px (matches Sheets' SNAP_TOL),
	// converted to paper px per-drag via `drag.s`, same pattern as Sheets' `SNAP_TOL / drag.scale`.
	// Margin/titleblock snap lines are a later addition (v1 is paper edges only, snap.ts's paperSnapLines).
	const GRID_STEP_PX = PAPER_SNAP_STEP * PAPER_PX_PER_MM
	const SNAP_TOL_PX = 6
	const snapEdge = (v: number, lines: number[], tolPaperPx: number): number => v + frameSnapDelta([v], lines, GRID_STEP_PX, tolPaperPx)

	// Viewports move freely on an infinite canvas — no position clamp; pan to follow one that
	// has been dragged off the paper.
	function onDrag(e: PointerEvent, drag: FrameDrag) {
		const dx = (e.clientX - drag.sx) / drag.s, dy = (e.clientY - drag.sy) / drag.s
		const b = drag.base
		const lines = paperSnapLines(pw, ph, marginMm * PAPER_PX_PER_MM)   // XP7: margins snap too
		const tol = SNAP_TOL_PX / drag.s
		if (drag.mode === 'move') {
			let x = b.x + dx, y = b.y + dy
			if (!e.altKey) {   // move: both edges of an axis snap together (the whole frame shifts)
				x += frameSnapDelta([x, x + b.w], lines.x, GRID_STEP_PX, tol)
				y += frameSnapDelta([y, y + b.h], lines.y, GRID_STEP_PX, tol)
			}
			drag.set({ w: b.w, h: b.h, x, y }); return
		}
		// Corner resize (opposite corner fixed) + Shift-square constrain reuse grips.ts's rect grip
		// (R8-lite) via a throwaway fake rect `Ent` built from `drag.base`
		// — storage stays `Frame`/`SheetFrame`, only the resize MATH is shared.
		const baseEnt: Ent = { id: 'frame', type: 'rect', a: [b.x, b.y], b: [b.x + b.w, b.y + b.h] }
		const opts = { gripMm: 0, shift: () => e.shiftKey, imgCropId: null }
		const gi = GRIP_IDX[drag.gi]
		const grip = gripsLocal(PAPER_CTX, baseEnt, opts)[gi]
		let p: Pt = [toSheet(e.clientX, e.clientY).x, toSheet(e.clientX, e.clientY).y]
		p = constrainGrip(PAPER_CTX, baseEnt, gi, p, e.shiftKey, opts)
		if (!e.altKey) p = [snapEdge(p[0], lines.x, tol), snapEdge(p[1], lines.y, tol)]   // resize: only the dragged edge(s) snap
		const anchor = grip.anchor!   // the opposite corner, held fixed
		const px = LEFT_GI.has(drag.gi) ? Math.min(p[0], anchor[0] - MIN) : Math.max(p[0], anchor[0] + MIN)
		const py = TOP_GI.has(drag.gi) ? Math.min(p[1], anchor[1] - MIN) : Math.max(p[1], anchor[1] + MIN)
		const edited = grip.apply([px, py])
		const [ex0, ey0] = edited.a!, [ex1, ey1] = edited.b!
		drag.set({ x: Math.min(ex0, ex1), y: Math.min(ey0, ey1), w: Math.abs(ex1 - ex0), h: Math.abs(ey1 - ey0) })   // may extend beyond the sheet
	}

	// Frame pick + marquee (R8-lite): border-band pick and marquee
	// selection reuse `hit.ts`'s `inBox`/`marqueeSelect` instead of hand-rolled DOM/geometry, so there's one
	// implementation of each. `PAPER_CTX` is a throwaway `ViewCtx` — the rect-fallback paths of `bbox`/`inBox`
	// these calls exercise read no `ctx` field (paper space isn't a real model view; none of `ViewCtx`'s
	// fields apply to it). `frameEnt` builds a bare rect `Ent` on the fly so `marqueeSelect` (which wants
	// `Ent[]`) can be reused without storing frames that way — storage stays `SheetFrame[]` (Dave's call).
	const PAPER_CTX: ViewCtx = { dir: 'plan', isPlan: false, isElev: false, isIso: false, elevDir: 'front', cx: 0, cy: 0, ground: 0, mdl: undefined, yaw: 0, pitch: 0, paperMm: 1 }
	// Frame geometry (f.x/y/w/h, like pw/ph) is in PAPER PX, not real paper mm — BAND_PX is that same
	// unit, matching the old CSS `border: 11px solid transparent` exactly (not a paper-mm quantity,
	// fixed from an earlier draft of this comment; see GRID_STEP_PX below for where a real-mm constant
	// from snap.ts DOES need converting before touching frame geometry).
	const BAND_PX = 11
	const frameEnt = (f: SheetFrame): Ent => ({ id: f.id, type: 'rect', a: [f.x, f.y], b: [f.x + f.w, f.y + f.h] })
	/** Topmost (last-drawn) INACTIVE frame whose border band contains p, or null. An active frame renders
	 *  its own Viewport, not a hit-testable band/interior overlay (template `{#if !fa}`), so it's excluded —
	 *  same exclusion the old `.vp-band`/`.vp-interior`-per-inactive-frame DOM achieved implicitly.
	 *  `inBox(p, x0, y0, x1, y1, thr, false)` tests a band of ±thr AROUND the given rect (outer = rect
	 *  grown by thr, inner = rect shrunk by thr) — passing the frame's own bounds straight through would
	 *  pick up to BAND_PX OUTSIDE the frame too, not just the BAND_PX INSIDE it the old `.vp-band` CSS
	 *  used (`inset:0; border:11px; box-sizing:border-box` — band is inside only). Insetting the tested
	 *  rect by BAND_PX/2 (and halving thr to match) shifts inBox's outer edge back to the frame's own
	 *  bounds, so the resulting band sits entirely inside — eos-07 caught this in review (2026-09-23). */
	function frameBorderHit(p: { x: number; y: number }): SheetFrame | null {
		const h = BAND_PX / 2
		for (let i = frames.length - 1; i >= 0; i--) {
			const f = frames[i]
			if (isFrameActive(f.id)) continue
			if (inBox([p.x, p.y], f.x + h, f.y + h, f.x + f.w - h, f.y + f.h - h, h, false)) return f
		}
		return null
	}
	/** Topmost INACTIVE frame whose outer rect (band OR interior) contains p — used for double-click
	 *  activation, which fires anywhere in the frame, not just the border. */
	function frameHit(p: { x: number; y: number }): SheetFrame | null {
		for (let i = frames.length - 1; i >= 0; i--) {
			const f = frames[i]
			if (isFrameActive(f.id)) continue
			if (p.x >= f.x && p.x <= f.x + f.w && p.y >= f.y && p.y <= f.y + f.h) return f
		}
		return null
	}

	// Selection marquee (paper space): drag a box across empty paper; if it touches the
	// frame, the frame is selected. This is the touch-friendly alternative to a border click.
	let marquee = $state<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
	let placingFrame = $state(false)   // dragging out a NEW viewport frame (the Viewport tool)
	function onSheetDown(e: PointerEvent) {
		// A pointerdown INSIDE an active viewport is that viewport's (drawing/editing) — the sheet must not
		// also start a paper-space marquee/frame-placement (that hijacked drawing after the primary was
		// removed). Only handle presses on the bare paper. The Viewport tool disables frame bands, so its
		// press lands here regardless of position (border test is skipped below).
		if (e.button !== 0 || (tool !== 'Viewport' && (e.target as Element).closest?.('.vp.active'))) return
		e.preventDefault()   // stop a native text/element drag starting after a double-click (shows a not-allowed cursor + leaves the marquee stuck)
		try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch { /* synthetic */ }
		const p = toSheet(e.clientX, e.clientY)
		if (tool !== 'Viewport') {
			const border = frameBorderHit(p)
			// XP22: a LOCKED frame selects but never drags
			if (border) { selectFrame(border.id); if (!border.locked) startDrag(e, 'move', -1, border, (g) => onframegeom?.(border.id, g), true); return }
			clearFrameSel()   // clicking empty paper (or a frame's interior) deselects any frame
			if (frameHit(p)) return   // interior of an inactive frame: deselect only, no marquee (matches the old .vp-interior stopPropagation)
		}
		placingFrame = tool === 'Viewport'
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
		// marqueeSelect (window vs crossing by drag direction — a BEHAVIOUR CHANGE from the old
		// always-crossing `touches()`, flagged in R8-lite — matches every other
		// marquee in the app now, including the entity marquee); take the LAST match = topmost frame,
		// since `frames` and the built `Ent[]` share index order and 'frame' selection is single-select.
		const ids = marqueeSelect(PAPER_CTX, frames.map(frameEnt), [m.x0, m.y0], [m.x1, m.y1], () => true)
		if (ids.length) selectFrame(ids[ids.length - 1])
	}
	// Double-click activates the topmost INACTIVE frame under the pointer (band or interior); outside any
	// frame it exits the active viewport + deselects. A dblclick inside the ACTIVE viewport's own content
	// (`.vp.active`) is that viewport's own business (e.g. text-edit) — handled there, not here.
	function onWrapDblclick(e: MouseEvent) {
		if ((e.target as Element).closest?.('.vp.active')) return
		const p = toSheet(e.clientX, e.clientY)
		const hit = frameHit(p)
		if (hit) { makeFrameOn(hit).activate?.(); return }
		clearFrameSel(); ondeactivate?.()
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
					<Viewport kind={frameKind(f.proj)} label={f.label} scale={f.scale} active={fa} {focused} {tool} env={frameEnv} on={fon} editor={feditor} border={f.border} frameId={f.id} frozen={f.frozen} modelId={f.modelId ?? tabModelId}
						entities={entsForModel ? entsForModel(f.modelId ?? tabModelId) : entities} view={frameView(f.id, f.proj)} clip={f.clip} yaw={frameOrbit(f.id, f.proj).yaw} pitch={frameOrbit(f.id, f.proj).pitch}
						boxW={f.w} boxH={f.h} />
					{#if !fa}
						<!-- Purely visual now (R8-lite): cursor/outline only, no handlers of their own — picking
						     (border band vs interior vs corner grip) is centralized in onSheetDown/onWrapDblclick
						     above via hit.ts's inBox, so a press/dblclick anywhere on these just bubbles there. -->
						<div class="vp-band" style:pointer-events={tool === 'Viewport' ? 'none' : undefined}>
							<div class="vp-interior"></div>
						</div>
						{#if selFrame === f.id && !f.locked}
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
			{#if marginMm > 0}
				<!-- XP7: the paper margin — a screen-only guide (printing.ts hides it); frames snap to it -->
				{@const m = marginMm * PAPER_PX_PER_MM}
				<div class="margin-guide" style="left:{m}px; top:{m}px; width:{pw - 2 * m}px; height:{ph - 2 * m}px"></div>
			{/if}
			{#if mq}
				<div class="vp-marquee" style="left:{mq.x}px; top:{mq.y}px; width:{mq.w}px; height:{mq.h}px"></div>
			{/if}
		</div>
		<!-- titleblock (right vertical strip, like EOS) -->
		<!-- the project's template (titleBlock.ts): full-width rows at the top, half-width cells in the grid below -->
		<div class="tb">
			{#if tbShown.logo}<div class="tb-logo">{tbShown.logo}</div>{/if}
			{#each tbShown.cells.filter((c) => c.wide) as c, i (i)}
				<div class="tb-cell"><span>{c.label.toUpperCase()}</span><b>{c.value}</b></div>
			{/each}
			<div class="tb-grid">
				{#each tbShown.cells.filter((c) => !c.wide) as c, i (i)}
					<div class="tb-cell"><span>{c.label.toUpperCase()}</span>{c.value}</div>
				{/each}
			</div>
		</div>
	</div>
</div>

<style>
	/* XP7: paper margin guide — dashed, under the frames, never interactive, hidden in print */
	.margin-guide { position:absolute; border:1px dashed #94a3b866; pointer-events:none; z-index:0; }
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
