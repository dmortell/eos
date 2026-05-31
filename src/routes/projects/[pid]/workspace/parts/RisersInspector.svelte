<script lang="ts">
	import RisersSidebar from '../../risers/parts/RisersSidebar.svelte'
	import { risersBridge as bridge } from '../risersBridge.svelte'

	// `risersBridge` is a module-scope $state object populated by RisersView
	// (and written to reactively by the bare Risers instance). Reading it
	// here gives us live state + callbacks.
</script>

{#if !bridge.mounted || !bridge.selectCable}
	<div class="p-3 text-xs text-zinc-400">Waiting for Risers to mount…</div>
{:else}
	<div class="risers-inspector">
		<RisersSidebar
			selection={bridge.selection}
			cables={bridge.cables ?? []}
			rooms={bridge.rooms ?? []}
			ladders={bridge.ladders ?? []}
			labels={bridge.labels ?? []}
			onUpdateCable={(id, patch) => bridge.updateCable?.(id, patch)}
			onDeleteCable={(id) => bridge.deleteCable?.(id)}
			onUpdateRoom={(id, patch) => bridge.updateRoom?.(id, patch)}
			onUpdateLadder={(id, patch) => bridge.updateLadder?.(id, patch)}
			onUpdateLabel={(id, patch) => bridge.updateLabel?.(id, patch)}
			onDeleteLabel={(id) => bridge.deleteLabel?.(id)}
			onDeleteSelected={() => bridge.deleteSelected?.()}
			onSelectCable={(id) => bridge.selectCable?.(id)}
			onStartNewCable={() => bridge.startNewCable?.()}
		/>
	</div>
{/if}

<style>
	/* The extracted RisersSidebar styles itself as a 320px aside with its own
	 * left border. Override to fit the workspace right panel column instead. */
	:global(.risers-inspector .sidebar) {
		width: 100% !important;
		border-left: none !important;
		height: 100%;
	}
</style>
