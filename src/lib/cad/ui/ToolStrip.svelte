<!-- The TOOL STRIP (UX03, the Pages look; User: icons + groups) — tool strip option 2, FLYOUTS (User 2026-10-15): one
     button per family (toolGroups.ts TOOL_FAMILIES), showing the item in use from it, else the one last used (kept in
     this browser). A click uses it; the corner mark, a right-click, a long press (touch) or a click on the family that
     is already in use opens the others. An item can be a tool's variant (Rectangle / Polygon / Ellipse / Arc; Box /
     Cylinder / Polygon box). Groups: Select / modify · Draw · Build (3D) · Spaces and views · Annotate · Cabling ·
     Drawings; the buttons never move. A tool that doesn't work in this view is greyed, its title saying where it does.
     `vertical`: the floating palette's two columns (flyouts open to the right), else a row in the top bar (below). -->
<script lang="ts">
	import { Icon } from '$lib'
	import { TOOL_FAMILIES, itemOf, itemLabel, itemIcon } from './toolGroups'
	import type { ToolId } from '../app/workspace.svelte'
	import { TOOL_VIEWS, toolWorksIn } from '../app/workspace.svelte'
	import type { ViewSpec } from '../views/space'

	let { tool, kind, onSheet = false, vertical = false, variantOf = () => undefined, onTool }: {
		tool: ToolId; kind: ViewSpec['kind']; /** a viewport being edited on a sheet */ onSheet?: boolean; vertical?: boolean
		/** The variant a tool is set to now (the Shape / Box tools' kind). */
		variantOf?: (tool: ToolId) => string | undefined
		onTool: (id: ToolId, variant?: string) => void
	} = $props()

	const VIEW_WORDS: Record<ViewSpec['kind'], string> = { plan: 'plans', elevation: 'elevations', section: 'sections', row: 'rack views', sheet: 'sheets', riser: 'the riser view', portmap: 'port maps', ports: 'port grids', schedule: 'schedules', fill: 'fill sections' }
	const where = (id: ToolId) => TOOL_VIEWS[id].map((k) => VIEW_WORDS[k]).join(', ')
	const ok = (item: string) => toolWorksIn(itemOf(item).tool, kind, onSheet)
	const title = (item: string) => { const t = itemOf(item).tool; return ok(item) ? itemLabel(item) : `${itemLabel(item)} — works in ${where(t)}${TOOL_VIEWS[t].includes('plan') ? ' (a click opens the plan)' : ''}` }
	/** The item in use: its tool is the active one (and, for a variant, set to it). */
	const inUse = (item: string) => { const { tool: t, variant } = itemOf(item); return t === tool && (!variant || variantOf(t) === variant) }

	// the item each family shows when none of it is in use: the last one picked from it (this browser)
	const KEY = 'cad-tool-flyouts'
	let last = $state<Record<string, string>>((() => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} } })())
	const fam = (f: string[]) => f[0]
	const shown = (f: string[]): string => f.find(inUse) ?? (f.includes(last[fam(f)]) ? last[fam(f)] : f[0])
	function pick(f: string[], item: string) {
		if (f.length > 1) { last = { ...last, [fam(f)]: item }; try { localStorage.setItem(KEY, JSON.stringify(last)) } catch { /* storage blocked */ } }
		open = null
		const { tool: t, variant } = itemOf(item)
		onTool(t, variant)
	}

	/** The family whose flyout is open, and where (the button's box, in screen px). */
	let open = $state<{ f: string[]; x: number; y: number } | null>(null)
	function openFly(f: string[], el: HTMLElement) {
		const r = el.getBoundingClientRect()
		open = open && fam(open.f) === fam(f) ? null : { f, x: vertical ? r.right + 4 : r.left, y: vertical ? r.top : r.bottom + 4 }
	}
	function away(e: PointerEvent) { if (open && !(e.target as Element | null)?.closest?.('.fly, .mark')) open = null }

	// touch (User 2026-10-15: the mark is very small): a long press opens the family; the click that ends it is eaten
	let press: ReturnType<typeof setTimeout> | null = null, longPressed = false
	function down(f: string[], e: PointerEvent) {
		longPressed = false
		if (f.length < 2) return
		const el = e.currentTarget as HTMLElement
		press = setTimeout(() => { longPressed = true; openFly(f, el) }, 450)
	}
	const cancelPress = () => { if (press) clearTimeout(press); press = null }
	function click(f: string[], item: string, e: MouseEvent) {
		cancelPress()
		if (longPressed) { longPressed = false; return }
		// a click on the family already in use opens it (a quick way to the others, on a touch screen too)
		if (f.length > 1 && f.some(inUse)) { openFly(f, e.currentTarget as HTMLElement); return }
		pick(f, item)
	}
