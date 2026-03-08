<script lang="ts">
	import { Icon } from '$lib'
	import type { RackPlacement, PageCalibration } from './types'
	import type { RackConfig } from '../../racks/parts/types'

	let { rackConfigs, rackPlacements, selectedRackIds, calibration, onplace, onselect, onremove, onrotate }: {
		rackConfigs: (RackConfig & { room: string })[]
		rackPlacements: RackPlacement[]
		selectedRackIds: Set<string>
		calibration: PageCalibration | null
		onplace: (rackIds: string[], room: string, position: { x: number; y: number }) => void
		onselect: (rackId: string, multi: boolean) => void
		onremove: () => void
		onrotate: () => void
	} = $props()

	let draggedIds = $state<string[]>([])
	let lastClickedIndex = $state(-1)

	// Placed rack IDs for quick lookup
	let placedIds = $derived(new Set(rackPlacements.map(p => p.rackId)))

	// Group racks by room
	let racksByRoom = $derived.by(() => {
		const groups = new Map<string, (RackConfig & { room: string })[]>()
		for (const rack of rackConfigs) {
			const room = rack.room ?? rack.serverRoom ?? '?'
			if (!groups.has(room)) groups.set(room, [])
			groups.get(room)!.push(rack)
		}
		return groups
	})

	// Selected placed racks (for properties panel)
	let selectedPlaced = $derived(
		rackPlacements.filter(p => selectedRackIds.has(p.rackId))
	)
	let selectedConfigs = $derived(
		rackConfigs.filter(r => selectedRackIds.has(r.id))
	)

	function handleListClick(e: MouseEvent, rack: RackConfig & { room: string }) {
		const placed = placedIds.has(rack.id)
		if (placed) {
			onselect(rack.id, e.ctrlKey || e.metaKey)
		}
	}

	function handleDragStart(e: DragEvent, rack: RackConfig & { room: string }) {
		if (!calibration) { e.preventDefault(); return }
		// If rack is in multi-selection, drag all selected unplaced
		const ids = selectedRackIds.has(rack.id) && selectedRackIds.size > 1
			? [...selectedRackIds].filter(id => !placedIds.has(id))
			: [rack.id]
		if (ids.length === 0) { e.preventDefault(); return }
		draggedIds = ids
		e.dataTransfer!.effectAllowed = 'copy'
		e.dataTransfer!.setData('text/plain', ids.join(','))
	}

	function isPlaced(rackId: string): boolean {
		return placedIds.has(rackId)
	}

	/** For multi-select properties: return value if all share it */
	function sharedConfig<K extends keyof RackConfig>(key: K): RackConfig[K] | undefined {
		if (selectedConfigs.length === 0) return undefined
		const first = selectedConfigs[0][key]
		return selectedConfigs.every(r => r[key] === first) ? first : undefined
	}

	function sharedPlacement<K extends keyof RackPlacement>(key: K): RackPlacement[K] | undefined {
		if (selectedPlaced.length === 0) return undefined
		const first = selectedPlaced[0][key]
		return selectedPlaced.every(p => p[key] === first) ? first : undefined
	}
</script>

