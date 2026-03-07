<script lang="ts">
	import { Icon, Titlebar } from '$lib'
	import { PaneGroup, Pane, Handle } from '$lib/components/ui/resizable'
	import FloorManagerDialog, { type FloorConfig } from '$lib/components/FloorManagerDialog.svelte'
	import type { OutletConfig, OutletsData, ToolMode, PageCalibration, Point } from './parts/types'
	import { OUTLET_DEFAULTS, type StickyDefaults } from './parts/constants'
	import { HistoryStore } from './parts/HistoryStore.svelte.ts'
	import OutletCanvas from './parts/OutletCanvas.svelte'
	import OutletPalette from './parts/OutletPalette.svelte'

	let { data = null, files = [], floors = [], frameData = null, floor, projectId = '', projectName = '', onsave, onfloorchange, onupdatefloors, ondeletefloor }: {
		data?: any
		files?: any[]
		floors?: FloorConfig[]
		frameData?: any
		floor: number
		projectId?: string
		projectName?: string
		onsave?: (payload: any) => void
		onfloorchange?: (floor: number) => void
		onupdatefloors?: (floors: FloorConfig[]) => void
		ondeletefloor?: (floor: number) => void
	} = $props()

	// ── State ──
	let outlets = $state<OutletConfig[]>(data?.outlets ?? [])
	let selectedFileId = $state<string>(data?.selectedFileId ?? '')
	let selectedPage = $state<number>(data?.selectedPage ?? 1)
	let activeZone = $state<string>(data?.activeZone ?? 'A')
	let activeTool = $state<ToolMode>('select')
	let selectedIds = $state<Set<string>>(new Set())
	let floorManagerOpen = $state(false)
	let floorFormat = $state<string>('L01')

	// Calibration from selected file/page
	let calibration = $state<PageCalibration | null>(null)

	// Selected file doc
	let selectedFile = $derived(files.find(f => f.id === selectedFileId) ?? null)

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
	// lastSavedSnapshot tracks what we last sent to Firestore.
	// Sync-from-remote only applies when incoming data matches what we saved
	// (i.e. Firestore has caught up), preventing stale data from overwriting local edits.
	let lastSavedSnapshot = ''
	let dirty = $state(false)

	function snapshotOf(d: any): string {
		return JSON.stringify({ outlets: d?.outlets, selectedFileId: d?.selectedFileId, selectedPage: d?.selectedPage, activeZone: d?.activeZone })
	}

	$effect(() => {
		const d = data
		if (!d || dirty) return
		// Only sync if remote matches our last save (Firestore caught up) or we haven't saved yet
		if (lastSavedSnapshot && snapshotOf(d) !== lastSavedSnapshot) return
		if (d.outlets) outlets = d.outlets
		if (d.selectedFileId) selectedFileId = d.selectedFileId
		if (d.selectedPage) selectedPage = d.selectedPage
		if (d.activeZone) activeZone = d.activeZone
		lastSavedSnapshot = ''
	})

	// ── Auto-save ──
	let saveTimer: ReturnType<typeof setTimeout> | null = null
	let prevSnapshot = $state('')

	$effect(() => {
		const snapshot = JSON.stringify({ outlets, selectedFileId, selectedPage, activeZone })
		if (!prevSnapshot) { prevSnapshot = snapshot; return }
		if (snapshot === prevSnapshot) return
		prevSnapshot = snapshot

		dirty = true
		if (saveTimer) clearTimeout(saveTimer)
		saveTimer = setTimeout(() => {
			const payload = { outlets, selectedFileId, selectedPage, activeZone }
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

	// ── Sticky defaults (last-used properties carry forward to new outlets) ──
	let stickyDefaults = $state({ ...OUTLET_DEFAULTS })

	// ── Outlet CRUD ──
	function addOutlet(pagePosPixels: Point) {
		if (!calibration) return
		const mm = toMm(pagePosPixels)
		const id = `out-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

		// Auto-label: next number in active zone
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
	}

	// ── Floor format ──
	function fmtFloor(fl: number): string {
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
		// Undo/redo works even in inputs
		if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); history.undo(); return }
		if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); history.redo(); return }

		if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return

		if (e.key === 'Escape') {
			if (activeTool !== 'select') activeTool = 'select'
			else clearSelection()
		}
		else if (e.key === 'o' || e.key === 'O') activeTool = 'outlet'
		else if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected()
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
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="h-screen flex flex-col overflow-hidden">
<Titlebar title={projectName ? `${projectName} — Outlets` : 'Outlets'} />

<PaneGroup direction="horizontal" class="flex-1 min-h-0">
	<!-- Sidebar -->
	<Pane defaultSize={20} minSize={15} maxSize={35}>
		<div class="h-full border-r border-gray-200">
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
		</div>
	</Pane>

	<Handle withHandle />

	<!-- Main content -->
	<Pane defaultSize={80}>
		<div class="h-full flex flex-col">
			<!-- Canvas -->
			<div class="flex-1 min-h-0">
				<OutletCanvas
					file={selectedFile}
					page={selectedPage}
					{calibration}
					{outlets}
					{selectedIds}
					{activeTool}
					{toPx}
					{toMm}
					onadd={addOutlet}
					onselect={selectOutlet}
					onclear={clearSelection}
					onmove={moveOutlets}
					onmoveend={moveEnd}
					ondelete={deleteSelected}
				/>
			</div>

			<!-- Status bar with floor tabs -->
			<div class="h-7 flex items-stretch border-t border-gray-200 bg-gray-50 shrink-0 relative z-10">
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
					{#if calibration}
						<span>Scale: 1px = {calibration.scaleFactor.toFixed(1)}mm</span>
					{/if}
				</div>
			</div>
		</div>
	</Pane>
</PaneGroup>
</div>

<FloorManagerDialog
	open={floorManagerOpen}
	{floors}
	{floorFormat}
	onclose={() => floorManagerOpen = false}
	onupdate={updated => onupdatefloors?.(updated)}
	ondelete={fl => ondeletefloor?.(fl)}
/>
