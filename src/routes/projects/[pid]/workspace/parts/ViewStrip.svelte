<script lang="ts">
	import { getWorkspace, viewsFor } from '../state.svelte'

	const ws = getWorkspace()
	const views = $derived(viewsFor(ws.selectedNodeKind))
</script>

<div
	class="flex items-center gap-1 px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm min-h-9"
>
	{#if !ws.selectedNodeId}
		<span class="text-xs text-zinc-500">Select a node in the navigator.</span>
	{:else if views.length === 0}
		<span class="text-xs text-zinc-500">No views for this node.</span>
	{:else}
		{#each views as view (view.id)}
			<button
				class="px-2 py-1 rounded text-xs {ws.activeView === view.id
					? 'bg-blue-500 text-white'
					: 'hover:bg-zinc-100 dark:hover:bg-zinc-800'}"
				onclick={() => (ws.activeView = view.id)}
			>
				{view.label}
			</button>
		{/each}
	{/if}
</div>
