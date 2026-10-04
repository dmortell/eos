<!-- The Shape tool's options in the tool bar: rectangle / ellipse / polygon; a polygon's sides and whether the click
     after its centre is a corner (inscribed) or an edge's middle (circumscribed). -->
<script lang="ts">
	import type { Workspace } from '../app/workspace.svelte'
	import type { ShapeKind } from '../editor/shapeTool'

	let { ws }: { ws: Workspace } = $props()
</script>

<span class="mx-2 h-5 w-px bg-zinc-200"></span>
<label class="opt">Shape
	<select value={ws.shapeOpts.kind} onchange={(e) => (ws.shapeOpts = { ...ws.shapeOpts, kind: e.currentTarget.value as ShapeKind })}>
		<option value="rect">Rectangle</option><option value="ellipse">Ellipse</option><option value="polygon">Polygon</option>
	</select></label>
{#if ws.shapeOpts.kind === 'polygon'}
	<label class="opt" title="Number of sides (3–12)">Sides <input type="number" min="3" max="12" value={ws.shapeOpts.sides} onchange={(e) => (ws.shapeOpts = { ...ws.shapeOpts, sides: Math.max(3, Math.min(12, Number(e.currentTarget.value) || 6)) })} /></label>
	<label class="opt" title="Inscribed: the second click is a corner · circumscribed: the middle of an edge">
		<select value={ws.shapeOpts.inscribed ? 'in' : 'out'} onchange={(e) => (ws.shapeOpts = { ...ws.shapeOpts, inscribed: e.currentTarget.value === 'in' })}>
			<option value="in">inscribed</option><option value="out">circumscribed</option>
		</select></label>
{/if}
<span class="hint">{ws.shapeOpts.kind === 'polygon' ? 'click the centre, then a corner' : 'corner to corner'} · Shift: {ws.shapeOpts.kind === 'rect' ? 'square' : ws.shapeOpts.kind === 'ellipse' ? 'circle' : '15° steps'}</span>

<style>
	.opt { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; }
	.opt input { width: 3.2rem; border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 4px; background: var(--cad-input); color: var(--cad-text); }
	.opt select { border: 1px solid var(--cad-line); border-radius: 4px; background: var(--cad-input); color: var(--cad-text); }
	.hint { margin-left: 6px; font-size: 11px; color: var(--cad-muted); }
</style>
