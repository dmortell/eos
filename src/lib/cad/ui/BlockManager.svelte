<!-- The BLOCKS panel (block manager): the global block library by category, with search and previews. Click a block to
     place it with the Insert tool — on the plan, or on a wall in an elevation / section (at the clicked height); click it
     again (or Esc) to stop. Your own blocks can be deleted from the library (drawings that use them keep them).
     "On this level" (Dave 2026-10-05: was the separate Symbols list) shows only the blocks used on the open level —
     outlet symbols and inserts — with how many. (Which go in a legend is chosen per legend, later.) -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Block } from '../domain/blocks'
	import type { Id } from '../domain/types'
	import { defaultOutletBlock } from '../domain/blocks'
	import { blockPreview } from '../views/blocks'
	import Prims from './Prims.svelte'
	import SideSection from './SideSection.svelte'

	let { project, ws, levelId, onpick }: { project: CadProject; ws: Workspace; levelId?: Id; onpick: (b: Block | null) => void } = $props()

	let q = $state('')
	let here = $state(false)
	/** How many of each block the open level uses (outlets by their symbol, inserts). */
	const used = $derived.by(() => {
		const n = new Map<Id, number>()
		if (!levelId) return n
		for (const o of project.index.outlets) if (o.levelId === levelId && o.at) { const id = o.blockId ?? defaultOutletBlock(o); n.set(id, (n.get(id) ?? 0) + 1) }
		for (const s of project.index.shapes) if (s.levelId === levelId && s.geom.kind === 'insert') n.set(s.geom.blockId, (n.get(s.geom.blockId) ?? 0) + 1)
		return n
	})
	const groups = $derived.by(() => {
		const s = q.trim().toLowerCase()
		const list = here
			? [...used.keys()].map((id) => project.blockOf(id) ?? ({ type: 'block', id, name: 'Missing block', scope: 'global', shapes: [] } satisfies Block))
			: [...project.blocks.values()].filter((b) => !b.retired)
		const by = new Map<string, Block[]>()
		for (const b of list.filter((b) => !s || b.name.toLowerCase().includes(s) || (b.category ?? '').toLowerCase().includes(s)).sort((a, c) => a.name.localeCompare(c.name)))
			{ const k = b.category ?? 'other'; by.set(k, [...(by.get(k) ?? []), b]) }
		return [...by].sort((a, c) => a[0].localeCompare(c[0])).map(([cat, bs]) => ({ cat, rows: bs.map((b) => ({ b, ...(b.shapes.length ? blockPreview(b) : { prims: [], viewBox: '-1 -1 2 2' }) })) }))
	})
	const picked = $derived(ws.toolId === 'insert' ? ws.insertBlock?.id : undefined)
	/** Drag a block onto a plan, an elevation / section or a sheet (backlog "Blocks: drag to place"): over the view it
	 *  arms Insert (the ghost follows), the drop places it; then the tool you had comes back. */
	function dragBlock(e: DragEvent, b: Block) {
		const had = ws.insertBlock
		ws.startDrag(() => { ws.insertBlock = b; ws.toolId = 'insert' }, () => { ws.insertBlock = had }, 'insert')
		e.dataTransfer?.setData('application/x-cad-block', b.id)
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy'
	}
	function retire(b: Block) {
		ws.ask2(`Delete block ${b.name} from the library (every project)? What's already drawn keeps it. This can't be undone.`, 'Delete block', () => project.retireBlock(b.id))
	}
</script>

<SideSection key="blocks" title="Blocks">
	<div class="tabs">
		<button class:on={!here} onclick={() => (here = false)}>Library</button>
		<button class:on={here} disabled={!levelId} title="Only the blocks used on this level, with counts" onclick={() => (here = true)}>On this level ({used.size})</button>
	</div>
	<input class="find" placeholder="Search blocks" bind:value={q} />
	{#each groups as g (g.cat)}
		<p class="cat">{g.cat}</p>
		{#each g.rows as r (r.b.id)}
			<div class="row" class:here class:on={picked === r.b.id}>
				<button class="pick" title="Place {r.b.name}: click, then click where it goes — or drag it onto the drawing{picked === r.b.id ? ' (click again to stop)' : ''}" disabled={!project.blockOf(r.b.id)} onclick={() => onpick(picked === r.b.id ? null : r.b)}
					draggable={!!project.blockOf(r.b.id)} ondragstart={(e) => dragBlock(e, r.b)} ondragend={() => ws.endDrag()}>
					<svg class="pv" viewBox={r.viewBox}><Prims prims={r.prims} selected={new Set()} /></svg>
					<span class="nm">{r.b.name}</span>
				</button>
				{#if here}<span class="ct">{used.get(r.b.id)}</span>{/if}
				{#if !r.b.builtin && project.blockOf(r.b.id) && !r.b.retired}<button class="del" title="Delete this block from the library" onclick={() => retire(r.b)}>✕</button>{:else}<span></span>{/if}
			</div>
		{/each}
	{:else}
		<p class="none">{here ? 'No blocks on this level' : 'No blocks match'}</p>
	{/each}
</SideSection>

<style>
	.tabs { display: flex; gap: 2px; margin: 0 4px 4px; font-size: 11px; }
	.tabs button { flex: 1; border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 4px; color: var(--cad-muted); }
	.tabs button.on { background: #2563eb; border-color: #2563eb; color: white; }
	.find { width: calc(100% - 8px); margin: 0 4px 4px; border: 1px solid var(--cad-line); border-radius: 4px; padding: 1px 4px; font-size: 12px; background: var(--cad-input); color: var(--cad-text); }
	.cat { padding: 2px 4px 0; font-size: 10px; color: var(--cad-faint); text-transform: capitalize; }
	.row { display: grid; grid-template-columns: 1fr 0.8rem; align-items: center; gap: 0.3rem; padding: 0 4px; border-radius: 4px; }
	.row.here { grid-template-columns: 1fr auto 0.8rem; }
	.row:hover { background: var(--cad-hover); }
	.row.on { background: #dbeafe; }
	.pick { display: grid; grid-template-columns: 1.4rem 1fr; align-items: center; gap: 0.35rem; text-align: left; font-size: 12px; padding: 1px 0; min-width: 0; }
	.pv { width: 1.3rem; height: 1.3rem; }
	.nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.ct { font-size: 11px; color: var(--cad-faint); }
	.del { visibility: hidden; font-size: 10px; color: var(--cad-faint); }
	.row:hover .del { visibility: visible; }
	.del:hover { color: #dc2626; }
	.none { padding: 2px 4px; font-size: 11px; color: var(--cad-faint); }
</style>
