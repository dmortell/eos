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

	const ROOM_COLORS: Record<string, { bg: string; border: string; dot: string; selectedBg: string; selectedBorder: string; selectedText: string }> = {
		A: { bg: 'bg-blue-100', border: 'border-blue-300', dot: 'bg-blue-500', selectedBg: 'bg-blue-50', selectedBorder: 'border-blue-400', selectedText: 'text-blue-700' },
		B: { bg: 'bg-purple-100', border: 'border-purple-300', dot: 'bg-purple-500', selectedBg: 'bg-purple-50', selectedBorder: 'border-purple-400', selectedText: 'text-purple-700' },
		C: { bg: 'bg-teal-100', border: 'border-teal-300', dot: 'bg-teal-500', selectedBg: 'bg-teal-50', selectedBorder: 'border-teal-400', selectedText: 'text-teal-700' },
		D: { bg: 'bg-rose-100', border: 'border-rose-300', dot: 'bg-rose-500', selectedBg: 'bg-rose-50', selectedBorder: 'border-rose-400', selectedText: 'text-rose-700' },
	}
	function roomColor(room: string) {
		return ROOM_COLORS[room] ?? ROOM_COLORS['A']
	}

	/** Group frames by serverRoom, preserving order within each room */
	let groupedByRoom = $derived.by(() => {
		const map = new Map<string, FrameConfig[]>()
		for (const f of frames) {
			if (!map.has(f.serverRoom)) map.set(f.serverRoom, [])
			map.get(f.serverRoom)!.push(f)
		}
		return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
	})

	let isGrouped = $derived(frames.length > 6)
</script>

<div class="space-y-3">
	{#if frames.length === 0}
		<span class="text-xs text-gray-400 italic">No racks with server rooms configured — add racks in the Rack Elevations tool</span>
	{:else if !isGrouped}
		<!-- Flat tabs for ≤6 racks -->
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
		</div>

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
	{:else}
		<!-- Grouped view for >6 racks -->
		<div class="flex gap-4 flex-wrap">
			{#each groupedByRoom as [room, roomFrames] (room)}
				{@const colors = roomColor(room)}
				<div class="space-y-1">
					<div class="flex items-center gap-1.5 px-1">
						<span class="w-2 h-2 rounded-full {colors.dot}"></span>
						<span class="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Room {room}</span>
						<span class="text-[10px] text-gray-400">{roomFrames.length}</span>
					</div>
					<div class="flex flex-wrap gap-0.5">
						{#each roomFrames as frame (frame.id)}
							{@const isSelected = frame.id === selectedFrameId}
							<button
								class="px-2 py-0.5 rounded text-[11px] font-mono border transition-colors
									{isSelected ? `${colors.selectedBg} ${colors.selectedBorder} ${colors.selectedText} font-semibold` : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-100'}"
								onclick={() => onselect(frame.id)}
							>{frame.name}</button>
						{/each}
					</div>
				</div>
			{/each}
		</div>

		<!-- Selected rack info (always visible in grouped mode) -->
		{#if selectedFrame}
			{@const colors = roomColor(selectedFrame.serverRoom)}
			<div class="p-1.5 rounded border text-xs text-gray-500 flex items-center gap-4 {colors.selectedBg} {colors.selectedBorder}">
				<span class="font-mono font-semibold {colors.selectedText}">{selectedFrame.name}</span>
				<span>Room {selectedFrame.serverRoom}</span>
				<span>{selectedFrame.totalRU}U</span>
				<span>Floor panels RU {selectedFrame.panelStartRU}–{selectedFrame.panelEndRU}</span>
				{#if selectedFrame.hlPanelStartRU != null}
					<span>HL panels RU {selectedFrame.hlPanelStartRU}–{selectedFrame.hlPanelEndRU}</span>
				{/if}
				{#if selectedFrame.slots.length > 0}
					<span>{selectedFrame.slots.length} slot{selectedFrame.slots.length !== 1 ? 's' : ''}</span>
				{/if}
			</div>
		{/if}
	{/if}
</div>
