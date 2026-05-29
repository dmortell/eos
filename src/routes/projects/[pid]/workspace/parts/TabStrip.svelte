<script lang="ts">
	import { Icon } from '$lib'
	import { getWorkspace } from '../state.svelte'

	const ws = getWorkspace()
</script>

<div class="flex items-stretch border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-900/50 text-xs overflow-x-auto">
	{#each ws.tabs as tab (tab.id)}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="group flex items-center gap-1.5 pl-3 pr-1 py-1 border-r border-zinc-200 dark:border-zinc-800 cursor-pointer min-w-0 max-w-[200px]
				{ws.activeTabId === tab.id
					? 'bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 border-b-2 border-b-blue-500 -mb-px'
					: 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/50 dark:hover:bg-zinc-950/50'}"
			onclick={() => ws.switchTab(tab.id)}
			onauxclick={(e) => {
				if (e.button === 1) {
					e.preventDefault()
					ws.closeTab(tab.id)
				}
			}}
			title={tab.selectedNodeId ?? 'Untitled'}
		>
			<span class="truncate flex-1 select-none">{tab.title || 'Untitled'}</span>
			<button
				class="rounded p-0.5 opacity-40 hover:opacity-100 hover:bg-zinc-200 dark:hover:bg-zinc-800"
				onclick={(e) => {
					e.stopPropagation()
					ws.closeTab(tab.id)
				}}
				aria-label="Close tab"
				title="Close tab"
			>
				<Icon name="close" size={10} />
			</button>
		</div>
	{/each}

	<button
		class="flex items-center gap-1 px-2 py-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
		onclick={() => ws.openTab()}
		title="New tab (duplicates current selection)"
	>
		<Icon name="plus" size={12} />
	</button>
</div>
