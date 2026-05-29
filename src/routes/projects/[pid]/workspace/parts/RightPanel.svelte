<script lang="ts">
	import { Icon } from '$lib'
	import { getWorkspace } from '../state.svelte'
	import InspectorProperties from './InspectorProperties.svelte'
	import InspectorLibrary from './InspectorLibrary.svelte'

	const ws = getWorkspace()
</script>

{#if !ws}
	<div class="p-3 text-xs text-zinc-400">Workspace context not initialised.</div>
{:else}
	<div class="h-full flex flex-col">
		<div class="flex items-center border-b border-zinc-200 dark:border-zinc-800 px-2">
			<button
				class="px-3 py-1.5 text-xs border-b-2 -mb-px transition-colors {ws.rightPanelTab === 'properties'
					? 'border-blue-500 text-blue-700 dark:text-blue-300'
					: 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'}"
				onclick={() => (ws.rightPanelTab = 'properties')}
			>Properties</button>
			<button
				class="px-3 py-1.5 text-xs border-b-2 -mb-px transition-colors {ws.rightPanelTab === 'library'
					? 'border-blue-500 text-blue-700 dark:text-blue-300'
					: 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'}"
				onclick={() => (ws.rightPanelTab = 'library')}
			>Library</button>
			<div class="flex-1"></div>
			<button
				class="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 p-1"
				onclick={() => (ws.rightPanelOpen = false)}
				aria-label="Close right panel"
				title="Close right panel"
			>
				<Icon name="close" size={14} />
			</button>
		</div>

		<div class="flex-1 min-h-0 overflow-y-auto p-3">
			{#if ws.rightPanelTab === 'properties'}
				<InspectorProperties />
			{:else}
				<InspectorLibrary />
			{/if}
		</div>
	</div>
{/if}
