<script lang="ts">
	import { Button } from '$lib'
	import type { LocationConfig, LocType } from './types'
	import { DEFAULT_LOC_TYPES, LOC_TYPE_LABELS } from './types'

	let { location, hasTwoRooms = false, selected = false, customTypes = [], locKey = '', onupdate, onselect }: {
		location: LocationConfig
		hasTwoRooms?: boolean
		selected?: boolean
		customTypes?: string[]
		locKey?: string
		onupdate: (loc: LocationConfig) => void
		onselect?: () => void
	} = $props()

	let allTypes = $derived([...DEFAULT_LOC_TYPES, ...customTypes])

	function setPortCount(val: string) {
		const count = Math.max(1, Math.min(99, parseInt(val) || 2))
		const assignments = Array.from({ length: count }, (_, i) =>
			location.serverRoomAssignment[i] || 'A'
		) as ('A' | 'B')[]
		onupdate({ ...location, portCount: count, serverRoomAssignment: assignments })
	}

	function setType(t: LocType) {
		onupdate({ ...location, locationType: t })
	}

	function setRoomNumber(val: string) {
		onupdate({ ...location, roomNumber: val || undefined })
	}

	function toggleHighLevel() {
		onupdate({ ...location, isHighLevel: !location.isHighLevel })
	}

	function toggleRoom(portIdx: number) {
		const assignments = [...location.serverRoomAssignment]
		assignments[portIdx] = assignments[portIdx] === 'A' ? 'B' : 'A'
		onupdate({ ...location, serverRoomAssignment: assignments })
	}

	function splitEven() {
		const half = Math.floor(location.portCount / 2)
		const assignments = location.serverRoomAssignment.map((_, i) =>
			i < half ? 'A' as const : 'B' as const
		)
		onupdate({ ...location, serverRoomAssignment: assignments })
	}

	function allTo(room: 'A' | 'B') {
		onupdate({
			...location,
			serverRoomAssignment: Array(location.portCount).fill(room),
		})
	}

	/** Wrap handler to stop propagation (Svelte 5 has no event modifiers) */
	function stop(fn: () => void) {
		return (e: Event) => { e.stopPropagation(); fn() }
	}
</script>

<div
	class="rounded-md p-2 space-y-1.5 transition-colors cursor-pointer border"
	class:bg-blue-50={selected}
	class:border-blue-300={selected}
	class:bg-gray-50={!selected}
	class:border-gray-200={!selected}
	class:hover:bg-gray-100={!selected}
	data-loc-row={locKey}
	onclick={() => onselect?.()}
	role="button"
	tabindex="0"
	onkeydown={e => e.key === 'Enter' && onselect?.()}
>
	<!-- Top line: loc number, ports, room, high-level, type buttons -->
	<div class="flex items-center gap-1.5 flex-wrap">
		<span class="font-mono text-xs font-semibold shrink-0 {location.isHighLevel ? 'text-amber-600' : 'text-blue-600'}">
			{String(location.locationNumber).padStart(3, '0')}{#if location.isHighLevel}<span class="text-[8px]">H</span>{/if}
		</span>

		<input
			type="number" min="1" max="99"
			value={location.portCount}
			onclick={e => e.stopPropagation()}
			onchange={e => setPortCount(e.currentTarget.value)}
			class="w-11 h-5 px-1 text-[10px] font-mono bg-white border border-gray-200 rounded text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
			title="Port count"
		/>

		<input
			type="text"
			maxlength="4"
			placeholder="room"
			value={location.roomNumber ?? ''}
			onclick={e => e.stopPropagation()}
			onchange={e => setRoomNumber(e.currentTarget.value)}
			class="w-11 h-5 px-1 text-[10px] font-mono bg-white border border-gray-200 rounded text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
			title="Room number"
		/>

		<label class="flex items-center gap-0.5 cursor-pointer shrink-0" onclick={e => e.stopPropagation()} title="High-level (ceiling) port">
			<input
				type="checkbox"
				checked={location.isHighLevel ?? false}
				onchange={toggleHighLevel}
				class="w-3 h-3 rounded"
			/>
			<span class="text-[9px] text-gray-400">HL</span>
		</label>

		<!-- Type quick-select -->
		<div class="flex ml-auto">
			{#each allTypes as t}
				<button
					class="text-[9px] px-1 py-0.5 border -ml-px first:ml-0 first:rounded-l last:rounded-r transition-colors"
					class:bg-blue-100={location.locationType === t}
					class:border-blue-300={location.locationType === t}
					class:text-blue-700={location.locationType === t}
					class:bg-white={location.locationType !== t}
					class:border-gray-200={location.locationType !== t}
					class:text-gray-500={location.locationType !== t}
					class:hover:bg-gray-50={location.locationType !== t}
					onclick={stop(() => setType(t))}
					title={LOC_TYPE_LABELS[t] ?? t}
				>{t}</button>
			{/each}
		</div>
	</div>

	<!-- Server room assignments (only when 2 rooms) -->
	{#if hasTwoRooms && location.portCount > 0}
		<div class="flex items-center gap-1 flex-wrap">
			<div class="flex gap-0.5 flex-wrap flex-1">
				{#each location.serverRoomAssignment as room, pIdx}
					<button
						class="font-mono text-[9px] px-1 py-0.5 rounded transition-colors border"
						class:bg-blue-100={room === 'A'}
						class:border-blue-300={room === 'A'}
						class:text-blue-600={room === 'A'}
						class:bg-purple-100={room === 'B'}
						class:border-purple-300={room === 'B'}
						class:text-purple-600={room === 'B'}
						onclick={stop(() => toggleRoom(pIdx))}
					>P{String(pIdx + 1).padStart(2, '0')}:{room}</button>
				{/each}
			</div>
			<div class="flex gap-0.5 shrink-0">
				<button class="text-[8px] px-1 py-0.5 rounded bg-gray-100 border border-gray-200 text-gray-500 hover:bg-gray-200" onclick={stop(splitEven)}>50/50</button>
				<button class="text-[8px] px-1 py-0.5 rounded bg-gray-100 border border-gray-200 text-gray-500 hover:bg-gray-200" onclick={stop(() => allTo('A'))}>All A</button>
				<button class="text-[8px] px-1 py-0.5 rounded bg-gray-100 border border-gray-200 text-gray-500 hover:bg-gray-200" onclick={stop(() => allTo('B'))}>All B</button>
			</div>
		</div>
	{/if}
</div>