</script>

<svelte:window onpointerdown={away} onkeydown={(e) => { if (e.key === 'Escape' && open) { open = null; e.stopPropagation() } }} />

<div class="strip" class:vertical role="toolbar" aria-label="Tools" aria-orientation={vertical ? 'vertical' : 'horizontal'}>
	<!-- the Drawings group (Viewport) only while a sheet is open (User 2026-10-15); it's last, so nothing moves -->
	{#each TOOL_FAMILIES.filter((g) => g.name !== 'Drawings' || kind === 'sheet') as g, gi (g.name)}
		{#if gi}<span class="sep" role="separator"></span>{/if}
		{#each g.families as f (fam(f))}
			{@const item = shown(f)}
			{@const anyOk = f.some(ok)}
			<span class="cell">
				<button class="tool" class:on={f.some(inUse)} class:off={!ok(item)} aria-label={itemLabel(item)}
					title={f.length > 1 ? `${title(item)} · more: ${f.filter((x) => x !== item).map((x) => itemLabel(x).replace(/ \(.*\)$/, '')).join(', ')} (the corner mark, a long press, or a click while in use)` : title(item)}
					onpointerdown={(e) => down(f, e)} onpointerup={cancelPress} onpointerleave={cancelPress}
					onclick={(e) => click(f, item, e)} oncontextmenu={(e) => { if (f.length > 1) { e.preventDefault(); openFly(f, e.currentTarget) } }}><Icon name={itemIcon(item)} size={16} /></button>
				{#if f.length > 1}<button class="mark" class:off={!anyOk} aria-label="More: {f.map(itemLabel).join(', ')}" title="More tools here" onclick={(e) => openFly(f, (e.currentTarget.previousElementSibling as HTMLElement) ?? e.currentTarget)}><i></i></button>{/if}
			</span>
		{/each}
	{/each}
</div>

{#if open}
	<div class="fly" role="menu" style:left="{open.x}px" style:top="{open.y}px">
		{#each open.f as item (item)}
			<button role="menuitem" class:on={inUse(item)} class:off={!ok(item)} title={title(item)} onclick={() => pick(open!.f, item)}><Icon name={itemIcon(item)} size={15} /><span>{itemLabel(item)}</span></button>
		{/each}
	</div>
{/if}

<style>
	.strip { display: flex; align-items: center; gap: 1px; }
	.strip.vertical { display: grid; grid-template-columns: repeat(2, 28px); gap: 2px; align-items: start; }
	.cell { position: relative; display: inline-flex; }
	.tool { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; color: var(--cad-muted); -webkit-touch-callout: none; user-select: none; }
	.tool:hover { background: var(--cad-hover); color: var(--cad-text); }
	.tool.on { background: var(--cad-sel, #dbeafe); color: var(--cad-link, #1d4ed8); box-shadow: inset 0 0 0 1px var(--cad-sel-line, #93c5fd); }
	.tool.off { opacity: 0.3; cursor: default; }
	.tool.off:hover { background: none; }
	/* the flyout's corner mark: a small triangle at the bottom right, its hit area larger than it looks */
	.mark { position: absolute; right: -2px; bottom: -2px; width: 14px; height: 14px; padding: 0; background: none; }
	.mark i { position: absolute; right: 2px; bottom: 2px; width: 8px; height: 8px; border-radius: 0 0 5px 0; background: linear-gradient(135deg, transparent 50%, var(--cad-muted) 50%); opacity: 0.55; }
	.mark:hover i { opacity: 1; }
	.mark.off i { opacity: 0.2; }
	.sep { width: 1px; height: 18px; margin: 0 5px; background: var(--cad-line); }
	.strip.vertical .sep { grid-column: 1 / -1; width: auto; height: 1px; margin: 3px 0; }
	.fly { position: fixed; z-index: 60; display: flex; flex-direction: column; min-width: 11rem; padding: 3px; border: 1px solid var(--cad-line); border-radius: 6px; background: var(--cad-panel, white); box-shadow: 0 4px 14px rgb(0 0 0 / 0.15); }
	.fly button { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: 4px; font-size: 12px; color: var(--cad-text); text-align: left; }
	.fly button:hover { background: var(--cad-hover); }
	.fly button.on { color: var(--cad-link, #1d4ed8); font-weight: 600; }
	.fly button.off { opacity: 0.4; }
</style>
