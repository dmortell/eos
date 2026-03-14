<script lang="ts">
	import { Icon } from '$lib'
	import type { FloorConfig } from '$lib/types/project'
	import { fmtFloor } from '$lib/utils/floor'

	let { floors = [], floor, floorFormat = 'L01', onfloorchange, onmanage }: {
		floors: FloorConfig[]
		floor: number
		floorFormat?: string
		onfloorchange?: (floor: number) => void
		onmanage?: () => void
	} = $props()

	const fmt = (fl: number) => fmtFloor(fl, floorFormat, floors)
</script>

<div class="flex items-stretch gap-0 overflow-x-auto">
	{#each floors as fl (fl.number)}
		<button
			class="px-3 text-[11px] font-mono font-medium border-r border-gray-200 transition-colors
				{floor === fl.number ? 'bg-white text-blue-600 border-t-2 border-t-blue-500' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600 border-t-2 border-t-transparent'}"
			onclick={() => onfloorchange?.(fl.number)}
		>{fmt(fl.number)}</button>
	{/each}
	<button
		class="px-2 text-gray-300 hover:text-gray-500 transition-colors"
		title="Manage floors"
		onclick={onmanage}
	><Icon name="plus" size={12} /></button>
</div>
