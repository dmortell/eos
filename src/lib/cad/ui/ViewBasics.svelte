<!-- Properties with NOTHING SELECTED: the active view's basics — a sheet's number, title and paper (Select sheet for
     all of it), or the level's name and heights (Floors… edits them). -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { ViewSpec } from '../views/space'
	import PropGroup from './PropGroup.svelte'

	let { project, ws, current, onfloors }: { project: CadProject; ws: Workspace; current?: { levelId?: string; spec: ViewSpec }; onfloors?: () => void } = $props()

	const sheet = $derived.by(() => { const s = current?.spec; const e = s?.kind === 'sheet' ? project.index.get(s.sheetId) : undefined; return e?.type === 'sheet' ? e : undefined })
	const level = $derived.by(() => { const e = project.index.get(current?.levelId ?? ws.levelId ?? ''); return e?.type === 'level' ? e : undefined })
	const mm = (v: number) => `${Math.round(v).toLocaleString('en').replace(/,/g, ' ')} mm`
</script>

<p class="muted">Nothing selected.</p>
{#if sheet}
	<PropGroup kind="view" title="This sheet">
		<div class="kv">
			<span>Sheet</span><span>{sheet.number} {sheet.title}</span>
			<span>Paper</span><span>{sheet.paper.size} {sheet.paper.orientation} · margin {sheet.paper.marginMm} mm</span>
			<span>Viewports</span><span>{sheet.viewports.length}</span>
		</div>
		<div class="acts"><button class="btn" title="Its Properties: number, title, category, paper, viewports, changes, revisions" onclick={() => ws.select([sheet.id])}>Select sheet</button></div>
	</PropGroup>
{:else if level}
	<PropGroup kind="view" title="This level">
		<div class="kv" title="Heights above its FFL (finished floor)">
			<span>Level</span><span>{level.name}</span>
			<span>FFL</span><span>{mm(level.elevationMm)} above the datum</span>
			<span>Raised floor</span><span>{mm(level.heights.raisedFloorMm)}</span>
			<span>Ceiling</span><span>{mm(level.heights.clearHeightMm)}</span>
			<span>Plenum</span><span>{mm(level.heights.plenumMm)}</span>
			<span>Slab</span><span>{mm(level.heights.slabMm)}</span>
		</div>
		{#if onfloors}<div class="acts"><button class="btn" title="The project's floors and their heights (Floor manager)" onclick={onfloors}>Floors…</button></div>{/if}
	</PropGroup>
{/if}

<style>
	.kv { display: grid; grid-template-columns: 6.5rem minmax(0, 1fr); gap: 1px 0.25rem; }
	.kv span:nth-child(odd) { color: var(--cad-muted); }
</style>
