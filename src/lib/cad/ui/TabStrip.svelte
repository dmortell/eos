<!-- The DRAWING TABS strip (UX review D1): one strip over the drawing, shared by both panes. A click shows the tab in
     the active pane; in Split the tabs on show are marked 1 / 2. The preview tab's title is in italics (double-click it
     to keep it). × on hover or a middle-click closes; a right-click opens the tab menu; ⌄ lists every tab. -->
<script lang="ts">
	import { KEYS } from './shellKeys'
	import { Icon, DragReorder } from '$lib'
	import type { Tabs, Tab } from '../app/tabs.svelte'
	import type { CadProject } from '../app/project.svelte'
	import { viewName } from '../domain/navTree'

	let { tabs, project, panes, activePane, onshow, onclose, onmenu }: {
		tabs: Tabs; project: CadProject; panes: number; activePane: number
		onshow: (id: string) => void; onclose: (id: string) => void; onmenu: (id: string, x: number, y: number) => void
	} = $props()

	const ICON: Record<string, string> = { plan: 'rect', elevation: 'elevmark', section: 'scan', row: 'server', riser: 'route', sheet: 'fileText' }
	function title(t: Tab): string {
		const v = t.view, ix = project.index
		if (v.spec.kind === 'sheet') { const s = ix.get(v.spec.sheetId); return s?.type === 'sheet' ? `${s.number} ${s.title}` : 'Sheet' }
		return viewName(ix, v.spec, v.levelId) || 'View'
	}
	// drag a tab along the strip to move it (Dave 2026-10-10); the drop line shows on the side it goes
	const dr = new DragReorder((id, target, after) => tabs.move(id, target, after), (id) => tabs.list.findIndex((t) => t.id === id))
	// …but not on a touch screen: there a long press opens the tab menu (ui/longPress.ts), and the system's drag lift
	// would fire on the same press
	const touchOnly = typeof matchMedia === 'function' && matchMedia('(hover: none)').matches
	let listOpen = $state(false)
	let strip: HTMLDivElement | undefined = $state()
	// the active pane's tab scrolls into view
	$effect(() => {
		const id = tabs.paneTab[activePane]
		strip?.querySelector(`[data-tab="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
	})
</script>

<div class="tabbar">
	<div class="strip" bind:this={strip} role="tablist">
		{#each tabs.list as t (t.id)}
			{@const pane = tabs.paneTab.slice(0, panes).indexOf(t.id)}
			<div class="tab" class:on={tabs.paneTab[activePane] === t.id} class:shown={pane >= 0} class:preview={t.preview} data-tab={t.id} role="tab" tabindex="-1"
				{...dr.row(t.id)} draggable={!touchOnly} class:drop-before={dr.isBefore(t.id)} class:drop-after={dr.isAfter(t.id)} class:dragging={dr.dragId === t.id}
				aria-selected={tabs.paneTab[activePane] === t.id} title="{title(t)}{t.preview ? ' — preview: double-click to keep it' : ''}"
				onclick={() => onshow(t.id)} ondblclick={() => tabs.keep(t.id)} onkeydown={(e) => e.key === 'Enter' && onshow(t.id)}
				onauxclick={(e) => { if (e.button === 1) { e.preventDefault(); onclose(t.id) } }}
				oncontextmenu={(e) => { e.preventDefault(); onmenu(t.id, e.clientX, e.clientY) }}>
				<Icon name={ICON[t.view.spec.kind] ?? 'rect'} size={12} />
				<span class="t">{title(t)}</span>
				{#if panes === 2 && pane >= 0}<span class="pn">{pane + 1}</span>{/if}
				<button class="x" title="Close ({KEYS.closeTab}, or a middle-click)" onclick={(e) => { e.stopPropagation(); onclose(t.id) }}><Icon name="x" size={11} /></button>
			</div>
		{/each}
	</div>
	<div class="all">
		<button class="more" title="Every open tab" onclick={() => (listOpen = !listOpen)}><Icon name="chevronDown" size={13} /></button>
		{#if listOpen}
			<button class="back" aria-label="Close the list" onclick={() => (listOpen = false)}></button>
			<div class="list" role="menu">
				{#each tabs.list as t (t.id)}
					<button class="item" class:on={tabs.paneTab[activePane] === t.id} class:preview={t.preview} role="menuitem" onclick={() => { listOpen = false; onshow(t.id) }}>
						<Icon name={ICON[t.view.spec.kind] ?? 'rect'} size={12} /> {title(t)}
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.tabbar { display: flex; align-items: stretch; height: 28px; flex: 0 0 auto; background: var(--cad-subtle); border-bottom: 1px solid var(--cad-line); }
	.strip { flex: 1; min-width: 0; display: flex; overflow-x: auto; scrollbar-width: thin; }
	.tab { display: flex; align-items: center; gap: 5px; max-width: 200px; padding: 0 4px 0 10px; border-right: 1px solid var(--cad-line); font-size: 12px; color: var(--cad-muted); cursor: pointer; white-space: nowrap; user-select: none; }
	.tab:hover { background: var(--cad-hover); color: var(--cad-text); }
	.tab.shown { color: var(--cad-text); }
	.tab.on { background: var(--cad-panel, white); color: var(--cad-text); box-shadow: inset 0 -2px 0 #2563eb; }
	.tab.preview .t { font-style: italic; }
	.tab.dragging { opacity: 0.5; }
	.tab.drop-before { box-shadow: inset 2px 0 0 #2563eb; }
	.tab.drop-after { box-shadow: inset -2px 0 0 #2563eb; }
	.t { overflow: hidden; text-overflow: ellipsis; }
	.pn { font-size: 9px; font-weight: 700; color: white; background: #2563eb; border-radius: 3px; padding: 0 4px; }
	.x { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; min-height: 20px; border-radius: 3px; visibility: hidden; color: var(--cad-muted); }
	/* on hover, the active / shown tab, a focused tab, and always on touch screens (review R81: no hover there) */
	.tab:hover .x, .tab.on .x, .tab.shown .x, .tab:focus-within .x, .tab:focus-visible .x { visibility: visible; }
	@media (hover: none) { .x { visibility: visible; } }
	.x:hover { background: var(--cad-strong); color: var(--cad-text); }
	.all { position: relative; display: flex; align-items: center; padding: 0 4px; border-left: 1px solid var(--cad-line); }
	.more { display: inline-flex; padding: 3px; border-radius: 4px; color: var(--cad-muted); }
	.more:hover { background: var(--cad-hover); }
	.back { position: fixed; inset: 0; z-index: 60; background: none; border: 0; cursor: default; }
	.list { position: absolute; right: 0; top: 100%; z-index: 61; min-width: 240px; max-height: 60vh; overflow: auto; padding: 4px; background: var(--cad-panel, white); border: 1px solid var(--cad-line); border-radius: 6px; box-shadow: 0 12px 30px rgb(0 0 0 / 0.2); }
	.item { display: flex; align-items: center; gap: 6px; width: 100%; padding: 3px 8px; border-radius: 4px; font-size: 12px; text-align: left; color: var(--cad-text); white-space: nowrap; }
	.item:hover { background: #dbeafe; }
	.item.on { font-weight: 600; }
	.item.preview { font-style: italic; }
</style>
