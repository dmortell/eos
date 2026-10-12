<!-- SEVERAL DRAWN SHAPES at once (backlog "Edit several at once"; not runs — RunsMultiProps): their layer, color, line
     type, fill, text size (texts), rotation (rectangles, ellipses), Z (shapes and blocks on a level's plan), whether
     blocks show in elevations, height and doors (boxes), block attributes. A field shows the value they share, or
     "mixed"; an edit sets it on every shape it applies to, as one undo step. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import { withFill, type Shape } from '../domain/shapes'
	import ColorPick from './ColorPick.svelte'
	import LineStyle from './LineStyle.svelte'
	import RackDoors from './RackDoors.svelte'
	import PropGroup from './PropGroup.svelte'
	import LayerPick from './LayerPick.svelte'
	import InsertAttrs from './InsertAttrs.svelte'
	import { shared as sharedOf, MIXED } from './propsKit'

	let { project, shapes }: { project: CadProject; shapes: Shape[] } = $props()

	const REGION = new Set(['rect', 'circle', 'ellipse', 'polygon'])
	/** What they share, or null when they differ. */
	const shared = <T,>(list: Shape[], f: (s: Shape) => T): T | null => { const r = sharedOf(list, f); return r.mixed ? null : (r.value as T) }
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
	const inserts = $derived(shapes.filter((s) => s.geom.kind === 'insert'))
	/** Blocks placed on a level's plan: they can show in elevations too. */
	const placed = $derived(inserts.filter((s) => s.levelId))
	/** Rectangles (boxes) and ellipses: they turn about their centre. */
	const turnable = $derived(shapes.filter((s) => s.geom.kind === 'rect' || s.geom.kind === 'ellipse'))
	function clearColour(s: Shape): Shape {
		const { stroke: _s, ...st } = s.style ?? {}
		return { ...s, style: Object.keys(st).length ? st : undefined }
	}
</script>

<!-- the same groups as one shape's: General · Style · Position · Box · Attributes (blocks) -->
<PropGroup kind="shapes" title="General">
	<LayerPick {project} ids={shapes.map((s) => s.id)} />
</PropGroup>
<PropGroup kind="shapes" title="Style">
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
			<input class="inp" type="number" min="1" step="0.5" value={size ?? ''} placeholder={size === null ? MIXED : ''} onchange={(e) => { const v = Number(e.currentTarget.value); if (v >= 1) each(texts, 'Text size', (s) => ({ ...s, geom: { ...s.geom, sizeMm: v } as Shape['geom'] })) }} /></label>
	{/if}
</PropGroup>
{#if onPlan.length || turnable.length || placed.length}
	<PropGroup kind="shapes" title="Position">
		{#if turnable.length}
			{@const rot = shared(turnable, (s) => (s.geom.kind === 'rect' || s.geom.kind === 'ellipse' ? (s.geom.rot ?? 0) : 0))}
			<label class="row" title="The {turnable.length} rectangle{turnable.length === 1 ? '' : 's'} / ellipse{turnable.length === 1 ? '' : 's'} turned about {turnable.length === 1 ? 'its' : 'each one’s'} centre, clockwise">Rotation (°)
				<input class="inp" type="number" step="15" value={rot ?? ''} placeholder={rot === null ? MIXED : ''} onchange={(e) => { const v = Number(e.currentTarget.value); if (e.currentTarget.value.trim() !== '' && Number.isFinite(v)) each(turnable, 'Rotate', (s) => ({ ...s, geom: { ...s.geom, rot: ((v % 360) + 360) % 360 || undefined } as Shape['geom'] })) }} /></label>
		{/if}
		{#if onPlan.length}
			{@const z = shared(onPlan, zOf)}
			<label class="row" title="Height above the floor of the {onPlan.length} on the plan (a box's base, a block's height in elevations)">Z (mm)
				<input class="inp" type="number" step="10" value={z ?? ''} placeholder={z === null ? MIXED : ''} onchange={(e) => { const v = e.currentTarget.value; if (v.trim() !== '') each(onPlan, 'Z', (s) => withZ(s, Number(v))) }} /></label>
		{/if}
		{#if placed.length}
			{@const on = (s: Shape) => s.geom.kind === 'insert' && !!s.geom.inElevations}
			<label class="row" title="Show these blocks in elevations and sections too (wall faceplates); otherwise only on the plan">Elevations
				<span><input type="checkbox" checked={placed.every(on)} indeterminate={placed.some(on) && !placed.every(on)}
					onchange={(e) => { const v = e.currentTarget.checked || undefined; each(placed, v ? 'Show in elevations' : 'Plan only', (s) => ({ ...s, geom: { ...s.geom, inElevations: v } } as Shape)) }} /> show in elevations</span></label>
		{/if}
	</PropGroup>
{/if}
{#if regions.length}
	<PropGroup kind="shapes" title="Box">
		{#if regions.length}
			{@const h = shared(regions, (s) => s.extent ?? 0)}
			<label class="row" title="How tall the {regions.length} box{regions.length === 1 ? '' : 'es'} are (0 = flat)">Height (mm)
				<input class="inp" type="number" min="0" step="10" value={h ?? ''} placeholder={h === null ? MIXED : ''} onchange={(e) => { const v = Math.max(0, Number(e.currentTarget.value)); each(regions, 'Height', (s) => ({ ...s, extent: v || undefined })) }} /></label>
		{/if}
		{#if regions.some((s) => s.geom.kind === 'rect')}<RackDoors {project} boxes={regions} />{/if}
	</PropGroup>
{/if}
{#if inserts.length}<InsertAttrs {project} {inserts} />{/if}
