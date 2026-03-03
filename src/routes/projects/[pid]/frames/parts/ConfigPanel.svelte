<script lang="ts">
	import { Button, Input } from '$lib'
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

	function setServerRooms(count: 1 | 2) {
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

<div class="space-y-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
	<h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Zone Configuration</h3>

	<div class="grid grid-cols-2 gap-2">
		<!-- Floor -->
		<div class="space-y-1">
			<label class="text-[10px] text-gray-500 uppercase tracking-wider">Floor</label>
			<input
				type="number" min="1" max="20"
				value={zone.floor}
				onchange={e => setFloor(e.currentTarget.value)}
				class="w-full h-8 px-2 text-sm font-mono bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
			/>
		</div>

		<!-- Zone -->
		<div class="space-y-1">
			<label class="text-[10px] text-gray-500 uppercase tracking-wider">Zone</label>
			<select
				value={zone.zone}
				onchange={e => setZone(e.currentTarget.value)}
				class="w-full h-8 px-2 text-sm font-mono bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
			>
				{#each zones as z}
					<option value={z}>{z}</option>
				{/each}
			</select>
		</div>
	</div>

	<!-- Server rooms -->
	<div class="space-y-1">
		<label class="text-[10px] text-gray-500 uppercase tracking-wider">Server Rooms</label>
		<div class="flex">
			<Button
				group
				active={zone.serverRoomCount === 1}
				onclick={() => setServerRooms(1)}
			>1 (A)</Button>
			<Button
				group
				active={zone.serverRoomCount === 2}
				onclick={() => setServerRooms(2)}
			>2 (A/B)</Button>
		</div>
	</div>

	<!-- Location count + generate -->
	<div class="space-y-1">
		<label class="text-[10px] text-gray-500 uppercase tracking-wider">Number of Locations</label>
		<div class="flex gap-2">
			<input
				type="number" min="1" max="999"
				bind:value={locationCount}
				class="flex-1 h-8 px-2 text-sm font-mono bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
			/>
			<Button variant="primary" onclick={generate}>Generate</Button>
		</div>
	</div>
</div>
