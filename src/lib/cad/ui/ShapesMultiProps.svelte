<!-- SEVERAL DRAWN SHAPES at once (backlog "Edit several at once"): their colour, text size (texts), Z (shapes and
     inserts on a level's plan) and height (boxes). A field shows the value they share, or "mixed"; an edit sets it on
     every shape it applies to, as one undo step. Layer is the Layer row below (LayerPick); several runs have their own
     fields too (RunsMultiProps). -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import { withFill, type Shape } from '../domain/shapes'
	import ColorPick from './ColorPick.svelte'
	import LineStyle from './LineStyle.svelte'
	import RackDoors from './RackDoors.svelte'

	let { project, shapes }: { project: CadProject; shapes: Shape[] } = $props()

	const REGION = new Set(['rect', 'circle', 'ellipse', 'polygon'])
	const shared = <T,>(list: Shape[], f: (s: Shape) => T): T | null => { const vs = new Set(list.map(f)); return vs.size === 1 ? [...vs][0] : null }
	const texts = $derived(shapes.filter((s) => s.geom.kind === 'text'))
	/** On a level's plan (not drawn on an elevation's plane, not a run): they have a Z. */
	const onPlan = $derived(shapes.filter((s) => s.levelId && s.plane?.kind !== 'vertical' && s.geom.kind !== 'path'))
	const regions = $derived(onPlan.filter((s) => REGION.has(s.geom.kind)))
	const zOf = (s: Shape) => (s.geom.kind === 'insert' ? (s.geom.z ?? 0) : s.plane?.kind === 'plan' ? s.plane.z : 0)
	const colour = $derived(shared(shapes, (s) => s.style?.stroke))

	function each(list: Shape[], label: string, f: (s: Shape) => Shape) {
		project.store.transact(`${label} (${list.length} shapes)`, (tx) => { for (const s of list) tx.put(f(s)) })
	}
	const withZ = (s: Shape, z: number): Shape => (s.geom.kind === 'insert' ? { ...s, geom: { ...s.geom, z } } : { ...s, plane: { kind: 'plan', z } })
	/** Rectangles, circles, ellipses and polygons anywhere (plan, elevation, sheet): they can be filled. */
	const fillable = $derived(shapes.filter((s) => REGION.has(s.geom.kind)))
	function clearColour(s: Shape): Shape {
		const { stroke: _s, ...st } = s.style ?? {}
		return { ...s, style: Object.keys(st).length ? st : undefined }
	}
</script>

<p class="pt-1 font-semibold">{shapes.length} shapes</p>
<div class="row" title="Their own color (By layer = their layer's)">Color
	<ColorPick value={colour ?? undefined} mixed={colour === null} allowByLayer onchange={(v) => (v ? each(shapes, 'Color', (s) => ({ ...s, style: { ...s.style, stroke: v } })) : each(shapes.filter((s) => s.style?.stroke), 'No own color', clearColour))} /></div>
<LineStyle {project} {shapes} />
{#if fillable.length}
	{@const fill = shared(fillable, (s) => s.style?.fill ?? 'none')}
	<div class="row" title="The {fillable.length} region{fillable.length === 1 ? '' : 's'} filled with a color, or None">Fill
		<ColorPick value={fill ?? undefined} mixed={fill === null} allowNone onchange={(v) => each(fillable, v && v !== 'none' ? 'Fill' : 'No fill', (s) => withFill(s, v))} /></div>
{/if}
{#if texts.length}
	{@const size = shared(texts, (s) => (s.geom.kind === 'text' ? s.geom.sizeMm : 0))}
	<label class="row" title="The {texts.length} text{texts.length === 1 ? '' : 's'} among them">Text size (mm)
		<input class="inp" type="number" min="1" step="0.5" value={size ?? ''} placeholder="mixed" onchange={(e) => { const v = Number(e.currentTarget.value); if (v >= 1) each(texts, 'Text size', (s) => ({ ...s, geom: { ...s.geom, sizeMm: v } as Shape['geom'] })) }} /></label>
{/if}
{#if onPlan.length}
	{@const z = shared(onPlan, zOf)}
	<label class="row" title="Height above the floor (mm) of the {onPlan.length} on the plan">Z (mm)
		<input class="inp" type="number" step="10" value={z ?? ''} placeholder="mixed" onchange={(e) => { const v = e.currentTarget.value; if (v.trim() !== '') each(onPlan, 'Z', (s) => withZ(s, Number(v))) }} /></label>
{/if}
{#if regions.some((s) => s.geom.kind === 'rect')}<RackDoors {project} boxes={regions} />{/if}
{#if regions.length}
	{@const h = shared(regions, (s) => s.extent ?? 0)}
	<label class="row" title="How tall the {regions.length} box{regions.length === 1 ? '' : 'es'} are (0 = flat)">Height (mm)
		<input class="inp" type="number" min="0" step="10" value={h ?? ''} placeholder="mixed" onchange={(e) => { const v = Math.max(0, Number(e.currentTarget.value)); each(regions, 'Height', (s) => ({ ...s, extent: v || undefined })) }} /></label>
{/if}

<style>
	.row { display: grid; grid-template-columns: 6.5rem 1fr; align-items: center; gap: 0.25rem; }
	.inp { width: 100%; border: 1px solid var(--cad-line); border-radius: 4px; padding: 1px 4px; background: var(--cad-input); color: var(--cad-text); }
</style>
