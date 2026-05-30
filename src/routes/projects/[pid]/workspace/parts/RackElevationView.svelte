<script lang="ts">
	import { Firestore } from '$lib'
	import { writeLog, type ChangeDetail } from '$lib/logger'
	import {
		RackElevation,
		SCALE,
		RACK_GAP_PX,
		RU_HEIGHT_MM,
		RACK_19IN_MM,
		DEFAULT_SETTINGS,
		rackHeightMm,
		type RackConfig,
		type DeviceConfig,
		type RackSettings,
		type ViewState,
		type ElevationFace,
	} from '$lib/rack'
	import { getWorkspace } from '../state.svelte'

	const ws = getWorkspace()
	const db = new Firestore()

	const docId = $derived.by(() => {
		if (!ws) return null
		const m = ws.selectedNodeMeta
		if (!m?.floor || !m?.room) return null
		const fl = String(m.floor).padStart(2, '0')
		return `${ws.pid}_F${fl}_R${m.room}`
	})

	let rackDoc = $state<any>(null)
	$effect(() => {
		const id = docId
		if (!id) {
			rackDoc = null
			return
		}
		const unsub = db.subscribeOne('racks', id, (data: any) => (rackDoc = data ?? null))
		return () => unsub?.()
	})

	const isRUType = (t: string) => t !== 'desk' && t !== 'shelf' && t !== 'vcm'
	const hydrateRack = (r: any) => ({
		...r,
		heightMm: isRUType(r.type) ? rackHeightMm(r.heightU ?? 42) : (r.heightMm ?? 1600),
	})

	const settings = $derived<RackSettings>({ ...DEFAULT_SETTINGS, ...(rackDoc?.settings ?? {}) })
	const allRacks = $derived<RackConfig[]>((rackDoc?.racks ?? []).map(hydrateRack))
	const rows = $derived(rackDoc?.rows ?? [])

	// ── Local mutable devices mirror, with debounced save-back to Firestore ──
	// The Firestore subscription is the source of truth, but we keep a local
	// copy that we mutate optimistically on drag/delete. A short suppression
	// window prevents the echo of our own write from clobbering further edits.
	let localDevices = $state<DeviceConfig[]>([])
	let suppressUntil = 0

	$effect(() => {
		if (!rackDoc) {
			localDevices = []
			return
		}
		const remote: DeviceConfig[] = rackDoc.devices ?? []
		if (Date.now() < suppressUntil) return
		localDevices = remote
	})

	let saveTimer: ReturnType<typeof setTimeout> | null = null
	let pendingChanges: ChangeDetail[] = []

	function logEdit(c: ChangeDetail) {
		pendingChanges.push({ ...c })
	}

	function scheduleSave() {
		suppressUntil = Date.now() + 1500
		if (saveTimer) clearTimeout(saveTimer)
		saveTimer = setTimeout(doSave, 400)
	}

	function doSave() {
		const id = docId
		if (!id) return
		const payload = {
			id,
			projectId: ws.pid,
			devices: localDevices,
		}
		db.save('racks', payload)
		if (pendingChanges.length) {
			writeLog(ws.pid, 'racks', 'workspace', pendingChanges)
			pendingChanges = []
		}
	}

	const visibleRackIds = $derived.by(() => {
		const m = ws.selectedNodeMeta
		const kind = ws.selectedNodeKind
		if (!m) return new Set<string>(allRacks.map((r) => r.id))
		if (kind === 'rack' && m.rackId) return new Set([m.rackId])
		if (kind === 'row' && m.rowId) {
			return new Set(allRacks.filter((r) => r.rowId === m.rowId).map((r) => r.id))
		}
		return new Set<string>(allRacks.map((r) => r.id))
	})

	const RACK_GAP_MM = RACK_GAP_PX / SCALE

	const activeRacks = $derived.by(() => {
		const rowIds: string[] = rows.length ? rows.map((r: any) => r.id) : [undefined as unknown as string]
		const out: (RackConfig & { _x: number; _z: number })[] = []
		let x = 0
		for (const rowId of rowIds) {
			const rowRacks = allRacks
				.filter((r) => (rowId ? r.rowId === rowId : true))
				.filter((r) => visibleRackIds.has(r.id))
				.sort((a, b) => a.order - b.order)
			for (const rack of rowRacks) {
				out.push({ ...rack, _x: x, _z: settings.floorLevel })
				x += rack.widthMm + RACK_GAP_MM
			}
		}
		return out
	})

	const visibleDevices = $derived(
		localDevices.filter((d) => visibleRackIds.has(d.rackId)),
	)

	const contentWidthMm = $derived(activeRacks.reduce((max, r) => Math.max(max, r._x + r.widthMm), 0))

	let containerEl = $state<HTMLDivElement | null>(null)
	let containerSize = $state({ w: 0, h: 0 })
	$effect(() => {
		if (!containerEl) return
		const ro = new ResizeObserver(() => {
			if (!containerEl) return
			containerSize = { w: containerEl.clientWidth, h: containerEl.clientHeight }
		})
		ro.observe(containerEl)
		return () => ro.disconnect()
	})

	const slopMm = 200
	const syntheticView = $derived<ViewState>({
		x: 0,
		y: 0,
		zoom: 1,
		scale: SCALE,
		grid: 100,
		width: containerSize.w,
		height: containerSize.h,
		showGrid: false,
		panning: false,
		dragging: false,
		button: 0,
		bottom: settings.ceilingLevel + slopMm,
	})

	const fitScale = $derived.by(() => {
		if (containerSize.w === 0 || contentWidthMm === 0) return 1
		const contentPx = contentWidthMm * SCALE
		const margin = 80
		const target = Math.max(200, containerSize.w - margin)
		return Math.min(1.5, target / contentPx)
	})

	const fitTranslateX = $derived(-settings.leftWallX * SCALE + 40)
	const fitTranslateY = $derived(0)

	// ── Pan / zoom gestures ─────────────────────────────────────────────────

	let panning = $state(false)
	let panLast = { x: 0, y: 0 }
	let panButton = 0

	function onPointerDown(e: PointerEvent) {
		if (e.button !== 1 && e.button !== 2) return
		e.preventDefault()
		panning = true
		panButton = e.button
		panLast = { x: e.clientX, y: e.clientY }
		containerEl?.setPointerCapture(e.pointerId)
	}

	function onPointerMove(e: PointerEvent) {
		if (!panning) return
		const dx = e.clientX - panLast.x
		const dy = e.clientY - panLast.y
		panLast = { x: e.clientX, y: e.clientY }
		ws.viewport = {
			...ws.viewport,
			x: ws.viewport.x + dx,
			y: ws.viewport.y + dy,
		}
	}

	function onPointerUp(e: PointerEvent) {
		if (!panning) return
		panning = false
		try {
			containerEl?.releasePointerCapture(e.pointerId)
		} catch {
			// pointer already released
		}
	}

	$effect(() => {
		if (!containerEl) return
		const el = containerEl
		function onWheel(e: WheelEvent) {
			const isZoom = e.ctrlKey || e.altKey || e.metaKey || (panning && panButton === 2)
			e.preventDefault()
			if (isZoom) {
				const rect = el.getBoundingClientRect()
				const cx = e.clientX - rect.left
				const cy = e.clientY - rect.top
				const step = Math.exp(-e.deltaY * 0.0015)
				const newZoom = Math.max(0.1, Math.min(20, ws.viewport.zoom * step))
				const factor = newZoom / ws.viewport.zoom
				ws.viewport = {
					x: cx - factor * (cx - ws.viewport.x),
					y: cy - factor * (cy - ws.viewport.y),
					zoom: newZoom,
				}
			} else {
				const dx = e.shiftKey ? e.deltaY : e.deltaX
				const dy = e.shiftKey ? 0 : e.deltaY
				ws.viewport = { ...ws.viewport, x: ws.viewport.x - dx, y: ws.viewport.y - dy }
			}
		}
		el.addEventListener('wheel', onWheel, { passive: false })
		return () => el.removeEventListener('wheel', onWheel)
	})

	function onContextMenu(e: MouseEvent) {
		e.preventDefault()
	}

	function resetView() {
		ws.viewport = { x: 0, y: 0, zoom: 1 }
	}

	// ── Edit affordances: drag, drop, delete, select ──────────────────────

	function screenRect(rack: RackConfig & { _x: number; _z: number }) {
		return {
			left: rack._x * SCALE,
			top: (syntheticView.bottom - rack._z - rack.heightMm) * SCALE,
			width: rack.widthMm * SCALE,
			height: rack.heightMm * SCALE,
		}
	}

	function snapOffsetX(rect: { left: number; width: number }, rr: { left: number; width: number }, devW: number): number {
		const devMidX = rect.left + rect.width / 2
		const rackCenterX = rr.left + rr.width / 2
		const offsetPx = devMidX - rackCenterX
		return Math.round(offsetPx / SCALE / 25) * 25
	}

	function findDropRack(midX: number, midY: number) {
		for (const rack of activeRacks) {
			const rr = screenRect(rack)
			if (midX >= rr.left && midX <= rr.left + rr.width && midY >= rr.top && midY <= rr.top + rr.height) {
				return { rack, rr }
			}
		}
		return null
	}

	let dropGhost = $state<{ left: number; top: number; width: number; height: number } | null>(null)

	/** Convert a client (screen) coord into the inner-local space where
	 *  rack._x*SCALE / screenRect() live. */
	function clientToLocal(clientX: number, clientY: number): { x: number; y: number } | null {
		if (!containerEl) return null
		const rect = containerEl.getBoundingClientRect()
		const canvasX = clientX - rect.left
		const canvasY = clientY - rect.top
		const innerScale = fitScale * ws.viewport.zoom
		if (innerScale === 0) return null
		const x = (canvasX - ws.viewport.x) / innerScale - fitTranslateX
		const y = (canvasY - ws.viewport.y) / innerScale - fitTranslateY
		return { x, y }
	}

	function ghostFromTemplate(template: any, clientX: number, clientY: number) {
		const local = clientToLocal(clientX, clientY)
		if (!local) return null
		const heightU = template.heightU ?? 1
		const devW = (template.widthMm ?? RACK_19IN_MM) * SCALE
		// Centre the device rect on the cursor for hit-testing purposes.
		const rect = {
			left: local.x - devW / 2,
			top: local.y - (heightU * RU_HEIGHT_MM * SCALE) / 2,
			width: devW,
			height: heightU * RU_HEIGHT_MM * SCALE,
		}
		const hit = findDropRack(local.x, local.y)
		if (!hit) return { hit: null, rect }
		const { rack, rr } = hit
		const ruFromBottom = (rr.top + rr.height - rect.top - rect.height) / SCALE / RU_HEIGHT_MM
		const maxRU = isRUType(rack.type)
			? rack.heightU - heightU + 1
			: Math.floor(rack.heightMm / RU_HEIGHT_MM) - heightU + 1
		const snappedRU = Math.max(1, Math.min(maxRU, Math.round(ruFromBottom)))
		const ox = snapOffsetX(rect, rr, devW)
		const centerLeft = rr.left + (rr.width - devW) / 2 + ox * SCALE
		const ruBottom = rr.top + rr.height - snappedRU * RU_HEIGHT_MM * SCALE
		return {
			hit: { rack, snappedRU, ox },
			rect: {
				left: centerLeft,
				top: ruBottom - heightU * RU_HEIGHT_MM * SCALE,
				width: devW,
				height: heightU * RU_HEIGHT_MM * SCALE,
			},
		}
	}

	// While a library drag is in flight, update the dropGhost from the cursor.
	$effect(() => {
		const tpl = ws.draggingTemplate
		const pos = ws.dragClientPos
		if (!tpl || !pos) {
			// Don't clobber the per-device dropGhost during in-canvas dragging.
			if (!ws.draggingTemplate) return
			dropGhost = null
			return
		}
		const g = ghostFromTemplate(tpl, pos.x, pos.y)
		dropGhost = g?.hit ? g.rect : null
	})

	// Consume a library drop landed by InspectorLibrary.
	$effect(() => {
		const drop = ws.pendingDrop
		if (!drop) return
		const g = ghostFromTemplate(drop.template, drop.x, drop.y)
		if (g?.hit) {
			const t = drop.template
			const id = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
			const newDev: DeviceConfig = {
				id,
				rackId: g.hit.rack.id,
				type: t.type,
				positionU: g.hit.snappedRU,
				heightU: t.heightU,
				offsetX: g.hit.ox,
				label: t.label,
				portCount: t.portCount,
				portType: t.portType,
				icon: t.icon,
				...(t.widthMm ? { widthMm: t.widthMm } : {}),
			} as DeviceConfig
			localDevices = [...localDevices, newDev]
			ws.selectDevices([id])
			logEdit({ action: 'add', field: 'device', details: `${t.label} → ${g.hit.rack.label} RU${g.hit.snappedRU}` })
			scheduleSave()
		}
		dropGhost = null
		ws.pendingDrop = null
	})

	function onDeviceDrag(rect: any, _mouse: any, item: any) {
		const midX = rect.left + rect.width / 2
		const midY = rect.top + rect.height / 2
		const devW = (item.widthMm ?? RACK_19IN_MM) * SCALE
		const hit = findDropRack(midX, midY)
		if (!hit) {
			dropGhost = null
			return
		}
		const { rack, rr } = hit
		const ruFromBottom = (rr.top + rr.height - rect.top - rect.height) / SCALE / RU_HEIGHT_MM
		const maxRU = isRUType(rack.type)
			? rack.heightU - item.heightU + 1
			: Math.floor(rack.heightMm / RU_HEIGHT_MM) - item.heightU + 1
		const snappedRU = Math.max(1, Math.min(maxRU, Math.round(ruFromBottom)))
		const ox = snapOffsetX(rect, rr, devW)
		const centerLeft = rr.left + (rr.width - devW) / 2 + ox * SCALE
		const ruBottom = rr.top + rr.height - snappedRU * RU_HEIGHT_MM * SCALE
		dropGhost = {
			left: centerLeft,
			top: ruBottom - item.heightU * RU_HEIGHT_MM * SCALE,
			width: devW,
			height: item.heightU * RU_HEIGHT_MM * SCALE,
		}
	}

	function onDeviceDragged(rect: any, device: DeviceConfig, copy?: boolean) {
		dropGhost = null
		const devW = (device.widthMm ?? RACK_19IN_MM) * SCALE
		const midX = rect.left + rect.width / 2
		const midY = rect.top + rect.height / 2
		const hit = findDropRack(midX, midY)
		if (!hit) return
		const { rack, rr } = hit
		const ruFromBottom = (rr.top + rr.height - rect.top - rect.height) / SCALE / RU_HEIGHT_MM
		const maxRU = isRUType(rack.type)
			? rack.heightU - device.heightU + 1
			: Math.floor(rack.heightMm / RU_HEIGHT_MM) - device.heightU + 1
		const snappedRU = Math.max(1, Math.min(maxRU, Math.round(ruFromBottom)))
		const ox = snapOffsetX(rect, rr, devW)
		if (copy) {
			const id = `dev-${Date.now()}`
			const { id: _, ...rest } = device
			localDevices = [...localDevices, { ...rest, id, rackId: rack.id, positionU: snappedRU, offsetX: ox }]
			ws.selectDevices([id])
			logEdit({ action: 'copy', field: 'device', details: `${device.label} → ${rack.label} RU${snappedRU}` })
		} else {
			localDevices = localDevices.map((d) =>
				d.id === device.id ? { ...d, rackId: rack.id, positionU: snappedRU, offsetX: ox } : d,
			)
			logEdit({ action: 'update', field: 'device', details: `${device.label} → ${rack.label} RU${snappedRU}` })
		}
		scheduleSave()
	}

	function deleteDevice(deviceId: string) {
		const dev = localDevices.find((d) => d.id === deviceId)
		if (!dev) return
		localDevices = localDevices.filter((d) => d.id !== deviceId)
		const next = new Set(ws.selectedDeviceIds)
		next.delete(deviceId)
		ws.selectedDeviceIds = next
		logEdit({ action: 'remove', field: 'device', details: dev.label })
		scheduleSave()
	}

	function selectDevice(deviceId: string) {
		ws.selectDevices([deviceId])
	}

	function onKeyDown(e: KeyboardEvent) {
		if (e.key !== 'Delete' && e.key !== 'Backspace') return
		const ids = [...ws.selectedDeviceIds]
		if (!ids.length) return
		e.preventDefault()
		for (const id of ids) deleteDevice(id)
	}
