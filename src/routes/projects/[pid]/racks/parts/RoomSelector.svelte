<script lang="ts">
	import { Icon } from '$lib'
	import type { FloorConfig } from '$lib/types/project'
	import type { RackRow } from './types'
	import { fmtFloor } from '$lib/utils/floor'

	let {
		floors = [], floor, room, floorFormat = 'L01',
		rows = [], activeRowId,
		onfloorchange, onroomchange, onactiverowchange, onaddrow, ondeleterow, onmanagefloors,
	}: {
		floors: FloorConfig[]
		floor: number
		room: string
		floorFormat?: string
		rows: RackRow[]
		activeRowId: string
		onfloorchange?: (floor: number) => void
		onroomchange?: (room: string) => void
		onactiverowchange?: (rowId: string) => void
		onaddrow?: () => void
		ondeleterow?: (rowId: string) => void
		onmanagefloors?: () => void
	} = $props()

	const fmt = (fl: number) => fmtFloor(fl, floorFormat, floors)

	let roomCount = $derived(floors.find(f => f.number === floor)?.serverRoomCount ?? 4)
</script>

<div class="h-8 px-3 flex items-center gap-3 border-b border-gray-200 bg-white shrink-0 text-xs print:hidden">
	<!-- Floor -->
	<span class="text-[10px] text-gray-400 uppercase tracking-wider">Floor</span>
	<div class="flex gap-0.5 items-center">
		{#each floors as fl (fl.number)}
			<button
				class="h-6 px-2 rounded text-[11px] font-mono font-medium transition-colors
					{floor === fl.number ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}"
				onclick={() => onfloorchange?.(fl.number)}
			>{fmt(fl.number)}</button>
		{/each}
		<button
			class="h-6 w-6 rounded bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600 flex items-center justify-center transition-colors"
			title="Manage floors"
			onclick={onmanagefloors}
		><Icon name="plus" size={12} /></button>
	</div>

	<div class="w-px h-4 bg-gray-200"></div>

	<!-- Server Room pills -->
	<span class="text-[10px] text-gray-400 uppercase tracking-wider">Room</span>
	<div class="flex gap-0.5">
		{#each ['A', 'B', 'C', 'D'].slice(0, roomCount) as r}
			<button
				class="h-6 w-7 rounded text-[11px] font-semibold transition-colors
					{room === r ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}"
				onclick={() => onroomchange?.(r)}
			>{r}</button>
		{/each}
	</div>

	<div class="w-px h-4 bg-gray-200"></div>

	<!-- Row pills -->
	<span class="text-[10px] text-gray-400 uppercase tracking-wider">Row</span>
	<div class="flex gap-0.5">
		{#each rows as row}
			<div class="relative group">
				<button
					class="h-6 px-2 rounded text-[11px] font-medium transition-colors
						{activeRowId === row.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}"
					onclick={() => onactiverowchange?.(row.id)}
				>{row.label}</button>
				{#if rows.length > 1}
					<button
						class="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 text-white text-[7px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
						onclick={e => { e.stopPropagation(); ondeleterow?.(row.id) }}
					>&times;</button>
				{/if}
			</div>
		{/each}
		<button
			class="h-6 w-6 rounded bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600 flex items-center justify-center transition-colors"
			title="Add row"
			onclick={onaddrow}
		><Icon name="plus" size={12} /></button>
	</div>
</div>
