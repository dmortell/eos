<script lang="ts">
	import { getWorkspace } from '../state.svelte'
	const ws = getWorkspace()
</script>

<div class="p-3 text-sm h-full overflow-auto">
	<div class="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Patch list</div>
	<div class="text-xs text-zinc-500">
		Live patch list will render here once the Frames+Patching merge lands (plan items 4–5, 7).
		{#if ws.selectedNodeId}
			Selection context: <span class="font-mono">{ws.selectedNodeId}</span>
		{/if}
	</div>
</div>
