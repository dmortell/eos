<script lang="ts">
	import type { LocationConfig } from './types'
	import LocationRow from './LocationRow.svelte'

	let { locations, hasTwoRooms = false, selectedLocation, customTypes = [], onupdate, onselect }: {
		locations: LocationConfig[]
		hasTwoRooms?: boolean
		selectedLocation?: number | null
		customTypes?: string[]
		onupdate: (index: number, loc: LocationConfig) => void
		onselect?: (locNum: number) => void
	} = $props()
</script>

{#if locations.length === 0}
	<div class="text-center text-gray-400 text-sm py-8">
		Set the number of locations above and click Generate
	</div>
{:else}
	<div class="space-y-1">
		<div class="flex items-center justify-between px-1">
			<span class="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
				{locations.length} location{locations.length !== 1 ? 's' : ''}
			</span>
		</div>

		<div class="space-y-1 overflow-y-auto max-h-[calc(100vh-280px)] pr-1">
			{#each locations as loc, i (loc.locationNumber)}
				<LocationRow
					location={loc}
					{hasTwoRooms}
					{customTypes}
					selected={loc.locationNumber === selectedLocation}
					onupdate={updated => onupdate(i, updated)}
					{onselect}
				/>
			{/each}
		</div>
	</div>
{/if}
