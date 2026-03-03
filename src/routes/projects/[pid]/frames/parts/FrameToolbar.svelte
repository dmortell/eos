<script lang="ts">
	import { Button, Icon } from '$lib'
	import type { FrameConfig, FrameSlot, SlotType } from './types'
	import { defaultFrameConfig } from './types'

	let { frames, selectedFrameId, zone, onupdate, onselect }: {
		frames: FrameConfig[]
		selectedFrameId: string | null
		zone: { serverRoomCount: 1 | 2 }
		onupdate: (frames: FrameConfig[]) => void
		onselect: (id: string) => void
	} = $props()

	let editingFrame = $state<string | null>(null)
	let addingSlot = $state<string | null>(null)
	let slotRU = $state(1)
	let slotType = $state<SlotType>('blanking')
	let slotLabel = $state('')

	let selectedFrame = $derived(frames.find(f => f.id === selectedFrameId) ?? null)

	function addFrame(room: 'A' | 'B') {
		const count = frames.filter(f => f.serverRoom === room).length
		const frame = defaultFrameConfig(room, count + 1)
		onupdate([...frames, frame])
		onselect(frame.id)
	}

	function removeFrame(id: string) {
		onupdate(frames.filter(f => f.id !== id))
	}

	function updateFrame(id: string, changes: Partial<FrameConfig>) {
		onupdate(frames.map(f => f.id === id ? { ...f, ...changes } : f))
	}

	function addSlot(frameId: string) {
		const frame = frames.find(f => f.id === frameId)
		if (!frame) return
		const height: 1 | 2 = slotType === 'cable-mgmt-2u' ? 2 : 1
		const slot: FrameSlot = { ru: slotRU, type: slotType, height, label: slotLabel || undefined }
		updateFrame(frameId, { slots: [...frame.slots, slot] })
		addingSlot = null
		slotLabel = ''
	}

	function removeSlot(frameId: string, index: number) {
		const frame = frames.find(f => f.id === frameId)
		if (!frame) return
		updateFrame(frameId, { slots: frame.slots.filter((_, i) => i !== index) })
	}
</script>

<div class="space-y-3">
	<!-- Frame tabs -->
	<div class="flex items-center gap-1 flex-wrap">
		{#each frames as frame (frame.id)}
			<button
				class="flex items-center gap-1 px-2 py-1 rounded text-xs font-mono border transition-colors"
				class:bg-blue-100={frame.id === selectedFrameId && frame.serverRoom === 'A'}
				class:border-blue-300={frame.id === selectedFrameId && frame.serverRoom === 'A'}
				class:bg-purple-100={frame.id === selectedFrameId && frame.serverRoom === 'B'}
				class:border-purple-300={frame.id === selectedFrameId && frame.serverRoom === 'B'}
				class:bg-white={frame.id !== selectedFrameId}
				class:border-gray-200={frame.id !== selectedFrameId}
				class:text-gray-500={frame.id !== selectedFrameId}
				onclick={() => onselect(frame.id)}
			>
				<span class="w-2 h-2 rounded-full {frame.serverRoom === 'A' ? 'bg-blue-500' : 'bg-purple-500'}"></span>
				{frame.name}
			</button>
		{/each}

		<!-- Add frame buttons -->
		<Button onclick={() => addFrame('A')} class="text-[10px] h-6">+ Frame A</Button>
		{#if zone.serverRoomCount === 2}
			<Button onclick={() => addFrame('B')} class="text-[10px] h-6">+ Frame B</Button>
		{/if}
	</div>

	<!-- Selected frame settings -->
	{#if selectedFrame}
		<div class="flex items-center gap-2 text-xs">
			<button
				class="text-gray-400 hover:text-gray-600"
				onclick={() => editingFrame = editingFrame === selectedFrame!.id ? null : selectedFrame!.id}
			>
				<Icon name="settings" />
			</button>

			{#if frames.length > 1}
				<button
					class="text-gray-400 hover:text-red-500 ml-auto"
					onclick={() => removeFrame(selectedFrame!.id)}
					title="Remove frame"
				>
					<Icon name="trash" />
				</button>
			{/if}
		</div>

		<!-- Expandable frame settings -->
		{#if editingFrame === selectedFrame.id}
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

				<!-- Slots (blanking, cable mgmt, devices) -->
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
								type="text"
								bind:value={slotLabel}
								placeholder="Label"
								class="flex-1 h-5 px-1 text-[10px] border border-gray-200 rounded"
							/>
							<button class="text-[10px] text-blue-500 px-1" onclick={() => addSlot(selectedFrame!.id)}>Add</button>
						</div>
					{/if}

					{#each selectedFrame.slots as slot, i}
						<div class="flex items-center gap-1 text-[10px] text-gray-500 font-mono bg-white px-1 py-0.5 rounded border border-gray-100">
							<span class="w-8">RU {slot.ru}</span>
							<span class="flex-1 capitalize">{slot.type.replace(/-/g, ' ')}{slot.label ? `: ${slot.label}` : ''}</span>
							<button class="text-red-400 hover:text-red-600" onclick={() => removeSlot(selectedFrame!.id, i)}>x</button>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>
