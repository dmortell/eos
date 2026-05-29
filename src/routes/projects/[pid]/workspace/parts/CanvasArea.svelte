<script lang="ts">
	import { getWorkspace } from '../state.svelte'
	import RackElevationView from './RackElevationView.svelte'
	const ws = getWorkspace()

	/** Views that render a rack elevation (the `RackElevation` component). Rack
	 *  kind defaults to 'elevation'; row kind uses 'row-elevation' from viewsFor. */
	const isRackElevationView = $derived(
		(ws.selectedNodeKind === 'rack' && ws.activeView === 'elevation') ||
			(ws.selectedNodeKind === 'row' && ws.activeView === 'row-elevation') ||
			(ws.selectedNodeKind === 'serverRoom' && ws.activeView === 'room-elevation'),
	)
</script>

{#if isRackElevationView}
	<RackElevationView />
{:else if !ws.selectedNodeId}
	<div class="absolute inset-0 grid place-items-center text-zinc-400 dark:text-zinc-600 text-sm">
		<div class="text-center">
			<div class="text-base mb-1">Workspace</div>
			<div class="text-xs">Select a node in the navigator to begin.</div>
		</div>
	</div>
{:else if !ws.activeView}
	<div class="absolute inset-0 grid place-items-center text-zinc-400 dark:text-zinc-600 text-sm">
		<div class="text-center">
			<div class="text-xs font-mono">{ws.selectedNodeId}</div>
			<div class="text-xs mt-1">No view available for this selection.</div>
		</div>
	</div>
{:else}
	<div class="absolute inset-0 grid place-items-center text-zinc-400 dark:text-zinc-600 text-sm">
		<div class="text-center">
			<div class="text-base mb-1">Canvas — {ws.activeView}</div>
			<div class="text-xs font-mono">{ws.selectedNodeId}</div>
			<div class="text-xs mt-2 text-zinc-400">View not yet wired into the workspace.</div>
		</div>
	</div>
{/if}
