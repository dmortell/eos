<script lang="ts">
	import { Icon } from '$lib'
	import { getWorkspace } from '../state.svelte'
	const ws = getWorkspace()
</script>

<div class="p-3 text-sm">
	<div class="flex items-center justify-between mb-2">
		<div class="text-xs font-semibold uppercase tracking-wider text-zinc-500">Properties</div>
		<button
			class="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
			onclick={() => (ws.rightPanelOpen = false)}
			aria-label="Close right panel"
		>
			<Icon name="close" size={14} />
		</button>
	</div>
	{#if ws.selectedNodeId}
		<dl class="text-xs space-y-1">
			<dt class="text-zinc-500">Node</dt>
			<dd class="font-mono break-all">{ws.selectedNodeId}</dd>
			<dt class="text-zinc-500 mt-2">Kind</dt>
			<dd>{ws.selectedNodeKind ?? '—'}</dd>
			<dt class="text-zinc-500 mt-2">View</dt>
			<dd>{ws.activeView ?? '—'}</dd>
		</dl>
	{:else}
		<div class="text-xs text-zinc-500">No selection.</div>
	{/if}
</div>
