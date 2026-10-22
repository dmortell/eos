<!-- "Cables (n)" (backlog "Backbone cable list"): the project's backbone and tie cables, one row per panel pair and
     cable type — its color, "n × type" and "1F → 4F (2 transit)". A click selects its links (their routes light up
     on the plan; Ctrl adds to the selection). -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import { cableGroups } from '../domain/cableList'
	import SideSection from './SideSection.svelte'

	let { project, ws }: { project: CadProject; ws: Workspace } = $props()

	const groups = $derived(cableGroups(project.index))
	const on = $derived(new Set(ws.selection))
</script>

{#if groups.length}
	<SideSection key="cables" title={`Cables (${groups.length})`}>
		{#each groups as g (g.key)}
			{@const picked = g.links.every((id) => on.has(id))}
			<button class="row" class:picked title={`${g.a}\n→ ${g.b}\nClick: select its ${g.links.length} links (Ctrl adds)`}
				onclick={(e) => ws.select(e.ctrlKey || e.metaKey ? [...new Set([...ws.selection, ...g.links])] : g.links)}>
				<span class="sw" style:background={g.colour}></span>
				<span class="min-w-0">
					<span class="block truncate">{g.cables} × {g.type || 'cable'}{g.cables !== g.links.length ? ` · ${g.cores} cores` : ''}{g.kind === 'tie' ? ' · tie' : ''}</span>
					<span class="block truncate text-zinc-500">{g.floors} · {g.a.split(' · ').at(-1)} → {g.b.split(' · ').at(-1)}</span>
				</span>
			</button>
		{/each}
	</SideSection>
{:else}
	<p class="empty">No backbone or tie cables yet — link panels in a rack view (select ports, then L) and they're listed here.</p>
{/if}

<style>
	.empty { padding: 0.5rem; font-size: 11px; color: var(--cad-muted); }
	.row { display: grid; grid-template-columns: 0.7rem 1fr; align-items: center; gap: 0.4rem; width: 100%; padding: 2px 4px; border-radius: 4px; font-size: 12px; text-align: left; line-height: 1.25; }
	.row:hover { background: var(--cad-hover); }
	.row.picked { background: var(--cad-sel, #dbeafe); }
	.sw { width: 0.7rem; height: 0.7rem; border-radius: 2px; border: 1px solid rgb(0 0 0 / 0.2); }
</style>
