<script lang="ts">
	import type { RackRow } from './types'

	let { floor, room, rows = [], activeRowId = '', onfloor, onroom, onrow }: {
		floor: number
		room: string
		rows: RackRow[]
		activeRowId: string
		onfloor?: (floor: number) => void
		onroom?: (room: string) => void
		onrow?: (rowId: string) => void
	} = $props()

	const rooms = ['A', 'B', 'C', 'D']
</script>

<div class="space-y-2 p-2 border-b border-gray-200">
	<div class="grid grid-cols-2 gap-2">
		<!-- Floor -->
		<label class="text-[10px] text-gray-500 font-medium">
			Floor
			<input type="number" min="1" max="99" value={floor}
				class="w-full mt-0.5 h-7 px-2 text-sm border border-gray-300 rounded"
				onchange={e => onfloor?.(parseInt(e.currentTarget.value) || 1)} />
		</label>

		<!-- Room -->
		<div class="text-[10px] text-gray-500 font-medium">
			Server Room
			<div class="flex gap-0.5 mt-0.5">
				{#each rooms as r}
					<button
						class="flex-1 h-7 text-xs font-medium rounded transition-colors
							{room === r ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
						onclick={() => onroom?.(r)}
					>{r}</button>
				{/each}
			</div>
		</div>
	</div>

	<!-- Row selector (only show if multiple rows) -->
	{#if rows.length > 1}
		<div class="text-[10px] text-gray-500 font-medium">
			Row
			<div class="flex gap-0.5 mt-0.5">
				{#each rows as row}
					<button
						class="flex-1 h-7 text-xs font-medium rounded transition-colors
							{activeRowId === row.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
						onclick={() => onrow?.(row.id)}
					>{row.label}</button>
				{/each}
			</div>
		</div>
	{/if}
</div>
