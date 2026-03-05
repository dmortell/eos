<script lang="ts">
	import { Icon } from '$lib'
	import type { RackRow } from './types'

	let { floor, room, rows = [], activeRowId = '', onfloor, onroom, onrow, ondeleterow }: {
		floor: number
		room: string
		rows: RackRow[]
		activeRowId: string
		onfloor?: (floor: number) => void
		onroom?: (room: string) => void
		onrow?: (rowId: string) => void
		ondeleterow?: (rowId: string) => void
	} = $props()

	let confirmingDeleteRow = $state<string | null>(null)

	const rooms = ['A', 'B', 'C', 'D']
</script>

<!-- Row delete confirmation -->
{#if confirmingDeleteRow}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onclick={() => confirmingDeleteRow = null}>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="bg-white rounded-lg shadow-xl border border-gray-200 p-4 w-72" onclick={e => e.stopPropagation()}>
			<p class="text-sm text-gray-700 mb-3">Delete <strong>{rows.find(r => r.id === confirmingDeleteRow)?.label}</strong>? All racks and devices in this row will be removed.</p>
			<div class="flex gap-2 justify-end">
				<button class="px-3 py-1.5 text-xs rounded border border-gray-200 hover:bg-gray-50" onclick={() => confirmingDeleteRow = null}>Cancel</button>
				<button class="px-3 py-1.5 text-xs rounded bg-red-600 text-white hover:bg-red-500" onclick={() => { ondeleterow?.(confirmingDeleteRow!); confirmingDeleteRow = null }}>Delete</button>
			</div>
		</div>
	</div>
{/if}

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
					<div class="flex-1 relative group">
						<button
							class="w-full h-7 text-xs font-medium rounded transition-colors
								{activeRowId === row.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
							onclick={() => onrow?.(row.id)}
						>{row.label}</button>
						{#if rows.length > 1}
							<button
								class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
								title="Delete {row.label}"
								onclick={e => { e.stopPropagation(); confirmingDeleteRow = row.id }}
							>&times;</button>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