<div class="p-3 h-full flex flex-col gap-3 text-xs">
	<!-- Info -->
	{#if !calibration}
		<div class="px-2 py-1.5 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-700">
			Calibrate the floorplan first (set origin & scale in uploads) to place racks.
		</div>
	{/if}

	{#if rackConfigs.length === 0}
		<div class="px-2 py-3 text-center text-gray-400 text-[10px]">
			No racks defined. Add racks in the Racks tool first.
		</div>
	{:else}
		<!-- Toolbar -->
		{#if selectedRackIds.size > 0 && selectedPlaced.length > 0}
			<div class="flex items-center gap-1 shrink-0">
				<button class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-gray-500 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
					onclick={onrotate} title="Rotate 90° (R)">
					<Icon name="rotateRight" size={10} /> Rotate
				</button>
				<button class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-red-500 border border-red-200 rounded hover:bg-red-50 transition-colors"
					onclick={onremove} title="Remove from floorplan (Del)">
					<Icon name="trash" size={10} /> Remove {selectedRackIds.size}
				</button>
			</div>
		{/if}

		<!-- Rack list by room -->
		<div class="flex-1 min-h-0 overflow-y-auto space-y-2">
			<p>Drag racks to drawing</p>
			{#each [...racksByRoom.entries()].sort((a, b) => a[0].localeCompare(b[0])) as [room, racks] (room)}
				<div>
					<div class="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">Room {room}</div>
					{#each racks as rack (rack.id)}
						{@const placed = isPlaced(rack.id)}
						{@const selected = selectedRackIds.has(rack.id)}
						<button
							class="w-full flex items-center gap-1.5 px-1.5 py-1 text-left transition-colors rounded
								{selected ? 'bg-blue-50 ring-1 ring-blue-200' : placed ? 'bg-green-50/50 hover:bg-green-50' : 'hover:bg-gray-50'}"
							draggable={!placed && !!calibration}
							ondragstart={e => handleDragStart(e, rack)}
							onclick={e => handleListClick(e, rack)}
						>
							<!-- Status dot -->
							<span class="w-2 h-2 rounded-full shrink-0 {placed ? 'bg-green-400' : 'bg-gray-300'}"></span>
							<!-- Label -->
							<span class="font-mono text-[10px] {placed ? 'text-green-700' : 'text-gray-600'} truncate">{rack.label}</span>
							<!-- Dimensions -->
							<span class="text-[10px] text-gray-400 shrink-0 ml-auto">{rack.heightU}U</span>
							<span class="text-[10px] text-gray-400 shrink-0">{rack.widthMm}×{rack.depthMm}</span>
							<!-- Drag hint or placed indicator -->
							{#if placed}
								<Icon name="check" size={10} class="text-green-400 shrink-0" />
							{:else if calibration}
								<Icon name="grip" size={10} class="text-gray-300 shrink-0" />
							{/if}
						</button>
					{/each}
				</div>
			{/each}
		</div>

		<!-- Floating properties panel for selected placed racks -->
		{#if selectedPlaced.length > 0}
			<div class="border-t border-gray-200 pt-2 space-y-1 shrink-0">
				<div class="text-[10px] text-gray-400 uppercase tracking-wider font-medium">
					{selectedPlaced.length === 1 ? selectedConfigs[0]?.label ?? 'Rack' : `${selectedPlaced.length} racks`}
				</div>

				<div class="flex items-center gap-2">
					<span class="text-gray-500 w-12 shrink-0 text-[10px]">Size</span>
					<span class="font-mono text-[10px] text-gray-600">
						{sharedConfig('heightU') ?? '—'}U &middot;
						{sharedConfig('widthMm') ?? '—'}×{sharedConfig('depthMm') ?? '—'}mm
					</span>
				</div>

				<div class="flex items-center gap-2">
					<span class="text-gray-500 w-12 shrink-0 text-[10px]">Type</span>
					<span class="font-mono text-[10px] text-gray-600">{sharedConfig('type') ?? '—'}</span>
				</div>

				{#if sharedConfig('maker')}
					<div class="flex items-center gap-2">
						<span class="text-gray-500 w-12 shrink-0 text-[10px]">Maker</span>
						<span class="text-[10px] text-gray-600">{sharedConfig('maker')}</span>
					</div>
				{/if}

				{#if sharedConfig('model')}
					<div class="flex items-center gap-2">
						<span class="text-gray-500 w-12 shrink-0 text-[10px]">Model</span>
						<span class="text-[10px] text-gray-600">{sharedConfig('model')}</span>
					</div>
				{/if}

				<div class="flex items-center gap-2">
					<span class="text-gray-500 w-12 shrink-0 text-[10px]">Rotation</span>
					<span class="font-mono text-[10px] text-gray-600">{sharedPlacement('rotation') ?? '—'}°</span>
				</div>

				{#if selectedPlaced.length === 1}
					<div class="flex items-center gap-2">
						<span class="text-gray-500 w-12 shrink-0 text-[10px]">Pos</span>
						<span class="font-mono text-[10px] text-gray-600">
							{Math.round(selectedPlaced[0].position.x)}, {Math.round(selectedPlaced[0].position.y)} mm
						</span>
					</div>
				{/if}
			</div>
		{/if}
	{/if}
</div>
