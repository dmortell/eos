<script lang="ts">
	import { Firestore, Icon } from '$lib'
	import { DEVICE_TYPE_COLORS } from '../../racks/parts/constants'
	import type { DeviceType } from '../../racks/parts/types'
	import { getWorkspace } from '../state.svelte'

	const ws = getWorkspace()
	const db = new Firestore()

	const rackDocId = $derived.by(() => {
		if (!ws) return null
		const m = ws.selectedNodeMeta
		if (!m?.floor || !m?.room) return null
		const fl = String(m.floor).padStart(2, '0')
		return `${ws.pid}_F${fl}_R${m.room}`
	})

	let rackDoc = $state<any>(null)
	$effect(() => {
		const id = rackDocId
		if (!id) {
			rackDoc = null
			return
		}
		const unsub = db.subscribeOne('racks', id, (data: any) => (rackDoc = data))
		return () => unsub?.()
	})

	const meta = $derived(ws?.selectedNodeMeta ?? null)
	const kind = $derived(ws?.selectedNodeKind ?? null)

	const rack = $derived.by(() => {
		if (!meta?.rackId) return null
		return (rackDoc?.racks ?? []).find((r: any) => r.id === meta.rackId) ?? null
	})
	const row = $derived.by(() => {
		if (!meta?.rowId) return null
		return (rackDoc?.rows ?? []).find((r: any) => r.id === meta.rowId) ?? null
	})
	const rackDevices = $derived.by(() => {
		if (!rack) return [] as any[]
		return (rackDoc?.devices ?? []).filter((d: any) => d.rackId === rack.id)
	})
	const rowRacks = $derived.by(() => {
		if (!row) return [] as any[]
		return (rackDoc?.racks ?? []).filter((r: any) => r.rowId === row.id)
	})
	const roomRacks = $derived.by(() => {
		if (kind !== 'serverRoom') return [] as any[]
		return rackDoc?.racks ?? []
	})
	const roomRows = $derived(rackDoc?.rows ?? [])

	function devicesByType(devs: any[]) {
		const m = new Map<string, number>()
		for (const d of devs) m.set(d.type, (m.get(d.type) ?? 0) + 1)
		return [...m.entries()].sort((a, b) => b[1] - a[1])
	}
</script>

<div class="text-xs space-y-3">
	{#if !ws?.selectedNodeId}
		<div class="text-zinc-500">Select a node in the navigator to see properties.</div>
	{:else if kind === 'rack' && rack}
		<div class="font-semibold text-sm">{rack.label}</div>
		<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
			<dt class="text-zinc-500">Type</dt><dd>{rack.type}</dd>
			<dt class="text-zinc-500">Server room</dt><dd>{rack.serverRoom ?? '—'}</dd>
			<dt class="text-zinc-500">Row</dt><dd>{row?.label ?? '—'}</dd>
			<dt class="text-zinc-500">Height</dt><dd>{rack.heightU}U</dd>
			<dt class="text-zinc-500">Width</dt><dd>{rack.widthMm} mm</dd>
			<dt class="text-zinc-500">Depth</dt><dd>{rack.depthMm} mm</dd>
			{#if rack.maker}<dt class="text-zinc-500">Maker</dt><dd>{rack.maker}</dd>{/if}
			{#if rack.model}<dt class="text-zinc-500">Model</dt><dd>{rack.model}</dd>{/if}
			{#if rack.color}
				<dt class="text-zinc-500">Color</dt>
				<dd class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm border border-zinc-300" style:background={rack.color}></span>{rack.color}</dd>
			{/if}
		</dl>

		<div class="border-t border-zinc-200 dark:border-zinc-800 pt-2">
			<div class="text-zinc-500 mb-1">Devices ({rackDevices.length})</div>
			{#if rackDevices.length === 0}
				<div class="text-zinc-400 italic">Empty rack.</div>
			{:else}
				<ul class="space-y-0.5">
					{#each devicesByType(rackDevices) as [t, count]}
						<li class="flex items-center gap-2">
							<span class="w-2 h-2 rounded-sm" style:background={DEVICE_TYPE_COLORS[t as DeviceType] ?? '#888'}></span>
							<span class="flex-1">{t}</span>
							<span class="font-mono text-zinc-500">{count}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{:else if kind === 'row' && row}
		<div class="font-semibold text-sm">{row.label}</div>
		<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
			<dt class="text-zinc-500">Server room</dt><dd>{meta?.room ?? '—'}</dd>
			<dt class="text-zinc-500">Racks</dt><dd>{rowRacks.length}</dd>
			{#if row.defaults?.heightU}<dt class="text-zinc-500">Default height</dt><dd>{row.defaults.heightU}U</dd>{/if}
			{#if row.defaults?.color}
				<dt class="text-zinc-500">Default color</dt>
				<dd class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm border border-zinc-300" style:background={row.defaults.color}></span>{row.defaults.color}</dd>
			{/if}
			{#if row.defaults?.containment && row.defaults.containment !== 'none'}<dt class="text-zinc-500">Containment</dt><dd>{row.defaults.containment.toUpperCase()}</dd>{/if}
		</dl>
	{:else if kind === 'serverRoom'}
		<div class="font-semibold text-sm">Server room {meta?.room}</div>
		<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
			<dt class="text-zinc-500">Floor</dt><dd>{meta?.floor}</dd>
			<dt class="text-zinc-500">Rows</dt><dd>{roomRows.length}</dd>
			<dt class="text-zinc-500">Racks</dt><dd>{roomRacks.length}</dd>
		</dl>
	{:else if kind === 'floor'}
		<div class="font-semibold text-sm">Floor {meta?.floor}</div>
		<div class="text-zinc-500">Floor-level properties land here as the workspace gains floor views.</div>
	{:else if kind === 'frames'}
		<div class="font-semibold text-sm">Patch frames — floor {meta?.floor}</div>
		<div class="text-zinc-500">Zone / location breakdown lands here.</div>
	{:else}
		<div class="font-semibold text-sm break-all">{ws.selectedNodeId}</div>
		<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
			<dt class="text-zinc-500">Kind</dt><dd>{kind ?? '—'}</dd>
			<dt class="text-zinc-500">View</dt><dd>{ws.activeView ?? '—'}</dd>
		</dl>
	{/if}
</div>
