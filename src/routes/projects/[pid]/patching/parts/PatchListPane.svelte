<script lang="ts">
	import { tick } from 'svelte'
	import { Icon } from '$lib'
	import type { PatchConnection, PortRef, CustomCableType, PatchStatus } from './types'
	import { getCableType } from './constants'

	let {
		connections = [],
		racks = [],
		devices = [],
		customCableTypes = [],
		orphanedIds = new Set<string>(),
		selectedConnectionId = null,
		removedCount = 0,
		onselect,
		ontoggle,
		onsetstatus,
		ondelete,
		onrestore,
		onpurge,
	}: {
		connections: PatchConnection[]
		racks: any[]
		devices: any[]
		customCableTypes: CustomCableType[]
		orphanedIds?: Set<string>
		selectedConnectionId?: string | null
		removedCount?: number
		onselect?: (id: string | null) => void
		ontoggle?: () => void
		onsetstatus?: (ids: string[], status: PatchStatus) => void
		ondelete?: (ids: string[]) => void
		onrestore?: (ids: string[]) => void
		onpurge?: () => void
	} = $props()

	let filter = $state('')
	let statusFilter = $state<Set<PatchStatus>>(new Set(['add', 'change', 'remove', 'installed']))
	let sortField = $state<'from' | 'to' | 'type' | 'length' | 'status'>('from')
	let sortAsc = $state(true)
	let checkedIds = $state<Set<string>>(new Set())

	let rowRefs: Record<string, HTMLTableRowElement | undefined> = {}

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

	let visibleConnections = $derived.by(() => {
		let list = connections.filter(c => statusFilter.has(c.status))
		if (filter) {
			const q = filter.toLowerCase()
			list = list.filter(c =>
				fmtRef(c.fromPortRef).toLowerCase().includes(q) ||
				fmtRef(c.toPortRef).toLowerCase().includes(q) ||
				getCableType(c.cableType, customCableTypes).label.toLowerCase().includes(q) ||
				(c.cordId?.toLowerCase().includes(q)) ||
				(c.notes?.toLowerCase().includes(q))
			)
		}
		list = [...list].sort((a, b) => {
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

	let statusCounts = $derived.by(() => {
		const counts: Record<PatchStatus, number> = { add: 0, change: 0, remove: 0, installed: 0 }
		for (const c of connections) {
			const s = (c.status as string) === 'planned' ? 'add' : c.status
			counts[s as PatchStatus] = (counts[s as PatchStatus] ?? 0) + 1
		}
		return counts
	})

	let checkedConnections = $derived(connections.filter(c => checkedIds.has(c.id)))
	let anyRemovedChecked = $derived(checkedConnections.some(c => c.status === 'remove'))

	function toggleSort(field: typeof sortField) {
		if (sortField === field) sortAsc = !sortAsc
		else { sortField = field; sortAsc = true }
	}
	function sortIcon(field: typeof sortField): string {
		if (sortField !== field) return ''
		return sortAsc ? ' ▲' : ' ▼'
	}

	function toggleStatusFilter(s: PatchStatus) {
		const next = new Set(statusFilter)
		if (next.has(s)) next.delete(s); else next.add(s)
		statusFilter = next
	}

	function toggleCheck(id: string) {
		const next = new Set(checkedIds)
		if (next.has(id)) next.delete(id); else next.add(id)
		checkedIds = next
	}

	function checkAllVisible() {
		const allChecked = visibleConnections.every(c => checkedIds.has(c.id))
		const next = new Set(checkedIds)
		if (allChecked) { for (const c of visibleConnections) next.delete(c.id) }
		else { for (const c of visibleConnections) next.add(c.id) }
		checkedIds = next
	}

	function applyAction(action: 'add' | 'installed' | 'delete' | 'restore') {
		const ids = [...checkedIds]
		if (ids.length === 0) return
		switch (action) {
			case 'add': onsetstatus?.(ids, 'add'); break
			case 'installed': onsetstatus?.(ids, 'installed'); break
			case 'delete': ondelete?.(ids); break
			case 'restore': onrestore?.(ids); break
		}
		checkedIds = new Set()
	}

	// Auto-scroll selected row into view when selection changes from outside
	$effect(() => {
		const id = selectedConnectionId
		if (!id) return
		tick().then(() => {
			const el = rowRefs[id]
			if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
		})
	})

	const STATUS_PILL: Record<string, string> = {
		add: 'bg-blue-50 text-blue-700 border-blue-200',
		change: 'bg-amber-50 text-amber-700 border-amber-200',
		remove: 'bg-red-50 text-red-700 border-red-200',
		installed: 'bg-green-50 text-green-700 border-green-200',
		planned: 'bg-blue-50 text-blue-700 border-blue-200',
	}

	const STATUS_LABEL: Record<PatchStatus, string> = {
		add: 'Add', change: 'Change', remove: 'Remove', installed: 'Installed',
	}
</script>

<div class="h-full flex flex-col bg-white">
	<!-- Header: filter + status chips + collapse -->
	<div class="flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 bg-gray-50/70 shrink-0">
		<button
			class="h-6 w-6 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center"
			title="Hide list"
			onclick={ontoggle}
		><Icon name="chevronDown" size={14} /></button>

		<span class="text-[11px] font-semibold text-gray-600 mr-1">Patch list</span>

		<div class="relative w-48">
			<Icon name="search" size={12} class="absolute left-2 top-1/2 -translate-y-1/2 text-gray-300" />
			<input
				type="text"
				placeholder="Filter…"
				class="w-full h-6 pl-7 pr-2 text-[11px] rounded border border-gray-200 bg-white focus:border-blue-400 focus:outline-none"
				bind:value={filter}
			/>
		</div>

		<div class="flex gap-1 ml-2">
			{#each (['add', 'change', 'remove', 'installed'] as PatchStatus[]) as s}
				{@const active = statusFilter.has(s)}
				<button
					class="h-6 px-2 text-[10px] rounded border transition-colors
						{active ? STATUS_PILL[s] : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'}"
					onclick={() => toggleStatusFilter(s)}
					title="Toggle {STATUS_LABEL[s]} filter"
				>{STATUS_LABEL[s]} <span class="opacity-60">{statusCounts[s]}</span></button>
			{/each}
		</div>

		<div class="flex-1"></div>

		{#if removedCount > 0}
			<button
				class="h-6 px-2 text-[10px] rounded border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
				onclick={onpurge}
				title="Permanently remove all cords marked for removal"
			>Purge {removedCount} removed</button>
		{/if}
		<span class="text-[10px] text-gray-400">{visibleConnections.length} / {connections.length}</span>
	</div>

	<!-- Selection action bar -->
	{#if checkedIds.size > 0}
		<div class="flex items-center gap-2 px-3 py-1 border-b border-blue-100 bg-blue-50/60 shrink-0 text-[11px]">
			<span class="font-mono font-semibold text-blue-700">{checkedIds.size} selected</span>
			<span class="text-blue-300">|</span>
			<button class="h-5 px-2 rounded text-[10px] font-medium bg-white border border-blue-200 text-blue-700 hover:bg-blue-100" onclick={() => applyAction('installed')}>Mark Installed</button>
			<button class="h-5 px-2 rounded text-[10px] font-medium bg-white border border-blue-200 text-blue-700 hover:bg-blue-100" onclick={() => applyAction('add')}>Mark Add</button>
			{#if anyRemovedChecked}
				<button class="h-5 px-2 rounded text-[10px] font-medium bg-white border border-green-200 text-green-700 hover:bg-green-100" onclick={() => applyAction('restore')}>Restore</button>
			{/if}
			<button class="h-5 px-2 rounded text-[10px] font-medium bg-white border border-red-200 text-red-700 hover:bg-red-100" onclick={() => applyAction('delete')}>Delete</button>
			<div class="flex-1"></div>
			<button class="text-[10px] text-gray-400 hover:text-gray-700" onclick={() => checkedIds = new Set()}>Unselect</button>
		</div>
	{/if}

	<!-- Table -->
	<div class="flex-1 min-h-0 overflow-auto">
		<table class="w-full text-[11px]">
			<thead class="sticky top-0 z-10 bg-gray-50 shadow-[inset_0_-1px_0_0_#e5e7eb]">
				<tr class="text-left text-gray-400 uppercase tracking-wider whitespace-nowrap">
					<th class="w-8 px-2 py-1.5">
						<input
							type="checkbox"
							class="rounded"
							checked={visibleConnections.length > 0 && visibleConnections.every(c => checkedIds.has(c.id))}
							onchange={checkAllVisible}
						/>
					</th>
					<th class="px-2 py-1.5 cursor-pointer hover:text-gray-600 select-none w-1/4" onclick={() => toggleSort('from')}>From{sortIcon('from')}</th>
					<th class="px-2 py-1.5 cursor-pointer hover:text-gray-600 select-none w-1/4" onclick={() => toggleSort('to')}>To{sortIcon('to')}</th>
					<th class="w-24 px-2 py-1.5 cursor-pointer hover:text-gray-600 select-none" onclick={() => toggleSort('type')}>Cable{sortIcon('type')}</th>
					<th class="w-16 px-2 py-1.5 cursor-pointer hover:text-gray-600 select-none text-right" onclick={() => toggleSort('length')}>Len{sortIcon('length')}</th>
					<th class="w-24 px-2 py-1.5">Cord ID</th>
					<th class="w-24 px-2 py-1.5 cursor-pointer hover:text-gray-600 select-none" onclick={() => toggleSort('status')}>Status{sortIcon('status')}</th>
					<th class="px-2 py-1.5">Notes</th>
				</tr>
			</thead>
			<tbody>
				{#each visibleConnections as conn (conn.id)}
					{@const ct = getCableType(conn.cableType, customCableTypes)}
					{@const isSelected = selectedConnectionId === conn.id}
					{@const isChecked = checkedIds.has(conn.id)}
					{@const isOrphaned = orphanedIds.has(conn.id)}
					{@const statusKey = (conn.status as string) === 'planned' ? 'add' : conn.status}
					{@const isRemoved = statusKey === 'remove'}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
					<tr
						bind:this={rowRefs[conn.id]}
						class="border-b border-gray-100 cursor-pointer transition-colors
							{isOrphaned ? 'bg-amber-50/70 border-l-2 border-l-amber-400' : ''}
							{isSelected ? 'bg-blue-50 ring-1 ring-blue-200' : isOrphaned ? '' : 'hover:bg-gray-50'}
							{isRemoved ? 'opacity-60 line-through decoration-red-400' : ''}"
						onclick={() => onselect?.(isSelected ? null : conn.id)}
					>
						<td class="px-2 py-1" onclick={e => e.stopPropagation()}>
							<input type="checkbox" class="rounded" checked={isChecked} onchange={() => toggleCheck(conn.id)} />
						</td>
						<td class="px-2 py-1 truncate">
							{#if isOrphaned}<Icon name="alertTriangle" size={10} class="inline text-amber-500 mr-1" />{/if}
							{fmtRef(conn.fromPortRef) || '—'}
							{#if conn.previousFromRef}
								<span class="text-[10px] text-amber-600 ml-1" title="Was: {fmtRef(conn.previousFromRef)}">↶</span>
							{/if}
						</td>
						<td class="px-2 py-1 truncate">
							{fmtRef(conn.toPortRef) || '—'}
							{#if conn.previousToRef}
								<span class="text-[10px] text-amber-600 ml-1" title="Was: {fmtRef(conn.previousToRef)}">↶</span>
							{/if}
						</td>
						<td class="px-2 py-1">
							<div class="flex items-center gap-1.5">
								<span class="w-2.5 h-2.5 rounded-full shrink-0" style:background={conn.cableColor || ct.color}></span>
								<span class="text-gray-600 truncate">{ct.label}</span>
							</div>
						</td>
						<td class="px-2 py-1 font-mono text-right text-gray-600">{conn.lengthMeters || '—'}</td>
						<td class="px-2 py-1 font-mono text-gray-500 truncate">{conn.cordId ?? '—'}</td>
						<td class="px-2 py-1">
							<span class="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded border {STATUS_PILL[statusKey] ?? ''}">
								{STATUS_LABEL[statusKey as PatchStatus] ?? statusKey}
							</span>
						</td>
						<td class="px-2 py-1 text-gray-500 truncate">{conn.notes ?? ''}</td>
					</tr>
				{/each}

				{#if visibleConnections.length === 0}
					<tr>
						<td colspan="8" class="px-4 py-6 text-center text-gray-300 text-xs">
							{#if filter || statusFilter.size < 4}
								No connections match the filter.
							{:else}
								No patch connections yet.
							{/if}
						</td>
					</tr>
				{/if}
			</tbody>
		</table>
	</div>
</div>
