<script lang="ts">
	import { Window, Icon } from '$lib'
	import type { RoomObject } from './types'

	let { object, onupdate, ondelete, ondeselect }: {
		object: RoomObject | null
		onupdate?: (id: string, updates: Partial<RoomObject>) => void
		ondelete?: (id: string) => void
		ondeselect?: () => void
	} = $props()

	function set<K extends keyof RoomObject>(field: K, value: RoomObject[K]) {
		if (!object) return
		onupdate?.(object.id, { [field]: value } as Partial<RoomObject>)
	}

	function setPos(field: 'x' | 'y', value: number) {
		if (!object) return
		onupdate?.(object.id, { position: { ...object.position, [field]: value } })
	}
	function setEnd(field: 'x' | 'y', value: number) {
		if (!object || !object.endPosition) return
		onupdate?.(object.id, { endPosition: { ...object.endPosition, [field]: value } })
	}
</script>

{#if object}
	<Window title={object.kind} open={true} top={70} right={20} class="w-56 p-2 overflow-hidden print:hidden">
		<div class="space-y-1 text-xs">
			<div class="flex items-center gap-1 pb-1 border-b border-gray-200">
				<span class="text-[10px] uppercase tracking-wider text-gray-500 flex-1">Room Object</span>
				<button class="p-0.5 rounded text-red-600 hover:bg-red-50"
					title="Delete"
					onclick={() => { if (object) ondelete?.(object.id) }}>
					<Icon name="x" size={12} />
				</button>
				<button class="p-0.5 rounded text-gray-500 hover:bg-gray-100"
					title="Deselect"
					onclick={() => ondeselect?.()}>
					<Icon name="chevronRight" size={12} />
				</button>
			</div>

			<label class="flex gap-2 items-center">
				<span class="w-14 text-[10px] text-gray-500 shrink-0">label</span>
				<input class="flex-1 min-w-0 h-6 px-1 border-b border-gray-300 text-xs"
					value={object.label ?? ''}
					onchange={e => set('label', e.currentTarget.value || undefined)} />
			</label>

			<div class="grid grid-cols-2 gap-1">
				<label class="flex gap-1 items-center">
					<span class="w-4 text-[10px] text-gray-500">x</span>
					<input type="number" class="w-full h-6 px-1 border-b border-gray-300 text-xs"
						value={object.position.x}
						onchange={e => setPos('x', parseInt(e.currentTarget.value) || 0)} />
				</label>
				<label class="flex gap-1 items-center">
					<span class="w-4 text-[10px] text-gray-500">y</span>
					<input type="number" class="w-full h-6 px-1 border-b border-gray-300 text-xs"
						value={object.position.y}
						onchange={e => setPos('y', parseInt(e.currentTarget.value) || 0)} />
				</label>
			</div>

			{#if object.kind === 'wall' && object.endPosition}
				<div class="grid grid-cols-2 gap-1">
					<label class="flex gap-1 items-center">
						<span class="w-4 text-[10px] text-gray-500">x₂</span>
						<input type="number" class="w-full h-6 px-1 border-b border-gray-300 text-xs"
							value={object.endPosition.x}
							onchange={e => setEnd('x', parseInt(e.currentTarget.value) || 0)} />
					</label>
					<label class="flex gap-1 items-center">
						<span class="w-4 text-[10px] text-gray-500">y₂</span>
						<input type="number" class="w-full h-6 px-1 border-b border-gray-300 text-xs"
							value={object.endPosition.y}
							onchange={e => setEnd('y', parseInt(e.currentTarget.value) || 0)} />
					</label>
				</div>
				<label class="flex gap-2 items-center">
					<span class="w-14 text-[10px] text-gray-500 shrink-0">thick</span>
					<input type="number" min="10" max="1000" step="10" class="flex-1 min-w-0 h-6 px-1 border-b border-gray-300 text-xs"
						value={object.thicknessMm ?? 100}
						onchange={e => set('thicknessMm', parseInt(e.currentTarget.value) || 100)} />
					<span class="text-[9px] text-gray-400">mm</span>
				</label>
			{/if}

			{#if object.kind === 'door' || object.kind === 'rect'}
				<div class="grid grid-cols-2 gap-1">
					<label class="flex gap-1 items-center">
						<span class="w-4 text-[10px] text-gray-500">w</span>
						<input type="number" min="10" class="w-full h-6 px-1 border-b border-gray-300 text-xs"
							value={object.widthMm ?? 0}
							onchange={e => set('widthMm', parseInt(e.currentTarget.value) || 0)} />
					</label>
					<label class="flex gap-1 items-center">
						<span class="w-4 text-[10px] text-gray-500">d</span>
						<input type="number" min="10" class="w-full h-6 px-1 border-b border-gray-300 text-xs"
							value={object.depthMm ?? 0}
							onchange={e => set('depthMm', parseInt(e.currentTarget.value) || 0)} />
					</label>
				</div>
				<label class="flex gap-2 items-center">
					<span class="w-14 text-[10px] text-gray-500 shrink-0">rotation</span>
					<select class="flex-1 h-6 px-1 border-b border-gray-300 text-xs"
						value={object.rotationDeg ?? 0}
						onchange={e => set('rotationDeg', parseInt(e.currentTarget.value) || 0)}>
						<option value={0}>0°</option>
						<option value={90}>90°</option>
						<option value={180}>180°</option>
						<option value={270}>270°</option>
					</select>
				</label>
			{/if}

			{#if object.kind === 'door'}
				<label class="flex gap-2 items-center">
					<span class="w-14 text-[10px] text-gray-500 shrink-0">swing</span>
					<select class="flex-1 h-6 px-1 border-b border-gray-300 text-xs"
						value={object.swing ?? 'left'}
						onchange={e => set('swing', e.currentTarget.value as 'left' | 'right')}>
						<option value="left">Left</option>
						<option value="right">Right</option>
					</select>
				</label>
			{/if}
		</div>
	</Window>
{/if}
