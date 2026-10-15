<!-- The TOOL STRIP (UX03, the Pages look; Dave: icons + groups) — tool strip option 2, FLYOUTS (Dave 2026-10-15): one
     button per family (toolGroups.ts TOOL_FAMILIES), showing the tool in use from it, else the one last used (kept in
     this browser); a click uses it, the small corner mark (or a right-click) opens the family. Groups: Select / modify ·
     Draw · Annotate · Building · Cabling · Drawings; the buttons never move. A tool that doesn't work in this view is
     greyed, its title saying where it does; a family with none that works here is greyed whole. `vertical`: the
     floating palette's two columns (its flyouts open to the right), else a row in the top bar (they open below). -->
<script lang="ts">
	import { Icon } from '$lib'
	import { TOOL_FAMILIES, toolInfo } from './toolGroups'
	import type { ToolId } from '../app/workspace.svelte'
	import { TOOL_VIEWS, toolWorksIn } from '../app/workspace.svelte'
	import type { ViewSpec } from '../views/space'

	let { tool, kind, onSheet = false, vertical = false, onTool }: { tool: ToolId; kind: ViewSpec['kind']; /** a viewport being edited on a sheet */ onSheet?: boolean; vertical?: boolean; onTool: (id: ToolId) => void } = $props()

	const VIEW_WORDS: Record<ViewSpec['kind'], string> = { plan: 'plans', elevation: 'elevations', section: 'sections', row: 'rack views', sheet: 'sheets', riser: 'the riser view', portmap: 'port maps', ports: 'port grids', schedule: 'schedules', fill: 'fill sections' }
	const where = (id: ToolId) => TOOL_VIEWS[id].map((k) => VIEW_WORDS[k]).join(', ')
	const ok = (id: ToolId) => toolWorksIn(id, kind, onSheet)
	const label = (id: ToolId) => toolInfo(id)?.label ?? id
	const title = (id: ToolId) => (ok(id) ? label(id) : `${label(id)} — works in ${where(id)}${TOOL_VIEWS[id].includes('plan') ? ' (a click opens the plan)' : ''}`)

	// the tool each family shows when it isn't in use: the last one picked from it (this browser)
	const KEY = 'cad-tool-flyouts'
	let last = $state<Record<string, ToolId>>((() => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} } })())
	const fam = (f: ToolId[]) => f[0]
	const shown = (f: ToolId[]): ToolId => (f.includes(tool) ? tool : f.includes(last[fam(f)]) ? last[fam(f)] : f[0])
	function pick(f: ToolId[], id: ToolId) {
		if (f.length > 1) { last = { ...last, [fam(f)]: id }; try { localStorage.setItem(KEY, JSON.stringify(last)) } catch { /* storage blocked */ } }
		open = null
		onTool(id)
	}

	/** The family whose flyout is open, and where (the button's box, in screen px). */
	let open = $state<{ f: ToolId[]; x: number; y: number } | null>(null)
	function openFly(f: ToolId[], el: HTMLElement) {
		const r = el.getBoundingClientRect()
		open = open && fam(open.f) === fam(f) ? null : { f, x: vertical ? r.right + 4 : r.left, y: vertical ? r.top : r.bottom + 4 }
	}
	function away(e: PointerEvent) { if (open && !(e.target as Element | null)?.closest?.('.fly, .mark')) open = null }
</script>

<svelte:window onpointerdown={away} onkeydown={(e) => { if (e.key === 'Escape' && open) { open = null; e.stopPropagation() } }} />

<div class="strip" class:vertical role="toolbar" aria-label="Tools" aria-orientation={vertical ? 'vertical' : 'horizontal'}>
	{#each TOOL_FAMILIES as g, gi (g.name)}
		{#if gi}<span class="sep" role="separator"></span>{/if}
		{#each g.families as f (fam(f))}
			{@const id = shown(f)}
			{@const anyOk = f.some(ok)}
			<span class="cell">
				<button class="tool" class:on={f.includes(tool)} class:off={!ok(id)} aria-label={label(id)}
					title={f.length > 1 ? `${title(id)} · the mark (or a right-click): ${f.filter((x) => x !== id).map((x) => label(x).replace(/ \(.*\)$/, '')).join(', ')}` : title(id)}
					onclick={() => pick(f, id)} oncontextmenu={(e) => { if (f.length > 1) { e.preventDefault(); openFly(f, e.currentTarget) } }}><Icon name={toolInfo(id)?.icon ?? 'square'} size={16} /></button>
				{#if f.length > 1}<button class="mark" class:off={!anyOk} aria-label="More: {f.map((x) => label(x)).join(', ')}" title="More tools here" onclick={(e) => openFly(f, (e.currentTarget.previousElementSibling as HTMLElement) ?? e.currentTarget)}></button>{/if}
			</span>
		{/each}
	{/each}
</div>

{#if open}
	<div class="fly" role="menu" style:left="{open.x}px" style:top="{open.y}px">
		{#each open.f as id (id)}
			<button role="menuitem" class:on={tool === id} class:off={!ok(id)} title={title(id)} onclick={() => pick(open!.f, id)}><Icon name={toolInfo(id)?.icon ?? 'square'} size={15} /><span>{label(id)}</span></button>
		{/each}
	</div>
{/if}

<style>
	.strip { display: flex; align-items: center; gap: 1px; }
	.strip.vertical { display: grid; grid-template-columns: repeat(2, 28px); gap: 2px; align-items: start; }
	.cell { position: relative; display: inline-flex; }
	.tool { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; color: var(--cad-muted); }
	.tool:hover { background: var(--cad-hover); color: var(--cad-text); }
	.tool.on { background: var(--cad-sel, #dbeafe); color: var(--cad-link, #1d4ed8); box-shadow: inset 0 0 0 1px var(--cad-sel-line, #93c5fd); }
	.tool.off { opacity: 0.3; cursor: default; }
	.tool.off:hover { background: none; }
	/* the flyout's corner mark: a small triangle at the bottom right of the button */
	.mark { position: absolute; right: 0; bottom: 0; width: 9px; height: 9px; padding: 0; border-radius: 0 0 6px 0; background: linear-gradient(135deg, transparent 50%, var(--cad-muted) 50%); opacity: 0.55; }
	.mark:hover { opacity: 1; }
	.mark.off { opacity: 0.2; }
	.sep { width: 1px; height: 18px; margin: 0 5px; background: var(--cad-line); }
	.strip.vertical .sep { grid-column: 1 / -1; width: auto; height: 1px; margin: 3px 0; }
	.fly { position: fixed; z-index: 60; display: flex; flex-direction: column; min-width: 11rem; padding: 3px; border: 1px solid var(--cad-line); border-radius: 6px; background: var(--cad-panel, white); box-shadow: 0 4px 14px rgb(0 0 0 / 0.15); }
	.fly button { display: flex; align-items: center; gap: 8px; padding: 4px 8px; border-radius: 4px; font-size: 12px; color: var(--cad-text); text-align: left; }
	.fly button:hover { background: var(--cad-hover); }
	.fly button.on { color: var(--cad-link, #1d4ed8); font-weight: 600; }
	.fly button.off { opacity: 0.4; }
</style>
