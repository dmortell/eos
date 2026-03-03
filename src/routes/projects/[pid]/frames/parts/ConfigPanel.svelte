<script lang="ts">
	import { Button } from '$lib'
	import type { ZoneConfig } from './types'
	import { defaultLocations } from './types'

	let { zone, onupdate }: {
		zone: ZoneConfig
		onupdate: (zone: ZoneConfig) => void
	} = $props()

	let locationCount = $state(zone.locations.length || 10)

	const zones = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

	function setFloor(val: string) {
		const n = Math.max(1, Math.min(20, parseInt(val) || 1))
		onupdate({ ...zone, floor: n })
	}

	function setZone(val: string) {
		onupdate({ ...zone, zone: val })
	}

	function setServerRooms(count: number) {
		onupdate({ ...zone, serverRoomCount: count })
	}

	function generate() {
		const existing = zone.locations
		const locs = Array.from({ length: locationCount }, (_, i) => {
			// Keep existing location config if it exists at this index
			if (i < existing.length) return existing[i]
			// Otherwise create a new default location
			return {
				locationNumber: i + 1,
				portCount: 2,
				serverRoomAssignment: ['A' as const, 'A' as const],
				locationType: 'desk' as const,
			}
		})
		onupdate({ ...zone, locations: locs })
	}
</script>

<div class="space-y-2 p-2.5 bg-gray-50 rounded-lg border border-gray-200">
	<h3 class="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Zone Configuration</h3>

	<div class="grid grid-cols-4 gap-1.5 items-end">
		<!-- Floor -->
		<div>
			<label class="text-[10px] text-gray-500 uppercase tracking-wider">Floor</label>
			<input
				type="number" min="1" max="20"
				value={zone.floor}
				onchange={e => setFloor(e.currentTarget.value)}
				class="w-full h-7 px-2 text-xs font-mono bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
			/>
		</div>

		<!-- Zone -->
		<div>
			<label class="text-[10px] text-gray-500 uppercase tracking-wider">Zone</label>
			<select
				value={zone.zone}
				onchange={e => setZone(e.currentTarget.value)}
				class="w-full h-7 px-1 text-xs font-mono bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
			>
				{#each zones as z}
					<option value={z}>{z}</option>
				{/each}
			</select>
		</div>

		<!-- Location count + generate -->
		<div class="col-span-2">
			<label class="text-[10px] text-gray-500 uppercase tracking-wider">Locations</label>
			<div class="flex gap-1">
				<input
					type="number" min="1" max="999"
					bind:value={locationCount}
					class="flex-1 h-7 px-2 text-xs font-mono bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
				/>
				<button
					class="h-7 px-2.5 text-xs font-medium bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
					onclick={generate}
				>Generate</button>
			</div>
		</div>
	</div>

	<!-- Server rooms -->
	<div class="flex items-center gap-2">
		<label class="text-[10px] text-gray-500 uppercase tracking-wider shrink-0">Server Rooms</label>
		<div class="flex">
			{#each [1, 2, 3, 4] as n}
				<button
					class="h-7 w-7 text-xs font-mono border -ml-px first:ml-0 first:rounded-l last:rounded-r transition-colors
						{zone.serverRoomCount === n ? 'bg-blue-100 border-blue-300 text-blue-700 z-10' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-100'}"
					onclick={() => setServerRooms(n)}
				>{n}</button>
			{/each}
		</div>
	</div>
</div>
