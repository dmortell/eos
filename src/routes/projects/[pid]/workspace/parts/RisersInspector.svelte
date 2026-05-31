<script lang="ts">
	import { Button, Icon } from '$lib'
	import { fmtFloor } from '$lib/utils/floor'
	import FloorManagerDialog from '$lib/components/FloorManagerDialog.svelte'
	import RisersSidebar from '../../risers/parts/RisersSidebar.svelte'
	import { risersBridge as bridge } from '../risersBridge.svelte'

	let manageOpen = $state(false)

	const sortedFloors = $derived(
		[...(bridge.floors ?? [])].sort((a, b) => a.number - b.number).map((f) => f.number),
	)
	const lo = $derived(Math.min(bridge.fromFloor, bridge.toFloor))
	const hi = $derived(Math.max(bridge.fromFloor, bridge.toFloor))
	const rangeFloors = $derived(sortedFloors.filter((f) => f >= lo && f <= hi))

	function toggleHidden(f: number) {
		const set = new Set(bridge.hiddenFloors)
		if (set.has(f)) set.delete(f)
		else set.add(f)
		bridge.setHiddenFloors?.([...set].sort((a, b) => a - b))
	}

	function showAll() {
		bridge.setHiddenFloors?.([])
	}
</script>

{#if !bridge.mounted || !bridge.selectCable}
	<div class="p-3 text-xs text-zinc-400">Waiting for Risers to mount…</div>
{:else}
	<div class="flex flex-col h-full">
		<!-- ── Floors section ── -->
		<section class="px-3 py-3 border-b border-zinc-200 dark:border-zinc-800 space-y-2 text-xs">
			<div class="flex items-center justify-between">
				<div class="text-zinc-500 uppercase tracking-wider text-[10px] font-semibold">Floors</div>
				<button
					class="text-blue-600 hover:underline text-[10px]"
					onclick={() => (manageOpen = true)}
					title="Add / remove / rename floors in the project"
				>Manage…</button>
			</div>

			<div class="grid grid-cols-2 gap-2">
				<label class="flex flex-col gap-0.5">
					<span class="text-zinc-500 text-[10px]">From</span>
					<select
						class="h-6 text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-1"
						value={bridge.fromFloor}
						onchange={(e) => bridge.setFromFloor?.(Number((e.currentTarget as HTMLSelectElement).value))}
					>
						{#each sortedFloors as f}
							<option value={f}>{fmtFloor(f, bridge.floorFormat, bridge.floors)}</option>
						{/each}
					</select>
				</label>
				<label class="flex flex-col gap-0.5">
					<span class="text-zinc-500 text-[10px]">To</span>
					<select
						class="h-6 text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-1"
						value={bridge.toFloor}
						onchange={(e) => bridge.setToFloor?.(Number((e.currentTarget as HTMLSelectElement).value))}
					>
						{#each sortedFloors as f}
							<option value={f}>{fmtFloor(f, bridge.floorFormat, bridge.floors)}</option>
						{/each}
					</select>
				</label>
			</div>

			{#if rangeFloors.length > 0}
				<div>
					<div class="flex items-center justify-between mb-1">
						<div class="text-zinc-500 text-[10px]">Hide from elevation</div>
						{#if bridge.hiddenFloors.length > 0}
							<button class="text-blue-600 hover:underline text-[10px]" onclick={showAll}>Show all</button>
						{/if}
					</div>
					<div class="grid grid-cols-3 gap-1 max-h-40 overflow-y-auto">
						{#each rangeFloors as f}
							{@const hidden = bridge.hiddenFloors.includes(f)}
							<label class="flex items-center gap-1 text-[11px] cursor-pointer px-1 py-0.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
								<input
									type="checkbox"
									checked={hidden}
									onchange={() => toggleHidden(f)}
								/>
								<span class={hidden ? 'line-through text-zinc-400' : ''}>
									{fmtFloor(f, bridge.floorFormat, bridge.floors)}
								</span>
							</label>
						{/each}
					</div>
				</div>
			{/if}
		</section>

		<!-- ── Cable / room / ladder / label editor (RisersSidebar) ── -->
		<div class="flex-1 min-h-0 overflow-y-auto risers-inspector">
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
	</div>
{/if}

<FloorManagerDialog
	open={manageOpen}
	floors={bridge.floors ?? []}
	floorFormat={bridge.floorFormat}
	onclose={() => (manageOpen = false)}
	onupdate={(updated) => bridge.updateFloors?.(updated)}
	ondelete={(n) => bridge.deleteFloor?.(n)}
/>

<style>
	/* RisersSidebar styles itself as a 320px-wide bordered aside. Override
	 * for embed in the right panel column. */
	:global(.risers-inspector .sidebar) {
		width: 100% !important;
		border-left: none !important;
		height: 100%;
	}
</style>
