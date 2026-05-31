<script lang="ts">
	import { getWorkspace, viewsFor } from '../state.svelte'

	const ws = getWorkspace()
	const views = $derived(viewsFor(ws.selectedNodeKind))

	// When the selected node only exposes a single view, the strip is just
	// chrome — the active tab title already names the view. Hide it so we
	// don't stack a redundant bar above the canvas (matters most for Risers
	// and Frames, which each have one view + their own internal toolbar).
	const showStrip = $derived(!!ws.selectedNodeId && views.length > 1)
</script>

{#if showStrip}
	<div
		class="flex items-center gap-1 px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm min-h-9"
	>
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
	</div>
{/if}
