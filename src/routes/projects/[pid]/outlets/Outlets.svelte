<script lang="ts">
	import { Icon, Titlebar, Window } from '$lib'
	import { PaneGroup, Pane, Handle } from '$lib/components/ui/resizable'
	import FloorManagerDialog, { type FloorConfig } from '$lib/components/FloorManagerDialog.svelte'
	import type { OutletConfig, OutletsData, ToolMode, PageCalibration, Point, RackPlacement, SidebarTab } from './parts/types'
	import type { RackConfig } from '../racks/parts/types'
	import { OUTLET_DEFAULTS, type StickyDefaults } from './parts/constants'
	import { HistoryStore } from './parts/HistoryStore.svelte.ts'
	import OutletCanvas from './parts/OutletCanvas.svelte'
	import OutletPalette from './parts/OutletPalette.svelte'
	import RackPalette from './parts/RackPalette.svelte'
	import { exportOutletsToExcel } from './parts/exportExcel'

	let { data = null, files = [], floors = [], frameData = null, racksData = {}, floor, projectId = '', projectName = '', onsave, onfloorchange, onupdatefloors, ondeletefloor, onsaverack }: {
		data?: any
		files?: any[]
		floors?: FloorConfig[]
		frameData?: any
		racksData?: Record<string, any>
		floor: number
		projectId?: string
		projectName?: string
		onsave?: (payload: any) => void
		onfloorchange?: (floor: number) => void
		onupdatefloors?: (floors: FloorConfig[]) => void
		ondeletefloor?: (floor: number) => void
		onsaverack?: (room: string, rackId: string, updates: Partial<RackConfig>) => void
	} = $props()

	// ── State ──
	let outlets = $state<OutletConfig[]>(data?.outlets ?? [])
	let rackPlacements = $state<RackPlacement[]>(data?.rackPlacements ?? [])
	let selectedFileId = $state<string>(data?.selectedFileId ?? '')
	let selectedPage = $state<number>(data?.selectedPage ?? 1)
	let activeZone = $state<string>(data?.activeZone ?? 'A')
	let activeTool = $state<ToolMode>('select')
	let selectedIds = $state<Set<string>>(new Set())
	let selectedRackIds = $state<Set<string>>(new Set())
	let sidebarTab = $state<SidebarTab>(
		(typeof localStorage !== 'undefined' && localStorage.getItem('outlets-sidebar-tab') as SidebarTab) || 'outlets'
	)
	$effect(() => { try { localStorage.setItem('outlets-sidebar-tab', sidebarTab) } catch {} })
	let floorManagerOpen = $state(false)
	let floorFormat = $state<string>('L01')

	// Calibration from selected file/page
	let calibration = $state<PageCalibration | null>(null)

	// Selected file doc
	let selectedFile = $derived(files.find(f => f.id === selectedFileId) ?? null)

	// Build flat list of all rack configs across all rooms
	let allRackConfigs = $derived.by(() => {
		const result: (RackConfig & { room: string })[] = []
		for (const [room, data] of Object.entries(racksData)) {
			if (data?.racks) {
				for (const rack of data.racks) {
					result.push({ ...rack, room })
				}
			}
		}
		return result
	})

	// Selected rack data for floating properties panel
	let selectedRackConfigs = $derived(allRackConfigs.filter(r => selectedRackIds.has(r.id)))
	let selectedRackPlaced = $derived(rackPlacements.filter(p => selectedRackIds.has(p.rackId)))

	function sharedRack<K extends keyof RackConfig>(key: K): RackConfig[K] | undefined {
		if (selectedRackConfigs.length === 0) return undefined
		const first = selectedRackConfigs[0][key]
		return selectedRackConfigs.every(r => r[key] === first) ? first : undefined
	}

	let sharedRotation = $derived(
		selectedRackPlaced.length === 0 ? undefined :
		selectedRackPlaced.every(p => p.rotation === selectedRackPlaced[0].rotation) ? selectedRackPlaced[0].rotation : undefined
	)

	function updateSelectedRackConfigs(updates: Partial<RackConfig>) {
		for (const rc of selectedRackConfigs) {
			onsaverack?.(rc.room, rc.id, updates)
		}
	}

	// Update calibration when file/page changes
	$effect(() => {
		if (!selectedFile?.pages) { calibration = null; return }
		const p = selectedFile.pages[selectedPage]
		if (p?.origin && p?.scale?.scale) {
			calibration = {
				origin: p.origin,
				scaleFactor: p.scale.scale,
				crop: p.crop,
			}
		} else {
			calibration = null
		}
	})

	// Filter files to this project, sorted by name
	let projectFiles = $derived(
		files
			.filter((f: any) => f.projectId === projectId && f.url)
			.sort((a: any, b: any) => (a.name ?? a.id).localeCompare(b.name ?? b.id))
	)

	// ── Sync from remote ──
	let lastSavedSnapshot = ''
	let dirty = $state(false)

	function snapshotOf(d: any): string {
		return JSON.stringify({ outlets: d?.outlets, rackPlacements: d?.rackPlacements, selectedFileId: d?.selectedFileId, selectedPage: d?.selectedPage, activeZone: d?.activeZone })
	}

	$effect(() => {
		const d = data
		if (!d || dirty) return
		if (lastSavedSnapshot && snapshotOf(d) !== lastSavedSnapshot) return
		if (d.outlets) outlets = d.outlets
		if (d.rackPlacements) rackPlacements = d.rackPlacements
		if (d.selectedFileId) selectedFileId = d.selectedFileId
		if (d.selectedPage) selectedPage = d.selectedPage
		if (d.activeZone) activeZone = d.activeZone
		lastSavedSnapshot = ''
	})

	// ── Auto-save ──
	let saveTimer: ReturnType<typeof setTimeout> | null = null
	let prevSnapshot = $state('')

	$effect(() => {
		const snapshot = JSON.stringify({ outlets, rackPlacements, selectedFileId, selectedPage, activeZone })
		if (!prevSnapshot) { prevSnapshot = snapshot; return }
		if (snapshot === prevSnapshot) return
		prevSnapshot = snapshot

		dirty = true
		if (saveTimer) clearTimeout(saveTimer)
		saveTimer = setTimeout(() => {
			const payload = { outlets, rackPlacements, selectedFileId, selectedPage, activeZone }
			lastSavedSnapshot = JSON.stringify(payload)
			onsave?.(payload)
			dirty = false
		}, 300)
	})

	// ── Coordinate conversion ──
	function toMm(px: Point): Point {
		if (!calibration) return { x: 0, y: 0 }
		return {
			x: (px.x - calibration.origin.x) * calibration.scaleFactor,
			y: (px.y - calibration.origin.y) * calibration.scaleFactor,
		}
	}

	function toPx(mm: Point): Point {
		if (!calibration) return { x: 0, y: 0 }
		return {
			x: mm.x / calibration.scaleFactor + calibration.origin.x,
			y: mm.y / calibration.scaleFactor + calibration.origin.y,
		}
	}

	// ── Undo/redo ──
	const history = new HistoryStore()

	// ── Sticky defaults ──
	let stickyDefaults = $state({ ...OUTLET_DEFAULTS })

	// ── Outlet CRUD ──
	function addOutlet(pagePosPixels: Point) {
		if (!calibration) return
		const mm = toMm(pagePosPixels)
		const id = `out-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

		const zoneOutlets = outlets.filter(o => o.label?.startsWith(activeZone + '.'))
		const maxNum = zoneOutlets.reduce((max, o) => {
			const n = parseInt(o.label?.split('.')[1] ?? '0')
			return n > max ? n : max
		}, 0)
		const label = `${activeZone}.${String(maxNum + 1).padStart(3, '0')}`

		const outlet: OutletConfig = {
			id,
			position: mm,
			label,
			...stickyDefaults,
		}
		const prev = outlets
		outlets = [...outlets, outlet]
		selectedIds = new Set([id])
		history.record({
			label: 'Add outlet',
			undo: () => { outlets = prev; selectedIds = new Set() },
			redo: () => { outlets = [...prev, outlet]; selectedIds = new Set([id]) },
		})
	}

	function deleteSelected() {
		if (selectedIds.size === 0) return
		const prev = outlets
		const deletedIds = new Set(selectedIds)
		outlets = outlets.filter(o => !deletedIds.has(o.id))
		selectedIds = new Set()
		history.record({
			label: `Delete ${deletedIds.size}`,
			undo: () => { outlets = prev; selectedIds = deletedIds },
			redo: () => { outlets = prev.filter(o => !deletedIds.has(o.id)); selectedIds = new Set() },
		})
	}

	function updateOutlet(id: string, updates: Partial<OutletConfig>) {
		const prev = outlets
		outlets = outlets.map(o => o.id === id ? { ...o, ...updates } : o)
		updateStickyDefaults(updates)
		history.record({
			label: 'Update outlet',
			undo: () => { outlets = prev },
			redo: () => { outlets = prev.map(o => o.id === id ? { ...o, ...updates } : o) },
		})
	}

	function updateSelectedOutlets(updates: Partial<OutletConfig>) {
		if (selectedIds.size === 0) return
		const prev = outlets
		const ids = new Set(selectedIds)
		outlets = outlets.map(o => ids.has(o.id) ? { ...o, ...updates } : o)
		updateStickyDefaults(updates)
		history.record({
			label: `Update ${ids.size}`,
			undo: () => { outlets = prev },
			redo: () => { outlets = prev.map(o => ids.has(o.id) ? { ...o, ...updates } : o) },
		})
	}

	function updateStickyDefaults(updates: Partial<StickyDefaults>) {
		if (updates.level) stickyDefaults.level = updates.level
		if (updates.portCount) stickyDefaults.portCount = updates.portCount
		if (updates.cableType) stickyDefaults.cableType = updates.cableType
		if (updates.mountType) stickyDefaults.mountType = updates.mountType
		if (updates.usage) stickyDefaults.usage = updates.usage
	}

	let preMoveSnapshot: OutletConfig[] | null = null

	function moveOutlets(ids: Set<string>, dxMm: number, dyMm: number) {
		if (!preMoveSnapshot) preMoveSnapshot = outlets
		outlets = outlets.map(o => {
			if (!ids.has(o.id)) return o
			return { ...o, position: { x: o.position.x + dxMm, y: o.position.y + dyMm } }
		})
	}

	function moveEnd(ids: Set<string>) {
		if (!preMoveSnapshot) return
		const prev = preMoveSnapshot
		const final = outlets
		preMoveSnapshot = null
		history.record({
			label: `Move ${ids.size}`,
			undo: () => { outlets = prev },
			redo: () => { outlets = final },
		})
	}

	function selectOutlet(id: string, multi: boolean) {
		if (multi) {
			const next = new Set(selectedIds)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			selectedIds = next
		} else {
			selectedIds = new Set([id])
		}
		// Clear rack selection when selecting outlets
		selectedRackIds = new Set()
	}

	function rangeSelect(fromIndex: number, toIndex: number) {
		const lo = Math.min(fromIndex, toIndex)
		const hi = Math.max(fromIndex, toIndex)
		const next = new Set(selectedIds)
		for (let i = lo; i <= hi; i++) {
			if (outlets[i]) next.add(outlets[i].id)
		}
		selectedIds = next
	}

	function clearSelection() {
		selectedIds = new Set()
		selectedRackIds = new Set()
	}

	// ── Rack placement CRUD ──
	let stickyRotation = $state(0)

	function placeRack(rackId: string, room: string, position: Point) {
		const prev = rackPlacements
		const placement: RackPlacement = { rackId, room, position, rotation: stickyRotation }
		rackPlacements = [...rackPlacements, placement]
		selectedRackIds = new Set([rackId])
		selectedIds = new Set()
		history.record({
			label: 'Place rack',
			undo: () => { rackPlacements = prev; selectedRackIds = new Set() },
			redo: () => { rackPlacements = [...prev, placement]; selectedRackIds = new Set([rackId]) },
		})
	}

	function placeRacks(rackIds: string[], room: string, position: Point) {
		const prev = rackPlacements
		const newPlacements: RackPlacement[] = rackIds.map((id, i) => {
			const cfg = allRackConfigs.find(r => r.id === id)
			const offset = i * ((cfg?.widthMm ?? 600) + 200)
			return { rackId: id, room, position: { x: position.x + offset, y: position.y }, rotation: stickyRotation }
		})
		rackPlacements = [...rackPlacements, ...newPlacements]
		selectedRackIds = new Set(rackIds)
		selectedIds = new Set()
		history.record({
			label: `Place ${rackIds.length} racks`,
			undo: () => { rackPlacements = prev; selectedRackIds = new Set() },
			redo: () => { rackPlacements = [...prev, ...newPlacements]; selectedRackIds = new Set(rackIds) },
		})
	}

	function removeRackPlacements() {
		if (selectedRackIds.size === 0) return
		const prev = rackPlacements
		const ids = new Set(selectedRackIds)
		rackPlacements = rackPlacements.filter(p => !ids.has(p.rackId))
		selectedRackIds = new Set()
		history.record({
			label: `Remove ${ids.size} rack(s)`,
			undo: () => { rackPlacements = prev; selectedRackIds = ids },
			redo: () => { rackPlacements = prev.filter(p => !ids.has(p.rackId)); selectedRackIds = new Set() },
		})
	}

	function selectRack(rackId: string, multi: boolean) {
		if (multi) {
			const next = new Set(selectedRackIds)
			if (next.has(rackId)) next.delete(rackId)
			else next.add(rackId)
			selectedRackIds = next
		} else {
			selectedRackIds = new Set([rackId])
		}
		// Clear outlet selection when selecting racks
		selectedIds = new Set()
	}

	let preRackMoveSnapshot: RackPlacement[] | null = null

	function moveRacks(ids: Set<string>, dxMm: number, dyMm: number) {
		if (!preRackMoveSnapshot) preRackMoveSnapshot = rackPlacements
		rackPlacements = rackPlacements.map(p => {
			if (!ids.has(p.rackId)) return p
			return { ...p, position: { x: p.position.x + dxMm, y: p.position.y + dyMm } }
		})
	}

	function moveRacksEnd(ids: Set<string>) {
		if (!preRackMoveSnapshot) return
		const prev = preRackMoveSnapshot
		const final = rackPlacements
		preRackMoveSnapshot = null
		history.record({
			label: `Move ${ids.size} rack(s)`,
			undo: () => { rackPlacements = prev },
			redo: () => { rackPlacements = final },
		})
	}

	function rotateSelectedRacks() {
		if (selectedRackIds.size === 0) return
		const prev = rackPlacements
		const ids = new Set(selectedRackIds)
		rackPlacements = rackPlacements.map(p => {
			if (!ids.has(p.rackId)) return p
			return { ...p, rotation: (p.rotation + 90) % 360 }
		})
		// Remember rotation for next placement
		const lastRotated = rackPlacements.find(p => ids.has(p.rackId))
		if (lastRotated) stickyRotation = lastRotated.rotation
		history.record({
			label: `Rotate ${ids.size} rack(s)`,
			undo: () => { rackPlacements = prev },
			redo: () => { rackPlacements = prev.map(p => ids.has(p.rackId) ? { ...p, rotation: (p.rotation + 90) % 360 } : p) },
		})
	}

	function setSelectedRacksRotation(degrees: number) {
		if (selectedRackIds.size === 0) return
		const prev = rackPlacements
		const ids = new Set(selectedRackIds)
		const rot = ((degrees % 360) + 360) % 360
		rackPlacements = rackPlacements.map(p => ids.has(p.rackId) ? { ...p, rotation: rot } : p)
		stickyRotation = rot
		history.record({
			label: `Set rotation ${rot}°`,
			undo: () => { rackPlacements = prev },
			redo: () => { rackPlacements = prev.map(p => ids.has(p.rackId) ? { ...p, rotation: rot } : p) },
		})
	}

	function updateRackPlacements(rackId: string, updates: Partial<RackPlacement>) {
		const prev = rackPlacements
		rackPlacements = rackPlacements.map(p => p.rackId === rackId ? { ...p, ...updates } : p)
		history.record({
			label: 'Update rack',
			undo: () => { rackPlacements = prev },
			redo: () => { rackPlacements = prev.map(p => p.rackId === rackId ? { ...p, ...updates } : p) },
		})
	}

	// ── Floor format ──
	function fmtFloor(fl: number): string {
		const cfg = floors.find(f => f.number === fl)
		if (cfg?.label) return cfg.label
		if (fl < 0) {
			const n = String(Math.abs(fl)).padStart(2, '0')
			return `B${n}`
		}
		const n = String(fl).padStart(2, '0')
		if (floorFormat === '01F') return `${n}F`
		if (floorFormat === '01') return n
		return `L${n}`
	}

	// ── Keyboard shortcuts ──
	function onKeyDown(e: KeyboardEvent) {
		if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); history.undo(); return }
		if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); history.redo(); return }

		if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return

		if (e.key === 'Escape') {
			if (activeTool !== 'select') activeTool = 'select'
			else clearSelection()
		}
		else if (e.key === 'Delete' || e.key === 'Backspace') {
			if (selectedRackIds.size > 0) removeRackPlacements()
			else deleteSelected()
		}
		else if (e.key === 'r' || e.key === 'R') {
			if (selectedRackIds.size > 0) rotateSelectedRacks()
		}
		else if (sidebarTab === 'outlets') {
			if (e.key === 'o' || e.key === 'O') activeTool = 'outlet'
			else if (e.key >= '1' && e.key <= '9') updateSelectedOutlets({ portCount: parseInt(e.key) })
			else if (e.key === 'l') updateSelectedOutlets({ level: 'low' })
			else if (e.key === 'h') updateSelectedOutlets({ level: 'high' })
			else if (e.key === 'c') updateSelectedOutlets({ cableType: 'cat6a' })
			else if (e.key === 's') updateSelectedOutlets({ cableType: 'fiber-sm' })
			else if (e.key === 'm') updateSelectedOutlets({ cableType: 'fiber-mm' })
			else if (e.key === 'w') updateSelectedOutlets({ mountType: 'wall' })
			else if (e.key === 'f') updateSelectedOutlets({ mountType: 'floor' })
			else if (e.key === 'b') updateSelectedOutlets({ mountType: 'box' })
		}
	}
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="h-screen flex flex-col overflow-hidden">
<div class="print:hidden"><Titlebar title={projectName ? `${projectName} — Outlets` : 'Outlets'} /></div>

<PaneGroup direction="horizontal" class="flex-1 min-h-0">
	<!-- Sidebar -->
	<Pane defaultSize={20} minSize={15} maxSize={35} class="print:hidden">
		<div class="h-full border-r border-gray-200 flex flex-col">
			<!-- Sidebar tabs -->
			<div class="flex border-b border-gray-200 shrink-0">
				<button
					class="flex-1 py-1.5 text-[11px] font-medium transition-colors
						{sidebarTab === 'outlets' ? 'text-blue-600 border-b-2 border-blue-500 bg-white' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}"
					onclick={() => sidebarTab = 'outlets'}
				>Outlets</button>
				<button
					class="flex-1 py-1.5 text-[11px] font-medium transition-colors
						{sidebarTab === 'racks' ? 'text-blue-600 border-b-2 border-blue-500 bg-white' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}"
					onclick={() => sidebarTab = 'racks'}
				>Racks</button>
			</div>

			<!-- Sidebar content -->
			<div class="flex-1 min-h-0">
				{#if sidebarTab === 'outlets'}
					<OutletPalette
						{projectFiles}
						{selectedFileId}
						{selectedPage}
						{selectedFile}
						{calibration}
						{outlets}
						{selectedIds}
						{activeTool}
						{activeZone}
						{stickyDefaults}
						onfilechange={(id) => { selectedFileId = id; selectedPage = 1 }}
						onpagechange={(p) => selectedPage = p}
						onzonechange={(z) => activeZone = z}
						ontoolchange={(t) => activeTool = t}
						onselect={selectOutlet}
						onrangeselect={rangeSelect}
						onupdate={updateOutlet}
						onupdateselected={updateSelectedOutlets}
						ondelete={deleteSelected}
						ondefaultschange={updateStickyDefaults}
					/>
				{:else}
					<RackPalette
						rackConfigs={allRackConfigs}
						{rackPlacements}
						{selectedRackIds}
						{calibration}
						onplace={placeRacks}
						onselect={selectRack}
						onremove={removeRackPlacements}
						onrotate={rotateSelectedRacks}
					/>
				{/if}
			</div>
		</div>
	</Pane>

	<Handle withHandle class="print:hidden" />

	<!-- Main content -->
	<Pane defaultSize={80}>
		<div class="h-full flex flex-col">
			<!-- Canvas -->
			<div class="flex-1 min-h-0 relative">
				<OutletCanvas
					file={selectedFile}
					page={selectedPage}
					viewKey={`${projectId}_F${floor}_${selectedFileId}_${selectedPage}`}
					{calibration}
					{outlets}
					{selectedIds}
					{activeTool}
					{sidebarTab}
					{rackPlacements}
					rackConfigs={allRackConfigs}
					{selectedRackIds}
					{toPx}
					{toMm}
					onadd={addOutlet}
					onselect={selectOutlet}
					onclear={clearSelection}
					onmove={moveOutlets}
					onmoveend={moveEnd}
					ondelete={deleteSelected}
					onselectrack={selectRack}
					onmoveracks={moveRacks}
					onmoveracksend={moveRacksEnd}
					onplacerack={placeRack}
					onremoveracks={removeRackPlacements}
					onrotateracks={rotateSelectedRacks}
				/>

				<!-- Floating rack properties window -->
				{#if selectedRackIds.size > 0 && selectedRackConfigs.length > 0}
					<Window title="Rack Properties" open={true} right={16} top={48} class="p-3 space-y-1.5 text-xs w-56">
						<div class="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">
							{selectedRackConfigs.length === 1 ? selectedRackConfigs[0].label : `${selectedRackConfigs.length} racks`}
						</div>

						<label class="flex items-center gap-2">
							<span class="text-gray-500 w-14 shrink-0">Label</span>
							{#if selectedRackConfigs.length === 1}
								<input type="text" class="flex-1 h-5 px-1.5 text-xs font-mono border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
									value={selectedRackConfigs[0].label}
									onchange={e => updateSelectedRackConfigs({ label: e.currentTarget.value })} />
							{:else}
								<span class="text-[10px] text-gray-400 italic">— multiple —</span>
							{/if}
						</label>

						<label class="flex items-center gap-2">
							<span class="text-gray-500 w-14 shrink-0">Height</span>
							<input type="number" min="1" max="60"
								class="w-14 h-5 px-1.5 text-xs font-mono border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
								value={sharedRack('heightU') ?? ''}
								placeholder="—"
								onchange={e => updateSelectedRackConfigs({ heightU: parseInt(e.currentTarget.value) || 42 })} />
							<span class="text-[10px] text-gray-400">U</span>
						</label>

						<label class="flex items-center gap-2">
							<span class="text-gray-500 w-14 shrink-0">Width</span>
							<input type="number" min="100" max="2000" step="50"
								class="w-16 h-5 px-1.5 text-xs font-mono border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
								value={sharedRack('widthMm') ?? ''}
								placeholder="—"
								onchange={e => updateSelectedRackConfigs({ widthMm: parseInt(e.currentTarget.value) || 600 })} />
							<span class="text-[10px] text-gray-400">mm</span>
						</label>

						<label class="flex items-center gap-2">
							<span class="text-gray-500 w-14 shrink-0">Depth</span>
							<input type="number" min="100" max="2000" step="50"
								class="w-16 h-5 px-1.5 text-xs font-mono border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
								value={sharedRack('depthMm') ?? ''}
								placeholder="—"
								onchange={e => updateSelectedRackConfigs({ depthMm: parseInt(e.currentTarget.value) || 1000 })} />
							<span class="text-[10px] text-gray-400">mm</span>
						</label>

						<label class="flex items-center gap-2">
							<span class="text-gray-500 w-14 shrink-0">Type</span>
							<select class="flex-1 h-5 px-1 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
								value={sharedRack('type') ?? ''}
								onchange={e => { if (e.currentTarget.value) updateSelectedRackConfigs({ type: e.currentTarget.value as any }) }}>
								{#if !sharedRack('type')}<option value="">— mixed —</option>{/if}
								<option value="cabinet">Cabinet</option>
								<option value="4-post">4-Post</option>
								<option value="2-post">2-Post</option>
							</select>
						</label>

						<label class="flex items-center gap-2">
							<span class="text-gray-500 w-14 shrink-0">Maker</span>
							<input type="text"
								class="flex-1 h-5 px-1.5 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
								value={sharedRack('maker') ?? ''}
								placeholder={sharedRack('maker') === undefined && selectedRackConfigs.length > 1 ? '— mixed —' : '—'}
								onchange={e => updateSelectedRackConfigs({ maker: e.currentTarget.value || undefined })} />
						</label>

						<label class="flex items-center gap-2">
							<span class="text-gray-500 w-14 shrink-0">Model</span>
							<input type="text"
								class="flex-1 h-5 px-1.5 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
								value={sharedRack('model') ?? ''}
								placeholder={sharedRack('model') === undefined && selectedRackConfigs.length > 1 ? '— mixed —' : '—'}
								onchange={e => updateSelectedRackConfigs({ model: e.currentTarget.value || undefined })} />
						</label>

						<label class="flex items-center gap-2">
							<span class="text-gray-500 w-14 shrink-0">Rotation</span>
							<input type="number" min="0" max="345" step="15"
								class="w-14 h-5 px-1.5 text-xs font-mono border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
								value={sharedRotation ?? ''}
								placeholder="—"
								onchange={e => setSelectedRacksRotation(parseInt(e.currentTarget.value) || 0)} />
							<span class="text-[10px] text-gray-400">°</span>
							<button class="ml-auto text-[10px] text-gray-400 hover:text-blue-500 px-1 rounded hover:bg-blue-50 transition-colors"
								onclick={rotateSelectedRacks}>+90°</button>
						</label>

						{#if selectedRackPlaced.length === 1}
							<div class="flex items-center gap-2 text-gray-400">
								<span class="w-14 shrink-0">Pos</span>
								<span class="font-mono text-[10px]">{Math.round(selectedRackPlaced[0].position.x)}, {Math.round(selectedRackPlaced[0].position.y)} mm</span>
							</div>
						{/if}

						<div class="flex items-center gap-1 pt-1 border-t border-gray-100">
							<button class="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-red-500 border border-red-200 rounded hover:bg-red-50 transition-colors"
								onclick={removeRackPlacements}>
								<Icon name="trash" size={10} /> Remove
							</button>
						</div>
					</Window>
				{/if}
			</div>

			<!-- Status bar with floor tabs -->
			<div class="h-7 flex items-stretch border-t border-gray-200 bg-gray-50 shrink-0 relative z-10 print:hidden">
				<div class="flex items-stretch gap-0 overflow-x-auto">
					{#each floors as fl (fl.number)}
						<button
							class="px-3 text-[11px] font-mono font-medium border-r border-gray-200 transition-colors
								{floor === fl.number ? 'bg-white text-blue-600 border-t-2 border-t-blue-500' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600 border-t-2 border-t-transparent'}"
							onclick={() => onfloorchange?.(fl.number)}
						>{fmtFloor(fl.number)}</button>
					{/each}
					<button
						class="px-2 text-gray-300 hover:text-gray-500 transition-colors"
						title="Manage floors"
						onclick={() => floorManagerOpen = true}
					><Icon name="plus" size={12} /></button>
				</div>
				<div class="flex-1"></div>
				<div class="flex items-center gap-3 px-3 text-[10px] text-gray-400">
					<span>{outlets.length} outlet{outlets.length !== 1 ? 's' : ''}</span>
					<span>{rackPlacements.length} rack{rackPlacements.length !== 1 ? 's' : ''} placed</span>
					{#if calibration}
						<span>Scale: 1px = {calibration.scaleFactor.toFixed(1)}mm</span>
					{/if}
					<button
						class="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-gray-500 hover:text-green-600 hover:bg-green-50 transition-colors"
						title="Export outlets to Excel"
						onclick={() => exportOutletsToExcel(outlets, projectName, fmtFloor(floor))}
					><Icon name="download" size={11} /> Excel</button>
				</div>
			</div>
		</div>
	</Pane>
</PaneGroup>
</div>

<div class="print:hidden">
	<FloorManagerDialog
		open={floorManagerOpen}
		{floors}
		{floorFormat}
		onclose={() => floorManagerOpen = false}
		onupdate={updated => onupdatefloors?.(updated)}
		ondelete={fl => ondeletefloor?.(fl)}
	/>
</div>
