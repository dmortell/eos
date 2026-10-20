<!-- What the legacy import said to check (kept on the settings record), grouped by kind. A note about an item that
     still exists selects it (and opens its level); the rest are plain text. Clear removes them (undoable). -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'

	let { project, ws }: { project: CadProject; ws: Workspace } = $props()

	const notes = $derived(project.settings?.importNotes)
	const groups = $derived.by(() => {
		const by = new Map<string, NonNullable<typeof notes>['notes']>()
		for (const n of notes?.notes ?? []) by.set(n.code, [...(by.get(n.code) ?? []), n])
		return [...by].sort((a, b) => b[1].length - a[1].length)
	})

	function show(id: string) {
		const e = project.index.get(id) as { levelId?: string } | undefined
		if (!e) return
		if (e.levelId && project.levels.some((l) => l.id === e.levelId)) ws.levelId = e.levelId
		ws.select([id])
	}
	/** Done with them (User 2026-10-20: they stayed in Properties for good): off the settings record, one undo step. */
	function clear() {
		const s = project.settings
		if (!s?.importNotes) return
		const { importNotes: _, ...rest } = s
		project.store.transact('Clear import notes', (tx) => tx.put(rest))
		ws.say('Import notes cleared · Undo brings them back')
	}
</script>

{#if notes?.notes.length}
	<details class="notes">
		<summary>Import notes ({notes.notes.length}) <span class="when">{new Date(notes.at).toLocaleDateString()}</span>
			<button class="clear" title="Remove these notes from the project (Undo brings them back)" onclick={(e) => { e.preventDefault(); clear() }}>Clear</button></summary>
		{#each groups as [code, list] (code)}
			<details class="group">
				<summary>{code.replace(/-/g, ' ')} <span class="n">{list.length}</span></summary>
				<ul>
					{#each list as n, i (i)}
						{@const there = !!project.index.get(n.id)}
						<li class:err={n.severity === 'error'}>
							{#if there}<button title="Select it" onclick={() => show(n.id)}>{n.message}</button>{:else}{n.message}{/if}
						</li>
					{/each}
				</ul>
			</details>
		{/each}
	</details>
{/if}

<style>
	.notes { border-top: 1px solid var(--cad-line); padding: 6px 12px; font-size: 11px; color: var(--cad-muted); }
	.notes > summary { cursor: pointer; font-weight: 600; }
	.when { font-weight: 400; color: var(--cad-faint); }
	.clear { float: right; font-weight: 400; color: var(--cad-link); }
	.clear:hover { text-decoration: underline; }
	.group summary { cursor: pointer; margin-top: 4px; }
	.n { color: var(--cad-faint); }
	ul { margin: 2px 0 0 10px; padding: 0; list-style: disc; max-height: 14rem; overflow: auto; }
	li { margin: 1px 0; }
	li.err { color: #b91c1c; }
	li button { text-align: left; color: var(--cad-link); }
	li button:hover { text-decoration: underline; }
</style>
