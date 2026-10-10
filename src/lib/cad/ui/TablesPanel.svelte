<!-- The TABLES (UX review T1–T3; Dave: "still take a lot of space" — "float"): Outlets · Patch list · Sheets · Links
     under one title bar with horizontal tabs and fold / maximise / float-or-dock / close. Folded, only the bar shows,
     with a one-line summary ("Outlets · 47 · 12 selected"). Docked it's the strip under the drawing; floating it's a
     window over the drawing (move it by its bar, resize it by its corner); maximised it fills the drawing area while
     you allocate or patch (Esc or the button brings the drawing back). -->
<script lang="ts" module>
	export type TableTab = 'outlets' | 'patch' | 'sheets' | 'links'
</script>

<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Panels } from '../app/panels.svelte'
	import type { Level } from '../domain/types'
	import type { ViewSpec } from '../views/space'
	import { Icon } from '$lib'
	import OutletGrid from './OutletGrid.svelte'
	import PatchList from './PatchList.svelte'
	import SheetsTab from './SheetsTab.svelte'
	import LinksTable from './LinksTable.svelte'


	let { project, ws, panels, level, projectName, roomId, inRoomView, tab, onpick, onview, area, closed = false }: {
		project: CadProject; ws: Workspace; panels: Panels; level: Level | undefined; projectName: string
		roomId?: string; inRoomView: boolean; tab: TableTab; onpick: (t: TableTab) => void; onview: (s: ViewSpec) => void
		/** The drawing area (a floating / maximised panel sits in it). */
		area: HTMLElement | undefined
		/** Closed: only the bar of tabs stays, under the drawing (Dave 2026-10-10); a tab opens the panel on it. */
		closed?: boolean
	} = $props()

	const t = $derived(panels.tables)
	const floating = $derived(t.float && !t.max && !closed), max = $derived(t.max && !closed), folded = $derived(closed || (t.folded && !t.max))
	/** Open the closed panel, unfolded. */
	const open = () => { set({ folded: false }); panels.toggle('bottom') }
	const TABS: [TableTab, string][] = [['outlets', 'Outlets'], ['patch', 'Patch list'], ['sheets', 'Sheets'], ['links', 'Links']]
	/** The folded bar's summary: how many rows the open table has, and how many of them are selected. */
	const summary = $derived.by(() => {
		const sel = new Set(ws.selection), ix = project.index
		const list = tab === 'outlets' ? ix.outlets.filter((o) => o.levelId === level?.id) : tab === 'patch' ? ix.cords : tab === 'links' ? [...ix.byId.values()].filter((e) => e.type === 'link') : [...ix.byId.values()].filter((e) => e.type === 'sheet')
		const n = list.filter((e) => sel.has(e.id)).length
		return `${list.length}${n ? ` · ${n} selected` : ''}`
	})

	function barDown(e: PointerEvent) {
		if (!t.float || t.max || e.button !== 0 || (e.target as HTMLElement).closest('button, select, input')) return
		e.preventDefault()
		const start = { x: e.clientX, y: e.clientY, wx: t.x, wy: t.y }
		const move = (m: PointerEvent) => { t.x = Math.round(start.wx + m.clientX - start.x); t.y = Math.round(Math.max(0, start.wy + m.clientY - start.y)) }
		const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); clamp(); panels.save() }
		window.addEventListener('pointermove', move)
		window.addEventListener('pointerup', up)
	}
	function cornerDown(e: PointerEvent) {
		if (e.button !== 0) return
		e.preventDefault(); e.stopPropagation()
		const start = { x: e.clientX, y: e.clientY, w: t.w, h: t.h }
		const move = (m: PointerEvent) => { t.w = Math.round(Math.max(360, start.w + m.clientX - start.x)); t.h = Math.round(Math.max(140, start.h + m.clientY - start.y)) }
		const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); clamp(); panels.save() }
		window.addEventListener('pointermove', move)
		window.addEventListener('pointerup', up)
	}
	/** A floating panel stays reachable inside the drawing area (and after the browser shrinks). */
	function clamp() {
		const el = area
		if (!el) return
		const aw = el.clientWidth, ah = el.clientHeight
		t.w = Math.min(t.w, aw); t.h = Math.min(t.h, ah)
		t.x = Math.min(Math.max(t.x, 120 - t.w), aw - 120); t.y = Math.min(Math.max(t.y, 0), ah - 30)
	}
	$effect(() => {
		const el = area
		if (!el || !t.float) return
		const ro = new ResizeObserver(clamp)
		ro.observe(el)
		return () => ro.disconnect()
	})
	const set = (patch: Partial<typeof t>) => { Object.assign(t, patch); panels.save() }
</script>

<svelte:window onkeydowncapture={(e) => { if (t.max && e.key === 'Escape' && !(e.target instanceof Element && e.target.closest('input, select, textarea'))) { e.preventDefault(); e.stopPropagation(); set({ max: false }) } }} />

