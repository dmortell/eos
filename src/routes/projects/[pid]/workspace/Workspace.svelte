<script lang="ts">
	import { Titlebar, Icon } from '$lib'
	import type { FloorConfig } from '$lib/types/project'
	import TreeNavigator from './parts/TreeNavigator.svelte'
	import ViewStrip from './parts/ViewStrip.svelte'
	import CanvasArea from './parts/CanvasArea.svelte'
	import RightPanel from './parts/RightPanel.svelte'
	import BottomPanel from './parts/BottomPanel.svelte'
	import { getWorkspace } from './state.svelte'

	let { projectName, floors }: { projectName: string; floors: FloorConfig[] } = $props()
	const ws = getWorkspace()
</script>

<div class="h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
	<Titlebar title={projectName || 'Workspace'} />

	<div class="flex-1 grid grid-cols-[auto_1fr_auto] min-h-0">
		<aside
			class="border-r border-zinc-200 dark:border-zinc-800 overflow-y-auto bg-white dark:bg-zinc-900"
			style="width: {ws.leftPanelWidth}px"
		>
			<TreeNavigator {floors} />
		</aside>

		<main class="flex flex-col min-w-0 min-h-0">
			<ViewStrip />
			<div class="flex-1 min-h-0 relative">
				<CanvasArea />
			</div>
			{#if ws.bottomPanelOpen}
				<div
					class="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
					style="height: {ws.bottomPanelHeight}px"
				>
					<BottomPanel />
				</div>
			{/if}
			<div class="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 py-1 flex items-center gap-2 text-xs text-zinc-500">
				<button
					class="flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100"
					onclick={() => (ws.bottomPanelOpen = !ws.bottomPanelOpen)}
					title="Toggle bottom panel"
				>
					<Icon name={ws.bottomPanelOpen ? 'chevronDown' : 'chevronUp'} size={12} />
					Patch list
				</button>
				<span class="ml-auto font-mono">
					{ws.viewport.x.toFixed(0)}, {ws.viewport.y.toFixed(0)} · {ws.viewport.zoom.toFixed(2)}x
				</span>
			</div>
		</main>

		{#if ws.rightPanelOpen}
			<aside
				class="border-l border-zinc-200 dark:border-zinc-800 overflow-y-auto bg-white dark:bg-zinc-900"
				style="width: {ws.rightPanelWidth}px"
			>
				<RightPanel />
			</aside>
		{/if}
	</div>
</div>
