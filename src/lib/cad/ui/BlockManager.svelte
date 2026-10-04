<!-- The BLOCKS panel (block manager): the global block library by category, with search and previews. Click a block to
     place it with the Insert tool — on the plan, or on a wall in an elevation / section (at the clicked height); click it
     again (or Esc) to stop. Your own blocks can be deleted from the library (drawings that use them keep them). -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Block } from '../domain/blocks'
	import { blockPreview } from '../views/blocks'
	import Prims from './Prims.svelte'
	import SideSection from './SideSection.svelte'

	let { project, ws, onpick }: { project: CadProject; ws: Workspace; onpick: (b: Block | null) => void } = $props()

	let q = $state('')
	const groups = $derived.by(() => {
		const s = q.trim().toLowerCase()
		const list = [...project.blocks.values()].filter((b) => !b.retired && (!s || b.name.toLowerCase().includes(s) || (b.category ?? '').toLowerCase().includes(s)))
		const by = new Map<string, Block[]>()
		for (const b of list.sort((a, c) => a.name.localeCompare(c.name))) { const k = b.category ?? 'other'; by.set(k, [...(by.get(k) ?? []), b]) }
		return [...by].sort((a, c) => a[0].localeCompare(c[0])).map(([cat, bs]) => ({ cat, rows: bs.map((b) => ({ b, ...blockPreview(b) })) }))
	})
	const picked = $derived(ws.toolId === 'insert' ? ws.insertBlock?.id : undefined)
	function retire(b: Block) {
		ws.ask2(`Delete block ${b.name} from the library (every project)? What's already drawn keeps it. This can't be undone.`, 'Delete block', () => project.retireBlock(b.id))
	}
</script>

<SideSection key="blocks" title="Blocks">
	<input class="find" placeholder="Search blocks" bind:value={q} />
	{#each groups as g (g.cat)}
		<p class="cat">{g.cat}</p>
		{#each g.rows as r (r.b.id)}
			<div class="row" class:on={picked === r.b.id}>
				<button class="pick" title="Place {r.b.name}{picked === r.b.id ? ' (click again to stop)' : ''}" onclick={() => onpick(picked === r.b.id ? null : r.b)}>
					<svg class="pv" viewBox={r.viewBox}><Prims prims={r.prims} selected={new Set()} /></svg>
					<span class="nm">{r.b.name}</span>
				</button>
				{#if !r.b.builtin}<button class="del" title="Delete this block from the library" onclick={() => retire(r.b)}>✕</button>{:else}<span></span>{/if}
			</div>
		{/each}
	{:else}
		<p class="none">No blocks match</p>
	{/each}
</SideSection>

<style>
	.find { width: calc(100% - 8px); margin: 0 4px 4px; border: 1px solid var(--cad-line); border-radius: 4px; padding: 1px 4px; font-size: 12px; background: var(--cad-input); color: var(--cad-text); }
	.cat { padding: 2px 4px 0; font-size: 10px; color: var(--cad-faint); text-transform: capitalize; }
	.row { display: grid; grid-template-columns: 1fr 0.8rem; align-items: center; padding: 0 4px; border-radius: 4px; }
	.row:hover { background: var(--cad-hover); }
	.row.on { background: #dbeafe; }
	.pick { display: grid; grid-template-columns: 1.4rem 1fr; align-items: center; gap: 0.35rem; text-align: left; font-size: 12px; padding: 1px 0; min-width: 0; }
	.pv { width: 1.3rem; height: 1.3rem; }
	.nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.del { visibility: hidden; font-size: 10px; color: var(--cad-faint); }
	.row:hover .del { visibility: visible; }
	.del:hover { color: #dc2626; }
	.none { padding: 2px 4px; font-size: 11px; color: var(--cad-faint); }
</style>
