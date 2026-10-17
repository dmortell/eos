<!-- Project › HISTORY… (design log step 4): the project's latest edits — when, who, what — newest first, with Find and
     a person filter; a click selects what that edit touched (what's still there). Off: says how to switch it on. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { HistoryEntry } from '../domain/history'
	import { recentHistory, forChange } from '../app/editHistory'
	import CadDialog from './CadDialog.svelte'

	let { project, ws, onclose }: { project: CadProject; ws: Workspace; onclose: () => void } = $props()

	let rows = $state.raw<HistoryEntry[] | null>(null), err = $state(''), q = $state(''), who = $state('')
	$effect(() => { void project.pid; recentHistory(project).then((r) => (rows = r), (e) => (err = (e as Error).message)) })
	const people = $derived([...new Set((rows ?? []).map((r) => r.by.name || r.by.uid))].sort())
	const shown = $derived((rows ?? []).filter((r) => (!who || (r.by.name || r.by.uid) === who) && (!q.trim() || r.label.toLowerCase().includes(q.trim().toLowerCase()))))
	const when = (at: number) => new Date(at).toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
	function pick(r: HistoryEntry) {
		const ids = r.ids.filter((id) => project.index.get(id))
		if (ids.length) ws.selectAndReveal(ids)
		else ws.say('What that edit touched isn’t there any more')
	}
</script>

<CadDialog title="History" width="44rem" top="12vh" {onclose}>
	{#if !project.settings?.editHistory}<p class="note">The edit history is off for this project — switch it on in Project › Settings… › Files. What was kept before stays listed.</p>{/if}
	<div class="bar">
		<input class="inp" bind:value={q} placeholder="Find in what was done…" aria-label="Find" />
		<select class="inp" bind:value={who} aria-label="Who"><option value="">everyone</option>{#each people as p (p)}<option value={p}>{p}</option>{/each}</select>
		<span class="muted">{rows ? `${shown.length} of the latest ${rows.length}` : ''}</span>
	</div>
	<div class="list">
		{#if err}<p class="muted">Couldn’t read the history: {err}</p>
		{:else if !rows}<p class="muted">Loading…</p>
		{:else if !shown.length}<p class="muted">{rows.length ? 'Nothing matches.' : 'No edits recorded yet.'}</p>
		{:else}
			{#each shown as r, i (i)}
				<button class="h" title="Select what it touched{r.n > r.ids.length ? ` (the first ${r.ids.length} of ${r.n})` : ''}" onclick={() => pick(r)}><span class="t">{when(r.at)}</span><span class="w">{r.by.name || r.by.uid}</span><span class="l">{r.label}{forChange(project, r)}</span><span class="n">{r.n > 1 ? r.n : ''}</span></button>
			{/each}
		{/if}
	</div>
</CadDialog>

<style>
	.note { margin: 0 0 8px; font-size: 12px; color: var(--cad-muted); }
	.bar { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
	.bar input { flex: 1; }
	.list { max-height: 60vh; overflow: auto; }
	.h { display: grid; grid-template-columns: 8.5rem 7rem 1fr 2.5rem; gap: 6px; width: 100%; text-align: left; font-size: 12px; padding: 2px 4px; border-radius: 4px; }
	.h:hover { background: var(--cad-hover); }
	.t, .w, .n { color: var(--cad-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.n { text-align: right; }
	.l { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.muted { color: var(--cad-muted); font-size: 12px; }
</style>
