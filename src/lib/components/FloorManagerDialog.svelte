<script lang="ts">
	import { fmtFloor } from '$lib/utils/floor'
	export type { FloorConfig } from '$lib/types/project'
	import type { FloorConfig } from '$lib/types/project'

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
	let editingAreas = $state<number | null>(null)
	let editingLabel = $state<number | null>(null)
	let editingNumber = $state<number | null>(null)
	let error = $state('')

	// Reset form when dialog opens
	$effect(() => {
		if (open) {
			const maxFloor = floors.length > 0 ? Math.max(...floors.map(f => f.number)) : 0
			newFloorNumber = maxFloor + 1
			newRoomCount = 1
			confirmingDelete = null
			editingLabel = null
			editingNumber = null
			editingAreas = null
			error = ''
		}
	})

	/** Local shorthand: format a floor number using this dialog's floorFormat + floors */
	const fmt = (fl: number) => fmtFloor(fl, floorFormat, floors)

	function addFloor() {
		const num = Math.max(-9, Math.min(9999, Math.round(newFloorNumber) || 1))
		if (floors.find(f => f.number === num)) {
			error = `Floor ${fmt(num)} already exists`
			return
		}
		error = ''
		const roomCount = Math.max(1, Math.min(4, Math.round(newRoomCount) || 1))
		const updated = [...floors, { number: num, serverRoomCount: roomCount }].sort((a, b) => a.number - b.number)
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

	function updateFloorLabel(floorNumber: number, label: string) {
		const updated = floors.map(f => f.number === floorNumber ? { ...f, label: label || undefined } : f)
		onupdate(updated)
		editingLabel = null
	}

	/** Renumber an existing floor. The number drives the building stack / floor
	 *  range (risers, rack/frame doc ids), so a typo here (e.g. 200 instead of 33)
	 *  inflates the whole stack — this lets you correct it without delete + re-add. */
	function updateFloorNumber(oldNumber: number, raw: string | number) {
		const num = Math.round(Number(raw))
		editingNumber = null
		if (!Number.isFinite(num) || num === oldNumber) { error = ''; return }
		if (num < -9 || num > 9999) { error = `Floor number must be between -9 and 9999`; return }
		if (floors.find(f => f.number === num)) { error = `Floor ${fmt(num)} already exists`; return }
		error = ''
		const updated = floors
			.map(f => f.number === oldNumber ? { ...f, number: num } : f)
			.sort((a, b) => a.number - b.number)
		onupdate(updated)
	}

	function getRoomLabel(fl: FloorConfig, room: string): string {
		return fl.roomNames?.[room] || room
	}

	// ── Tenant areas (outlets floorplans split per leased space) ──
	// `legacy` (immutable) marks the area that owns the floor's existing unsuffixed
	// doc — set on the first area so the original office needs no migration.
	// `primary` (editable) is just the default/featured space.
	function addArea(floorNumber: number) {
		const id = crypto.randomUUID().slice(0, 8)
		const updated = floors.map(f => {
			if (f.number !== floorNumber) return f
			const existing = f.areas ?? []
			const first = existing.length === 0
			const area = first
				? { id, label: f.label || 'Area 1', legacy: true, primary: true }
				: { id, label: `Area ${existing.length + 1}`, legacy: false }
			return { ...f, areas: [...existing, area] }
		})
		onupdate(updated)
	}
	function updateAreaLabel(floorNumber: number, areaId: string, label: string) {
		const updated = floors.map(f => f.number === floorNumber
			? { ...f, areas: (f.areas ?? []).map(a => a.id === areaId ? { ...a, label: label || a.label } : a) }
			: f)
		onupdate(updated)
	}
	/** Editable: re-point the default/featured space. Never touches `legacy`, so
	 *  no data moves (safe even when a tenant moves between offices). */
	function setPrimaryArea(floorNumber: number, areaId: string) {
		const updated = floors.map(f => f.number === floorNumber
			? { ...f, areas: (f.areas ?? []).map(a => ({ ...a, primary: a.id === areaId })) }
			: f)
		onupdate(updated)
	}
	function deleteArea(floorNumber: number, areaId: string) {
		const updated = floors.map(f => {
			if (f.number !== floorNumber) return f
			let areas = (f.areas ?? []).filter(a => a.id !== areaId)
			// Promote a new primary if we removed it. `legacy` is deliberately NOT
			// reassigned — the deleted area's `_F{NN}` doc just orphans; survivors
			// keep their own keys.
			if (areas.length && !areas.some(a => a.primary)) {
				areas = areas.map((a, i) => ({ ...a, primary: i === 0 }))
			}
			return { ...f, areas: areas.length ? areas : undefined }
		})
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
		<div class="bg-white rounded-lg shadow-xl border border-gray-200 w-125 max-h-[80vh] flex flex-col" onclick={e => e.stopPropagation()}>
			<div class="p-4 border-b border-gray-200 space-y-3">
				<div class="flex items-center justify-between">
					<div>
						<h2 class="font-semibold text-sm">Floor Manager</h2>
						<p class="text-xs text-gray-500">Manage floors, server rooms and room names. Use negative numbers for basements (e.g. -1 = B01).</p>
					</div>
					<button class="h-6 px-2 text-[11px] rounded border border-gray-200 bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800 transition-colors" onclick={onclose}>Close</button>
				</div>

				<!-- Add floor form -->
				<div class="flex items-end gap-2">
					<label class="text-[10px] text-gray-500 uppercase tracking-wider">Floor #
						<input bind:value={newFloorNumber} type="number" min="-9" max="9999"
							class="w-16 h-7 px-2 text-xs font-mono bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
							onkeydown={e => e.key === 'Enter' && addFloor()}
						/>
					</label>
					<label class="text-[10px] text-gray-500 uppercase tracking-wider">Rooms
						<input bind:value={newRoomCount} type="number" min="1" max="4"
							class="w-12 h-7 px-2 text-xs font-mono bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
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
									<!-- Floor number (editable) -->
									{#if editingNumber === fl.number}
										<!-- svelte-ignore a11y_autofocus -->
										<input type="number" min="-9" max="9999" autofocus
											class="w-14 h-6 px-1 text-xs font-mono font-semibold text-blue-600 border border-blue-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 shrink-0"
											value={fl.number}
											onkeydown={e => { if (e.key === 'Enter') updateFloorNumber(fl.number, e.currentTarget.value); if (e.key === 'Escape') editingNumber = null }}
											onblur={e => updateFloorNumber(fl.number, e.currentTarget.value)}
										/>
									{:else}
										<button class="font-mono text-xs font-semibold text-blue-600 w-10 shrink-0 text-left hover:underline" title="Edit floor number"
											onclick={() => { editingNumber = fl.number; error = '' }}>{fmt(fl.number)}</button>
									{/if}
									{#if editingLabel === fl.number}
										<input class="w-24 h-5 px-1 text-[10px] border border-blue-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
											value={fl.label ?? ''}
											placeholder="Label"
											onkeydown={e => { if (e.key === 'Enter') updateFloorLabel(fl.number, e.currentTarget.value.trim()); if (e.key === 'Escape') editingLabel = null }}
											onblur={e => updateFloorLabel(fl.number, e.currentTarget.value.trim())}
										/>
									{:else if fl.label}
										<span class="text-[10px] text-gray-600 font-medium">{fl.label}</span>
										<button class="p-0.5 rounded text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Edit floor label"
											onclick={() => editingLabel = fl.number}>
											<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
										</button>
									{:else}
										<button class="text-[10px] text-gray-300 hover:text-blue-500 transition-colors" title="Add floor label"
											onclick={() => editingLabel = fl.number}>rename</button>
									{/if}

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

									<!-- Tenant areas (separate outlets floorplans on one floor) -->
									<button class="flex items-center gap-1 text-[10px] text-gray-400 hover:text-emerald-600 transition-colors" title="Tenant areas — separate outlets floorplans on one floor"
										onclick={() => editingAreas = editingAreas === fl.number ? null : fl.number}>
										<span>Areas:</span>
										<span class="font-medium {fl.areas?.length ? 'text-emerald-600' : ''}">{fl.areas?.length ? fl.areas.map(a => a.label).join(', ') : '—'}</span>
									</button>

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

								<!-- Tenant area editor (expandable) -->
								{#if editingAreas === fl.number}
									<div class="flex flex-wrap items-center gap-2 px-3 pb-2 pt-0.5 border-t border-gray-100">
										{#each fl.areas ?? [] as area (area.id)}
											<div class="flex items-center gap-0.5 rounded {area.primary ? 'ring-1 ring-emerald-300 bg-emerald-50/50 px-1' : ''}">
												<button class="shrink-0 transition-colors {area.primary ? 'text-emerald-500' : 'text-gray-300 hover:text-emerald-400'}"
													title={area.primary ? 'Primary (default) space' : 'Make primary'}
													onclick={() => setPrimaryArea(fl.number, area.id)} aria-label="Set primary">
													<svg width="11" height="11" viewBox="0 0 24 24" fill={area.primary ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2l3 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.9 21l1.2-6.8-5-4.9 6.9-1z"/></svg>
												</button>
												<input class="w-24 h-5 px-1 text-[10px] border border-emerald-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400"
													value={area.label}
													placeholder="Area label"
													onchange={e => updateAreaLabel(fl.number, area.id, e.currentTarget.value.trim())} />
												{#if area.legacy}<span class="text-[8px] text-gray-400 uppercase tracking-wide" title="Holds the floor's original floorplan data">orig</span>{/if}
												<button class="text-gray-300 hover:text-red-500 transition-colors text-xs leading-none" title="Delete area"
													onclick={() => deleteArea(fl.number, area.id)}>&times;</button>
											</div>
										{/each}
										<button class="h-5 px-2 text-[10px] bg-emerald-600 text-white rounded hover:bg-emerald-500 transition-colors"
											onclick={() => addArea(fl.number)}>+ Area</button>
										{#if !(fl.areas?.length)}
											<span class="text-[10px] text-gray-400">No areas — one floorplan for the floor. Add areas to split it per tenant space.</span>
										{/if}
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
