<!-- The Dimension tool's option in the tool bar: measure along the two points, or only horizontally / vertically. -->
<script lang="ts">
	import type { Workspace } from '../app/workspace.svelte'
	import type { DimMode } from '../editor/dimTool'

	let { ws }: { ws: Workspace } = $props()
</script>

<span class="mx-2 h-5 w-px bg-zinc-200"></span>
<label class="opt">Measure
	<select value={ws.dimMode} onchange={(e) => (ws.dimMode = e.currentTarget.value as DimMode)}>
		<option value="aligned">along the points</option><option value="horizontal">horizontal</option><option value="vertical">vertical</option>
	</select></label>

<style>
	.opt { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; }
	.opt select { border: 1px solid var(--cad-line); border-radius: 4px; background: var(--cad-input); color: var(--cad-text); }
</style>
