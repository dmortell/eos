<svelte:options namespace="svg" />

<script lang="ts">
	// The Viewport's model-space MARKS drawn UNDER the entities: alignment guides (+ the Guide tool's hover
	// preview) and plan section markers (cut box, sight arrows, label, corner grips of the selected one; a section line;
	// an elevation marker's callout — ElevMarkerGlyph — with its region + turn / width / depth grips when selected).
	// Clicking a marker border selects it; when selected, all 4 arrows show and each one DROPS that direction's
	// elevation as a viewport frame on the current sheet.
	import Handle from '../../parts/Handle.svelte'
	import { sectionArrowFor } from '../annotations'
	import { sectionCorners } from '../hit'
	import { lineSectionMarks } from '../sectionLine'
	import { elevMarkerMarks, elevMarkerRef } from '../elevMarker'
	import ElevMarkerGlyph from './ElevMarkerGlyph.svelte'
	import type { ElevDir } from '../geometry'
	import type { VpView } from '../vpView.svelte'
	import type { VpInteraction } from '../vpInteraction.svelte'

	let { v, x }: { v: VpView; x: VpInteraction } = $props()
	const SECTION_DIRS: ElevDir[] = ['front', 'rear', 'left', 'right']   // the 4 cut directions a section box can spawn
	const SPAN = 1e7   // guides render as full-view lines (spanning far past the viewport)
	const sw = $derived(1 / (v.canvasZoom || 1))
	// a section line's marks (arrows / labels) and an elevation marker's callout are ANNOTATIVE — paper mm, so they print
	// at one size — but never smaller on screen than a clickable ~4 px unit (the arrows flip it); hit-tests use the same
	const markU = $derived(v.markU)
</script>

