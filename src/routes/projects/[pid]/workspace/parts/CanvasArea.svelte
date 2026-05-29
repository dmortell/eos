<script lang="ts">
	import { getWorkspace } from '../state.svelte'
	const ws = getWorkspace()
</script>

<div class="absolute inset-0 grid place-items-center text-zinc-400 dark:text-zinc-600 text-sm">
	{#if !ws.selectedNodeId}
		<div class="text-center">
			<div class="text-base mb-1">Workspace</div>
			<div class="text-xs">Select a node in the navigator to begin.</div>
		</div>
	{:else if !ws.activeView}
		<div class="text-center">
			<div class="text-xs font-mono">{ws.selectedNodeId}</div>
			<div class="text-xs mt-1">No view available for this selection.</div>
		</div>
	{:else}
		<div class="text-center">
			<div class="text-base mb-1">Canvas — {ws.activeView}</div>
			<div class="text-xs font-mono">{ws.selectedNodeId}</div>
			<div class="text-xs mt-2 text-zinc-400">Tool components mount here in later PRs.</div>
		</div>
	{/if}
</div>
