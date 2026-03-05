<script lang="ts">
	import { Icon } from '$lib'
	import type { FrameConfig } from './types'

	let { frames, selectedFrameId, serverRoomCount, onselect }: {
		frames: FrameConfig[]
		selectedFrameId: string | null
		serverRoomCount: number
		onselect: (id: string) => void
	} = $props()

	let selectedFrame = $derived(frames.find(f => f.id === selectedFrameId) ?? null)
	let showInfo = $state(false)

	const ROOM_COLORS: Record<string, { bg: string; border: string; dot: string }> = {
		A: { bg: 'bg-blue-100', border: 'border-blue-300', dot: 'bg-blue-500' },
		B: { bg: 'bg-purple-100', border: 'border-purple-300', dot: 'bg-purple-500' },
		C: { bg: 'bg-teal-100', border: 'border-teal-300', dot: 'bg-teal-500' },
		D: { bg: 'bg-rose-100', border: 'border-rose-300', dot: 'bg-rose-500' },
	}
	function roomColor(room: string) {
		return ROOM_COLORS[room] ?? ROOM_COLORS['A']
	}
</script>

<div class="space-y-3">
	<!-- Frame tabs row -->
	<div class="flex items-center gap-1">
		{#each frames as frame (frame.id)}
			{@const colors = roomColor(frame.serverRoom)}
			{@const isSelected = frame.id === selectedFrameId}
			<div class="group relative">
				<button
					class="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono border transition-colors"
					class:bg-white={!isSelected}
					class:border-gray-200={!isSelected}
					class:text-gray-500={!isSelected}
					class:font-semibold={isSelected}
					onclick={() => onselect(frame.id)}
				>
					<span class="w-2 h-2 rounded-full {colors.dot}"></span>
					{frame.name}
					{#if isSelected}
						<button
							class="text-gray-400 hover:text-gray-600 p-0.5 ml-1"
							onclick={e => { e.stopPropagation(); showInfo = !showInfo }}
							title="Frame info"
						>
							<Icon name="info" size={11} />
						</button>
					{/if}
				</button>
				{#if isSelected}
					<div class="absolute bottom-0 left-1 right-1 h-0.5 {colors.bg} rounded-full"></div>
				{/if}
			</div>
		{/each}

		{#if frames.length === 0}
			<span class="text-xs text-gray-400 italic">No racks with server rooms configured — add racks in the Rack Elevations tool</span>
		{/if}
	</div>

	<!-- Read-only frame info (below tabs) -->
	{#if selectedFrame && showInfo}
		<div class="p-2 bg-gray-50 rounded border border-gray-200 text-xs text-gray-500 flex items-center gap-4">
			<span><strong>Room:</strong> {selectedFrame.serverRoom}</span>
			<span><strong>RU:</strong> {selectedFrame.totalRU}U</span>
			<span><strong>Floor panels:</strong> RU {selectedFrame.panelStartRU}–{selectedFrame.panelEndRU}</span>
			{#if selectedFrame.hlPanelStartRU != null}
				<span><strong>HL panels:</strong> RU {selectedFrame.hlPanelStartRU}–{selectedFrame.hlPanelEndRU}</span>
			{/if}
			<span><strong>Slots:</strong> {selectedFrame.slots.length}</span>
		</div>
	{/if}
</div>
