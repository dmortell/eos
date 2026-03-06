<script lang="ts">
	export interface FloorConfig {
		number: number
		serverRoomCount: number
		roomNames?: Record<string, string> // e.g. { A: 'HR11-1', B: 'SER11' }
	}

	let { open = false, floors, floorFormat = 'L01', onclose, onupdate, ondelete }: {
		open: boolean
		floors: FloorConfig[]
		floorFormat?: string
		onclose: () => void
		onupdate: (floors: FloorConfig[]) => void
		ondelete: (floorNumber: number) => void
	} = $props()

	let newFloorNumber = $state(1)
	let newRoomCount = $state(1)
	let confirmingDelete = $state<number | null>(null)
	let editingRoomNames = $state<number | null>(null)
	let error = $state('')

	// Reset form when dialog opens
	$effect(() => {
		if (open) {
			const maxFloor = floors.length > 0 ? Math.max(...floors.map(f => f.number)) : 0
			newFloorNumber = maxFloor + 1
			newRoomCount = 1
			confirmingDelete = null
			error = ''
		}
	})

	function fmtFloor(fl: number): string {
		if (fl < 0) {
			const n = String(Math.abs(fl)).padStart(2, '0')
			if (floorFormat === '01F') return `B${Math.abs(fl)}F`
			if (floorFormat === '01') return `B${n}`
			return `B${n}`
		}
		const n = String(fl).padStart(2, '0')
		if (floorFormat === '01F') return `${n}F`
		if (floorFormat === '01') return n
		return `L${n}`
	}

	function addFloor() {
		const num = Math.max(-9, Math.min(200, Math.round(newFloorNumber) || 1))
		if (floors.find(f => f.number === num)) {
			error = `Floor ${fmtFloor(num)} already exists`
			return
		}
		error = ''
		const updated = [...floors, { number: num, serverRoomCount: newRoomCount }].sort((a, b) => a.number - b.number)
		onupdate(updated)
		newFloorNumber = Math.max(...updated.map(f => f.number)) + 1
	}

	function updateRoomCount(floorNumber: number, count: number) {
		const updated = floors.map(f => f.number === floorNumber ? { ...f, serverRoomCount: count } : f)
		onupdate(updated)
	}

	function updateRoomName(floorNumber: number, room: string, name: string) {
		const updated = floors.map(f => {
			if (f.number !== floorNumber) return f
			const roomNames = { ...(f.roomNames ?? {}), [room]: name }
			// Remove empty names
			if (!name) delete roomNames[room]
			return { ...f, roomNames: Object.keys(roomNames).length > 0 ? roomNames : undefined }
		})
		onupdate(updated)
	}

	function getRoomLabel(fl: FloorConfig, room: string): string {
		return fl.roomNames?.[room] || room
	}

	function doDelete(floorNumber: number) {
		confirmingDelete = null
		ondelete(floorNumber)
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onclick={onclose} onkeydown={e => e.key === 'Escape' && onclose()}>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="bg-white rounded-lg shadow-xl border border-gray-200 w-125 max-h-[80vh] flex flex-col" onclick={e => e.stopPropagation()}>
			<div class="p-4 border-b border-gray-200 space-y-3">
				<div class="flex items-center justify-between">
					<div>
						<h2 class="font-semibold text-sm">Floor Manager</h2>
						<p class="text-xs text-gray-500">Manage floors, server rooms and room names. Use negative numbers for basements (e.g. -1 = B01).</p>
					</div>
					<button class="text-gray-400 hover:text-gray-600 text-lg" onclick={onclose}>&times;</button>
				</div>

				<!-- Add floor form -->
				<div class="flex items-end gap-2">
					<label class="text-[10px] text-gray-500 uppercase tracking-wider">Floor #
						<input bind:value={newFloorNumber} type="number" min="-9" max="200"
							class="w-16 h-7 px-2 text-xs font-mono bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
							onkeydown={e => e.key === 'Enter' && addFloor()}
						/>
					</label>
					<button class="h-7 px-3 text-[11px] bg-blue-600 text-white rounded hover:bg-blue-500 transition-colors" onclick={addFloor}>Add</button>
				</div>
				{#if error}
					<p class="text-[10px] text-red-500 -mt-2">{error}</p>
				{/if}
			</div>

			<div class="flex-1 overflow-y-auto p-4 space-y-4">
				<!-- Floor list -->
				{#if floors.length === 0}
					<p class="text-xs text-gray-400 text-center py-4">No floors yet. Add one above.</p>
				{:else}
					<div class="space-y-0.5">
						{#each [...floors].sort((a, b) => a.number - b.number) as fl (fl.number)}
							<div class="rounded bg-gray-50 border border-gray-100">
								<div class="flex items-center gap-3 px-3 py-2">
									<!-- Floor label -->
									<span class="font-mono text-xs font-semibold text-blue-600 w-10 shrink-0">{fmtFloor(fl.number)}</span>

									<!-- Room count buttons -->
									<div class="flex items-center gap-1.5">
										<span class="text-[10px] text-gray-400">Rooms:</span>
										<div class="flex">
											{#each [1, 2, 3, 4] as n}
												<button
													class="h-6 w-6 text-[10px] font-mono border -ml-px first:ml-0 first:rounded-l last:rounded-r transition-colors
														{fl.serverRoomCount === n ? 'bg-blue-100 border-blue-300 text-blue-700 z-10' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-100'}"
													onclick={() => updateRoomCount(fl.number, n)}
												>{n}</button>
											{/each}
										</div>
										<span class="text-[10px] text-gray-500 ml-1">
											({['A', 'B', 'C', 'D'].slice(0, fl.serverRoomCount).map(r => getRoomLabel(fl, r)).join(', ')})
										</span>
										<button class="p-0.5 rounded text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Edit room names"
											onclick={() => editingRoomNames = editingRoomNames === fl.number ? null : fl.number}>
											<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
										</button>
									</div>

									<div class="flex-1"></div>

									<!-- Delete -->
									{#if confirmingDelete === fl.number}
										<div class="flex items-center gap-1 text-[10px]">
											<span class="text-red-600 font-medium">Delete all data?</span>
											<button class="px-1.5 py-0.5 bg-red-600 text-white rounded text-[10px] hover:bg-red-700" onclick={() => doDelete(fl.number)}>Yes</button>
											<button class="px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded text-[10px] hover:bg-gray-300" onclick={() => confirmingDelete = null}>No</button>
										</div>
									{:else}
										<button
											class="text-gray-300 hover:text-red-500 transition-colors"
											title="Delete floor"
											onclick={() => confirmingDelete = fl.number}
										>&times;</button>
									{/if}
								</div>

								<!-- Room name editor (expandable) -->
								{#if editingRoomNames === fl.number}
									<div class="flex items-center gap-2 px-3 pb-2 pt-0.5 border-t border-gray-100">
										{#each ['A', 'B', 'C', 'D'].slice(0, fl.serverRoomCount) as room}
											<label class="flex items-center gap-0.5 text-[10px] text-gray-400">
												<span class="font-mono font-medium">{room}:</span>
												<input class="w-20 h-5 px-1 text-[10px] border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
													value={fl.roomNames?.[room] ?? ''}
													placeholder={room}
													onchange={e => updateRoomName(fl.number, room, e.currentTarget.value.trim())} />
											</label>
										{/each}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
