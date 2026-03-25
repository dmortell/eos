<script lang="ts">
	import { tick } from 'svelte'
	import { Icon } from '$lib'
	import type { PatchConnection, PatchSettings, CustomCableType, PortRef, PatchStatus } from './types'
	import { CABLE_TYPES, getCableType } from './constants'

	let {
		connections = [],
		racks = [],
		devices = [],
		customCableTypes = [],
		settings,
		editNewId = null,
		orphanedIds = new Set<string>(),
		onupdate,
		ondelete,
		ondeleteselected,
		oneditnewclear,
		onupdateselected,
	}: {
		connections: PatchConnection[]
		racks: any[]
		devices: any[]
		customCableTypes: CustomCableType[]
		settings: PatchSettings
		editNewId?: string | null
		orphanedIds?: Set<string>
		onupdate?: (id: string, updates: Partial<PatchConnection>) => void
		ondelete?: (id: string) => void
		ondeleteselected?: (ids: string[]) => void
		oneditnewclear?: () => void
		onupdateselected?: (ids: string[], updates: Partial<PatchConnection>) => void
	} = $props()

	let selectedIds = $state(new Set<string>())
	let sortField = $state<'from' | 'to' | 'type' | 'length' | 'status'>('from')
	let sortAsc = $state(true)
	let filter = $state('')

	// ── Build flat port options for dropdowns ──
	// "Rack / Device (Unn) / Port nn" — grouped by rack, then device
	interface PortOption {
		value: string        // "rackId:deviceId:portIndex"
		rackId: string
		deviceId: string
		portIndex: number
		label: string        // compact display
		group: string        // rack label for optgroup
		deviceLabel: string
	}

	let multiRack = $derived(racks.length > 1)

	let portOptions = $derived.by(() => {
		const opts: PortOption[] = []
		// Build a set of already-used ports for quick lookup
		const usedPorts = new Set<string>()
		for (const c of connections) {
			if (c.fromPortRef.deviceId && c.fromPortRef.portIndex > 0) {
				usedPorts.add(`${c.fromPortRef.rackId}:${c.fromPortRef.deviceId}:${c.fromPortRef.portIndex}`)
			}
			if (c.toPortRef.deviceId && c.toPortRef.portIndex > 0) {
				usedPorts.add(`${c.toPortRef.rackId}:${c.toPortRef.deviceId}:${c.toPortRef.portIndex}`)
			}
		}
		for (const rack of racks) {
			const rackDevs = devices
				.filter((d: any) => d.rackId === rack.id)
				.sort((a: any, b: any) => b.positionU - a.positionU)
			for (const dev of rackDevs) {
				const count = dev.portCount ?? 0
				const padW = count >= 100 ? 3 : count >= 10 ? 2 : 1
				for (let p = 1; p <= count; p++) {
					const val = `${rack.id}:${dev.id}:${p}`
					const pLabel = String(p).padStart(padW, '0')
					const prefix = multiRack ? `${rack.label} / ` : ''
					opts.push({
						value: val,
						rackId: rack.id,
						deviceId: dev.id,
						portIndex: p,
						label: `${prefix}${dev.label || dev.type} U${dev.positionU} / ${pLabel}`,
						group: rack.label,
						deviceLabel: `${dev.label || dev.type} (U${dev.positionU})`,
					})
				}
			}
		}
		return opts
	})

	// Group options by rack for <optgroup>
	let portGroups = $derived.by(() => {
		const groups: { label: string; options: PortOption[] }[] = []
		const map = new Map<string, PortOption[]>()
		for (const opt of portOptions) {
			if (!map.has(opt.group)) map.set(opt.group, [])
			map.get(opt.group)!.push(opt)
		}
		for (const [label, options] of map) {
			groups.push({ label, options })
		}
		return groups
	})

	// Convert PortRef to select value string
	function refToValue(ref: PortRef): string {
		if (!ref.rackId || !ref.deviceId || ref.portIndex <= 0) return ''
		return `${ref.rackId}:${ref.deviceId}:${ref.portIndex}`
	}

	// Convert select value string to PortRef
	function valueToRef(val: string): PortRef {
		if (!val) return { rackId: '', deviceId: '', portIndex: 0, face: 'front' }
		const [rackId, deviceId, portStr] = val.split(':')
		return { rackId, deviceId, portIndex: parseInt(portStr) || 0, face: 'front' }
	}

	// Check if a port is used by another connection (not the current one)
	function isPortUsed(val: string, excludeConnId: string): boolean {
		for (const c of connections) {
			if (c.id === excludeConnId) continue
			if (refToValue(c.fromPortRef) === val || refToValue(c.toPortRef) === val) return true
		}
		return false
	}

	// Helpers
	function rackLabel(rackId: string): string {
		return racks.find((r: any) => r.id === rackId)?.label || '—'
	}
	function deviceLabel(deviceId: string): string {
		const d = devices.find((d: any) => d.id === deviceId)
		return d?.label || d?.type || '—'
	}
	function fmtRef(ref: PortRef): string {
		if (!ref.rackId || !ref.deviceId || ref.portIndex <= 0) return ''
		const dev = devices.find((d: any) => d.id === ref.deviceId)
		const count = dev?.portCount ?? 0
		const padW = count >= 100 ? 3 : count >= 10 ? 2 : 1
		const pLabel = String(ref.portIndex).padStart(padW, '0')
		return `${rackLabel(ref.rackId)} / ${deviceLabel(ref.deviceId)} U${dev?.positionU ?? '?'} / ${pLabel}`
	}

	// Sorted + filtered connections
	let sortedConnections = $derived.by(() => {
		let list = [...connections]
		if (filter) {
			const q = filter.toLowerCase()
			list = list.filter(c => {
				return fmtRef(c.fromPortRef).toLowerCase().includes(q) ||
					fmtRef(c.toPortRef).toLowerCase().includes(q) ||
					getCableType(c.cableType, customCableTypes).label.toLowerCase().includes(q) ||
					(c.cordId?.toLowerCase().includes(q)) ||
					(c.notes?.toLowerCase().includes(q))
			})
		}
		list.sort((a, b) => {
			let cmp = 0
			switch (sortField) {
				case 'from': cmp = fmtRef(a.fromPortRef).localeCompare(fmtRef(b.fromPortRef)); break
				case 'to': cmp = fmtRef(a.toPortRef).localeCompare(fmtRef(b.toPortRef)); break
				case 'type': cmp = a.cableType.localeCompare(b.cableType); break
				case 'length': cmp = a.lengthMeters - b.lengthMeters; break
				case 'status': cmp = a.status.localeCompare(b.status); break
			}
			return sortAsc ? cmp : -cmp
		})
		return list
	})

	function toggleSort(field: typeof sortField) {
		if (sortField === field) sortAsc = !sortAsc
		else { sortField = field; sortAsc = true }
	}

	function toggleSelect(id: string, e: MouseEvent) {
		const next = new Set(selectedIds)
		if (e.shiftKey || e.ctrlKey || e.metaKey) {
			if (next.has(id)) next.delete(id)
			else next.add(id)
		} else {
			if (next.has(id) && next.size === 1) next.clear()
			else { next.clear(); next.add(id) }
		}
		selectedIds = next
	}

	function selectAll() {
		if (selectedIds.size === sortedConnections.length) selectedIds = new Set()
		else selectedIds = new Set(sortedConnections.map(c => c.id))
	}

	function handleDeleteSelected() {
		if (selectedIds.size === 0) return
		ondeleteselected?.([...selectedIds])
		selectedIds = new Set()
	}

	function sortIcon(field: typeof sortField): string {
		if (sortField !== field) return ''
		return sortAsc ? ' ▲' : ' ▼'
	}

	// Status helpers
	const STATUS_COLORS: Record<string, string> = {
		add: 'text-blue-600',
		remove: 'text-red-600',
		change: 'text-amber-600',
		installed: 'text-green-600',
		planned: 'text-amber-600', // legacy compat
	}

	function handleStatusChange(conn: PatchConnection, newStatus: PatchStatus) {
		const updates: Partial<PatchConnection> = { status: newStatus }
		// When changing to "change", capture current from/to in notes
		if (newStatus === 'change' && conn.status !== 'change') {
			const fromDesc = fmtRef(conn.fromPortRef)
			const toDesc = fmtRef(conn.toPortRef)
			const prev = conn.notes ? conn.notes + ' | ' : ''
			if (fromDesc || toDesc) {
				updates.notes = `${prev}Was: ${fromDesc || '?'} → ${toDesc || '?'}`
			}
		}
		onupdate?.(conn.id, updates)
	}

	// Auto-scroll + focus new row
	$effect(() => {
		if (!editNewId) return
		tick().then(() => {
			const el = document.getElementById(`patch-from-${editNewId}`)
			if (el) {
				el.scrollIntoView({ block: 'nearest' })
				el.focus()
			}
			oneditnewclear?.()
		})
	})
