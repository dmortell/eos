<!-- What the legacy import said to check (kept on the settings record), grouped by kind. A note about an item that
     still exists selects it (and opens its level); the rest are plain text. -->
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
</script>

{#if notes?.notes.length}
	<details class="notes">
		<summary>Import notes ({notes.notes.length}) <span class="when">{new Date(notes.at).toLocaleDateString()}</span></summary>
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
	.notes { border-top: 1px solid #e4e4e7; padding: 6px 12px; font-size: 11px; color: #52525b; }
	.notes > summary { cursor: pointer; font-weight: 600; }
	.when { font-weight: 400; color: #a1a1aa; }
	.group summary { cursor: pointer; margin-top: 4px; }
	.n { color: #a1a1aa; }
	ul { margin: 2px 0 0 10px; padding: 0; list-style: disc; max-height: 14rem; overflow: auto; }
	li { margin: 1px 0; }
	li.err { color: #b91c1c; }
	li button { text-align: left; color: #1d4ed8; }
	li button:hover { text-decoration: underline; }
</style>
