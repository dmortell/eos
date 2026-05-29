<script lang="ts">
	import { Firestore, Icon } from '$lib'
	import { writeLog, type ChangeDetail } from '$lib/logger'
	import { DEVICE_TYPE_COLORS } from '../../racks/parts/constants'
	import type { DeviceType, RackConfig } from '../../racks/parts/types'
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

	// ── Locally mutable racks / rows / devices for inline edits ──
	// Same echo-suppression pattern as RackElevationView so our own write
	// doesn't clobber an in-flight follow-up edit.
	let localRacks = $state<RackConfig[]>([])
	let localRows = $state<any[]>([])
	let localDevices = $state<any[]>([])
	let suppressUntil = 0
	$effect(() => {
		if (!rackDoc) { localRacks = []; localRows = []; localDevices = []; return }
		if (Date.now() < suppressUntil) return
		localRacks = rackDoc.racks ?? []
		localRows = rackDoc.rows ?? []
		localDevices = rackDoc.devices ?? []
	})

	let saveTimer: ReturnType<typeof setTimeout> | null = null
	let pendingChanges: ChangeDetail[] = []
	function scheduleSave() {
		suppressUntil = Date.now() + 1500
		if (saveTimer) clearTimeout(saveTimer)
		saveTimer = setTimeout(() => {
			const id = rackDocId
			if (!id) return
			db.save('racks', { id, projectId: ws.pid, racks: localRacks, rows: localRows, devices: localDevices })
			if (pendingChanges.length) {
				writeLog(ws.pid, 'racks', 'workspace', pendingChanges)
				pendingChanges = []
			}
		}, 400)
	}

	function updateRack(id: string, updates: Partial<RackConfig>) {
		localRacks = localRacks.map((r) => (r.id === id ? ({ ...r, ...updates } as RackConfig) : r))
		pendingChanges.push({ action: 'update', field: 'rack', details: id })
		scheduleSave()
	}

	function updateDevice(id: string, updates: Record<string, any>) {
		localDevices = localDevices.map((d) => (d.id === id ? { ...d, ...updates } : d))
		pendingChanges.push({ action: 'update', field: 'device', details: id })
		scheduleSave()
	}

	const allRacks = $derived<RackConfig[]>(localRacks)
	const allDevices = $derived<any[]>(localDevices)
	const allRows = $derived<any[]>(localRows)
	const allConnections = $derived<PatchConnection[]>(patchDoc?.connections ?? [])

	const rack = $derived.by(() => meta?.rackId ? allRacks.find((r) => r.id === meta.rackId) ?? null : null)
	const row = $derived.by(() => meta?.rowId ? allRows.find((r) => r.id === meta.rowId) ?? null : null)
	const rackDevices = $derived.by(() => rack ? allDevices.filter((d) => d.rackId === rack.id) : [])
	const rowRacks = $derived.by(() => row ? allRacks.filter((r) => r.rowId === row.id) : [])
	const roomRacks = $derived.by(() => kind === 'serverRoom' ? allRacks : [])

	const selectedDeviceIds = $derived([...(ws?.selectedDeviceIds ?? [])])
	const selectedDevice = $derived.by(() => {
		if (selectedDeviceIds.length !== 1) return null
		return allDevices.find((d) => d.id === selectedDeviceIds[0]) ?? null
	})
	const selectedDeviceRack = $derived.by(() =>
		selectedDevice ? allRacks.find((r) => r.id === selectedDevice.rackId) ?? null : null,
	)

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

	const RACK_TYPES = ['2-post', '4-post', 'cabinet', 'desk', 'shelf', 'vcm'] as const
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
			<input
				type="text"
				class="flex-1 bg-transparent border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 focus:border-blue-400 focus:outline-none rounded px-1 -mx-1 font-semibold"
				value={selectedDevice.label ?? ''}
				onchange={(e) => updateDevice(selectedDevice.id, { label: (e.currentTarget as HTMLInputElement).value })}
			/>
		</div>
		<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 items-center">
			<dt class="text-zinc-500">Type</dt><dd>{selectedDevice.type}</dd>
			{#if selectedDeviceRack}<dt class="text-zinc-500">Rack</dt><dd>{selectedDeviceRack.label}</dd>{/if}
			<dt class="text-zinc-500">Position</dt>
			<dd>U<input type="number" min="1" class="w-14 bg-transparent border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 focus:border-blue-400 focus:outline-none rounded px-1"
				value={selectedDevice.positionU}
				onchange={(e) => updateDevice(selectedDevice.id, { positionU: Number((e.currentTarget as HTMLInputElement).value) || 1 })} /></dd>
			<dt class="text-zinc-500">Height</dt>
			<dd><input type="number" min="0" class="w-14 bg-transparent border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 focus:border-blue-400 focus:outline-none rounded px-1"
				value={selectedDevice.heightU}
				onchange={(e) => updateDevice(selectedDevice.id, { heightU: Number((e.currentTarget as HTMLInputElement).value) || 1 })} />U</dd>
			{#if selectedDevice.portCount != null}
				<dt class="text-zinc-500">Ports</dt>
				<dd><input type="number" min="0" class="w-14 bg-transparent border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 focus:border-blue-400 focus:outline-none rounded px-1"
					value={selectedDevice.portCount}
					onchange={(e) => updateDevice(selectedDevice.id, { portCount: Number((e.currentTarget as HTMLInputElement).value) || 0 })} />{selectedDevice.portType ? ` (${selectedDevice.portType})` : ''}</dd>
			{/if}
			{#if selectedDevice.mounting && selectedDevice.mounting !== 'both'}<dt class="text-zinc-500">Face</dt><dd>{selectedDevice.mounting}</dd>{/if}
			{#if selectedDevice.maker}<dt class="text-zinc-500">Maker</dt><dd>{selectedDevice.maker}</dd>{/if}
			{#if selectedDevice.model}<dt class="text-zinc-500">Model</dt><dd>{selectedDevice.model}</dd>{/if}
		</dl>

	{:else if kind === 'rack' && rack}
		<input
			type="text"
			class="w-full bg-transparent border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 focus:border-blue-400 focus:outline-none rounded px-1 -mx-1 font-semibold text-sm"
			value={rack.label ?? ''}
			onchange={(e) => updateRack(rack.id, { label: (e.currentTarget as HTMLInputElement).value })}
		/>
		<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 items-center">
			<dt class="text-zinc-500">Type</dt>
			<dd>
				<select
					class="bg-transparent border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 focus:border-blue-400 focus:outline-none rounded px-1 -mx-1"
					value={rack.type}
					onchange={(e) => updateRack(rack.id, { type: (e.currentTarget as HTMLSelectElement).value as any })}
				>
					{#each RACK_TYPES as t}<option value={t}>{t}</option>{/each}
				</select>
			</dd>
			<dt class="text-zinc-500">Server room</dt><dd>{rack.serverRoom ?? '—'}</dd>
			<dt class="text-zinc-500">Row</dt><dd>{row?.label ?? '—'}</dd>
			<dt class="text-zinc-500">Height</dt>
			<dd><input type="number" min="1" class="w-14 bg-transparent border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 focus:border-blue-400 focus:outline-none rounded px-1"
				value={rack.heightU}
				onchange={(e) => updateRack(rack.id, { heightU: Number((e.currentTarget as HTMLInputElement).value) || 42 })} />U</dd>
			<dt class="text-zinc-500">Width</dt>
			<dd><input type="number" min="100" class="w-16 bg-transparent border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 focus:border-blue-400 focus:outline-none rounded px-1"
				value={rack.widthMm}
				onchange={(e) => updateRack(rack.id, { widthMm: Number((e.currentTarget as HTMLInputElement).value) || 600 })} /> mm</dd>
			<dt class="text-zinc-500">Depth</dt>
			<dd><input type="number" min="100" class="w-16 bg-transparent border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 focus:border-blue-400 focus:outline-none rounded px-1"
				value={rack.depthMm}
				onchange={(e) => updateRack(rack.id, { depthMm: Number((e.currentTarget as HTMLInputElement).value) || 1000 })} /> mm</dd>
			<dt class="text-zinc-500">Maker</dt>
			<dd><input type="text" class="w-full bg-transparent border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 focus:border-blue-400 focus:outline-none rounded px-1"
				value={rack.maker ?? ''}
				onchange={(e) => updateRack(rack.id, { maker: (e.currentTarget as HTMLInputElement).value || undefined })} /></dd>
			<dt class="text-zinc-500">Model</dt>
			<dd><input type="text" class="w-full bg-transparent border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 focus:border-blue-400 focus:outline-none rounded px-1"
				value={rack.model ?? ''}
				onchange={(e) => updateRack(rack.id, { model: (e.currentTarget as HTMLInputElement).value || undefined })} /></dd>
			<dt class="text-zinc-500">Color</dt>
			<dd class="flex items-center gap-1.5">
				<input type="color" class="w-5 h-5 rounded-sm border border-zinc-300 cursor-pointer"
					value={rack.color ?? '#000000'}
					onchange={(e) => updateRack(rack.id, { color: (e.currentTarget as HTMLInputElement).value })} />
				<input type="text" class="w-20 font-mono bg-transparent border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 focus:border-blue-400 focus:outline-none rounded px-1"
					value={rack.color ?? ''}
					onchange={(e) => updateRack(rack.id, { color: (e.currentTarget as HTMLInputElement).value || undefined })} />
			</dd>
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
		<input
			type="text"
			class="w-full bg-transparent border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 focus:border-blue-400 focus:outline-none rounded px-1 -mx-1 font-semibold text-sm"
			value={row.label ?? ''}
			onchange={(e) => {
				const label = (e.currentTarget as HTMLInputElement).value
				localRows = localRows.map((r) => (r.id === row.id ? { ...r, label } : r))
				pendingChanges.push({ action: 'update', field: 'row', details: row.id })
				scheduleSave()
			}}
		/>
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