<section class="tables" class:floating class:max class:folded class:closed
	style:left={floating ? `${t.x}px` : undefined} style:top={floating ? `${t.y}px` : undefined}
	style:width={floating ? `${t.w}px` : undefined} style:height={floating && !t.folded ? `${t.h}px` : undefined}>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<header onpointerdown={(e) => { if (!closed) barDown(e) }} ondblclick={(e) => { if (!(e.target as HTMLElement).closest('button')) { if (closed) open(); else set({ folded: !t.folded }) } }}>
		<div class="tabs" role="tablist">
			{#each TABS as [k, label] (k)}
				<button role="tab" aria-selected={!closed && tab === k} class:on={!closed && tab === k} onclick={() => { onpick(k); if (closed) open(); else if (t.folded) set({ folded: false }) }}>{label}</button>
			{/each}
		</div>
		{#if !closed}<span class="sum">{TABS.find((x) => x[0] === tab)?.[1]} · {summary}</span>{/if}
		<span class="grow"></span>
		{#if closed}
			<button class="ib" title="Open the tables (Ctrl+,)" onclick={open}><Icon name="chevronUp" size={13} /></button>
		{:else}
			{#if !t.max}<button class="ib" title={t.folded ? 'Unfold' : 'Fold to this bar'} onclick={() => set({ folded: !t.folded })}><Icon name={t.folded ? 'chevronUp' : 'chevronDown'} size={13} /></button>{/if}
			<button class="ib" class:on={t.max} title={t.max ? 'Back to the drawing (Esc)' : 'Maximise: the table fills the drawing area'} onclick={() => set({ max: !t.max, folded: false })}><Icon name="expand" size={13} /></button>
			{#if !t.max}
				<button class="ib" title={t.float ? 'Dock it under the drawing' : 'Float it over the drawing (move and resize it)'} onclick={() => { set({ float: !t.float }); clamp() }}><Icon name={t.float ? 'panelBottom' : 'panels'} size={13} /></button>
			{/if}
			<button class="ib" title="Close the tables to their tabs (Ctrl+, or a tab brings them back)" onclick={() => { set({ max: false }); panels.toggle('bottom') }}><Icon name="x" size={13} /></button>
		{/if}
	</header>
	{#if !folded}
		<div class="body">
			{#if tab === 'patch'}<PatchList {project} {ws} {projectName} {roomId} {inRoomView} />
			{:else if tab === 'sheets'}<SheetsTab {project} {ws} {onview} />
			{:else if tab === 'links'}<LinksTable {project} {ws} levelId={level?.id} />
			{:else if level}<OutletGrid {project} {ws} levelId={level.id} />{/if}
		</div>
		{#if t.float && !t.max}<div class="corner" role="presentation" title="Drag to resize" onpointerdown={cornerDown}></div>{/if}
	{/if}
</section>

<style>
	.tables { display: flex; flex-direction: column; min-height: 0; min-width: 0; height: 100%; background: var(--cad-panel, white); }
	.tables.floating { position: absolute; z-index: 25; border: 1px solid var(--cad-line); border-radius: 6px; box-shadow: 0 8px 28px rgb(0 0 0 / 0.18); overflow: hidden; }
	.tables.max { position: absolute; inset: 0; z-index: 40; height: auto; }
	.tables.folded { height: auto; }
	header { display: flex; align-items: center; gap: 4px; height: 28px; flex: 0 0 auto; padding: 0 4px; border-bottom: 1px solid var(--cad-line); background: var(--cad-subtle); user-select: none; }
	.floating header { cursor: grab; }
	.tabs { display: flex; gap: 2px; }
	.tabs button { font-size: 12px; padding: 2px 10px; border-radius: 5px; color: var(--cad-muted); }
	.tabs button:hover { background: var(--cad-hover); color: var(--cad-text); }
	.tabs button.on { background: #dbeafe; color: #1d4ed8; font-weight: 600; }
	.sum { margin-left: 8px; font-size: 11px; color: var(--cad-muted); white-space: nowrap; }
	.grow { flex: 1; }
	.ib { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 4px; color: var(--cad-muted); }
	.ib:hover { background: var(--cad-hover); color: var(--cad-text); }
	.ib.on { background: #dbeafe; color: #1d4ed8; }
	.body { flex: 1; min-height: 0; overflow: auto; }
	/* every table as wide as its content, from the left (Dave: stretched to the panel, spare width went to whatever
	   column could grow — an empty Tags, a 370 px Notes — while Level got 49 px) */
	.body :global(table) { width: max-content; min-width: 0; }
	.body :global(td.clip) { max-width: 24rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	/* rows a little taller and easier to hit (T1) */
	.body :global(td) { height: 20px; }
	.corner { position: absolute; right: 0; bottom: 0; width: 14px; height: 14px; cursor: nwse-resize;
		background: linear-gradient(135deg, transparent 50%, var(--cad-faint, #a1a1aa) 50%, transparent 60%, transparent 70%, var(--cad-faint, #a1a1aa) 70%, transparent 80%); }
</style>
