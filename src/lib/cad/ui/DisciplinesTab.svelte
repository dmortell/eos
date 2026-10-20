<!-- Settings › SHEETS: the DISCIPLINE list (User D2: "a fixed list" — one GLOBAL list, every project, beside the
     sheet categories). Sheets pick their Discipline from it; a value typed on a sheet before (or removed from the list)
     still shows on that sheet, flagged, until changed — and can be added from here. Saved straight to the global doc
     (not on this project's undo history). -->
<script lang="ts">
	import { enterKey } from './keyGuards'
	import type { CadProject } from '../app/project.svelte'

	let { project }: { project: CadProject } = $props()

	const list = $derived(project.disciplines)
	const sheets = $derived(project.index.ofType('sheet'))
	const uses = $derived.by(() => { const m = new Map<string, number>(); for (const s of sheets) if (s.discipline) m.set(s.discipline, (m.get(s.discipline) ?? 0) + 1); return m })
	const strays = $derived([...uses.keys()].filter((d) => !list.includes(d)).sort())
	let name = $state(''), busy = $state(false)
	async function save(next: string[]) {
		busy = true
		try { await project.saveDisciplines(next) } catch (e) { project.error = `Saving the disciplines failed: ${(e as Error).message}` } finally { busy = false }
	}
	function add(d = name) { const t = d.trim(); if (!t || list.includes(t)) return; void save([...list, t]); name = '' }
	const move = (d: string, by: -1 | 1) => { const i = list.indexOf(d), j = i + by; if (j < 0 || j >= list.length) return; const next = [...list]; [next[i], next[j]] = [next[j], next[i]]; void save(next) }
</script>

<p class="note">One list for <b>every project</b>: a sheet's Discipline is picked from it.</p>
<div class="chips">
	{#each list as d (d)}
		<span class="chip" title={uses.get(d) ? `${uses.get(d)} sheet(s) here` : 'No sheet here uses it'}>
			<button class="mv" disabled={busy} title="Earlier in the list" onclick={() => move(d, -1)}>‹</button>{d}{#if uses.get(d)}<span class="n">{uses.get(d)}</span>{/if}<button class="mv" disabled={busy} title="Later in the list" onclick={() => move(d, 1)}>›</button>
			<button class="del" disabled={busy} title="Stop offering it (sheets that have it keep it, flagged)" onclick={() => void save(list.filter((x) => x !== d))}>✕</button>
		</span>
	{/each}
</div>
<div class="foot">
	<input class="inp" placeholder="New discipline" bind:value={name} onkeydown={(e) => enterKey(e) && add()} />
	<button class="btn" disabled={!name.trim() || busy} onclick={() => add()}>+ Add discipline</button>
</div>
{#if strays.length}
	<p class="note">On this project's sheets, not in the list:
		{#each strays as d (d)}<button class="btn" disabled={busy} title="Add “{d}” to the list (the sheets keep it)" onclick={() => add(d)}>+ {d}</button>{/each}</p>
{/if}

<style>
	.note { padding: 4px 6px; color: var(--cad-muted); display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
	.chips { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 6px; }
	.chip { display: inline-flex; align-items: center; gap: 2px; border: 1px solid var(--cad-line); border-radius: 10px; padding: 0 4px 0 2px; }
	.n { font-size: 10px; color: var(--cad-faint); margin-left: 3px; }
	.mv, .del { padding: 0 3px; color: var(--cad-faint); }
	.mv:hover:not(:disabled) { color: #2563eb; }
	.del:hover:not(:disabled) { color: #dc2626; }
	.inp { width: 12rem; border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 4px; background: var(--cad-input); color: var(--cad-text); }
	.btn { min-height: 20px; border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 6px; background: var(--cad-input); color: var(--cad-text); }
	.btn:hover:not(:disabled) { background: var(--cad-hover); }
	.foot { display: flex; gap: 6px; align-items: center; padding: 6px; }
</style>
