<!-- Settings › SHEETS: the sheet CATEGORY list (sheets-organising slice 2; User D1: one GLOBAL list, every project).
     Label, the number prefix "Renumber group" offers (code), order (▲ ▼), how many of THIS project's sheets use it.
     Delete only hides it (retired: other projects may use it — it still names their sheets, it isn't offered any more);
     Restore brings it back. Typed categories found on this project's sheets can be added. Saved straight to the global
     doc (not on this project's undo history). -->
<script lang="ts">
	import { enterKey } from './keyGuards'
	import type { CadProject } from '../app/project.svelte'
	import type { Sheet } from '../domain/drawing'
	import { ordered, addCategory, moveCategory, strayKinds, categoryOf, type SheetCategory } from '../domain/sheetCategories'

	let { project }: { project: CadProject } = $props()

	const list = $derived(project.sheetCategories)
	const sheets = $derived(project.index.ofType('sheet'))
	const uses = $derived.by(() => { const m = new Map<string, number>(); for (const s of sheets) { if (!s.kind) continue; const id = categoryOf(s, list).id; m.set(id, (m.get(id) ?? 0) + 1) } return m })
	const strays = $derived(strayKinds(sheets, list))
	let label = $state(''), code = $state('')
	let busy = $state(false)
	async function save(next: SheetCategory[]) {
		busy = true
		try { await project.saveSheetCategories(next) } catch (e) { project.error = `Saving the categories failed: ${(e as Error).message}` } finally { busy = false }
	}
	const set = (id: string, patch: Partial<SheetCategory>) => save(list.map((c) => (c.id === id ? { ...c, ...patch } : c)))
	function add(l = label, c = code) { if (!l.trim()) return; save(addCategory(list, l, c)); label = ''; code = '' }
</script>

<p class="note">One list for <b>every project</b>. A sheet with no category of its own gets one from its viewports.</p>
<table>
	<thead><tr><th>Category</th><th title="The number prefix Renumber offers for this category's sheets">Code</th><th>Order</th><th title="Sheets in this project set to it">Here</th><th></th></tr></thead>
	<tbody>
		{#each ordered(list, true) as c (c.id)}
			<tr class:retired={c.retired}>
				<td><input class="lbl" value={c.label} disabled={busy} onchange={(e) => e.currentTarget.value.trim() && set(c.id, { label: e.currentTarget.value.trim() })} /></td>
				<td><input class="code" value={c.code ?? ''} placeholder="—" disabled={busy} onchange={(e) => set(c.id, { code: e.currentTarget.value.trim() || undefined })} /></td>
				<td class="whitespace-nowrap"><button class="mv" disabled={busy} onclick={() => save(moveCategory(list, c.id, -1))}>▲</button><button class="mv" disabled={busy} onclick={() => save(moveCategory(list, c.id, 1))}>▼</button></td>
				<td class="text-zinc-500">{uses.get(c.id) ?? '—'}</td>
				<td>{#if c.retired}<button class="btn" disabled={busy} title="Offer it again" onclick={() => set(c.id, { retired: undefined })}>Restore</button>
					{:else}<button class="del" disabled={busy} title="Stop offering it (sheets that use it — here or in other projects — keep it)" onclick={() => set(c.id, { retired: true })}>✕</button>{/if}</td>
			</tr>
		{/each}
	</tbody>
</table>
<div class="foot">
	<input class="lbl2" placeholder="New category" bind:value={label} onkeydown={(e) => enterKey(e) && add()} />
	<input class="code" placeholder="Code" bind:value={code} onkeydown={(e) => enterKey(e) && add()} />
	<button class="btn" disabled={!label.trim() || busy} onclick={() => add()}>+ Add category</button>
</div>
{#if strays.length}
	<p class="note">Typed on this project's sheets, not in the list:
		{#each strays as k (k)}<button class="btn" disabled={busy} title="Add “{k}” to the list (the sheets keep it)" onclick={() => add(k, '')}>+ {k}</button>{/each}</p>
{/if}

<style>
	table { width: 100%; border-collapse: collapse; }
	th { text-align: left; font-weight: 600; color: var(--cad-muted); padding: 2px 6px; }
	td { padding: 1px 6px; }
	tr.retired { opacity: 0.5; }
	.note { padding: 4px 6px; color: var(--cad-muted); display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
	.lbl, .lbl2 { width: 100%; border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 4px; background: var(--cad-input); color: var(--cad-text); }
	.lbl2 { width: 12rem; }
	.code { width: 4rem; border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 4px; background: var(--cad-input); color: var(--cad-text); font-family: ui-monospace, monospace; }
	.mv { padding: 0 4px; color: var(--cad-muted); }
	.mv:hover:not(:disabled) { color: #2563eb; }
	.del { color: var(--cad-faint); padding: 0 4px; }
	.del:hover:not(:disabled) { color: #dc2626; }
	.btn { min-height: 20px; border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 6px; background: var(--cad-input); color: var(--cad-text); }
	.btn:hover:not(:disabled) { background: var(--cad-hover); }
	.foot { display: flex; gap: 6px; align-items: center; padding: 6px; }
</style>
