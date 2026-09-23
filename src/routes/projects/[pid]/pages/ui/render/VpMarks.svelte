<svelte:options namespace="svg" />

<script lang="ts">
	// The Viewport's model-space MARKS drawn UNDER the entities: alignment guides (+ the Guide tool's hover
	// preview) and plan section markers (cut box, sight arrows, label, corner grips of the selected one).
	// Clicking a marker border selects it; when selected, all 4 arrows show and each one DROPS that direction's
	// elevation as a viewport frame on the current sheet.
	import Handle from '../../parts/Handle.svelte'
	import { sectionArrowFor } from '../annotations'
	import { sectionCorners } from '../hit'
	import type { ElevDir } from '../geometry'
	import type { VpView } from '../vpView.svelte'
	import type { VpInteraction } from '../vpInteraction.svelte'

	let { v, x }: { v: VpView; x: VpInteraction } = $props()
	const SECTION_DIRS: ElevDir[] = ['front', 'rear', 'left', 'right']   // the 4 cut directions a section box can spawn
	const SPAN = 1e7   // guides render as full-view lines (spanning far past the viewport)
	const sw = $derived(1 / (v.canvasZoom || 1))
</script>

{#if v.viewSpace}
	{#each v.viewGuides as gd (gd.id)}
		{@render guide(gd.orient, gd.pos, v.modelSel.includes(gd.id) ? 'sel' : '')}
	{/each}
	{#if v.active && v.tool === 'Guide' && x.guideCur}{@render guide(x.guideCur.orient, x.guideCur.pos, 'preview')}{/if}
{/if}
{#if v.isPlan}
	{#each v.sections as s (s.id)}
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
	{/each}
	{#if v.active && v.selSectionObj}
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
</style>
