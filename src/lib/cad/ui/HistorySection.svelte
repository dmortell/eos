<!-- HISTORY in Properties (design log step 4): the edits that touched the selected item — when, who, what — from the
     project's edit history (shown while Settings › Files › Edit history is on). Loaded when the selection changes;
     Refresh reads it again. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Id } from '../domain/types'
	import type { HistoryEntry } from '../domain/history'
	import { historyOf } from '../app/editHistory'
	import { runToken } from '../app/runToken'
	import PropGroup from './PropGroup.svelte'

	let { project, id }: { project: CadProject; id: Id } = $props()

	let rows = $state.raw<HistoryEntry[] | null>(null), err = $state('')
	const runs = runToken()
	function load() {
		rows = null; err = ''
		const current = runs.start()
		historyOf(project, id).then((r) => { if (current()) rows = r }, (e) => { if (current()) err = (e as Error).message })
	}
	$effect(() => { void id; load(); return () => runs.cancel() })
	const when = (at: number) => new Date(at).toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
</script>

<PropGroup kind="item" title="History" id="history">
	{#if err}<p class="muted">Couldn’t read the history: {err}</p>
	{:else if !rows}<p class="muted">Loading…</p>
	{:else if !rows.length}<p class="muted">No edits recorded for it — the history keeps edits made since it was switched on.</p>
	{:else}
		{#each rows as r, i (i)}
			<div class="h" title="{r.label}{r.n > 1 ? ` (${r.n} things in that edit)` : ''}"><span class="t">{when(r.at)}</span><span class="w">{r.by.name || r.by.uid}</span><span class="l">{r.label}</span></div>
		{/each}
	{/if}
	<div class="acts"><button class="btn" onclick={load}>Refresh</button></div>
</PropGroup>

<style>
	.h { display: grid; grid-template-columns: 7.2rem 4.5rem 1fr; gap: 4px; font-size: 11px; line-height: 1.5; }
	.t, .w { color: var(--cad-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.l { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.acts { display: flex; gap: 4px; margin-top: 4px; }
</style>
