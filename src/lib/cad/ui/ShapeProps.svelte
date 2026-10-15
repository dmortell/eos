<!-- A drawn SHAPE that isn't a run, a note, a legend or a block (a rectangle, circle, ellipse, polygon, arc, image):
     General (label, layer, Make block) · Image (its file) or Style (color, line type, lineweight, fill) · Position
     (a region's middle X / Y; a rectangle's or ellipse's rotation; a box's Z, its base above the floor) · Box / Size
     (width and depth, a circle's diameter, all typed; a region on a level's plan: its height — 0 = flat; a rectangle's
     back line, doors and floor-tile grid). -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import { withStyle, moveGeometry, type Shape } from '../domain/shapes'
	import { put } from './propsKit'
	import { DEFAULT_TILES, tilesTooFine } from '../domain/tiles'
	import { gridStepOf } from '../editor/snap'
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
	/** A rectangle's floor-tile grid: size (any positive mm, as the grid step is typed) and X / Y offset. */
	const setTiles = (label: string, patch: Partial<NonNullable<Shape['tiles']>>) => set(label, { tiles: { ...(s.tiles ?? DEFAULT_TILES), ...patch } })
	const fine = $derived(s.geom.kind === 'rect' && !!s.tiles && tilesTooFine(s.geom.size, s.tiles))
	// typed size and place (User 2026-10-14: a box needed more than its height to be drawn exactly)
	/** Its middle: a rectangle / circle / ellipse's centre, a polygon's box's middle. */
	const mid = $derived.by(() => {
		const g = s.geom
		if (g.kind === 'rect' || g.kind === 'circle' || g.kind === 'ellipse') return g.centre
		if (g.kind !== 'polygon') return null
		const xs = g.pts.map((p) => p.x), ys = g.pts.map((p) => p.y)
		return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
	})
	const moveTo = (axis: 'x' | 'y', v: number) => { if (!mid) return; const d = { x: 0, y: 0, [axis]: v - mid[axis] }; set('Move', { geom: moveGeometry(s.geom, d) }) }
	/** Width / depth (a rectangle's size, an ellipse's two diameters), or a circle's diameter. */
	const resize = (what: 'x' | 'y', v: number | null | undefined) => {
		const g = s.geom
		if (v == null || v <= 0) return
		if (g.kind === 'rect') set(what === 'x' ? 'Width' : 'Depth', { geom: { ...g, size: { ...g.size, [what]: v } } })
		else if (g.kind === 'ellipse') set(what === 'x' ? 'Width' : 'Depth', { geom: what === 'x' ? { ...g, rx: v / 2 } : { ...g, ry: v / 2 } })
		else if (g.kind === 'circle') set('Diameter', { geom: { ...g, r: v / 2 } })
	}
	const round1 = (n: number) => Math.round(n * 10) / 10
</script>

<PropGroup kind="shape" title="General">
	<TextField label="Label" value={s.label} onchange={(v) => set('Label', { label: v || undefined })} />
	<LayerPick {project} ids={[s.id]} />
	{#if s.levelId}<MakeBlock {project} {ws} shapes={[s]} />{/if}
</PropGroup>
{#if s.geom.kind === 'image'}
	<!-- a picture (Draw › Image…): which file; its box is resized by its grips -->
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
{#if rot !== null || box || mid}
	<PropGroup kind="shape" title="Position">
		{#if mid}
			<NumberField label="X" unit="mm" step={10} title="Where its middle is, across" value={round1(mid.x)} onchange={(v) => v != null && moveTo('x', v)} />
			<NumberField label="Y" unit="mm" step={10} title="Where its middle is, down the plan" value={round1(mid.y)} onchange={(v) => v != null && moveTo('y', v)} />
		{/if}
		{#if rot !== null}<NumberField label="Rotation" unit="°" step={15} title="Turned about its centre, clockwise" value={rot} onchange={(v) => v != null && setRot(v)} />{/if}
		{#if box}
			<NumberField label="Z" unit="mm" step={10} title="Its base: height above the floor" value={s.plane?.kind === 'plan' ? s.plane.z : 0}
				onchange={(v) => { const z = v ?? 0; set('Box Z', { plane: z ? { kind: 'plan', z } : undefined }) }} />
		{/if}
	</PropGroup>
{/if}
{#if box || region}
	<PropGroup kind="shape" title={box ? 'Box' : 'Size'}>
		{#if s.geom.kind === 'rect' || s.geom.kind === 'ellipse'}
			{@const w = s.geom.kind === 'rect' ? s.geom.size.x : s.geom.rx * 2}
			{@const d = s.geom.kind === 'rect' ? s.geom.size.y : s.geom.ry * 2}
			<NumberField label="Width" unit="mm" min={0.1} step={10} title="Across (before it is turned), about its middle" value={round1(w)} onchange={(v) => resize('x', v)} />
			<NumberField label="Depth" unit="mm" min={0.1} step={10} title="Front to back (before it is turned), about its middle" value={round1(d)} onchange={(v) => resize('y', v)} />
		{:else if s.geom.kind === 'circle'}
			<NumberField label="Diameter" unit="mm" min={0.1} step={10} title="About its middle" value={round1(s.geom.r * 2)} onchange={(v) => resize('x', v)} />
		{/if}
		{#if box}
			<NumberField label="Height" unit="mm" min={0} step={10} title="How tall it stands; 0 = flat — a box shows in elevations and sections" value={s.extent ?? 0}
				onchange={(v) => { const h = Math.max(0, v ?? 0); set(h ? 'Box height' : 'Flat', { extent: h || undefined }) }} />
		{/if}
		{#if s.geom.kind === 'rect'}
			<CheckField label="Back line" text="on the back edge" title="A thick line on the box's back edge (its local −y side), like racks — which way a desk or cabinet faces" checked={!!s.backLine}
				onchange={(on) => set(on ? 'Back line' : 'No back line', { backLine: on || undefined })} />
			<RackDoors {project} boxes={[s]} />
			<CheckField label="Floor tiles" text="draw a tile grid" title="Lines every tile across the box, from its top-left corner (shown on screen, in PDF and in DXF)" checked={!!s.tiles}
				onchange={(on) => set(on ? 'Tile grid' : 'No tile grid', { tiles: on ? DEFAULT_TILES : undefined })} />
			{#if s.tiles}
				<NumberField label="Tile size" unit="mm" min={0.01} step={50} title="One tile’s size: lines every this far (600 is the usual floor tile)" value={s.tiles.mm}
					onchange={(v) => { const n = v == null ? null : gridStepOf(v); if (n) setTiles('Tile size', { mm: n }) }} />
				<NumberField label="Offset X" unit="mm" step={10} title="Where the first vertical line falls from the box’s left edge: slide the grid to line up with the real tiles" value={s.tiles.dx}
					onchange={(v) => v != null && setTiles('Tile offset', { dx: v })} />
				<NumberField label="Offset Y" unit="mm" step={10} title="Where the first horizontal line falls from the box’s top edge" value={s.tiles.dy}
					onchange={(v) => v != null && setTiles('Tile offset', { dy: v })} />
				{#if fine}<p class="muted">Too fine to draw on a box this size — use bigger tiles.</p>{/if}
			{/if}
		{/if}
	</PropGroup>
{/if}
