<!-- "Sections (n)" (backlog "List of all sections", Dave 2026-10-05): every section cut in the project, by level. A click
     opens it in the active pane (going to its level) and selects it, so Properties can put it on a sheet as a viewport;
     the count says how many viewports already show it. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { SectionCut } from '../domain/drawing'
	import type { ViewSpec } from '../views/space'
	import { sectionViewports } from '../editor/commands'
	import { naturalCompare } from '../domain/labels'
	import SideSection from './SideSection.svelte'

	let { project, ws, onview }: { project: CadProject; ws: Workspace; onview: (s: ViewSpec) => void } = $props()

	const rows = $derived.by(() => {
		void project.rev
		const order = new Map(project.levels.map((l, i) => [l.id, i]))
		return (project.store.ofType('section') as SectionCut[])
			.map((s) => ({ s, level: project.index.nameOf(s.levelId), shown: sectionViewports(project.store, [s.id]).length }))
			.sort((a, b) => (order.get(a.s.levelId) ?? 0) - (order.get(b.s.levelId) ?? 0) || naturalCompare(a.s.name, b.s.name))
	})
	function open(s: SectionCut) {
		ws.levelId = s.levelId
		onview({ kind: 'section', sectionId: s.id })
		ws.select([s.id])
	}
</script>

{#if rows.length}
	<SideSection key="sections" title={`Sections (${rows.length})`}>
		{#each rows as r (r.s.id)}
			<button class="row" class:on={ws.selection.includes(r.s.id)} title="Open section {r.s.name} ({r.level}); Properties → Put on sheet makes a viewport of it" onclick={() => open(r.s)}>
				<span class="nm">Section {r.s.name}</span>
				<span class="meta">{r.level}{r.shown ? ` · on ${r.shown} sheet${r.shown === 1 ? '' : 's'}` : ''}</span>
			</button>
		{/each}
	</SideSection>
{/if}

<style>
	.row { display: flex; justify-content: space-between; gap: 0.5rem; width: 100%; padding: 1px 4px; border-radius: 4px; font-size: 12px; text-align: left; }
	.row:hover { background: var(--cad-hover); }
	.row.on { background: var(--cad-sel, #dbeafe); }
	.nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.meta { flex: none; font-size: 11px; color: var(--cad-faint); }
</style>
