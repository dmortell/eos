<script lang="ts">
	// A CAD viewport (modelled on KestrelCad2): a fixed-scale window into a model — plan, one of the four
	// elevations, or iso — with Kestrel/AutoCAD-style drafting, grips, object snap and in-place editing. Used
	// as a frame on a sheet's paper (PaperPage) and as a standalone model-space pane (Pane, `modelSpace`). The
	// parent owns the document (entities, selection via `editor`) and the camera (`view`, `yaw`/`pitch`).
	//
	// R1 (review.md §R1): this component is the SHELL — props, the DOM event wiring and the
	// SVG skeleton. The view model (mapping, pan/zoom, ctx, layers, picking, grips) is ./vpView.svelte.ts; the
	// pointer/key state machine is ./vpInteraction.svelte.ts; the overlays are render/VpMarks (under the
	// entities), render/VpOverlays (above) and render/VpWidgets (HTML). Pure logic stays in hit/grips/snap/
	// place/mapper/gestures.ts.
	import { untrack } from 'svelte'
	import { Icon } from '$lib'
	import { panzoom } from './panzoom'
	import EntRender from './render/EntRender.svelte'
	import VpMarks from './render/VpMarks.svelte'
	import VpOverlays from './render/VpOverlays.svelte'
	import VpWidgets from './render/VpWidgets.svelte'
	import Model3d from '../3dview/Model3d.svelte'
	import { GROUND, MMPU } from './geometry'
	import { HANDLE_PX, stepScale, effScale } from '../constants'
	import { onDark } from './modelSpace'
	import { imgEdit } from '../imageEdit.svelte'
	import { VpView } from './vpView.svelte'
	import { VpInteraction } from './vpInteraction.svelte'
	import type { VpProps } from './vpTypes'
	import { cmdBus } from './cmdBus.svelte'
	import { DIR_LABEL } from '../3dview/types'

	const props: VpProps = $props()
	// the props PROXY itself is handed over (never destructured), so VpView's getters read every prop live
	// svelte-ignore state_referenced_locally
	const v = new VpView(props)
	const x = new VpInteraction(v)
	const tagIcon: Record<string, string> = { plan: 'mapPin', iso: 'box', front: 'server', rear: 'server', left: 'server', right: 'server' }
	/** The view's DIRECTION as the ViewCube names it (Plan / Front … / 3D, and the 3D popout's ISO / WIRE), shown with
	 *  the scale — a sheet viewport's direction is otherwise only visible on the cube, for the TARGET viewport. */
	const modeLabel = $derived(v.kind === 'iso' ? (props.wire ? 'WIRE' : props.persp ? '3D' : 'ISO') : DIR_LABEL[v.kind]?.toUpperCase() ?? '')
	const CX = v.cx, CY = v.cy
	// the command line drives the focused pane's ACTIVE viewport (ui/cmdBus)
	$effect(() => {
		if (!v.active || !v.focused) return
		cmdBus.target = x.cmdTarget
		return () => { if (cmdBus.target === x.cmdTarget) cmdBus.target = null }
	})
	// A standalone (model-space) viewport's viewBox is centred on the pane, so a pane that narrows / widens (the split
	// bar, a split, the side panels) would slide the drawing. Shift the view so the content stays put ON SCREEN (Dave:
	// "the content shouldn't move when the split bar is moved"): screen x = left + (vbx − minX)·u, and minX moves by
	// −Δw / 2u, so vbx moves by −Δw / 2u − Δleft / u (the right split pane's left edge moves with the bar). Sheet
	// frames (boxW) keep their own rule.
	let lastBox: { w: number; h: number; l: number; t: number } | null = null
	$effect(() => {
		const w = v.vpW, h = v.vpH, framed = !!props.boxW
		untrack(() => {
			const r = v.svg?.getBoundingClientRect()
			const p = lastBox; lastBox = framed || !w || !h || !r ? null : { w, h, l: r.left, t: r.top }
			if (!p || !lastBox || (p.w === w && p.h === h && p.l === lastBox.l && p.t === lastBox.t)) return
			const u = v.pxPerUnit, cur = v.view
			v.on.view?.({ zoom: cur.zoom, x: cur.x - (w - p.w) / u / 2 - (lastBox.l - p.l) / u, y: cur.y - (h - p.h) / u / 2 - (lastBox.t - p.t) / u })
		})
	})
</script>

