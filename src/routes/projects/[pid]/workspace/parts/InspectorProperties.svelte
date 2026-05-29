<script lang="ts">
	import { Firestore, Icon } from '$lib'
	import { DEVICE_TYPE_COLORS } from '../../racks/parts/constants'
	import type { DeviceType } from '../../racks/parts/types'
	import type { PatchConnection } from '../../patching/parts/types'
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
	let patchDoc = $state<any>(null)
	$effect(() => {
		const id = rackDocId
		if (!id) { rackDoc = null; return }
		const unsub = db.subscribeOne('racks', id, (data: any) => (rackDoc = data))
		return () => unsub?.()
	})
	$effect(() => {
		const id = rackDocId
		if (!id) { patchDoc = null; return }
		const unsub = db.subscribeOne('patching', id, (data: any) => (patchDoc = data))
		return () => unsub?.()
	})

	const meta = $derived(ws?.selectedNodeMeta ?? null)
	const kind = $derived(ws?.selectedNodeKind ?? null)
	const allRacks = $derived<any[]>(rackDoc?.racks ?? [])
	const allDevices = $derived<any[]>(rackDoc?.devices ?? [])
	const allRows = $derived<any[]>(rackDoc?.rows ?? [])
	const allConnections = $derived<PatchConnection[]>(patchDoc?.connections ?? [])

	const rack = $derived.by(() => meta?.rackId ? allRacks.find((r) => r.id === meta.rackId) ?? null : null)
	const row = $derived.by(() => meta?.rowId ? allRows.find((r) => r.id === meta.rowId) ?? null : null)
	const rackDevices = $derived.by(() => rack ? allDevices.filter((d) => d.rackId === rack.id) : [])
	const rowRacks = $derived.by(() => row ? allRacks.filter((r) => r.rowId === row.id) : [])
	const roomRacks = $derived.by(() => kind === 'serverRoom' ? allRacks : [])

	// ── Canvas / patch list selection takes priority over tree selection ──
	const selectedDeviceIds = $derived([...(ws?.selectedDeviceIds ?? [])])
	const selectedDevice = $derived.by(() => {
		if (selectedDeviceIds.length !== 1) return null
		return allDevices.find((d) => d.id === selectedDeviceIds[0]) ?? null
	})
	const selectedDeviceRack = $derived.by(() => {
		if (!selectedDevice) return null
		return allRacks.find((r) => r.id === selectedDevice.rackId) ?? null
	})

	const selectedConnection = $derived.by(() => {
		const id = ws?.selectedConnectionId
		if (!id) return null
		return allConnections.find((c) => c.id === id) ?? null
	})

	function devicesByType(devs: any[]) {
		const m = new Map<string, number>()
		for (const d of devs) m.set(d.type, (m.get(d.type) ?? 0) + 1)
		return [...m.entries()].sort((a, b) => b[1] - a[1])
	}

	function deviceLabel(deviceId: string): string {
		return allDevices.find((d) => d.id === deviceId)?.label ?? '—'
	}
	function rackLabel(rackId: string): string {
		return allRacks.find((r) => r.id === rackId)?.label ?? '—'
	}
</script>

<div class="text-xs space-y-3">
	{#if !ws?.selectedNodeId}
		<div class="text-zinc-500">Select a node in the navigator to see properties.</div>

	{:else if selectedConnection}
		{@const c = selectedConnection}
		<div class="font-semibold text-sm flex items-center gap-2">
			<Icon name="cable" size={14} />
			Patch connection
		</div>
		<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
			<dt class="text-zinc-500">From</dt>
			<dd>{rackLabel(c.fromPortRef.rackId)} / {deviceLabel(c.fromPortRef.deviceId)} / port {c.fromPortRef.portIndex}</dd>
			<dt class="text-zinc-500">To</dt>
			<dd>{rackLabel(c.toPortRef.rackId)} / {deviceLabel(c.toPortRef.deviceId)} / port {c.toPortRef.portIndex}</dd>
			<dt class="text-zinc-500">Cable</dt><dd>{c.cableType}</dd>
			<dt class="text-zinc-500">Length</dt><dd>{c.lengthMeters ? `${c.lengthMeters} m` : '—'}</dd>
			<dt class="text-zinc-500">Status</dt><dd>{c.status}</dd>
			{#if c.cordId}<dt class="text-zinc-500">Cord ID</dt><dd class="font-mono">{c.cordId}</dd>{/if}
			{#if c.notes}<dt class="text-zinc-500">Notes</dt><dd>{c.notes}</dd>{/if}
		</dl>

	{:else if selectedDeviceIds.length > 1}
		<div class="font-semibold text-sm flex items-center gap-2">
			<Icon name="rect" size={14} />
			{selectedDeviceIds.length} devices selected
		</div>
		<div class="text-zinc-500">Press Delete / Backspace to remove all.</div>

	{:else if selectedDevice}
		<div class="font-semibold text-sm flex items-center gap-2">
			<span class="w-2.5 h-2.5 rounded-sm" style:background={DEVICE_TYPE_COLORS[selectedDevice.type as DeviceType] ?? '#888'}></span>
			{selectedDevice.label || selectedDevice.type}
		</div>
		<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
			<dt class="text-zinc-500">Type</dt><dd>{selectedDevice.type}</dd>
			{#if selectedDeviceRack}<dt class="text-zinc-500">Rack</dt><dd>{selectedDeviceRack.label}</dd>{/if}
			<dt class="text-zinc-500">Position</dt><dd>U{selectedDevice.positionU}</dd>
			<dt class="text-zinc-500">Height</dt><dd>{selectedDevice.heightU}U</dd>
			{#if selectedDevice.portCount}<dt class="text-zinc-500">Ports</dt><dd>{selectedDevice.portCount}{selectedDevice.portType ? ` (${selectedDevice.portType})` : ''}</dd>{/if}
			{#if selectedDevice.mounting && selectedDevice.mounting !== 'both'}<dt class="text-zinc-500">Face</dt><dd>{selectedDevice.mounting}</dd>{/if}
			{#if selectedDevice.maker}<dt class="text-zinc-500">Maker</dt><dd>{selectedDevice.maker}</dd>{/if}
			{#if selectedDevice.model}<dt class="text-zinc-500">Model</dt><dd>{selectedDevice.model}</dd>{/if}
		</dl>

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
			<dt class="text-zinc-500">Rows</dt><dd>{allRows.length}</dd>
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
