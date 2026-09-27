<script lang="ts">
	// A sheet tab's paper page: an A3 sheet (fixed size) holding one Viewport + a
	// titleblock, like the Sheets tool / AutoCAD paper space. Two modes, AutoCAD-style:
	//  · Paper space (deactivated): the viewport is a floating FRAME. Select it by its
	//    BORDER (click the edge band) or by dragging a selection box across it — NOT by
	//    clicking the interior. Once selected, drag the border to move or a corner grip to
	//    resize (opposite corner fixed, like the rect tool). Double-click enters it.
	//  · Model space (activated): interact with the drawing inside; double-click on the
	//    paper outside the frame (or Esc / Exit) returns to paper space.
	import { untrack } from 'svelte'
	import Viewport from '../ui/Viewport.svelte'
	import type { Env, VpOn } from '../ui/vpTypes'
	import { noopEditor, type Editor } from '../ui/editor'
	import { singleOfKind, idsOfKind } from '../ui/selection'
	import type { Ent, Pt, View } from '../ui/geometry'
	import Handle from './Handle.svelte'
	import { beginPointerDrag, DragRegistry } from '../ui/gestures'
	import { ItemEditor, type ItemSource } from '../ui/itemEdit.svelte'
	import { inBox, marqueeSelect } from '../ui/hit'
	import { gripsLocal, constrainGrip } from '../ui/grips'
	import { PAPER_SNAP_STEP, paperSnapLines, frameSnapDelta } from '../ui/snap'
	import type { ViewCtx } from '../ui/view'
	import { HANDLE_PX, PAPER_W, PAPER_H, PAPER_PX_PER_MM } from '../constants'
	import type { ElevDir } from '../ui/geometry'
	import type { SheetFrame } from '../types'
	import { fillTitleBlock, shownTitleBlock, type TbShown } from '../titleBlock'
	import FillSection from './FillSection.svelte'
	import type { Conduit } from '../3dview/types'
	import { cmdBus } from '../ui/cmdBus.svelte'
	import { paperCmdTarget } from '../ui/paperCmd'

	// Paper size in px (default A3 landscape). Driven by the status-bar paper-size / orientation.
	type VKind = 'plan' | 'iso' | ElevDir
	let { title = 'Sheet', drawingNo = '001', scale = '1:100', focused = true, tool = 'Select', env = {}, pw = PAPER_W, ph = PAPER_H, sizeLabel = 'A3', rev = '', revDate = '', marginMm = 0, tb = undefined,
		entities = [], entsForModel = undefined, tabModelId = undefined, conduitOf = () => null,
		frames = [], editor = noopEditor, frameKind = (p: string) => p as VKind, isFrameActive = () => false, frameView = () => ({ zoom: 1, x: 0, y: 0 }), frameEnv = {},
		frameOrbit = () => ({ yaw: 0, pitch: 0 }), makeFrameOn = () => ({}), makeFrameEditor = () => noopEditor, onseed, onaddframe, onframegeom, onframecommit, onframesdup, ondeactivate, frameClip = (f: SheetFrame) => f.clip, frameOClip = (f: SheetFrame) => f.oclip ?? null, frameTitle = () => undefined }:
		{ title?: string; drawingNo?: string; scale?: string; focused?: boolean; tool?: string; env?: Env; pw?: number; ph?: number; sizeLabel?: string; rev?: string; revDate?: string;
			/** The filled title block (titleBlock.ts); absent → the default template from the props above. */ tb?: TbShown;
			/** XP7: paper margin (mm) — a dashed guide (screen only) and frame snap lines. */ marginMm?: number;
			entities?: Ent[]; entsForModel?: (mid?: string) => Ent[]; tabModelId?: string;
			/** F12: a conduit (with its label) by model + id, for a fill-rate frame. */ conduitOf?: (mid: string | undefined, id: string) => (Conduit & { label?: string }) | null;
			// R3 commit 3 (review.md §R3): a NEW page-level `editor` — distinct from `makeFrameEditor` (which
			// builds one PER-FRAME editor for entity/obj/guide/section/node editing INSIDE that frame's
			// viewport). This one's `sel` holds the 'frame' kind only: which viewport FRAME is selected in
			// PAPER space (border/marquee click, grips, Properties). Both share the same per-viewport
			// selStore — the page editor is keyed by the TAB id (a slot no per-frame editor ever writes to).
			frames?: SheetFrame[]; editor?: Editor; frameKind?: (p: string) => VKind; isFrameActive?: (id: string) => boolean; frameView?: (id: string, proj: string) => View; frameEnv?: Env;
			frameOrbit?: (id: string, proj: string) => { yaw: number; pitch: number; persp?: boolean; wire?: boolean }; makeFrameOn?: (f: SheetFrame) => VpOn; makeFrameEditor?: (f: SheetFrame) => Editor; onseed?: (x: number, y: number, w: number, h: number) => void; onaddframe?: (x: number, y: number, w: number, h: number) => void;
			onframegeom?: (id: string, g: { x: number; y: number; w: number; h: number }) => void; onframecommit?: () => void; /** Ctrl-drag: copy these frames IN PLACE (views + scoped notes) and return the copies — the engine drags them */ onframesdup?: (ids: string[]) => SheetFrame[]; /** a frame's clip (a section-linked frame follows its marker) */ frameClip?: (f: SheetFrame) => import('../3dview/types').Clip | null;
			/** a frame's ORIENTED clip — a section LINE's view, live (phase 3); null = none */ frameOClip?: (f: SheetFrame) => import('../3dview/types').OClip | null;
			/** a frame's elevation title (a section line's "SECTION A–A′"); undefined = the Viewport's own */ frameTitle?: (f: SheetFrame) => string | undefined; ondeactivate?: () => void } = $props()
	const canvasZoom = $derived(env.canvasZoom ?? 1)
	const tbShown = $derived(tb === undefined ? shownTitleBlock(undefined, fillTitleBlock(undefined, { title, scale, size: sizeLabel, rev, date: revDate, number: drawingNo })) : tb)
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

	const reg = new DragRegistry()   // one registry for the paper's drags (a 2nd finger cancels)
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
	const GRID_STEP_PX = PAPER_SNAP_STEP * PAPER_PX_PER_MM
	const SNAP_TOL_PX = 6
	const snapEdge = (v: number, lines: number[], tolPaperPx: number): number => v + frameSnapDelta([v], lines, GRID_STEP_PX, tolPaperPx)
	// Frame snap lines in SHEET-AREA coords (frame geometry's frame of reference, inset PAD from the paper's
	// corner): the paper edges + margin (XP7), the drawing area's own edges and the title block's edges (A8).
	const PAD = 10   // .paper's padding (frames are placed relative to it — don't change it, or every sheet's frames move)
	/** The title block is inset by the rest of the paper MARGIN so its outer edges sit ON the (printed) margin border. */
	const tbInset = $derived(Math.max(0, marginMm * PAPER_PX_PER_MM - PAD))
	let tbEl: HTMLDivElement | undefined = $state()
	function snapLines(): { x: number[]; y: number[] } {
		const pl = paperSnapLines(pw, ph, marginMm * PAPER_PX_PER_MM), x = pl.x.map((v) => v - PAD), y = pl.y.map((v) => v - PAD)
		if (sheetEl) { x.push(0, sheetEl.offsetWidth); y.push(0, sheetEl.offsetHeight) }
		if (tbEl) { x.push(tbEl.offsetLeft - PAD, tbEl.offsetLeft - PAD + tbEl.offsetWidth); y.push(tbEl.offsetTop - PAD, tbEl.offsetTop - PAD + tbEl.offsetHeight) }
		return { x, y }
	}

	// ── FRAMES ON THE ONE EDITING ENGINE (editing-merge-plan.md phase 2) ── move / corner-resize / Ctrl-drag copy / marquee /
	// Shift-select / arrow nudge run in ItemEditor, like shapes; this source says how a FRAME moves, resizes (opposite corner
	// fixed, MIN size, Shift square, paper snap lines — Alt off), copies (with its view, via the parent) and records (the
	// page history). Viewports move freely on an infinite canvas — no position clamp.
	const snapTol = () => SNAP_TOL_PX / scaleOf()
	const baseEntOf = (b: Frame): Ent => ({ id: 'frame', type: 'rect', a: [b.x, b.y], b: [b.x + b.w, b.y + b.h] })
	const gripOpts = (shift = false) => ({ gripMm: 0, shift: () => shift, imgCropId: null })
	let dragStart: Map<string, { f: SheetFrame; v0: View }> = new Map()   // the frames as they were at the press (resize keeps content still)
	let dragChanged = false
	const frameSource: ItemSource<SheetFrame> = {
		kind: 'frame',
		get: (id) => frames.find((f) => f.id === id),
		id: (f) => f.id,
		translate: (f, dx, dy) => ({ ...f, x: f.x + dx, y: f.y + dy }),
		// the four corners — PaperPage's gi order (TL, TR, BR, BL); the opposite corner stays, MIN size kept
		grips: (f) => CORNERS.map(([cx, cy], gi) => ({ x: f.x + cx * f.w, y: f.y + cy * f.h, apply: (p: Pt) => {
			const grip = gripsLocal(PAPER_CTX, baseEntOf(f), gripOpts())[GRIP_IDX[gi]], anchor = grip.anchor!
			const px = LEFT_GI.has(gi) ? Math.min(p[0], anchor[0] - MIN) : Math.max(p[0], anchor[0] + MIN)
			const py = TOP_GI.has(gi) ? Math.min(p[1], anchor[1] - MIN) : Math.max(p[1], anchor[1] + MIN)
			const ed = grip.apply([px, py]), [ex0, ey0] = ed.a!, [ex1, ey1] = ed.b!
			return { ...f, x: Math.min(ex0, ex1), y: Math.min(ey0, ey1), w: Math.abs(ex1 - ex0), h: Math.abs(ey1 - ey0) }
		} })),
		gripPoint: (f, gi, p, shift, free) => {   // Shift square (the rect grip's rule); the dragged edge(s) snap unless Alt
			const q = constrainGrip(PAPER_CTX, baseEntOf(f), GRIP_IDX[gi], p, shift, gripOpts(shift))
			if (free) return q
			const lines = snapLines(), tol = snapTol()
			return [snapEdge(q[0], lines.x, tol), snapEdge(q[1], lines.y, tol)]
		},
		snapDelta: (dx, dy, b, free) => {   // move: both edges of an axis snap together (the whole frame shifts)
			if (free) return [dx, dy]
			const lines = snapLines(), tol = snapTol(), x = b.x + dx, y = b.y + dy
			return [dx + frameSnapDelta([x, x + b.w], lines.x, GRID_STEP_PX, tol), dy + frameSnapDelta([y, y + b.h], lines.y, GRID_STEP_PX, tol)]
		},
		duplicate: (fs) => onframesdup?.(fs.map((f) => f.id)) ?? [],   // the parent copies them IN PLACE (views, scoped notes) and returns them
		canMove: (f) => !f.locked,
		marquee: (a, b) => marqueeSelect(PAPER_CTX, frames.filter((f) => !isFrameActive(f.id)).map(frameEnt), a, b, () => true),
		sel: { ids: () => idsOfKind(editor.sel.get(), 'frame'), set: (ids) => editor.sel.only(ids.map((id) => ({ kind: 'frame' as const, id }))) },
		commit: {
			begin: () => { dragChanged = false; dragStart = new Map(frames.map((f) => [f.id, { f: { ...f }, v0: { ...frameView(f.id, f.proj) } }])) },
			update: (fs) => {
				dragChanged = true
				for (const f of fs) {
					onframegeom?.(f.id, { x: f.x, y: f.y, w: f.w, h: f.h })
					const s = dragStart.get(f.id)
					if (s && (f.w !== s.f.w || f.h !== s.f.h)) {   // a RESIZE keeps the drawing still on the paper: shift the view by −ΔL/ppu − ΔW/(2·ppu)
						const u = PAPER_PX_PER_MM, b = s.f
						makeFrameOn(f).view?.({ zoom: s.v0.zoom, x: s.v0.x - (f.x - b.x) / u - (f.w - b.w) / (2 * u), y: s.v0.y - (f.y - b.y) / u - (f.h - b.h) / (2 * u) })
					}
				}
			},
			add: () => {},   // copies are already on the page (onframesdup made them)
			end: () => { if (dragChanged) onframecommit?.(); dragChanged = false },   // one history step — none for a click
		},
	}
	const items = new ItemEditor<SheetFrame>(frameSource, { ortho: () => false })
	const toPt = (e: PointerEvent | MouseEvent): Pt => { const s = toSheet(e.clientX, e.clientY); return [s.x, s.y] }
	/** A press on a frame's border band (move) or a corner grip: the engine drags it (Ctrl = drag a copy, Alt = no snap). */
	function startFrameDrag(e: PointerEvent, id: string, kind: 'move' | 'grip', gi: number) {
		e.stopPropagation()
		const mod = e.ctrlKey || e.metaKey
		if (!items.beginMove(id, toPt(e), kind, gi, { dup: mod && kind === 'move', additive: false })) return   // a LOCKED frame: selected, no drag (XP22)
		beginPointerDrag(e, null, { onMove: (ev) => items.moveTo(toPt(ev), ev.shiftKey, undefined, ev.altKey), onUp: () => items.endMove(), onCancel: (_s, moved) => items.cancelMove(moved) }, reg, { thresholdPx: 4 })
	}
	// arrow keys nudge the selected frames (1 mm, Shift 10 mm) while no viewport is active on this focused sheet
	$effect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (!focused || !e.key.startsWith('Arrow') || frames.some((f) => isFrameActive(f.id)) || !idsOfKind(editor.sel.get(), 'frame').length) return
			const t = e.target as HTMLElement | null; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
			e.preventDefault()
			const s = (e.shiftKey ? 10 : 1) * PAPER_PX_PER_MM
			items.nudge(e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0, e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0)
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	})

	// ── the COMMAND LINE on paper (editing-merge-plan.md phase 4): with no viewport active on this focused sheet, MOVE /
	// COPY / ARRAY / ALIGN / ERASE … act on the selected frames through the same engine (ui/paperCmd.ts) ──
	let cursorPx: Pt | null = null
	const paperTarget = paperCmdTarget({
		k: PAPER_PX_PER_MM,
		height: () => sheetEl?.offsetHeight ?? 0,
		frames: () => frames,
		selected: () => idsOfKind(editor.sel.get(), 'frame'),
		select: (ids) => editor.sel.only(ids.map((id) => ({ kind: 'frame' as const, id }))),
		frameAt: (d) => (frameBorderHit({ x: d[0], y: d[1] }) ?? frameHit({ x: d[0], y: d[1] }))?.id ?? null,
		moveSel: (dx, dy) => items.moveSel(dx, dy),
		copySel: (offs) => items.copySel(offs),
		place: (fs) => { const src = frameSource.commit; src.begin(); src.update(fs.flatMap((p) => { const f = frames.find((x) => x.id === p.id); return f ? [{ ...f, x: p.x, y: p.y }] : [] })); src.end() },
		erase: () => editor.sel.delete(),
		cursor: () => cursorPx,
	})
	$effect(() => {
		if (!focused || frames.some((f) => isFrameActive(f.id))) return
		cmdBus.target = paperTarget
		return () => { if (cmdBus.target === paperTarget) cmdBus.target = null }
	})
	/** A running command's point / shape pick (cmdBus.pick) takes this click on the paper. */
	function pickOnPaper(e: PointerEvent): boolean {
		const pk = cmdBus.target === paperTarget ? cmdBus.pick : null; if (!pk) return false
		const s = toSheet(e.clientX, e.clientY), d: Pt = [s.x, s.y], u = paperTarget.toUser(d)!
		pk.resolve({ p: u, ent: pk.kind === 'ent' ? (paperTarget.entAt(u) ?? undefined) : undefined })
		return true
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

	// Paper-space press: a frame's BORDER BAND → the engine drags it (select / Shift toggles / Ctrl drags a copy); empty
	// paper → the engine's selection marquee (window / crossing, Shift / Ctrl unions); the Viewport tool → drag out a
	// new frame. A frame's interior never selects (Dave: select by the border or a marquee).
	let placing = $state<{ x0: number; y0: number; x1: number; y1: number } | null>(null)   // the Viewport tool's box
	// The Viewport tool draws its box with the RECTANGLE tool's gesture: EOS press-drag, or (ACAD on) click a corner,
	// click the opposite one; corners snap to the paper lines (Alt off), Esc / another tool cancels.
	let placeArmed = $state(false)   // ACAD: the first corner is down, the next click places
	const snapPt = (p: { x: number; y: number }, free: boolean) => { if (free) return p; const l = snapLines(), t = snapTol(); return { x: snapEdge(p.x, l.x, t), y: snapEdge(p.y, l.y, t) } }
	function finishPlacing() {
		const m = placing; placing = null; placeArmed = false; if (!m) return
		const bx0 = Math.min(m.x0, m.x1), by0 = Math.min(m.y0, m.y1), bx1 = Math.max(m.x0, m.x1), by1 = Math.max(m.y0, m.y1)
		if (bx1 - bx0 > 20 && by1 - by0 > 20) onaddframe?.(bx0, by0, bx1 - bx0, by1 - by0)
	}
	$effect(() => { if (tool !== 'Viewport') untrack(() => { placing = null; placeArmed = false }) })
	$effect(() => {
		const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && placing) { placing = null; placeArmed = false } }
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	})
	function onSheetMove(e: PointerEvent) {
		const s = toSheet(e.clientX, e.clientY); cursorPx = [s.x, s.y]
		if (placeArmed && placing) { const q = snapPt(s, e.altKey); placing = { ...placing, x1: q.x, y1: q.y } }
	}
	function onSheetDown(e: PointerEvent) {
		// A pointerdown INSIDE an active viewport is that viewport's (drawing/editing) — the sheet must not also start a
		// paper-space marquee / frame placement. Only presses on the bare paper (or an inactive frame) land here.
		if (e.button !== 0 || (tool !== 'Viewport' && (e.target as Element).closest?.('.vp.active'))) return
		e.preventDefault()   // stop a native text/element drag starting after a double-click
		if (pickOnPaper(e)) return   // a running command (MOVE / COPY …) wants this point
		try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch { /* synthetic */ }
		const p = toSheet(e.clientX, e.clientY)
		if (tool === 'Viewport') {
			const q = snapPt(p, e.altKey)
			if (placing && placeArmed) { placing = { ...placing, x1: q.x, y1: q.y }; finishPlacing(); return }   // ACAD: the second click
			placing = { x0: q.x, y0: q.y, x1: q.x, y1: q.y }
			beginPointerDrag(e, null, { onMove: (ev) => { const r = snapPt(toSheet(ev.clientX, ev.clientY), ev.altKey); if (placing) placing = { ...placing, x1: r.x, y1: r.y } },
				onUp: (_ev, _s, moved) => { if (moved) finishPlacing(); else if (env.acad) placeArmed = true; else placing = null },
				onCancel: () => { placing = null; placeArmed = false } }, reg, { thresholdPx: 4 })
			return
		}
		const border = frameBorderHit(p)
		if (border) {
			if (e.shiftKey) { e.stopPropagation(); editor.sel.toggle([{ kind: 'frame', id: border.id }]); return }   // Shift: add / remove it
			startFrameDrag(e, border.id, 'move', -1); return
		}
		const add = e.shiftKey || e.ctrlKey || e.metaKey
		if (!add) clearFrameSel()   // clicking empty paper (or a frame's interior) deselects
		if (frameHit(p)) return   // interior of an inactive frame: deselect only, no marquee
		items.beginMarquee([p.x, p.y], add)
		beginPointerDrag(e, null, { onMove: (ev) => items.marqueeTo(toPt(ev)), onUp: () => items.endMarquee(3), onCancel: () => items.cancelMarquee() }, reg)
	}
	// Double-click activates the topmost INACTIVE frame under the pointer (band or interior); outside any
	// frame it exits the active viewport + deselects. A dblclick inside the ACTIVE viewport's own content
	// (`.vp.active`) is that viewport's own business (e.g. text-edit) — handled there, not here.
	function onWrapDblclick(e: MouseEvent) {
		if (env.navMode === 'pan' || (e.target as Element).closest?.('.vp.active')) return   // latched Pan: no enter / exit
		const p = toSheet(e.clientX, e.clientY)
		const hit = frameHit(p)
		if (hit) { makeFrameOn(hit).activate?.(); return }
		clearFrameSel(); ondeactivate?.()
	}
	const CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]] as const   // TL, TR, BR, BL
	const CURSORS = ['nwse-resize', 'nesw-resize', 'nwse-resize', 'nesw-resize']
	// the box being dragged: a new frame (Viewport tool) or the engine's selection marquee
	let mq = $derived.by(() => {
		const m = placing ?? (items.marquee ? { x0: items.marquee.a[0], y0: items.marquee.a[1], x1: items.marquee.b[0], y1: items.marquee.b[1] } : null)
		return m ? { x: Math.min(m.x0, m.x1), y: Math.min(m.y0, m.y1), w: Math.abs(m.x1 - m.x0), h: Math.abs(m.y1 - m.y0) } : null
	})
