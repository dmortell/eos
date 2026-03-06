<script lang="ts">
	import type { LocationConfig } from './types'
	import LocationRow from './LocationRow.svelte'

	import type { Snippet } from 'svelte'

	let { locations, hasTwoRooms = false, selectedLocations, customTypes = [], zoneForLoc, onupdate, onselect, children }: {
		locations: LocationConfig[]
		hasTwoRooms?: boolean
		selectedLocations?: Set<string>
		customTypes?: string[]
		/** Returns the zone letter for a given index — used for selection keys */
		zoneForLoc?: (index: number) => string
		onupdate: (index: number, loc: LocationConfig) => void
		onselect?: (key: string, e: MouseEvent | KeyboardEvent) => void
		children?: Snippet
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
				{#if selectedLocations && selectedLocations.size > 1}
					<span class="text-blue-500 ml-1">({selectedLocations.size} selected)</span>
				{/if}
			</span>
			{@render children?.()}
		</div>
		<div class="flex items-center justify-between px-1">
			<span class="text-[10px] text-gray-400 ">
				Select multiple items with shift-click/ctrl-click
			</span>
		</div>

		<div class="space-y-1 pr-1 select-none">
			{#each locations as loc, i (locKey(i, loc))}
				{@const key = locKey(i, loc)}
				<LocationRow
					location={loc}
					{hasTwoRooms}
					{customTypes}
					selected={selectedLocations?.has(key) ?? false}
					locKey={key}
					onupdate={updated => onupdate(i, updated)}
					onselect={e => onselect?.(key, e)}
				/>
			{/each}
		</div>
	</div>
{/if}