</script>

<!-- Toolbar row -->
<div class="flex items-center gap-2 px-3 py-1.5 border-b border-gray-100 bg-gray-50/50 shrink-0">
	<div class="relative flex-1 max-w-xs">
		<Icon name="search" size={12} class="absolute left-2 top-1/2 -translate-y-1/2 text-gray-300" />
		<input
			type="text"
			placeholder="Filter connections..."
			class="w-full h-6 pl-7 pr-2 text-[11px] rounded border border-gray-200 bg-white focus:border-blue-400 focus:outline-none"
			bind:value={filter}
		/>
	</div>

	{#if selectedIds.size > 0}
		<span class="text-[11px] text-gray-400">{selectedIds.size} selected</span>

		<!-- Bulk color -->
		<label class="flex items-center gap-1 cursor-pointer" title="Change color of selected">
			<input type="color" class="w-5 h-5 rounded border border-gray-200 cursor-pointer"
				onchange={e => {
					const color = (e.target as HTMLInputElement).value
					onupdateselected?.([...selectedIds], { cableColor: color })
				}} />
			<span class="text-[10px] text-gray-400">Color</span>
		</label>

		<!-- Bulk cable type -->
		<select
			class="h-6 text-[11px] border border-gray-200 rounded px-1 bg-white text-gray-600"
			onchange={e => {
				const val = (e.target as HTMLSelectElement).value
				if (!val) return
				const ct = getCableType(val, customCableTypes)
				onupdateselected?.([...selectedIds], { cableType: val, cableColor: ct.color });
				(e.target as HTMLSelectElement).value = ''
			}}
		>
			<option value="">Cable type...</option>
			{#each CABLE_TYPES as t}
				<option value={t.id}>{t.label}</option>
			{/each}
			{#if customCableTypes.length > 0}
				{#each customCableTypes as t}
					<option value={t.id}>{t.label}</option>
				{/each}
			{/if}
		</select>

		<!-- Bulk status -->
		<select
			class="h-6 text-[11px] border border-gray-200 rounded px-1 bg-white text-gray-600"
			onchange={e => {
				const val = (e.target as HTMLSelectElement).value
				if (!val) return
				onupdateselected?.([...selectedIds], { status: val as PatchStatus });
				(e.target as HTMLSelectElement).value = ''
			}}
		>
			<option value="">Status...</option>
			<option value="add">Add</option>
			<option value="change">Change</option>
			<option value="remove">Remove</option>
			<option value="installed">Installed</option>
		</select>

		<button
			class="h-6 px-2 rounded bg-red-50 text-red-600 text-[11px] font-medium hover:bg-red-100 transition-colors"
			onclick={handleDeleteSelected}
		>Delete</button>
	{/if}
</div>

<!-- Table -->
<div class="overflow-x-auto">
	<table class="w-full text-[11px]">
		<thead class="sticky top-0 z-10">
			<tr class="bg-gray-50 border-b border-gray-200 text-left text-gray-400 uppercase tracking-wider">
				<th class="w-8 px-2 py-1.5">
					<input type="checkbox" class="rounded" checked={selectedIds.size === sortedConnections.length && sortedConnections.length > 0} onchange={selectAll} />
				</th>
				<th class="px-2 py-1.5 cursor-pointer hover:text-gray-600 select-none" onclick={() => toggleSort('from')}>
					From{sortIcon('from')}
				</th>
				<th class="px-2 py-1.5 cursor-pointer hover:text-gray-600 select-none" onclick={() => toggleSort('to')}>
					To{sortIcon('to')}
				</th>
				<th class="w-24 px-2 py-1.5 cursor-pointer hover:text-gray-600 select-none" onclick={() => toggleSort('type')}>
					Cable{sortIcon('type')}
				</th>
				<th class="w-16 px-2 py-1.5 cursor-pointer hover:text-gray-600 select-none" onclick={() => toggleSort('length')}>
					Length{sortIcon('length')}
				</th>
				<th class="w-24 px-2 py-1.5">Cord ID</th>
				<th class="w-20 px-2 py-1.5 cursor-pointer hover:text-gray-600 select-none" onclick={() => toggleSort('status')}>
					Status{sortIcon('status')}
				</th>
				<th class="px-2 py-1.5">Notes</th>
				<th class="w-8 px-2 py-1.5"></th>
			</tr>
		</thead>
		<tbody>
			{#each sortedConnections as conn (conn.id)}
				{@const ct = getCableType(conn.cableType, customCableTypes)}
				{@const isSelected = selectedIds.has(conn.id)}
				{@const isOrphaned = orphanedIds.has(conn.id)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
				<tr
					class="border-b border-gray-100 transition-colors cursor-default
						{isOrphaned ? 'bg-amber-50/70 border-l-2 border-l-amber-400' : ''}
						{isSelected ? 'bg-blue-50' : isOrphaned ? '' : 'hover:bg-gray-50'}"
					onclick={e => toggleSelect(conn.id, e)}
				>
					<!-- Checkbox -->
					<td class="px-2 py-1">
						<div class="flex items-center gap-1">
							<input type="checkbox" class="rounded" checked={isSelected}
								onclick={e => e.stopPropagation()}
								onchange={() => {
									const next = new Set(selectedIds)
									if (next.has(conn.id)) next.delete(conn.id)
									else next.add(conn.id)
									selectedIds = next
								}} />
							{#if isOrphaned}
								<Icon name="alertTriangle" size={11} class="text-amber-500" />
							{/if}
						</div>
					</td>

					<!-- From port — always a dropdown -->
					<td class="px-2 py-0.5" onclick={e => e.stopPropagation()}>
						<select
							id="patch-from-{conn.id}"
							class="w-full text-[11px] border border-gray-200 rounded px-1 py-0.5 bg-white text-gray-700 focus:border-blue-400 focus:outline-none truncate"
							value={refToValue(conn.fromPortRef)}
							onchange={e => {
								const ref = valueToRef((e.target as HTMLSelectElement).value)
								onupdate?.(conn.id, { fromPortRef: ref })
							}}
						>
							<option value="">— Select port —</option>
							{#each portGroups as group}
								<optgroup label={group.label}>
									{#each group.options as opt}
										{#if !isPortUsed(opt.value, conn.id) || opt.value === refToValue(conn.fromPortRef)}
											<option value={opt.value}>{opt.label}</option>
										{/if}
									{/each}
								</optgroup>
							{/each}
						</select>
					</td>

					<!-- To port — always a dropdown -->
					<td class="px-2 py-0.5" onclick={e => e.stopPropagation()}>
						<select
							class="w-full text-[11px] border border-gray-200 rounded px-1 py-0.5 bg-white text-gray-700 focus:border-blue-400 focus:outline-none truncate"
							value={refToValue(conn.toPortRef)}
							onchange={e => {
								const ref = valueToRef((e.target as HTMLSelectElement).value)
								onupdate?.(conn.id, { toPortRef: ref })
							}}
						>
							<option value="">— Select port —</option>
							{#each portGroups as group}
								<optgroup label={group.label}>
									{#each group.options as opt}
										{#if !isPortUsed(opt.value, conn.id) || opt.value === refToValue(conn.toPortRef)}
											<option value={opt.value}>{opt.label}</option>
										{/if}
									{/each}
								</optgroup>
							{/each}
						</select>
					</td>

					<!-- Cable type -->
					<td class="px-2 py-0.5" onclick={e => e.stopPropagation()}>
						<div class="flex items-center gap-1.5">
							<span class="w-2.5 h-2.5 rounded-full shrink-0" style:background={conn.cableColor || ct.color}></span>
							<select
								class="flex-1 text-[11px] text-gray-600 border border-gray-200 rounded px-1 py-0.5 bg-white focus:border-blue-400 focus:outline-none"
								value={conn.cableType}
								onchange={e => {
									const newType = (e.target as HTMLSelectElement).value
									const newCt = getCableType(newType, customCableTypes)
									onupdate?.(conn.id, { cableType: newType, cableColor: newCt.color })
								}}
							>
								<optgroup label="Copper">
									{#each CABLE_TYPES.filter(t => t.category === 'copper') as t}
										<option value={t.id}>{t.label}</option>
									{/each}
								</optgroup>
								<optgroup label="Fiber">
									{#each CABLE_TYPES.filter(t => t.category === 'fiber') as t}
										<option value={t.id}>{t.label}</option>
									{/each}
								</optgroup>
								<optgroup label="Other">
									{#each CABLE_TYPES.filter(t => t.category === 'direct-attach') as t}
										<option value={t.id}>{t.label}</option>
									{/each}
								</optgroup>
								{#if customCableTypes.length > 0}
									<optgroup label="Custom">
										{#each customCableTypes as t}
											<option value={t.id}>{t.label}</option>
										{/each}
									</optgroup>
								{/if}
							</select>
						</div>
					</td>

					<!-- Length -->
					<td class="px-2 py-0.5" onclick={e => e.stopPropagation()}>
						<div class="flex items-center gap-0.5">
							<input
								type="number"
								step="0.1"
								min="0"
								class="w-12 text-[11px] font-mono border border-gray-200 rounded px-1 py-0.5 bg-white text-gray-600 focus:border-blue-400 focus:outline-none
									{conn.lengthLocked ? 'bg-amber-50' : ''}"
								value={conn.lengthMeters || ''}
								placeholder="—"
								onchange={e => {
									const val = parseFloat((e.target as HTMLInputElement).value) || 0
									onupdate?.(conn.id, { lengthMeters: val, lengthLocked: val > 0 })
								}}
							/>
							{#if conn.lengthLocked}
								<button class="text-amber-400 hover:text-gray-400" title="Unlock (auto-calculate)"
									onclick={() => onupdate?.(conn.id, { lengthLocked: false })}>
									<Icon name="lock" size={10} />
								</button>
							{/if}
						</div>
					</td>

					<!-- Cord ID -->
					<td class="px-2 py-0.5" onclick={e => e.stopPropagation()}>
						<input
							type="text"
							class="w-full text-[11px] text-gray-500 border border-gray-200 rounded px-1 py-0.5 bg-white placeholder:text-gray-300 focus:border-blue-400 focus:outline-none focus:text-gray-700"
							placeholder="—"
							value={conn.cordId ?? ''}
							onchange={e => onupdate?.(conn.id, { cordId: (e.target as HTMLInputElement).value || undefined })}
						/>
					</td>

					<!-- Status -->
					<td class="px-2 py-0.5" onclick={e => e.stopPropagation()}>
						<select
							class="text-[11px] border border-gray-200 rounded px-1 py-0.5 bg-white focus:border-blue-400 focus:outline-none
								{STATUS_COLORS[conn.status] ?? 'text-gray-600'}"
							value={conn.status === 'planned' ? 'add' : conn.status}
							onchange={e => handleStatusChange(conn, (e.target as HTMLSelectElement).value as PatchStatus)}
						>
							<option value="add">Add</option>
							<option value="change">Change</option>
							<option value="remove">Remove</option>
							<option value="installed">Installed</option>
						</select>
					</td>

					<!-- Notes -->
					<td class="px-2 py-0.5" onclick={e => e.stopPropagation()}>
						<input
							type="text"
							class="w-full text-[11px] text-gray-500 border border-gray-200 rounded px-1 py-0.5 bg-white placeholder:text-gray-300 focus:border-blue-400 focus:outline-none focus:text-gray-700"
							placeholder="—"
							value={conn.notes ?? ''}
							onchange={e => onupdate?.(conn.id, { notes: (e.target as HTMLInputElement).value || undefined })}
						/>
					</td>

					<!-- Delete -->
					<td class="px-2 py-1 text-center">
						<button
							class="text-gray-300 hover:text-red-500 transition-colors"
							title="Delete connection"
							onclick={e => { e.stopPropagation(); ondelete?.(conn.id) }}
						><Icon name="trash2" size={12} /></button>
					</td>
				</tr>
			{/each}

			{#if sortedConnections.length === 0}
				<tr>
					<td colspan="9" class="px-4 py-8 text-center text-gray-300 text-xs">
						{#if filter}
							No connections match filter.
						{:else}
							No patch connections yet. Click "Add Patch" to create one.
						{/if}
					</td>
				</tr>
			{/if}
		</tbody>
	</table>
</div>
