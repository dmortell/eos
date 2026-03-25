<script lang="ts">
	import { Icon } from '$lib'
	import type { PatchConnection, PatchSettings, CustomCableType } from './types'
	import { CABLE_TYPES, getCableType } from './constants'

	let {
		connections = [],
		racks = [],
		devices = [],
		customCableTypes = [],
		settings,
		onupdate,
		ondelete,
		ondeleteselected,
	}: {
		connections: PatchConnection[]
		racks: any[]
		devices: any[]
		customCableTypes: CustomCableType[]
		settings: PatchSettings
		onupdate?: (id: string, updates: Partial<PatchConnection>) => void
		ondelete?: (id: string) => void
		ondeleteselected?: (ids: string[]) => void
	} = $props()

	let selectedIds = $state(new Set<string>())
	let sortField = $state<'from' | 'to' | 'type' | 'length' | 'status'>('from')
	let sortAsc = $state(true)
	let filter = $state('')

	// All cable types (built-in + custom)
	let allCableTypes = $derived([...CABLE_TYPES, ...customCableTypes.map(c => ({ ...c, category: c.category as string }))])

	// Helper: get device label
	function deviceLabel(deviceId: string): string {
		const d = devices.find((d: any) => d.id === deviceId)
		return d?.label || d?.type || '—'
	}

	// Helper: get rack label
	function rackLabel(rackId: string): string {
		const r = racks.find((r: any) => r.id === rackId)
		return r?.label || '—'
	}

	// Helper: format port reference for display
	function fmtRef(ref: PatchConnection['fromPortRef']): string {
		if (!ref.rackId || !ref.deviceId) return '(not set)'
		const rack = rackLabel(ref.rackId)
		const dev = deviceLabel(ref.deviceId)
		const port = ref.portIndex > 0 ? ref.portIndex : '?'
		const label = ref.label ? ` [${ref.label}]` : ''
		return `${rack} / ${dev} / ${port}${label}`
	}

	// Sorted + filtered connections
	let sortedConnections = $derived.by(() => {
		let list = [...connections]

		// Filter
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

		// Sort
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
		if (selectedIds.size === sortedConnections.length) {
			selectedIds = new Set()
		} else {
			selectedIds = new Set(sortedConnections.map(c => c.id))
		}
	}

	function handleDeleteSelected() {
		if (selectedIds.size === 0) return
		ondeleteselected?.([...selectedIds])
		selectedIds = new Set()
	}

	// Inline editing: which cell is being edited
	let editingCell = $state<{ id: string; field: string } | null>(null)

	function startEdit(id: string, field: string) {
		editingCell = { id, field }
	}

	function stopEdit() {
		editingCell = null
	}

	// Header sort indicator
	function sortIcon(field: typeof sortField): string {
		if (sortField !== field) return ''
		return sortAsc ? ' ▲' : ' ▼'
	}
</script>

<!-- Toolbar row -->
<div class="flex items-center gap-2 px-3 py-1.5 border-b border-gray-100 bg-gray-50/50 shrink-0">
	<!-- Search -->
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
		<button
			class="h-6 px-2 rounded bg-red-50 text-red-600 text-[11px] font-medium hover:bg-red-100 transition-colors"
			onclick={handleDeleteSelected}
		>Delete selected</button>
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
				<th class="w-20 px-2 py-1.5 cursor-pointer hover:text-gray-600 select-none" onclick={() => toggleSort('status')}>
					Status{sortIcon('status')}
				</th>
				<th class="w-24 px-2 py-1.5">Cord ID</th>
				<th class="w-8 px-2 py-1.5"></th>
			</tr>
		</thead>
		<tbody>
			{#each sortedConnections as conn (conn.id)}
				{@const ct = getCableType(conn.cableType, customCableTypes)}
				{@const isSelected = selectedIds.has(conn.id)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
				<tr
					class="border-b border-gray-100 transition-colors cursor-default
						{isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}"
					onclick={e => toggleSelect(conn.id, e)}
				>
					<!-- Checkbox -->
					<td class="px-2 py-1">
						<input type="checkbox" class="rounded" checked={isSelected} onclick={e => e.stopPropagation()} onchange={() => {
							const next = new Set(selectedIds)
							if (next.has(conn.id)) next.delete(conn.id)
							else next.add(conn.id)
							selectedIds = next
						}} />
					</td>

					<!-- From -->
					<td class="px-2 py-1">
						{#if editingCell?.id === conn.id && editingCell.field === 'from'}
							{@render portSelector(conn.fromPortRef, (ref) => { onupdate?.(conn.id, { fromPortRef: ref }); stopEdit() })}
						{:else}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<span class="text-gray-700 hover:text-blue-600 cursor-pointer" ondblclick={() => startEdit(conn.id, 'from')}>
								{fmtRef(conn.fromPortRef)}
							</span>
						{/if}
					</td>

					<!-- To -->
					<td class="px-2 py-1">
						{#if editingCell?.id === conn.id && editingCell.field === 'to'}
							{@render portSelector(conn.toPortRef, (ref) => { onupdate?.(conn.id, { toPortRef: ref }); stopEdit() })}
						{:else}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<span class="text-gray-700 hover:text-blue-600 cursor-pointer" ondblclick={() => startEdit(conn.id, 'to')}>
								{fmtRef(conn.toPortRef)}
							</span>
						{/if}
					</td>

					<!-- Cable type -->
					<td class="px-2 py-1">
						<div class="flex items-center gap-1.5">
							<span class="w-2.5 h-2.5 rounded-full shrink-0" style:background={conn.cableColor || ct.color}></span>
							<select
								class="bg-transparent text-[11px] text-gray-600 border-none outline-none cursor-pointer appearance-none pr-3 -ml-0.5"
								value={conn.cableType}
								onclick={e => e.stopPropagation()}
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
					<td class="px-2 py-1 font-mono text-gray-500">
						{#if conn.lengthMeters > 0}
							{conn.lengthMeters}m
						{:else}
							<span class="text-gray-300">—</span>
						{/if}
					</td>

					<!-- Status -->
					<td class="px-2 py-1">
						<select
							class="bg-transparent text-[11px] border-none outline-none cursor-pointer appearance-none pr-3
								{conn.status === 'installed' ? 'text-green-600' : 'text-amber-600'}"
							value={conn.status}
							onclick={e => e.stopPropagation()}
							onchange={e => onupdate?.(conn.id, { status: (e.target as HTMLSelectElement).value as 'planned' | 'installed' })}
						>
							<option value="planned">Planned</option>
							<option value="installed">Installed</option>
						</select>
					</td>

					<!-- Cord ID -->
					<td class="px-2 py-1">
						<input
							type="text"
							class="w-full bg-transparent text-[11px] text-gray-500 border-none outline-none placeholder:text-gray-200 focus:text-gray-700"
							placeholder="—"
							value={conn.cordId ?? ''}
							onclick={e => e.stopPropagation()}
							onchange={e => onupdate?.(conn.id, { cordId: (e.target as HTMLInputElement).value || undefined })}
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
					<td colspan="8" class="px-4 py-8 text-center text-gray-300 text-xs">
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

<!-- Inline port selector snippet -->
{#snippet portSelector(ref: import('./types').PortRef, onchange: (ref: import('./types').PortRef) => void)}
	<div class="flex items-center gap-1" onclick={e => e.stopPropagation()}>
		<!-- Rack -->
		<select
			class="text-[11px] border border-gray-200 rounded px-1 py-0.5 bg-white max-w-20"
			value={ref.rackId}
			onchange={e => {
				const rackId = (e.target as HTMLSelectElement).value
				onchange({ ...ref, rackId, deviceId: '', portIndex: 0 })
			}}
		>
			<option value="">Rack...</option>
			{#each racks as r}
				<option value={r.id}>{r.label}</option>
			{/each}
		</select>

		<!-- Device -->
		{#if ref.rackId}
			{@const rackDevs = devices.filter((d: any) => d.rackId === ref.rackId)}
			<select
				class="text-[11px] border border-gray-200 rounded px-1 py-0.5 bg-white max-w-24"
				value={ref.deviceId}
				onchange={e => {
					const deviceId = (e.target as HTMLSelectElement).value
					onchange({ ...ref, deviceId, portIndex: 0 })
				}}
			>
				<option value="">Device...</option>
				{#each rackDevs.sort((a: any, b: any) => b.positionU - a.positionU) as d}
					<option value={d.id}>{d.label || d.type} (U{d.positionU})</option>
				{/each}
			</select>
		{/if}

		<!-- Port -->
		{#if ref.deviceId}
			{@const dev = devices.find((d: any) => d.id === ref.deviceId)}
			{@const portCount = dev?.portCount ?? 0}
			<select
				class="text-[11px] border border-gray-200 rounded px-1 py-0.5 bg-white w-14"
				value={ref.portIndex || ''}
				onchange={e => {
					const portIndex = parseInt((e.target as HTMLSelectElement).value) || 0
					onchange({ ...ref, portIndex })
				}}
			>
				<option value="">Port</option>
				{#each Array.from({ length: portCount }, (_, i) => i + 1) as p}
					<option value={p}>{p}</option>
				{/each}
			</select>
		{/if}

		<button class="text-gray-400 hover:text-gray-600" onclick={stopEdit}>
			<Icon name="x" size={12} />
		</button>
	</div>
{/snippet}
