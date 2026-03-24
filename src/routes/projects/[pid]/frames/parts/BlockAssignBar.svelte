<script lang="ts">
	import { Button } from '$lib'
	import { DEFAULT_LOC_TYPES, LOC_TYPE_LABELS, LOC_TYPE_COLORS } from './types'
	import type { LocType } from './types'

	let { count, customTypes = [], onassign, onremove, onclear }: {
		count: number
		customTypes?: string[]
		onassign: (type: LocType) => void
		onremove: () => void
		onclear: () => void
	} = $props()

	let allTypes = $derived<string[]>([
		...DEFAULT_LOC_TYPES.filter(t => t !== 'N/A'),
		...customTypes.filter(t => !DEFAULT_LOC_TYPES.includes(t as any)),
	])
</script>

{#if count > 0}
	<div class="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs flex-wrap">
		<span class="font-mono font-semibold text-blue-700">{count} port{count !== 1 ? 's' : ''}</span>
		<span class="text-blue-400">|</span>
		<span class="text-gray-500">Assign:</span>
		<div class="flex items-center gap-0.5 flex-wrap">
			{#each allTypes as t (t)}
				{@const colors = LOC_TYPE_COLORS[t] ?? 'bg-gray-200 text-gray-600'}
				<button
					class="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border transition-colors hover:opacity-80 {colors}"
					onclick={() => onassign(t as LocType)}
					title={LOC_TYPE_LABELS[t] ?? t}
				>{t}</button>
			{/each}
		</div>
		<span class="text-blue-400">|</span>
		<button
			class="text-[10px] text-red-500 hover:text-red-700 font-medium"
			onclick={onremove}
			title="Remove reservation from selected ports (Delete)"
		>Remove</button>
		<button
			class="text-[10px] text-gray-400 hover:text-gray-600 font-medium"
			onclick={onclear}
			title="Deselect ports without changing reservations (Esc)"
		>Clear</button>
	</div>
{/if}
