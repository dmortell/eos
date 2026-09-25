<svelte:options namespace="svg" />

<script lang="ts">
	// The Viewport's editing OVERLAYS drawn ABOVE the entities, all screen-constant (sized by `gripSize`,
	// strokes ÷ canvasZoom): the elevation depth-snap highlight, the draft rubber band / shape preview, the
	// draw crosshair, the image-calibration marks, entity + model grips, the object-snap marker and the
	// selection marquee. Tool UI only — no document content.
	import Handle from '../../parts/Handle.svelte'
	import { rotCenter, rotatePt, groundInIso } from '../hit'
	import type { Pt } from '../geometry'
	import { SEL, type VpView } from '../vpView.svelte'
	import { DRAW, POLY, type VpInteraction } from '../vpInteraction.svelte'
	import { imgEdit } from '../../imageEdit.svelte'

	let { v, x }: { v: VpView; x: VpInteraction } = $props()
	const sw = $derived(1 / (v.canvasZoom || 1))   // ~1 px on screen at ANY canvas zoom (non-scaling-stroke can't see the CSS zoom)
	const gs = $derived(v.gripSize)
</script>

<!-- depth-snap: the wall/conduit whose depth the next elevation point will snap onto (amber) -->
{#if x.depthSnapMark}
	{@const m = x.depthSnapMark}
	<line x1={m.a[0]} y1={m.a[1]} x2={m.b[0]} y2={m.b[1]} stroke="#e0a020" stroke-width={2.5 * sw} stroke-dasharray="{6 * sw} {3 * sw}" />
{/if}
{#if v.active && POLY.has(v.tool) && x.draft.length}
	<!-- polyline / wall / trunk / pipe: committed segments + the rubber band to the cursor -->
	<polyline points={x.draft.map((p) => p.join(',')).join(' ')} fill="none" stroke={SEL} stroke-width={sw} />
	{#if x.cur}<line x1={x.draft.at(-1)![0]} y1={x.draft.at(-1)![1]} x2={x.cur[0]} y2={x.cur[1]} stroke={SEL} stroke-width={sw} />{/if}
{:else if v.active && x.draft.length && x.cur}
	{@render preview(x.draft[0], x.cur)}
{/if}
<!-- a running command's pick: the rubber band from its base point + the crosshair -->
{#if x.pickCur}
	{#if x.pickBase && x.pickBox}
		{@const [bx, by] = x.pickBase}
		{@const [cx, cy] = x.pickCur}
		<rect x={Math.min(bx, cx)} y={Math.min(by, cy)} width={Math.abs(cx - bx)} height={Math.abs(cy - by)} fill="none" stroke={SEL} stroke-width={sw} stroke-dasharray="{5 * sw} {3 * sw}" />
	{:else if x.pickBase}<line x1={x.pickBase[0]} y1={x.pickBase[1]} x2={x.pickCur[0]} y2={x.pickCur[1]} stroke={SEL} stroke-width={sw} stroke-dasharray="{5 * sw} {3 * sw}" />{/if}
	{@render crosshair(x.pickCur)}
{/if}
<!-- cursor crosshair: precise endpoint placement for any draw tool, before + during a draft -->
{#if v.active && DRAW.has(v.tool) && v.tool !== 'Guide'}
	{@const cp = x.cur ?? x.hoverPt}
	{#if cp}{@render crosshair(cp)}{/if}
{/if}
<!-- image SCALE calibration: the 2-point measure line -->
{#if x.scalePts.length && v.editImgVisible}
	<polyline points={x.scalePts.map((p) => p.join(',')).join(' ')} fill="none" stroke={SEL} stroke-width={1.5 * sw} />
	{#each x.scalePts as sp (sp.join(','))}<circle cx={sp[0]} cy={sp[1]} r={gs} fill={SEL} />{/each}
{/if}
<!-- image ORIGIN anchor marker (selected image / while editing) -->
{#if v.active && v.originMark}
	{@const [ox, oy] = v.originMark}
	<circle cx={ox} cy={oy} r={gs * 1.3} fill="none" stroke={SEL} stroke-width={1.4 * sw} />
	<line x1={ox - gs * 2} y1={oy} x2={ox + gs * 2} y2={oy} stroke={SEL} stroke-width={sw} />
	<line x1={ox} y1={oy - gs * 2} x2={ox} y2={oy + gs * 2} stroke={SEL} stroke-width={sw} />
{/if}
{#if v.active && v.tool === 'Select'}
	<!-- entity grips: squares at each selected entity's defining points (+ a rotate handle) -->
	{#each v.entities as e (e.id)}
		{#if v.selSet.has(e.id) && v.inThisView(e) && !v.isLayerHidden(e.layer) && !v.isLayerLocked(e.layer) && !groundInIso(v.ctx, e)}
			{#each v.selGrips.get(e.id) ?? [] as g}
				{#if g.rotate}
					{@const bc = rotCenter(v.ctx, e)}
					{@const tc = rotatePt([bc[0], v.bbox(e)[1]], bc, e.rot ?? 0)}
					<line x1={tc[0]} y1={tc[1]} x2={g.x} y2={g.y} stroke={SEL} stroke-width={sw} opacity="0.6" />
					<circle cx={g.x} cy={g.y} r={gs * 0.85} fill="white" stroke={SEL} stroke-width={1.2 * sw} style="cursor:grab" />
				{:else}
					<Handle cx={g.x} cy={g.y} size={gs} cursor="crosshair" strokeWidth={1.2 * sw} />
				{/if}
			{/each}
		{/if}
	{/each}
	<!-- D13: the multi-selection's transform box — corners scale (about the opposite corner), the top handle
	     rotates about the barycentre (the small cross) -->
	{#if v.groupXf}
		{@const g = v.groupXf}
		{@const [x0, y0, x1, y1] = g.box}
		<rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="none" stroke={SEL} stroke-width={sw} stroke-dasharray="{4 * sw} {3 * sw}" opacity="0.8" />
		<line x1={(x0 + x1) / 2} y1={y0} x2={g.rot[0]} y2={g.rot[1]} stroke={SEL} stroke-width={sw} opacity="0.6" />
		<circle cx={g.rot[0]} cy={g.rot[1]} r={gs * 0.85} fill="white" stroke={SEL} stroke-width={1.2 * sw} style="cursor:grab" />
		<line x1={g.pivot[0] - gs} y1={g.pivot[1]} x2={g.pivot[0] + gs} y2={g.pivot[1]} stroke={SEL} stroke-width={sw} />
		<line x1={g.pivot[0]} y1={g.pivot[1] - gs} x2={g.pivot[0]} y2={g.pivot[1] + gs} stroke={SEL} stroke-width={sw} />
		{#each g.corners as c, i (i)}<Handle cx={c.c[0]} cy={c.c[1]} size={gs} cursor={i % 2 ? 'nesw-resize' : 'nwse-resize'} strokeWidth={1.2 * sw} />{/each}
	{/if}
	<!-- the selected SEGMENT of a run (a second click on the selected run) -->
	{#if v.segSel}
		{@const s = v.segSel}
		<line x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={SEL} stroke-width={5 * sw} stroke-linecap="round" opacity="0.55" />
	{/if}
	<!-- model grips: prism resize corners, or wall/conduit node handles (of the selected object) -->
	{#if v.mSelObj}
		{#each v.mGrips as g, i (g.node?.id ?? i)}
			{#if g.node && v.nodeSelValid && g.node.id === v.nodeSelValid.node}<circle cx={g.x} cy={g.y} r={gs * 0.95} fill={SEL} opacity="0.85" />{/if}
			{#if g.node?.conn}<circle cx={g.x} cy={g.y} r={gs * 1.5} fill="none" stroke="#22c55e" stroke-width={2 * sw}><title>Connected — follows its box / outlet</title></circle>{/if}
			{#if g.bend}
				<!-- F9: a corner's bend handle (drag along the bisector = its radius) -->
				<polygon points="{g.x},{g.y - gs * 0.8} {g.x + gs * 0.8},{g.y} {g.x},{g.y + gs * 0.8} {g.x - gs * 0.8},{g.y}" fill="white" stroke={SEL} stroke-width={1.2 * sw} style="cursor:move"><title>Bend radius — drag</title></polygon>
			{:else}
				<Handle cx={g.x} cy={g.y} size={gs} cursor="crosshair" strokeWidth={1.2 * sw} />
			{/if}
		{/each}
	{/if}
{/if}
<!-- I6: the model ORIGIN (0,0) — where a floorplan's Uploads calibration origin lands — a red cross on every
     plan view (model tabs and sheet viewports); screen only, never printed -->
{#if v.isPlan}
	<g class="origin-mark print:hidden" stroke="#ef4444" stroke-width={1.6 * sw} fill="none" pointer-events="none">
		<line x1={-gs * 2.5} y1="0" x2={gs * 2.5} y2="0" /><line x1="0" y1={-gs * 2.5} x2="0" y2={gs * 2.5} />
		<title>Model origin (0, 0) — the floorplan's calibration origin</title>
	</g>
{/if}
<!-- F6: connection points (Visio-style ×) — where a trunk / pipe end attaches -->
{#each v.connMarks as c, i (i)}
	<g stroke="#22c55e" stroke-width={1.4 * sw} opacity="0.9"><line x1={c.x - gs * 0.7} y1={c.y - gs * 0.7} x2={c.x + gs * 0.7} y2={c.y + gs * 0.7} /><line x1={c.x - gs * 0.7} y1={c.y + gs * 0.7} x2={c.x + gs * 0.7} y2={c.y - gs * 0.7} /></g>
{/each}
<!-- object-snap marker (constant screen size): □ endpoint · △ midpoint · ○ centre · ◇ quadrant -->
{#if v.active && v.snapMark}
	{@const s = gs * 1.5}
	{@const [mx, my] = v.snapMark.p}
	{#if v.snapMark.type === 'end'}<rect class="snap" x={mx - s / 2} y={my - s / 2} width={s} height={s} />
	{:else if v.snapMark.type === 'mid'}<polygon class="snap" points="{mx},{my - s / 2} {mx + s / 2},{my + s / 2} {mx - s / 2},{my + s / 2}" />
	{:else if v.snapMark.type === 'center'}<circle class="snap" cx={mx} cy={my} r={s / 2} />
	{:else}<polygon class="snap" points="{mx},{my - s / 2} {mx + s / 2},{my} {mx},{my + s / 2} {mx - s / 2},{my}" />{/if}
{/if}
<!-- Kestrel selection box: solid blue = window (enclose), dashed green = crossing -->
{#if v.active && x.marquee}
	{@const m = x.marquee}
	<rect class="marquee {m.b[0] < m.a[0] ? 'crossing' : 'window'}" x={Math.min(m.a[0], m.b[0])} y={Math.min(m.a[1], m.b[1])} width={Math.abs(m.b[0] - m.a[0])} height={Math.abs(m.b[1] - m.a[1])} />
{/if}

{#snippet preview(a: Pt, p: Pt)}
	{@const tool = v.tool}
	{@const qa = v.centerDraw && (tool === 'Rectangle' || tool === 'Ellipse') ? ([2 * a[0] - p[0], 2 * a[1] - p[1]] as Pt) : a}
	{#if tool === 'Line' || tool === 'Dimension'}
		<line x1={a[0]} y1={a[1]} x2={p[0]} y2={p[1]} stroke={SEL} stroke-width={sw} />
	{:else if tool === 'Rectangle'}
		<rect x={Math.min(qa[0], p[0])} y={Math.min(qa[1], p[1])} width={Math.abs(p[0] - qa[0])} height={Math.abs(p[1] - qa[1])} fill="none" stroke={SEL} stroke-width={sw} />
	{:else if tool === 'Ellipse'}
		<ellipse cx={(qa[0] + p[0]) / 2} cy={(qa[1] + p[1]) / 2} rx={Math.abs(p[0] - qa[0]) / 2} ry={Math.abs(p[1] - qa[1]) / 2} fill="none" stroke={SEL} stroke-width={sw} />
	{:else if tool === 'Furniture' || tool === 'Opening'}
		<rect x={Math.min(a[0], p[0])} y={Math.min(a[1], p[1])} width={Math.abs(p[0] - a[0])} height={Math.abs(p[1] - a[1])} fill="none" stroke={SEL} stroke-width={sw} />
	{:else if tool === 'Section'}
		<rect x={Math.min(a[0], p[0])} y={Math.min(a[1], p[1])} width={Math.abs(p[0] - a[0])} height={Math.abs(p[1] - a[1])} fill="#0e749011" stroke="#0e7490" stroke-width={1.2 * sw} />
	{/if}
	<!-- the fixed anchor point (first click / centre) as a small hollow square -->
	{@const ds = gs * 1.2}
	<rect x={qa[0] - ds / 2} y={qa[1] - ds / 2} width={ds} height={ds} fill="white" stroke={SEL} stroke-width={sw} />
{/snippet}
{#snippet crosshair(pt: Pt)}
	{@const s = gs * 2.4}
	<line x1={pt[0] - s} y1={pt[1]} x2={pt[0] + s} y2={pt[1]} stroke={SEL} stroke-width={sw} opacity="0.85" />
	<line x1={pt[0]} y1={pt[1] - s} x2={pt[0]} y2={pt[1] + s} stroke={SEL} stroke-width={sw} opacity="0.85" />
	<rect x={pt[0] - s * 0.28} y={pt[1] - s * 0.28} width={s * 0.56} height={s * 0.56} fill="none" stroke={SEL} stroke-width={sw} />
{/snippet}

<style>
	/* Lineweights stay constant as the view zooms (like the Viewport's own rule, which can't reach a child). */
	:where(line, rect, circle, ellipse, polyline, polygon) { vector-effect: non-scaling-stroke; }
	/* Object-snap marker — amber, constant border, never intercepts pointer events. */
	.snap { fill:none; stroke:#f59e0b; stroke-width:1.4; vector-effect:non-scaling-stroke; pointer-events:none; }
	/* Kestrel/AutoCAD selection box: window (L→R) solid blue, crossing (R→L) dashed green. */
	.marquee { pointer-events:none; }
	.marquee.window { fill:#3b82f61f; stroke:#3b82f6; stroke-width:1; }
	.marquee.crossing { fill:#10b9811f; stroke:#10b981; stroke-width:1; stroke-dasharray:5 3; }
</style>
