<!-- Properties with NOTHING SELECTED: the active view's basics — a sheet's number, title and paper (Select sheet for
     all of it), the riser view's floor range (a project setting: everyone's riser view and its viewports), or the
     level's name and heights (Floors… edits them). -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { ViewSpec } from '../views/space'
	import { withRiserEnd } from '../views/riser'
	import { floorsWithoutLevel } from '../domain/floors'
	import PropGroup from './PropGroup.svelte'
	import Field from './fields/Field.svelte'

	let { project, ws, current, onfloors }: { project: CadProject; ws: Workspace; current?: { levelId?: string; spec: ViewSpec }; onfloors?: () => void } = $props()

	/** The floors a riser range can start / end at (area plans share their floor), lowest first. */
	// every floor of the building, a model or not (User 2026-10-17: with 20 floors shown, the range offered only 1F–3F)
	const floorsUp = $derived.by(() => {
		const all = [...project.levels.filter((l) => !l.area), ...project.index.ofType('building').flatMap((b) => floorsWithoutLevel(project.levels, b))]
		return [...new Map(all.map((l) => [l.number, l])).values()].sort((a, b) => a.number - b.number)
	})
	const range = $derived(project.settings?.riser)
	function setRiserEnd(end: 'from' | 'to', v: string) {
		const st = project.settings
		if (!st) return
		const n = v === '' ? null : Number(v)
		const what = n === null ? (end === 'from' ? 'the lowest floor' : 'the top floor') : floorsUp.find((l) => l.number === n)?.name ?? v
		project.store.transact(`Riser view ${end} ${what} (for everyone)`, (tx) => tx.put({ ...st, riser: withRiserEnd(st.riser, end, n) }))
	}

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
		<div class="acts"><button class="btn" title="Its Properties: number, title, category, paper, viewports, changes, revisions" onclick={() => ws.select([sheet.id])}>Select sheet</button>
			<button class="btn" title="Release this sheet: the Sheets table opens with the release form for it" onclick={() => { ws.select([sheet.id]); ws.releaseSheets() }}>Release…</button></div>
	</PropGroup>
{:else if current?.spec.kind === 'riser'}
	<PropGroup kind="view" title="Riser view">
		<Field label="Floors" title="The floors the riser view shows — a project setting: everyone's riser view and its sheet viewports show the same">
			<span class="range">
				<select class="inp" aria-label="Riser view from floor" value={range?.from ?? ''} onchange={(e) => setRiserEnd('from', e.currentTarget.value)}><option value="">lowest</option>{#each floorsUp as l (l.id)}<option value={l.number}>{l.name}</option>{/each}</select>
				–
				<select class="inp" aria-label="Riser view to floor" value={range?.to ?? ''} onchange={(e) => setRiserEnd('to', e.currentTarget.value)}><option value="">top</option>{#each floorsUp as l (l.id)}<option value={l.number}>{l.name}</option>{/each}</select>
			</span></Field>
		<p class="muted">For everyone on this project (sheets too). Hiding empty floors is this view’s own: Display ▾.</p>
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
	.range { display: inline-flex; align-items: center; gap: 4px; }
	/* each wide enough for "lowest" (Round 8: 53 px cut it to "lowe") */
	.range .inp { width: auto; min-width: 4.5rem; flex: 1; }
</style>
