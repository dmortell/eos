<!-- Settings › Files › EDIT HISTORY (design log step 4, User 2026-10-17): switch it on for the project (off by default —
     one small record per edit), see how big it has grown, delete what's older than a number of days. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import { historyCount, trimHistory } from '../app/editHistory'
	import { roughSize } from '../domain/history'

	let { project, ws }: { project: CadProject; ws: Workspace } = $props()

	const on = $derived(!!project.settings?.editHistory)
	function setOn(v: boolean) {
		const st = project.settings
		if (st) project.store.transact(v ? 'Edit history on' : 'Edit history off', (tx) => tx.put({ ...st, editHistory: v || undefined }))
		ws.say(v ? 'Edit history on — every edit from now on is kept: who, when, what (Properties › History, Project › History…)' : 'Edit history off — what is kept stays until deleted')
	}
	let count = $state<number | null>(null), err = $state(''), days = $state(365), busy = $state(false)
	const recount = () => { err = ''; historyCount(project).then((n) => (count = n), (e) => (err = (e as Error).message)) }
	$effect(() => { void project.pid; recount() })
	function trim() {
		ws.ask2(`Delete the edit history older than ${days} days? This can't be undone.`, 'Delete', async () => {
			busy = true
			try { const n = await trimHistory(project, days); ws.say(`${n} history entr${n === 1 ? 'y' : 'ies'} deleted`); recount() } catch (e) { err = (e as Error).message } finally { busy = false }
		})
	}
</script>

<!-- grid items of Settings' form (its `label { display: contents }` doesn't reach in here): a name, then its control -->
<span title="Keep who changed what, and when: one small record per edit (a drag is one), beside the project — read in an item's Properties › History and Project › History…. Off by default; switch it on after the first major release, and watch its size here.">Edit history</span>
<label class="ctl"><input type="checkbox" checked={on} onchange={(e) => setOn(e.currentTarget.checked)} /> keep one</label>
<p class="wide">
	{#if err}Couldn’t read its size: {err}{:else if count === null}Counting…{:else}{count} entr{count === 1 ? 'y' : 'ies'} kept{count ? ` (about ${roughSize(count)})` : ''}.{/if}
	<button class="btn" onclick={recount}>Recount</button>
</p>
<span title="Delete the entries older than this many days (everyone's): keeps the history from growing without end">Delete older than</span>
<span class="ctl"><input class="num" type="number" min="1" step="30" aria-label="Days" bind:value={days} /> days <button class="btn" disabled={busy || !count} onclick={trim}>Delete…</button></span>

<style>
	.ctl { display: flex; align-items: center; gap: 6px; }
	.wide { grid-column: 1 / -1; margin: 0; display: flex; align-items: center; gap: 8px; color: var(--cad-muted); }
	/* as Settings' own inputs and buttons (SettingsPanel.svelte; its styles are scoped to it) */
	.num { width: 4.5rem; border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; padding: 0 4px; background: var(--cad-input, white); color: inherit; }
	.btn { min-height: 20px; border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 6px; background: var(--cad-input); color: var(--cad-text); }
	.btn:disabled { opacity: 0.4; }
</style>