</script>

<svelte:window onkeydown={onKeyDown} />

<div
	bind:this={containerEl}
	class="absolute inset-0 overflow-hidden bg-zinc-50 dark:bg-zinc-900 select-none"
	style:cursor={panning ? 'grabbing' : 'default'}
	style:touch-action="none"
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointercancel={onPointerUp}
	oncontextmenu={onContextMenu}
	role="img"
	aria-label="Rack elevation"
	tabindex="0"
>
	{#if !docId}
		<div class="absolute inset-0 grid place-items-center text-xs text-zinc-400">
			Select a rack, row, or server room in the navigator.
		</div>
	{:else if !rackDoc}
		<div class="absolute inset-0 grid place-items-center text-xs text-zinc-400">
			Loading rack data…
		</div>
	{:else if activeRacks.length === 0}
		<div class="absolute inset-0 grid place-items-center text-xs text-zinc-400">
			No racks to render for this selection.
		</div>
	{:else}
		<div
			class="absolute top-0 left-0 origin-top-left"
			style:transform="translate({ws.viewport.x}px, {ws.viewport.y}px) scale({ws.viewport.zoom})"
		>
			<div
				class="absolute top-0 left-0 origin-top-left"
				style:transform="scale({fitScale}) translate({fitTranslateX}px, {fitTranslateY}px)"
			>
				<RackElevation
					view={syntheticView}
					{settings}
					{activeRacks}
					rearRacks={[]}
					face={'front' as ElevationFace}
					devices={visibleDevices}
					selectedIds={ws.selectedDeviceIds}
					rackOverlaps={new Map<string, Set<number>>()}
					{dropGhost}
					floorLabel=""
					roomLabel=""
					readonly={false}
					ondevicedrag={onDeviceDrag}
					ondevicedragged={onDeviceDragged}
					ondeletedevice={deleteDevice}
					onselectdevice={selectDevice}
				/>
			</div>
		</div>

		<div class="absolute bottom-2 left-2 flex items-center gap-2 text-[10px] font-mono text-zinc-500 bg-white/70 dark:bg-zinc-900/70 rounded px-2 py-1 backdrop-blur">
			<button
				class="hover:text-zinc-900 dark:hover:text-zinc-100"
				onclick={resetView}
				title="Reset view (pan to 0,0, zoom 1×)"
			>reset</button>
			<span>{(ws.viewport.zoom * 100).toFixed(0)}%</span>
			{#if ws.selectedDeviceIds.size > 0}
				<span class="text-blue-500 dark:text-blue-300">·</span>
				<span class="text-blue-700 dark:text-blue-300">{ws.selectedDeviceIds.size} selected</span>
			{/if}
		</div>
	{/if}
</div>
