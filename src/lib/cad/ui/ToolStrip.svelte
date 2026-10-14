<!-- The TOOL STRIP (UX03, the Pages look; Dave: icons + groups): the tools as icons in fixed groups — Select / modify ·
     Draw · Annotate · Building · Cabling · Sheet — whose buttons never move. A tool that doesn't work in this view is
     greyed, its title saying where it does (it used to be hidden, so the others shifted). The label is the title. -->

<script lang="ts">
	import { Icon } from '$lib'
	import { TOOL_GROUPS } from './toolGroups'
	import type { ToolId } from '../app/workspace.svelte'
	import { TOOL_VIEWS, toolWorksIn } from '../app/workspace.svelte'
	import type { ViewSpec } from '../views/space'

	let { tool, kind, onSheet = false, onTool }: { tool: ToolId; kind: ViewSpec['kind']; /** a viewport being edited on a sheet */ onSheet?: boolean; onTool: (id: ToolId) => void } = $props()

	const VIEW_WORDS: Record<ViewSpec['kind'], string> = { plan: 'plans', elevation: 'elevations', section: 'sections', row: 'rack views', sheet: 'sheets', riser: 'the riser view', portmap: 'port maps', ports: 'port grids', schedule: 'schedules', fill: 'fill sections' }
	const where = (id: ToolId) => TOOL_VIEWS[id].map((k) => VIEW_WORDS[k]).join(', ')
</script>

<div class="strip" role="toolbar" aria-label="Tools">
	{#each TOOL_GROUPS as g, gi (g.name)}
		{#if gi}<span class="sep" role="separator"></span>{/if}
		{#if g.tools.some((t) => toolWorksIn(t.id, kind, onSheet))}
			{#each g.tools as t (t.id)}
				{@const ok = toolWorksIn(t.id, kind, onSheet)}
				<button class="tool" class:on={tool === t.id} class:off={!ok} aria-label={t.label}
					title={ok ? t.label : `${t.label} — works in ${where(t.id)}`} onclick={() => ok && onTool(t.id)}><Icon name={t.icon} size={16} /></button>
			{/each}
		{:else}
			<!-- a group with nothing that works in this view folds to one faint stub (review R51: 19 of 23 tools greyed in a
			     rack view); it keeps its place, so the strip doesn't jump -->
			<span class="tool off stub" title="{g.name}: {g.tools.map((t) => t.label.replace(/ \(.*\)$/, '')).join(', ')} — not in this view">⋯</span>
		{/if}
	{/each}
</div>

<style>
	.strip { display: flex; align-items: center; gap: 1px; }
	.tool { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; color: var(--cad-muted); }
	.tool:hover { background: var(--cad-hover); color: var(--cad-text); }
	.tool.on { background: var(--cad-sel, #dbeafe); color: var(--cad-link, #1d4ed8); box-shadow: inset 0 0 0 1px var(--cad-sel-line, #93c5fd); }
	.tool.off { opacity: 0.3; cursor: default; }
	.tool.off:hover { background: none; }
	.stub { font-size: 13px; letter-spacing: 1px; }
	.sep { width: 1px; height: 18px; margin: 0 5px; background: var(--cad-line); }
</style>
