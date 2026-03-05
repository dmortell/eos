<script lang="ts">
	import type { LocationConfig } from './types'

	let { floor, serverRoomCount, activeZone, locations, floorLabel = '', onserverrooms, onzone, ongenerate }: {
		floor: number
		serverRoomCount: number
		activeZone: string
		locations: LocationConfig[]
		floorLabel?: string
		onserverrooms: (count: number) => void
		onzone: (zone: string) => void
		ongenerate: (count: number) => void
	} = $props()

	let locationCount = $state(locations.length || 10)

	const zones = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

	// Sync locationCount when switching zones
	$effect(() => {
		if (locations.length > 0) locationCount = locations.length
	})
</script>

<div class="space-y-1.5 p-2.5 bg-gray-50 rounded-lg border border-gray-200">
	<!-- Row 1: Floor + Server Rooms -->
	<div class="grid grid-cols-2 gap-1.5 items-end">
		<div>
			<label class="text-[10px] text-gray-500 uppercase tracking-wider">Floor</label>
			<div class="h-7 px-2 text-xs font-mono bg-gray-100 border border-gray-200 rounded flex items-center text-gray-600">
				{floorLabel || floor}
			</div>
		</div>
		<div>
			<label class="text-[10px] text-gray-500 uppercase tracking-wider">Server Rooms</label>
			<div class="flex">
				{#each [1, 2, 3, 4] as n}
					<button
						class="h-7 w-7 text-xs font-mono border -ml-px first:ml-0 first:rounded-l last:rounded-r transition-colors
							{serverRoomCount === n ? 'bg-blue-100 border-blue-300 text-blue-700 z-10' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-100'}"
						onclick={() => onserverrooms(n)}
					>{n}</button>
				{/each}
			</div>
		</div>
	</div>

	<!-- Row 2: Zone select + Locations + Generate -->
	<div class="grid grid-cols-[1fr_2fr] gap-1.5 items-end">
		<div>
			<label class="text-[10px] text-gray-500 uppercase tracking-wider">Zone</label>
			<select
				value={activeZone}
				onchange={e => onzone(e.currentTarget.value)}
				class="w-full h-7 px-1 text-xs font-mono bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
			>
				{#each zones as z}
					<option value={z}>{z}</option>
				{/each}
			</select>
		</div>
		<div>
			<label class="text-[10px] text-gray-500 uppercase tracking-wider">Locations</label>
			<div class="flex gap-1">
				<input
					type="number" min="1" max="999"
					bind:value={locationCount}
					class="flex-1 h-7 px-2 text-xs font-mono bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
				/>
				<button
					class="h-7 px-2.5 text-xs font-medium bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
					onclick={() => ongenerate(locationCount)}
				>Generate</button>
			</div>
		</div>
	</div>
</div>
