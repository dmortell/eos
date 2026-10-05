<!-- The Shape / Box tools' options in the tool bar: rectangle / ellipse / polygon; a polygon's sides and whether the
     click after its centre is a corner (inscribed) or an edge's middle (circumscribed). The Box tool (`box`) adds the
     height it stands up to and its base Z (backlog "Box / desk tool": a desk is 750 from the floor). -->
<script lang="ts">
	import type { Workspace } from '../app/workspace.svelte'
	import type { ShapeKind, ShapeOpts } from '../editor/shapeTool'

	let { ws, box = false }: { ws: Workspace; box?: boolean } = $props()
	const o = $derived(box ? ws.boxOpts : ws.shapeOpts)
	const set = (patch: Partial<ShapeOpts>) => { if (box) ws.boxOpts = { ...ws.boxOpts, ...patch }; else ws.shapeOpts = { ...ws.shapeOpts, ...patch } }
</script>

<span class="mx-2 h-5 w-px bg-zinc-200"></span>
<label class="opt">{box ? 'Footprint' : 'Shape'}
	<select value={o.kind} onchange={(e) => set({ kind: e.currentTarget.value as ShapeKind })}>
		<option value="rect">Rectangle</option><option value="ellipse">Ellipse</option><option value="polygon">Polygon</option>
	</select></label>
{#if o.kind === 'polygon'}
	<label class="opt" title="Number of sides (3–12)">Sides <input type="number" min="3" max="12" value={o.sides} onchange={(e) => set({ sides: Math.max(3, Math.min(12, Number(e.currentTarget.value) || 6)) })} /></label>
	<label class="opt" title="Inscribed: the second click is a corner · circumscribed: the middle of an edge">
		<select value={o.inscribed ? 'in' : 'out'} onchange={(e) => set({ inscribed: e.currentTarget.value === 'in' })}>
			<option value="in">inscribed</option><option value="out">circumscribed</option>
		</select></label>
{/if}
{#if box}
	<label class="opt" title="How tall it is (mm) — shows in elevations and sections">Height <input type="number" min="1" step="10" value={o.height ?? 750} onchange={(e) => set({ height: Math.max(1, Number(e.currentTarget.value) || 750) })} /></label>
	<label class="opt" title="Its base above the floor (mm)">Z <input type="number" step="10" value={o.z ?? 0} onchange={(e) => set({ z: Number(e.currentTarget.value) || 0 })} /></label>
{/if}
<span class="hint">{o.kind === 'polygon' ? 'click the centre, then a corner' : 'corner to corner'} · Shift: {o.kind === 'rect' ? 'square' : o.kind === 'ellipse' ? 'circle' : '15° steps'}</span>

<style>
	.opt { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; }
	.opt input { width: 3.6rem; border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 4px; background: var(--cad-input); color: var(--cad-text); }
	.opt select { border: 1px solid var(--cad-line); border-radius: 4px; background: var(--cad-input); color: var(--cad-text); }
	.hint { margin-left: 6px; font-size: 11px; color: var(--cad-muted); }
</style>
