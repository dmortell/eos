<script lang="ts">
	import type { LocationConfig } from './types'
	import LocationRow from './LocationRow.svelte'

	let { locations, hasTwoRooms = false, selectedLocation, customTypes = [], zoneForLoc, onupdate, onselect }: {
		locations: LocationConfig[]
		hasTwoRooms?: boolean
		selectedLocation?: string | null
		customTypes?: string[]
		/** Returns the zone letter for a given index — used for selection keys */
		zoneForLoc?: (index: number) => string
		onupdate: (index: number, loc: LocationConfig) => void
		onselect?: (key: string) => void
	} = $props()

	function locKey(index: number, loc: LocationConfig): string {
		const z = zoneForLoc ? zoneForLoc(index) : ''
		return `${z}-${loc.locationNumber}`
	}
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
			<slot />
		</div>

		<div class="space-y-1 pr-1">
			{#each locations as loc, i (locKey(i, loc))}
				{@const key = locKey(i, loc)}
				<LocationRow
					location={loc}
					{hasTwoRooms}
					{customTypes}
					selected={key === selectedLocation}
					locKey={key}
					onupdate={updated => onupdate(i, updated)}
					onselect={() => onselect?.(key)}
				/>
			{/each}
		</div>
	</div>
{/if}
