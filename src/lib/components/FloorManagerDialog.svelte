<script lang="ts">
	import { Button } from '$lib'

	export interface FloorConfig {
		number: number
		serverRoomCount: number
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
		const n = String(fl).padStart(2, '0')
		if (floorFormat === '01F') return `${n}F`
		if (floorFormat === '01') return n
		return `L${n}`
	}

	function addFloor() {
		const num = Math.max(1, Math.min(99, Math.round(newFloorNumber) || 1))
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
		<div class="bg-white rounded-lg shadow-xl border border-gray-200 w-[500px] max-h-[80vh] flex flex-col" onclick={e => e.stopPropagation()}>
			<div class="flex items-center justify-between p-4 border-b border-gray-200">
				<h2 class="font-semibold text-sm">Floor Manager</h2>
				<button class="text-gray-400 hover:text-gray-600 text-lg" onclick={onclose}>&times;</button>
			</div>

			<div class="flex-1 overflow-y-auto p-4 space-y-4">
				<!-- Floor list -->
				{#if floors.length === 0}
					<p class="text-xs text-gray-400 text-center py-4">No floors yet. Add one below.</p>
				{:else}
					<div class="space-y-0.5">
						{#each [...floors].sort((a, b) => a.number - b.number) as fl (fl.number)}
							<div class="flex items-center gap-3 px-3 py-2 rounded bg-gray-50 border border-gray-100">
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
									<span class="text-[10px] text-gray-300 ml-1">
										({['A', 'B', 'C', 'D'].slice(0, fl.serverRoomCount).join(', ')})
									</span>
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
						{/each}
					</div>
				{/if}

				<!-- Add floor form -->
				<div class="border-t border-gray-200 pt-4">
					<div class="flex items-end gap-2">
						<div>
							<label class="text-[10px] text-gray-500 uppercase tracking-wider">Floor #</label>
							<input
								type="number" min="1" max="99"
								bind:value={newFloorNumber}
								class="w-16 h-7 px-2 text-xs font-mono bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
								onkeydown={e => e.key === 'Enter' && addFloor()}
							/>
						</div>
						<div>
							<label class="text-[10px] text-gray-500 uppercase tracking-wider">Rooms</label>
							<div class="flex">
								{#each [1, 2, 3, 4] as n}
									<button
										class="h-7 w-7 text-xs font-mono border -ml-px first:ml-0 first:rounded-l last:rounded-r transition-colors
											{newRoomCount === n ? 'bg-blue-100 border-blue-300 text-blue-700 z-10' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-100'}"
										onclick={() => newRoomCount = n}
									>{n}</button>
								{/each}
							</div>
						</div>
						<Button onclick={addFloor}>Add Floor</Button>
					</div>
					{#if error}
						<p class="text-[10px] text-red-500 mt-1">{error}</p>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}
