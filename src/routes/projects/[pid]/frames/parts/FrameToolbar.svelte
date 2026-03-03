<script lang="ts">
	import { Button, Icon } from '$lib'
	import type { FrameConfig, FrameSlot, SlotType } from './types'
	import { defaultFrameConfig } from './types'

	let { frames, selectedFrameId, zone, onupdate, onselect }: {
		frames: FrameConfig[]
		selectedFrameId: string | null
		zone: { serverRoomCount: number }
		onupdate: (frames: FrameConfig[]) => void
		onselect: (id: string) => void
	} = $props()

	let editingFrame = $state<string | null>(null)
	let confirmingDelete = $state<string | null>(null)
	let addingSlot = $state<string | null>(null)
	let slotRU = $state(1)
	let slotType = $state<SlotType>('blanking')
	let slotLabel = $state('')
	let slotHeight = $state(1)

	let selectedFrame = $derived(frames.find(f => f.id === selectedFrameId) ?? null)

	function addFrame(room: string) {
		const count = frames.filter(f => f.serverRoom === room).length
		const frame = defaultFrameConfig(room, count + 1)
		onupdate([...frames, frame])
		onselect(frame.id)
	}

	function confirmRemoveFrame(id: string) {
		confirmingDelete = id
	}

	function removeFrame(id: string) {
		onupdate(frames.filter(f => f.id !== id))
		confirmingDelete = null
	}

	function updateFrame(id: string, changes: Partial<FrameConfig>) {
		onupdate(frames.map(f => f.id === id ? { ...f, ...changes } : f))
	}

	function addSlot(frameId: string) {
		const frame = frames.find(f => f.id === frameId)
		if (!frame) return
		const h = slotType === 'cable-mgmt-2u' ? 2 : Math.max(1, Math.min(10, slotHeight))
		const slot: FrameSlot = { ru: slotRU, type: slotType, height: h, label: slotLabel || undefined }
		updateFrame(frameId, { slots: [...frame.slots, slot] })
		addingSlot = null
		slotLabel = ''
		slotHeight = 1
	}

	function removeSlot(frameId: string, index: number) {
		const frame = frames.find(f => f.id === frameId)
		if (!frame) return
		updateFrame(frameId, { slots: frame.slots.filter((_, i) => i !== index) })
	}

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