<!-- the building STRUCTURE in an elevation (layers A-FLOR / A-CLNG): slabs, raised floors, ceilings -->
{#if v.structure}
	{@const s = v.structure}
	<g pointer-events="none">
		{#each s.slabs as b, i (i)}<rect x={s.x0} y={b.y0} width={s.x1 - s.x0} height={b.y1 - b.y0} fill={s.floorColor} fill-opacity="0.35" stroke={s.floorColor} stroke-width="1" vector-effect="non-scaling-stroke" />{/each}
		<!-- raised floor + ceiling: 1 px, darker tones (Dave: were too faint) -->
		{#each s.floors as y, i (i)}<line x1={s.x0} y1={y} x2={s.x1} y2={y} stroke="#6b6152" stroke-width="1" vector-effect="non-scaling-stroke" />{/each}
		{#each s.ceilings as y, i (i)}<line x1={s.x0} y1={y} x2={s.x1} y2={y} stroke="#7d5f74" stroke-width="1" stroke-dasharray="6 3" vector-effect="non-scaling-stroke" />{/each}
		<!-- the ceiling SLAB's underside (the plenum between it and the ceiling): thin dash-dot -->
		{#each s.soffits as y, i (i)}<line x1={s.x0} y1={y} x2={s.x1} y2={y} stroke="#6b6152" stroke-width="1" stroke-dasharray="10 3 2 3" vector-effect="non-scaling-stroke" />{/each}
	</g>
{/if}
{#if v.viewSpace}
	{#each v.viewGuides as gd (gd.id)}
		{@render guide(gd.orient, gd.pos, v.modelSel.includes(gd.id) ? 'sel' : '')}
	{/each}
	{#if v.active && v.tool === 'Guide' && x.guideCur}{@render guide(x.guideCur.orient, x.guideCur.pos, 'preview')}{/if}
{/if}
{#if v.isElev && v.elevBands.length}
	<!-- SECTIONS SEEN FROM THE SIDE (ui/sectionElev.ts): each other section's band — its width along this view × its Z↓..Z↑
	     (every height = the model's); click its outline to select, then drag its top / bottom handle for Z↑ / Z↓ -->
	{#each v.elevBands as b (b.id)}
		{@const sel = b.id === v.selSection}
		<rect class="section-band" class:sel class:all={b.all} x={b.u0} y={b.top} width={Math.max(0, b.u1 - b.u0)} height={Math.max(0, b.bot - b.top)} />
		<text class="section-label" x={b.u0 + 1.5 * v.paperMm} y={b.top - 1.5 * v.paperMm} font-size={2.5 * v.paperMm}>{b.label}{b.all ? '' : ` · Z ${Math.round(b.z0)}–${Math.round(b.z1)}`}</text>
		{#if sel && v.active}
			<!-- Z↑ (top) / Z↓ (bottom) of the band it sees -->
			<Handle cx={(b.u0 + b.u1) / 2} cy={b.top} size={v.gripSize} cursor="ns-resize" strokeWidth={1.2 * sw} />
			<Handle cx={(b.u0 + b.u1) / 2} cy={b.bot} size={v.gripSize} cursor="ns-resize" strokeWidth={1.2 * sw} />
		{/if}
	{/each}
{/if}
{#if v.isPlan}
	{#each v.sections as s (s.id)}
		{#if s.kind === 'line'}
			{@const sel = s.id === v.selSection}
			{@const pick = sel && v.tool === 'Select'}
			{@const mk = lineSectionMarks(s, markU)}
			<!-- a section LINE (phase 3, OpenCad's look): dashed cut line, an arrow at each end pointing where it looks, A / A′.
			     Selected + Select tool: the arrows are clickable — a CLICK flips it (on click, not press: the arrow jumps to the
			     other side, and a release off it would click the canvas and drop the selection). Handlers sit on the hit
			     elements themselves; the Viewport's own press / click bail on `.section-arrow.pick`. -->
			<line class="section-line" class:sel x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke-width={(sel ? 2 : 1.5) * sw} />
			{#each mk.arrows as ar, i (i)}
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<line class="section-arrow" class:pick x1={ar.end[0]} y1={ar.end[1]} x2={ar.tip[0]} y2={ar.tip[1]} stroke-width={1.6 * sw}
					onpointerdown={(e) => { if (pick) e.stopPropagation() }} onclick={(e) => { if (!pick) return; e.stopPropagation(); v.flipSection(s.id) }}>{#if pick}<title>Flip — look the other way</title>{/if}</line>
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<polygon class="section-arrow" class:pick points={ar.head.map((q) => q.join(',')).join(' ')} stroke-width={1.2 * sw}
					onpointerdown={(e) => { if (pick) e.stopPropagation() }} onclick={(e) => { if (!pick) return; e.stopPropagation(); v.flipSection(s.id) }}>{#if pick}<title>Flip — look the other way</title>{/if}</polygon>
			{/each}
			{#each mk.labels as lb, i (i)}
				<text class="section-label" x={lb.p[0]} y={lb.p[1]} font-size={3.5 * v.paperMm} text-anchor="middle" dominant-baseline="central">{lb.text}</text>
			{/each}
		{:else if s.kind === 'elev'}
			<!-- an ELEVATION MARKER (phase 4): its callout (ui/elevMarker.ts elevMarkerMarks — the eltag look), numbered PER SHEET:
			     its first linked viewport's number / sheet, else its own number. Picked / moved via hitSection (circle + arrow). -->
			<ElevMarkerGlyph marks={elevMarkerMarks(s, markU, elevMarkerRef(s, v.editor.sections.links(s.id)))} sel={s.id === v.selSection} {sw} />
		{:else}
		{@const bx = Math.min(s.clip.x0, s.clip.x1)}
		{@const by = Math.min(s.clip.y0, s.clip.y1)}
		<rect class="section-mark" class:sel={s.id === v.selSection} x={bx} y={by} width={Math.abs(s.clip.x1 - s.clip.x0)} height={Math.abs(s.clip.y1 - s.clip.y0)} stroke-width={(s.id === v.selSection ? 2 : 1.4) * sw} />
		<!-- the primary sight arrow always; all 4 (clickable) when selected -->
		{#each SECTION_DIRS as d (d)}
			{#if d === s.dir || s.id === v.selSection}
				{@const pick = v.tool === 'Select' && s.id === v.selSection}
				<polygon class="section-arrow" class:inactive={d !== s.dir} class:pick points={sectionArrowFor(s.clip, d, v.tolMm(11))} stroke-width={1.4 * sw}
					onpointerdown={(e) => { if (!pick) return; e.stopPropagation(); v.editor.sections.dropDir(s.id, d) }} />
			{/if}
		{/each}
		{@const pad = 1.5 * v.paperMm}
		<text class="section-label" x={bx + pad} y={by - pad} font-size={3 * v.paperMm}>{s.name ?? 'Section'}</text>
		{/if}
	{/each}
	{#if v.active && v.lineSecSel}
		<!-- the selected line section: the region it sees (to its depth), its end grips and the depth handle (a diamond) -->
		<polygon class="section-region" points={v.lineSecSel.region.map((q) => q.join(',')).join(' ')} />
		{#each v.lineSecSel.grips as g (g.key)}
			{#if g.key === 'depth'}
				{@const r = v.gripSize * 0.75}
				<polygon class="section-depth" points="{g.p[0]},{g.p[1] - r} {g.p[0] + r},{g.p[1]} {g.p[0]},{g.p[1] + r} {g.p[0] - r},{g.p[1]}" stroke-width={1.2 * sw}><title>Depth — drag along the look</title></polygon>
			{:else}
				<Handle cx={g.p[0]} cy={g.p[1]} size={v.gripSize} cursor="crosshair" strokeWidth={1.2 * sw} />
			{/if}
		{/each}
	{:else if v.active && v.elevSecSel}
		<!-- the selected elevation marker: the region it sees (faint), its cut line, the band-end grips (width), the depth
		     diamond and the TURN handle on the arrow tip (a ring) -->
		{@const es = v.elevSecSel}
		<polygon class="section-region" points={es.region.map((q) => q.join(',')).join(' ')} />
		<line class="section-line sel" x1={es.cut[0][0]} y1={es.cut[0][1]} x2={es.cut[1][0]} y2={es.cut[1][1]} stroke-width={sw} />
		{#each es.grips as g (g.key)}
			{#if g.key === 'depth'}
				{@const r = v.gripSize * 0.75}
				<polygon class="section-depth" points="{g.p[0]},{g.p[1] - r} {g.p[0] + r},{g.p[1]} {g.p[0]},{g.p[1] + r} {g.p[0] - r},{g.p[1]}" stroke-width={1.2 * sw}><title>Depth — drag along the look</title></polygon>
			{:else if g.key === 'rot'}
				<circle class="section-depth" cx={g.p[0]} cy={g.p[1]} r={v.gripSize * 0.6} stroke-width={1.2 * sw}><title>Turn — drag round (Shift = 15°)</title></circle>
			{:else}
				<Handle cx={g.p[0]} cy={g.p[1]} size={v.gripSize} cursor="crosshair" strokeWidth={1.2 * sw} />
			{/if}
		{/each}
	{:else if v.active && v.selSectionObj && v.selSectionObj.kind !== 'line' && v.selSectionObj.kind !== 'elev'}
		{#each sectionCorners(v.selSectionObj.clip) as c (c.join(','))}
			<Handle cx={c[0]} cy={c[1]} size={v.gripSize} cursor="crosshair" strokeWidth={1.2 * sw} />
		{/each}
	{/if}
{/if}

{#snippet guide(orient: 'h' | 'v', pos: number, cls: string)}
	{#if orient === 'h'}<line class="guide {cls}" x1={-SPAN} y1={pos} x2={SPAN} y2={pos} stroke-width={sw} />
	{:else}<line class="guide {cls}" x1={pos} y1={-SPAN} x2={pos} y2={SPAN} stroke-width={sw} />{/if}
{/snippet}

<style>
	/* Alignment guide lines (Visio-style): thin magenta dashed, brighter when selected; preview dimmer. */
	.guide { stroke:#c026d3; stroke-width:1; stroke-dasharray:10 6; vector-effect:non-scaling-stroke; pointer-events:none; opacity:0.7; }
	.guide.sel { stroke:#e879f9; opacity:1; stroke-dasharray:none; }
	.guide.preview { opacity:0.4; }
	/* Section marker on the plan: a teal cut box + a direction arrow + the elevation's label. */
	.section-mark { fill:#0e749010; stroke:#0e7490; stroke-dasharray:7 4; vector-effect:non-scaling-stroke; pointer-events:none; }
	.section-mark.sel { fill:#0e749022; stroke-dasharray:none; }
	.section-arrow { fill:#0e7490; stroke:#0e7490; vector-effect:non-scaling-stroke; pointer-events:none; }
	.section-arrow.inactive { fill:#0e749033; stroke:#0e749077; }   /* a direction with no elevation yet — click to add */
	.section-arrow.pick { pointer-events:auto; cursor:pointer; }
	.section-arrow.pick:hover { fill:#e0a020; stroke:#e0a020; }
	.section-label { fill:#0e7490; font-weight:700; font-family:Consolas,monospace; pointer-events:none; }
	/* A section LINE: the dashed cut (solid when selected), the region it sees (selected only), its depth handle. */
	.section-line { stroke:#0e7490; stroke-dasharray:12 4 2 4; vector-effect:non-scaling-stroke; pointer-events:none; }
	.section-line.sel { stroke-dasharray:none; }
	.section-region { fill:#0e749012; stroke:#0e749066; stroke-width:1; stroke-dasharray:4 3; vector-effect:non-scaling-stroke; pointer-events:none; }
	.section-depth { fill:#fff; stroke:#0e7490; vector-effect:non-scaling-stroke; pointer-events:none; }
	/* A section seen in an elevation: its band (dashed; faint when it sees every height), solid when selected. */
	.section-band { fill:#0e749008; stroke:#0e7490; stroke-width:1; stroke-dasharray:8 4; vector-effect:non-scaling-stroke; pointer-events:none; }
	.section-band.all { stroke-opacity:0.5; }
	.section-band.sel { fill:#0e749018; stroke-dasharray:none; stroke-opacity:1; }
</style>
