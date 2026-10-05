<!-- The TOOL STRIP (UX03, the Pages look; Dave: icons + groups): the tools as icons in fixed groups — Select / modify ·
     Draw · Annotate · Building · Cabling · Sheet — whose buttons never move. A tool that doesn't work in this view is
     greyed, its title saying where it does (it used to be hidden, so the others shifted). The label is the title. -->
<script lang="ts" module>
	import type { ToolId } from '../app/workspace.svelte'
	export const TOOL_GROUPS: { name: string; tools: { id: ToolId; label: string; icon: string }[] }[] = [
		{ name: 'Select / modify', tools: [{ id: 'select', label: 'Select (Esc)', icon: 'k-select' }, { id: 'move', label: 'Move', icon: 'move' }, { id: 'copy', label: 'Copy', icon: 'copy' }] },
		{ name: 'Draw', tools: [{ id: 'line', label: 'Line', icon: 'k-line' }, { id: 'shape', label: 'Shape (rectangle, ellipse, polygon)', icon: 'rect' }, { id: 'box', label: 'Box / desk', icon: 'box' }, { id: 'dimension', label: 'Dimension', icon: 'ruler' }] },
		{ name: 'Annotate', tools: [{ id: 'text', label: 'Text', icon: 'k-text' }, { id: 'leader', label: 'Leader', icon: 'callout' }, { id: 'cloud', label: 'Revision cloud', icon: 'highlighter' }, { id: 'legend', label: 'Legend', icon: 'list' }, { id: 'insert', label: 'Insert a block', icon: 'package' }] },
		{ name: 'Building', tools: [{ id: 'wall', label: 'Wall', icon: 'brickWall' }, { id: 'opening', label: 'Opening (door, window, hole)', icon: 'opening' }, { id: 'section', label: 'Section', icon: 'scan' }] },
		{ name: 'Cabling', tools: [{ id: 'outlet', label: 'Outlet', icon: 'circleDot' }, { id: 'trunk', label: 'Trunk', icon: 'route' }, { id: 'conduit', label: 'Conduit', icon: 'rows' }, { id: 'rack', label: 'Rack', icon: 'server' }, { id: 'device', label: 'Device', icon: 'pcCase' }, { id: 'cord', label: 'Patch cord', icon: 'cable' }, { id: 'renumber', label: 'Renumber', icon: 'tag' }] },
		{ name: 'Sheet', tools: [{ id: 'viewport', label: 'Viewport (draw a box on the sheet)', icon: 'panels' }] },
	]
</script>

<script lang="ts">
	import { Icon } from '$lib'
	import { TOOL_VIEWS, toolWorksIn } from '../app/workspace.svelte'
	import type { ViewSpec } from '../views/space'

	let { tool, kind, onTool }: { tool: ToolId; kind: ViewSpec['kind']; onTool: (id: ToolId) => void } = $props()

	const VIEW_WORDS: Record<ViewSpec['kind'], string> = { plan: 'plans', elevation: 'elevations', section: 'sections', row: 'rack views', sheet: 'sheets', riser: 'the riser view' }
	const where = (id: ToolId) => TOOL_VIEWS[id].map((k) => VIEW_WORDS[k]).join(', ')
</script>

<div class="strip" role="toolbar" aria-label="Tools">
	{#each TOOL_GROUPS as g, gi (g.name)}
		{#if gi}<span class="sep" role="separator"></span>{/if}
		{#each g.tools as t (t.id)}
			{@const ok = toolWorksIn(t.id, kind)}
			<button class="tool" class:on={tool === t.id} class:off={!ok} aria-label={t.label}
				title={ok ? t.label : `${t.label} — works in ${where(t.id)}`} onclick={() => ok && onTool(t.id)}><Icon name={t.icon} size={16} /></button>
		{/each}
	{/each}
</div>

<style>
	.strip { display: flex; align-items: center; gap: 1px; }
	.tool { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; color: var(--cad-muted); }
	.tool:hover { background: var(--cad-hover); color: var(--cad-text); }
	.tool.on { background: #dbeafe; color: #1d4ed8; box-shadow: inset 0 0 0 1px #93c5fd; }
	.tool.off { opacity: 0.3; cursor: default; }
	.tool.off:hover { background: none; }
	.sep { width: 1px; height: 18px; margin: 0 5px; background: var(--cad-line); }
</style>