<!-- Delete confirmation dialog -->
{#if confirmingDelete}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onclick={() => confirmingDelete = null} onkeydown={e => e.key === 'Escape' && (confirmingDelete = null)}>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="bg-white rounded-lg shadow-xl border border-gray-200 p-4 w-80" onclick={e => e.stopPropagation()}>
			<p class="text-sm text-gray-700 mb-3">Remove frame <strong>{frames.find(f => f.id === confirmingDelete)?.name}</strong>? This will delete all its slot configuration.</p>
			<div class="flex gap-2 justify-end">
				<Button onclick={() => confirmingDelete = null}>Cancel</Button>
				<Button variant="danger" onclick={() => removeFrame(confirmingDelete!)}>Remove</Button>
			</div>
		</div>
	</div>
{/if}

<div class="space-y-3">
	<!-- Frame tabs row -->
	<div class="flex items-center gap-1">
		{#each frames as frame (frame.id)}
			{@const colors = roomColor(frame.serverRoom)}
			{@const isSelected = frame.id === selectedFrameId}
			<!-- Frame tab with hover actions -->
			<div class="group relative">
				<button
					class="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono border transition-colors"
					class:bg-white={!isSelected}
					class:border-gray-200={!isSelected}
					class:text-gray-500={!isSelected}
					style={isSelected ? '' : ''}
					class:font-semibold={isSelected}
					onclick={() => onselect(frame.id)}
				>
					<span class="w-2 h-2 rounded-full {colors.dot}"></span>
					{frame.name}
					{#if isSelected}
						<!-- Inline settings/delete on hover, visible when selected -->
						<span class="inline-flex items-center gap-0.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
							<button
								class="text-gray-400 hover:text-gray-600 p-0.5"
								onclick={e => { e.stopPropagation(); editingFrame = editingFrame === frame.id ? null : frame.id }}
								title="Frame settings"
							>
								<Icon name="settings" size={11} />
							</button>
							{#if frames.length > 1}
								<button
									class="text-gray-400 hover:text-red-500 p-0.5"
									onclick={e => { e.stopPropagation(); confirmRemoveFrame(frame.id) }}
									title="Remove frame"
								>
									<Icon name="trash" size={11} />
								</button>
							{/if}
						</span>
					{/if}
				</button>
				{#if isSelected}
					<div class="absolute bottom-0 left-1 right-1 h-0.5 {colors.bg} rounded-full"></div>
				{/if}
			</div>
		{/each}

		<!-- Spacer + add frame buttons pushed right -->
		<div class="flex-1"></div>
		{#each ['A', 'B', 'C', 'D'].slice(0, zone.serverRoomCount) as room}
			{@const colors = roomColor(room)}
			<button
				class="text-[10px] h-6 px-2 rounded border border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors flex items-center gap-1"
				onclick={() => addFrame(room)}
			>
				<span class="w-1.5 h-1.5 rounded-full {colors.dot}"></span>
				+ {room}
			</button>
		{/each}
	</div>

	<!-- Expandable frame settings (below tabs) -->
	{#if selectedFrame && editingFrame === selectedFrame.id}
		<div class="p-2 bg-gray-50 rounded border border-gray-200 space-y-2 text-xs">
			<div class="grid grid-cols-3 gap-2">
				<div>
					<label class="text-[10px] text-gray-400">Name</label>
					<input
						type="text"
						value={selectedFrame.name}
						onchange={e => updateFrame(selectedFrame!.id, { name: e.currentTarget.value })}
						class="w-full h-6 px-1 text-xs font-mono bg-white border border-gray-200 rounded"
					/>
				</div>
				<div>
					<label class="text-[10px] text-gray-400">Total RU</label>
					<input
						type="number" min="1" max="50"
						value={selectedFrame.totalRU}
						onchange={e => updateFrame(selectedFrame!.id, { totalRU: parseInt(e.currentTarget.value) || 45 })}
						class="w-full h-6 px-1 text-xs font-mono bg-white border border-gray-200 rounded"
					/>
				</div>
				<div>
					<label class="text-[10px] text-gray-400">Panel RU range</label>
					<div class="flex items-center gap-1">
						<input
							type="number" min="1"
							value={selectedFrame.panelStartRU}
							onchange={e => updateFrame(selectedFrame!.id, { panelStartRU: parseInt(e.currentTarget.value) || 1 })}
							class="w-12 h-6 px-1 text-xs font-mono bg-white border border-gray-200 rounded text-center"
						/>
						<span class="text-gray-400">–</span>
						<input
							type="number" min="1"
							value={selectedFrame.panelEndRU}
							onchange={e => updateFrame(selectedFrame!.id, { panelEndRU: parseInt(e.currentTarget.value) || 45 })}
							class="w-12 h-6 px-1 text-xs font-mono bg-white border border-gray-200 rounded text-center"
						/>
					</div>
				</div>
			</div>

			<!-- Slots -->
			<div class="space-y-1">
				<div class="flex items-center justify-between">
					<span class="text-[10px] text-gray-400 uppercase tracking-wider">Slots</span>
					<button
						class="text-[10px] text-blue-500 hover:underline"
						onclick={() => addingSlot = addingSlot ? null : selectedFrame!.id}
					>+ Add slot</button>
				</div>

				{#if addingSlot === selectedFrame.id}
					<div class="flex items-center gap-1 bg-white p-1 rounded border border-gray-200">
						<input
							type="number" min="1" max={selectedFrame.totalRU}
							bind:value={slotRU}
							placeholder="RU"
							title="Starting RU"
							class="w-10 h-5 px-1 text-[10px] font-mono border border-gray-200 rounded text-center"
						/>
						<select
							bind:value={slotType}
							class="h-5 text-[10px] border border-gray-200 rounded px-0.5"
						>
							<option value="blanking">Blanking</option>
							<option value="cable-mgmt-1u">Cable Mgmt 1U</option>
							<option value="cable-mgmt-2u">Cable Mgmt 2U</option>
							<option value="device">Device</option>
						</select>
						<input
							type="number" min="1" max="10"
							bind:value={slotHeight}
							title="Height in RU"
							class="w-10 h-5 px-1 text-[10px] font-mono border border-gray-200 rounded text-center"
						/>
						<span class="text-[9px] text-gray-400">U</span>
						<input
							type="text"
							bind:value={slotLabel}
							placeholder="Label"
							class="flex-1 h-5 px-1 text-[10px] border border-gray-200 rounded"
						/>
						<button class="text-[10px] text-blue-500 px-1 hover:underline" onclick={() => addSlot(selectedFrame!.id)}>Add</button>
					</div>
				{/if}

				{#each selectedFrame.slots as slot, i}
					<div class="flex items-center gap-1 text-[10px] text-gray-500 font-mono bg-white px-1 py-0.5 rounded border border-gray-100">
						<span class="w-8">RU {slot.ru}</span>
						<span class="w-6">{slot.height}U</span>
						<span class="flex-1 capitalize">{slot.type.replace(/-/g, ' ')}{slot.label ? `: ${slot.label}` : ''}</span>
						<button class="text-red-400 hover:text-red-600" onclick={() => removeSlot(selectedFrame!.id, i)}>x</button>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