<svelte:window onkeydown={x.onKey} onkeyup={x.onKeyUp} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="vp print:!border-transparent" class:active={v.active} class:model-space={v.modelSpace} bind:clientWidth={v.vpW} bind:clientHeight={v.vpH} role="button" tabindex="0" style:cursor={x.cursorStyle}
	style:border-style={v.active ? 'solid' : v.border === 'none' ? 'dotted' : v.border}
	style:border-color={v.border === 'none' && !v.active ? '#94a3b866' : undefined}
	use:panzoom={{ enabled: () => v.active && (v.navContent || v.modelSpace), wheelZoom: () => v.acad, leftPans: () => v.navMode === 'pan', onpan: v.onPan, onzoom: v.onZoom,
		altWheel: v.modelSpace ? undefined : (d: 1 | -1) => v.on.scale?.(stepScale(v.scale, d)), altDrag: () => !v.modelSpace && !v.active }}
	onpointerdowncapture={x.noteRightDown} onwheelcapture={x.noteWheel}
	ondragover={x.onDragOver} ondrop={x.onDrop}
	onclick={x.onClick} ondblclick={x.onDblclick} oncontextmenu={x.onContext} onpointerdown={x.onDown} onpointermove={x.onMove} onpointerleave={x.onLeave}
	onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); v.on.activate?.() } }}>

	<svg bind:this={v.svg} class="vp-svg {v.kind === 'iso' || v.isElev ? 'model' : ''}" viewBox="{v.minX} {v.minY} {v.vbW} {v.vbH}" preserveAspectRatio="xMidYMid meet">
		<g transform="translate({v.view.x} {v.view.y}) scale({v.view.zoom}) translate({CX} {CY}) scale({v.dscale}) translate({-CX} {-CY})">
			{#if v.isElev}
				<!-- flat elevation backdrop: the ground line at GROUND (mm) + the direction label -->
				<!-- the ground line spans the section cut / the model (v.groundSpan), the label is 2.5 paper mm (annotative) -->
				<line x1={v.groundSpan[0]} y1={GROUND} x2={v.groundSpan[1]} y2={GROUND} stroke="#94a3b8" stroke-width="1.2" vector-effect="non-scaling-stroke" />
				<text x={v.groundSpan[0]} y={GROUND + 4 * v.paperMm} font-size={2.5 * v.paperMm} fill="#64748b" font-weight="600">{v.elevLabel}</text>
			{/if}
			<!-- Background-layer shapes (a floor's calibrated floorplan PDF image) under the 3D model -->
			{#each v.backEnts as e (e.id)}{#if !(e.id === x.editText?.id && x.editText.field === 'text') && !v.isLayerHidden(e.layer) && v.inThisView(e)}<EntRender {e} ctx={v.ctx} selected={v.selSet.has(e.id)} style={v.entStyle} isoGround={v.isoGround} imgCrop={imgEdit.mode === 'crop' ? imgEdit.id : null} clipNs={v.clipNs} />{/if}{/each}
			<!-- GRID (status bar GRID, ui/grid.ts): minor + major lines ABOVE the background layers (a floorplan PDF) and
			     under the model + shapes; screen only (`.vp-screen` — not in SVGOUT / PNGOUT, hidden in print) -->
			{#if v.grid}
				<g class="vp-screen vp-grid" class:dark={v.modelSpace} pointer-events="none" stroke-width={1 / (v.canvasZoom || 1)}>
					{#if v.grid.minor}<path class="minor" d={v.grid.minor} style:--a={v.grid.minorAlpha} />{/if}
					{#if v.grid.major}<path class="major" d={v.grid.major} />{/if}
				</g>
			{/if}
			{#if v.mdl}<Model3d model={v.mdl} frozen={v.frozen} adapt={v.modelSpace ? onDark : undefined} dir={v.kind} cx={CX} cy={CY} ground={GROUND} selIds={v.modelSel} canvasZoom={v.canvasZoom} clip={v.clip} frame={v.obFrame} oclip={v.oclip} yaw={v.yaw} pitch={v.pitch} persp={v.persp} wire={!!v.p.wire} showStoreys={v.p.storeys} hideHidden={v.p.hideHidden} mono={v.p.mono} zBand={v.p.zBand} paperMm={v.paperMm} pxMm={v.modelSpace ? v.gripSize / HANDLE_PX : 0} lwt={v.lwt} lwPxPerMm={v.lwPxPerMm} />{/if}
			<VpMarks {v} {x} />
			<!-- drawn entities (hidden layers skipped; the text being edited in place is hidden too) -->
			{#each v.frontEnts as e (e.id)}{#if !(e.id === x.editText?.id && x.editText.field === 'text') && !v.isLayerHidden(e.layer) && v.inThisView(e)}<EntRender {e} ctx={v.ctx} selected={v.selSet.has(e.id)} style={v.entStyle} isoGround={v.isoGround} imgCrop={imgEdit.mode === 'crop' ? imgEdit.id : null} clipNs={v.clipNs} />{/if}{/each}
			<!-- screen-only tool UI (SVGOUT / PNGOUT strip `.vp-screen`): a running command's live preview (MOVE / COPY /
			     ROTATE … follow the cursor), grips, crosshair, snap marker, the origin cross -->
			<g class="vp-screen">
				{#each x.ghosts as e, i (i)}<g opacity="0.45" style="pointer-events:none"><EntRender {e} ctx={v.ctx} selected={false} style={v.entStyle} isoGround={v.isoGround} imgCrop={null} clipNs={v.clipNs + 'g'} /></g>{/each}
				<VpOverlays {v} {x} />
			</g>
		</g>
	</svg>

	{#if !v.modelSpace}
		<!-- the viewport's number / name (top-left) and its EFFECTIVE scale (top-right: the frame's 1:N ÷ its content zoom,
		     so it's right after zooming inside the viewport); plain text on paper when printed (B31: model space names itself
		     in the pane's bar) -->
		<div class="vp-tag"><Icon name={tagIcon[v.kind]} size={10} /> <span class="vp-num">{v.label}</span></div>
		{#if v.scale || modeLabel}<div class="vp-scale-tag">{#if modeLabel}<span class="vp-mode">{modeLabel}</span>{/if}{#if v.scale && modeLabel}{' · '}{/if}{#if v.scale}{effScale(v.scale, v.view.zoom)}{/if}</div>{/if}
	{/if}
	<VpWidgets {v} {x} />
	{#if v.missing}
		<div class="vp-missing">{#if v.missing.unmapped}<b>Not mapped yet</b><span>Imported from Sheets: {v.missing.unmapped} — no Pages model for it yet.</span>{:else}<b>Missing model</b>{#if v.missing.name}<span>“{v.missing.name}” is archived — unarchive it to show it here.</span>{:else}<span>The model this view points at doesn't exist.</span>{/if}{/if}</div>
	{/if}
</div>

<style>
	.vp { position:relative; width:100%; height:100%; border:1.5px dashed #94a3b8; background:#fff; cursor:pointer; overflow:hidden; touch-action:none;
		user-select:none; -webkit-user-select:none; }
	.vp:hover { border-color:#5ac6d2; }
	.vp.active { border:1.5px solid #157a8b; box-shadow:0 0 0 2px #5ac6d233; cursor:default; }
	.vp-svg { display:block; width:100%; height:100%; }
	.vp-svg.model { background:#fff; }   /* elevations / 3D on paper: white like the plan (Dave 2026-09-26) */
	/* B31: model space — AutoCAD-style dark background, edge to edge, no frame border/glow. `--vp-paper` is the
	   colour an opening's hole / an iso face is filled with to mask what's behind (Model3d). */
	.vp.model-space { --vp-paper:#212830; background:var(--vp-paper); border-width:0; box-shadow:none; }
	.vp.model-space .vp-svg.model { background:transparent; }
	/* Lineweights stay constant as the viewport zooms (like real CAD): the view <g> scales the geometry,
	   non-scaling-stroke keeps strokes fixed on screen. Only the elevation ground line is drawn here — the child
	   components carry their own copy of this rule (EntRender sets it inline). */
	.vp-svg line { vector-effect: non-scaling-stroke; }
	.vp-svg text { font-family:'Inter','Segoe UI',system-ui,sans-serif; }
	/* GRID: thin screen-constant lines, subtle on white paper and on dark model space; minors fade in with zoom (--a) */
	.vp-grid path { fill:none; vector-effect:non-scaling-stroke; shape-rendering:crispEdges; stroke:#64748b; }
	.vp-grid .minor { stroke-opacity:calc(0.16 * var(--a, 1)); }
	.vp-grid .major { stroke-opacity:0.3; }
	.vp-grid.dark path { stroke:#a9b4c2; }
	.vp-grid.dark .minor { stroke-opacity:calc(0.12 * var(--a, 1)); }
	.vp-grid.dark .major { stroke-opacity:0.24; }
	@media print { .vp-grid { display:none; } }
	.vp-tag {
		position:absolute; top:6px; left:6px; display:flex; align-items:center; gap:5px;
		font-size:9px; color:#475569; background:#ffffffcc; border:1px solid #e2e8f0; border-radius:3px; padding:2px 6px;
	}
	.vp-tag :global(svg) { color:#94a3b8; }
	.vp-scale-tag { position:absolute; top:6px; right:6px; font-size:9px; color:#475569; background:#ffffffcc; border:1px solid #e2e8f0; border-radius:3px; padding:2px 6px; font-family:Consolas,monospace; }
	.vp-mode { font-weight:700; color:#0e7490; letter-spacing:0.04em; }
	.vp-num { font-weight:600; }
	/* print: the number and scale as plain drawing text (no chips / icon), black, a touch larger */
	@media print {
		.vp-tag { background:none; border:none; color:#000; font-size:10px; padding:0; }
		.vp-scale-tag { display:none; }   /* the scale is a screen aid (the title block carries the sheet's scale) */
		.vp-tag :global(svg) { display:none; }
		.vp-num { font-weight:700; }
	}
	.vp-missing { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px;
		font-size:12px; color:#94a3b8; pointer-events:none; text-align:center; padding:12px; }
	.vp-missing b { color:#f59e0b; font-size:13px; }
</style>