</script>

<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
<div class="paper-wrap" ondblclick={onWrapDblclick}>
	<div class="paper" class:tb-h={tbShown.layout === 'horizontal' && !tbShown.hidden} class:tb-c={tbShown.layout === 'compact' && !tbShown.hidden} style:width="{pw}px" style:height="{ph}px" style:--tb-inset="{tbInset}px" style:--pad="{PAD + tbInset}px">
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="sheet-area" bind:this={sheetEl} onpointerdown={onSheetDown} onpointermove={onSheetMove}>
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
					{#if f.fillOf}
						{@const cd = conduitOf(f.modelId ?? tabModelId, f.fillOf)}
						<!-- F12: a fill-rate frame — the conduit's cross-section (picked by its border like any frame) -->
						<div class="fill-frame" style:border-style={f.border === 'none' ? 'none' : f.border}>
							{#if cd}<FillSection conduit={cd} name={cd.label} />{:else}<div class="fill-missing">Conduit not found</div>{/if}
							<div class="vp-tag">{f.label}{#if cd} · fill{/if}</div>
						</div>
					{:else}
					<Viewport kind={frameKind(f.proj)} label={f.label} scale={f.scale} active={fa} {focused} {tool} env={frameEnv} on={fon} editor={feditor} border={f.border} frameId={f.id} frozen={f.frozen} vpLocked={f.vpLocked} modelId={f.modelId ?? tabModelId} unmapped={f.source} storeys={f.storeys} hideHidden={f.hideHidden} mono={f.mono} zBand={f.zBand}
						entities={f.source ? [] : entsForModel ? entsForModel(f.modelId ?? tabModelId) : entities} view={frameView(f.id, f.proj)} clip={frameClip(f)} oclip={frameOClip(f)} viewTitle={frameTitle(f)} yaw={frameOrbit(f.id, f.proj).yaw} persp={frameOrbit(f.id, f.proj).persp} wire={frameOrbit(f.id, f.proj).wire} pitch={frameOrbit(f.id, f.proj).pitch}
						boxW={f.w} boxH={f.h} />
					{/if}
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
										onpointerdown={(e) => startFrameDrag(e, f.id, 'grip', i)} />
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
		{#if marginMm > 0}
			<!-- XP7: the paper margin, in PAPER coords — a screen-only guide (printing.ts hides it), or a printed
			     hairline border when the project's title block asks for one (A9); frames snap to it -->
			{@const m = marginMm * PAPER_PX_PER_MM}
			<div class="margin-guide" class:printed={tbShown.border} style="left:{m}px; top:{m}px; width:{pw - 2 * m}px; height:{ph - 2 * m}px"></div>
		{/if}
		<!-- titleblock (right vertical strip, like EOS) — the project's template (titleBlock.ts): logo, the
		     company block, full-width rows, then half-width cells in the grid below. A sheet can hide it. -->
		{#if !tbShown.hidden}
			<div class="tb" bind:this={tbEl}>
				{#if tbShown.logos || tbShown.logo}
					<div class="tb-logo">
						{#each tbShown.logos ?? [] as lg, i (i)}<img src={lg.src} alt="logo" style:height="{(lg.h ?? 10) * PAPER_PX_PER_MM}px" />{/each}
						{#if tbShown.logo}<span>{tbShown.logo}</span>{/if}
					</div>
				{/if}
				{#if tbShown.company}
					<div class="tb-company">{#each tbShown.company as line, i (i)}<div class:name={i === 0}>{line}</div>{/each}</div>
				{/if}
				{#each tbShown.cells.filter((c) => c.wide) as c, i (i)}
					<div class="tb-cell"><span>{c.label.toUpperCase()}</span><b>{c.value}</b></div>
				{/each}
				{#if tbShown.revisions}
					<!-- A4: the revision table (the last few, newest at the bottom) -->
					<table class="tb-revs">
						<thead><tr><th>REV</th><th>DATE</th><th>DESCRIPTION</th></tr></thead>
						<tbody>{#each tbShown.revisions as r (r.code)}<tr><td>{r.code}</td><td>{r.date}</td><td>{r.note ?? ''}</td></tr>{/each}</tbody>
					</table>
				{/if}
				<div class="tb-grid">
					{#each tbShown.cells.filter((c) => !c.wide) as c, i (i)}
						<div class="tb-cell"><span>{c.label.toUpperCase()}</span>{c.value}</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	/* XP7: paper margin guide — dashed, under the frames, never interactive, hidden in print */
	.margin-guide { position:absolute; border:1px dashed #94a3b866; pointer-events:none; z-index:0; }
	.margin-guide.printed { border:0.5px solid #334155; }   /* A9: printed hairline border (printing.ts keeps it) */
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
	/* F12: a fill-rate frame (a conduit's cross-section) */
	.fill-frame { position:absolute; inset:0; border:1.5px solid #94a3b8; background:#fff; }
	.fill-frame .vp-tag { position:absolute; top:6px; left:6px; font-size:9px; color:#475569; background:#ffffffcc; border:1px solid #e2e8f0; border-radius:3px; padding:2px 6px; }
	.fill-missing { display:grid; place-items:center; height:100%; font-size:12px; color:#f59e0b; }
	/* Paper-space selection box. */
	.vp-marquee { position:absolute; background:#3b82f61f; border:1px solid #3b82f6; pointer-events:none; }
	/* Titleblock */
	.tb { width:16%; min-width:78px; display:flex; flex-direction:column; border:1px solid #64748b; }
	.tb-logo {
		min-height:34px; padding:3px 4px; gap:6px; display:flex; align-items:center; justify-content:center;
		font-family:Georgia, serif; font-size:18px; font-weight:700; color:#1f2937; border-bottom:1px solid #94a3b8;
	}
	.tb { position:relative; z-index:3; background:#fff; margin:var(--tb-inset, 0) var(--tb-inset, 0) var(--tb-inset, 0) 0; }   /* above a frame that strays over it; inset onto the margin border */
	.tb-logo img { max-width:45%; object-fit:contain; }
	.tb-logo span { padding:0 4px; }
	/* A6: a band along the BOTTOM — the sections side by side */
	.paper.tb-h { flex-direction:column; }
	.paper.tb-h .tb { width:auto; min-width:0; flex-direction:row; align-items:stretch; min-height:58px; margin:0 var(--tb-inset, 0) var(--tb-inset, 0) var(--tb-inset, 0); }
	.paper.tb-h .tb > * { border-bottom:none; border-right:1px solid #cbd5e1; flex:1 1 0; min-width:0; }
	.paper.tb-h .tb-logo { flex:0 0 auto; height:auto; padding:0 8px; }
	.paper.tb-h .tb-grid { margin-top:0; grid-template-columns:repeat(4, 1fr); flex:2 1 0; border-right:none; }
	.paper.tb-h .tb-revs { margin-top:0; }
	/* A6: a COMPACT box in the bottom-right corner, over the drawing area */
	.paper.tb-c .tb { position:absolute; right:var(--pad, 10px); bottom:var(--pad, 10px); width:34%; background:#fff; z-index:3; }
	.tb-revs { width:100%; border-collapse:collapse; margin-top:auto; font-size:7px; color:#1f2937; table-layout:fixed; }
	.tb-revs th { font-size:6px; letter-spacing:.06em; color:#94a3b8; font-weight:500; text-align:left; padding:2px 3px; border-bottom:1px solid #cbd5e1; }
	.tb-revs th:nth-child(1) { width:20%; } .tb-revs th:nth-child(2) { width:34%; }
	.tb-revs td { padding:1px 3px; border-bottom:1px solid #e2e8f0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
	.tb-revs + .tb-grid { margin-top:0; }
	.tb-company { border-bottom:1px solid #94a3b8; padding:4px 5px; font-size:7px; line-height:1.35; color:#475569; }
	.tb-company .name { font-size:9px; font-weight:700; color:#1f2937; }
	.tb-cell { border-bottom:1px solid #cbd5e1; padding:3px 5px; font-size:9px; color:#1f2937; min-width:0; overflow:hidden; }
	.tb-cell span { display:block; font-size:6px; letter-spacing:.08em; color:#94a3b8; }
	.tb-cell b { font-weight:600; }
	.tb-grid { margin-top:auto; display:grid; grid-template-columns:1fr 1fr; }
	.tb-grid .tb-cell { border-right:1px solid #cbd5e1; }
	.tb-grid .tb-cell:nth-child(even) { border-right:none; }
</style>
