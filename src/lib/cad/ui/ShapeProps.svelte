<!-- A drawn SHAPE that isn't a run, a note, a legend or a block (a rectangle, circle, ellipse, polygon, arc, image):
     General (label, layer, Make block) · Image (its file) or Style (color, line type, lineweight, fill) · Position
     (a rectangle's or ellipse's rotation; a box's Z, its base above the floor) · Box (a region on a level's plan: its
     height — 0 = flat; a rectangle's back line and doors). -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import { withStyle, type Shape } from '../domain/shapes'
	import { put } from './propsKit'
	import PropGroup from './PropGroup.svelte'
	import LayerPick from './LayerPick.svelte'
	import LineStyle from './LineStyle.svelte'
	import RackDoors from './RackDoors.svelte'
	import MakeBlock from './MakeBlock.svelte'
	import TextField from './fields/TextField.svelte'
	import NumberField from './fields/NumberField.svelte'
	import CheckField from './fields/CheckField.svelte'
	import ColorField from './fields/ColorField.svelte'

	let { project, ws, s }: { project: CadProject; ws: Workspace; s: Shape } = $props()

	const REGION = ['rect', 'circle', 'ellipse', 'polygon']
	const region = $derived(REGION.includes(s.geom.kind))
	/** A region on a level's plan: it has a height (a box / desk — backlog "Box / desk tool") and a base Z. */
	const box = $derived(region && !!s.levelId && s.plane?.kind !== 'vertical')
	const set = (label: string, patch: Partial<Shape>) => put(project.store, s, label, patch)
	const style = (label: string, next: Shape) => project.store.transact(label, (tx) => tx.put(next))
	/** Turned about its centre (degrees, clockwise on screen): rectangles (boxes) and ellipses. */
	const rot = $derived(s.geom.kind === 'rect' || s.geom.kind === 'ellipse' ? (s.geom.rot ?? 0) : null)
	const setRot = (v: number) => set('Rotate', { geom: { ...s.geom, rot: ((v % 360) + 360) % 360 || undefined } as Shape['geom'] })
</script>

<PropGroup kind="shape" title="General">
	<TextField label="Label" value={s.label} onchange={(v) => set('Label', { label: v || undefined })} />
	<LayerPick {project} ids={[s.id]} />
	{#if s.levelId}<MakeBlock {project} {ws} shapes={[s]} />{/if}
</PropGroup>
{#if s.geom.kind === 'image'}
	<!-- a picture (Insert › Image…): which file; its box is resized by its grips -->
	{@const g = s.geom}
	<PropGroup kind="shape" title="Image">
		<p class="muted" title="The file in Uploads">{g.fileId}{g.page && g.page > 1 ? ` · page ${g.page}` : ''} · {Math.round(g.size.x)} × {Math.round(g.size.y)}{s.sheetId ? ' mm on paper' : ' mm'}</p>
	</PropGroup>
{:else}
	<PropGroup kind="shape" title="Style">
		<ColorField title="Its own line color (By layer = its layer's)" value={s.style?.stroke} allowByLayer onchange={(v) => style(v ? 'Color' : 'Color by layer', withStyle(s, { stroke: v }))} />
		<LineStyle {project} shapes={[s]} />
		{#if region}
			<ColorField label="Fill" title="Fill it with a color, or None" value={s.style?.fill ?? 'none'} allowNone onchange={(v) => style(v && v !== 'none' ? 'Fill' : 'No fill', withStyle(s, { fill: v }))} />
		{/if}
	</PropGroup>
{/if}
{#if rot !== null || box}
	<PropGroup kind="shape" title="Position">
		{#if rot !== null}<NumberField label="Rotation" unit="°" step={15} title="Turned about its centre, clockwise" value={rot} onchange={(v) => v != null && setRot(v)} />{/if}
		{#if box}
			<NumberField label="Z" unit="mm" step={10} title="Its base: height above the floor" value={s.plane?.kind === 'plan' ? s.plane.z : 0}
				onchange={(v) => { const z = v ?? 0; set('Box Z', { plane: z ? { kind: 'plan', z } : undefined }) }} />
		{/if}
	</PropGroup>
{/if}
{#if box || s.geom.kind === 'rect'}
	<PropGroup kind="shape" title="Box">
		{#if box}
			<NumberField label="Height" unit="mm" min={0} step={10} title="How tall it stands; 0 = flat — a box shows in elevations and sections" value={s.extent ?? 0}
				onchange={(v) => { const h = Math.max(0, v ?? 0); set(h ? 'Box height' : 'Flat', { extent: h || undefined }) }} />
		{/if}
		{#if s.geom.kind === 'rect'}
			<CheckField label="Back line" text="on the back edge" title="A thick line on the box's back edge (its local −y side), like racks — which way a desk or cabinet faces" checked={!!s.backLine}
				onchange={(on) => set(on ? 'Back line' : 'No back line', { backLine: on || undefined })} />
			<RackDoors {project} boxes={[s]} />
		{/if}
	</PropGroup>
{/if}
