<script lang="ts">
	/** Frames-tab sidebar: room → rack → patch panels with search (§14 F-1). */
	import { Icon } from '$lib'
	import type { FramesEditor } from './frames-editor.svelte'

	let { editor }: { editor: FramesEditor } = $props()

	let query = $state('')

	let tree = $derived.by(() => {
		const q = query.trim().toLowerCase()
		return editor.rooms.map(room => {
			const racks = editor.racks
				.filter(r => r._room === room)
				.map(rack => {
					const panels = editor.devices
						.filter(d => d.rackId === rack.id && d.type === 'panel' && (d.portCount ?? 0) > 0)
						.sort((a, b) => b.positionU - a.positionU)
						.filter(d => !q
							|| d.label?.toLowerCase().includes(q)
							|| rack.label?.toLowerCase().includes(q))
					return { rack, panels }
				})
				.filter(({ rack, panels }) => panels.length > 0 && (!q || panels.length > 0 || rack.label?.toLowerCase().includes(q)))
			return { room, racks }
		}).filter(g => g.racks.length > 0)
	})
</script>

<div class="h-full flex flex-col text-xs">
	<div class="p-2 border-b border-gray-100">
		<div class="relative">
			<Icon name="search" size={12} class="absolute left-1.5 top-1/2 -translate-y-1/2 text-gray-300" />
			<input class="w-full h-6 pl-6 pr-2 border border-gray-200 rounded text-[11px]"
				placeholder="Search racks & panels…" bind:value={query} />
		</div>
	</div>
	<div class="flex-1 overflow-y-auto p-1 space-y-1.5">
		{#if tree.length === 0}
			<div class="p-2 text-[11px] text-gray-400">No panels on this floor{query ? ' match the search' : ''}.</div>
		{/if}
		{#each tree as { room, racks } (room)}
			<div>
				<div class="px-1.5 text-[10px] text-gray-400 uppercase tracking-wider font-medium">Room {room}</div>
				{#each racks as { rack, panels } (rack.id)}
					{@const onBench = editor.bench.includes(rack.id)}
					<div class="mt-0.5">
						<button class="w-full flex items-center gap-1.5 px-1.5 py-0.5 rounded text-left
								{onBench ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'}"
							title={onBench ? 'On the bench — click to remove' : 'Add this rack to the bench'}
							onclick={() => onBench ? editor.removeFromBench(rack.id) : editor.addToBench(rack.id)}>
							<Icon name="server" size={11} class="shrink-0 {onBench ? 'text-blue-500' : 'text-gray-400'}" />
							<span class="font-medium truncate">{rack.label}</span>
							{#if onBench}<Icon name="check" size={10} class="ml-auto shrink-0 text-blue-500" />{/if}
						</button>
						{#each panels as d (d.id)}
							<button class="w-full flex items-center gap-1.5 pl-6 pr-1.5 py-px rounded text-left text-[11px] text-gray-500 hover:bg-gray-50"
								title="Show this panel on the bench"
								onclick={() => editor.showDevice(d)}>
								<span class="truncate">{d.label}</span>
								<span class="ml-auto shrink-0 text-[10px] text-gray-400">U{d.positionU} · {d.portCount}p</span>
							</button>
						{/each}
					</div>
				{/each}
			</div>
		{/each}
	</div>
</div>
