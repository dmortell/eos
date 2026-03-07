<script lang="ts">
	import { Icon, Titlebar } from '$lib'
	import { PaneGroup, Pane, Handle } from '$lib/components/ui/resizable'
	import FloorManagerDialog, { type FloorConfig } from '$lib/components/FloorManagerDialog.svelte'
	import type { OutletConfig, OutletsData, ToolMode, PageCalibration, Point } from './parts/types'
	import { OUTLET_DEFAULTS } from './parts/constants'
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
	let syncPaused = $state(false)
	let syncTimer: ReturnType<typeof setTimeout> | null = null

	function pauseSync() {
		syncPaused = true
		if (syncTimer) clearTimeout(syncTimer)
		syncTimer = setTimeout(() => { syncPaused = false }, 1500)
	}

	$effect(() => {
		const d = data
		if (syncPaused || !d) return
		if (d.outlets) outlets = d.outlets
		if (d.selectedFileId) selectedFileId = d.selectedFileId
		if (d.selectedPage) selectedPage = d.selectedPage
		if (d.activeZone) activeZone = d.activeZone
	})

	// ── Auto-save ──
	let saveTimer: ReturnType<typeof setTimeout> | null = null
	let initialized = false

	$effect(() => {
		const snapshot = JSON.stringify({ outlets, selectedFileId, selectedPage, activeZone })
		if (!initialized) { initialized = true; return }

		syncPaused = true
		if (saveTimer) clearTimeout(saveTimer)
		saveTimer = setTimeout(() => {
			onsave?.({ outlets, selectedFileId, selectedPage, activeZone })
			pauseSync()
		}, 500)
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
			...OUTLET_DEFAULTS,
		}
		outlets = [...outlets, outlet]
		selectedIds = new Set([id])
	}

	function deleteSelected() {
		if (selectedIds.size === 0) return
		outlets = outlets.filter(o => !selectedIds.has(o.id))
		selectedIds = new Set()
	}

	function updateOutlet(id: string, updates: Partial<OutletConfig>) {
		outlets = outlets.map(o => o.id === id ? { ...o, ...updates } : o)
	}

	function moveOutlets(ids: Set<string>, dxMm: number, dyMm: number) {
		outlets = outlets.map(o => {
			if (!ids.has(o.id)) return o
			return { ...o, position: { x: o.position.x + dxMm, y: o.position.y + dyMm } }
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
		if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return

		if (e.key === 'Escape') {
			if (activeTool !== 'select') activeTool = 'select'
			else clearSelection()
		}
		else if (e.key === 'o' || e.key === 'O') activeTool = 'outlet'
		else if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected()
		else if (e.key >= '1' && e.key <= '9') {
			const count = parseInt(e.key)
			for (const id of selectedIds) updateOutlet(id, { portCount: count })
		}
		else if (e.key === 'l') {
			for (const id of selectedIds) updateOutlet(id, { level: 'low' })
		}
		else if (e.key === 'h') {
			for (const id of selectedIds) updateOutlet(id, { level: 'high' })
		}
		else if (e.key === 'c') {
			for (const id of selectedIds) updateOutlet(id, { cableType: 'cat6a' })
		}
		else if (e.key === 's') {
			for (const id of selectedIds) updateOutlet(id, { cableType: 'fiber-sm' })
		}
		else if (e.key === 'm') {
			for (const id of selectedIds) updateOutlet(id, { cableType: 'fiber-mm' })
		}
		else if (e.key === 'w') {
			for (const id of selectedIds) updateOutlet(id, { mountType: 'wall' })
		}
		else if (e.key === 'f') {
			for (const id of selectedIds) updateOutlet(id, { mountType: 'floor' })
		}
		else if (e.key === 'b') {
			for (const id of selectedIds) updateOutlet(id, { mountType: 'box' })
		}
	}
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="h-screen flex flex-col overflow-hidden">
<Titlebar title={projectName ? `${projectName} — Outlets` : 'Outlets'} />

<PaneGroup direction="horizontal" class="flex-1 min-h-0">
	<!-- Sidebar -->
	<Pane defaultSize={20} minSize={15} maxSize={35}>
		<div class="h-full overflow-y-auto border-r border-gray-200">
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
				onfilechange={(id) => { selectedFileId = id; selectedPage = 1 }}
				onpagechange={(p) => selectedPage = p}
				onzonechange={(z) => activeZone = z}
				ontoolchange={(t) => activeTool = t}
				onselect={selectOutlet}
				onupdate={updateOutlet}
				ondelete={deleteSelected}
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
					ondelete={deleteSelected}
				/>
			</div>

			<!-- Status bar with floor tabs -->
			<div class="h-7 flex items-stretch border-t border-gray-200 bg-gray-50 shrink-0">
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
