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
	import TrunkPalette from './trunks/TrunkPalette.svelte'
	import type { TrunkConfig, TrunkNode, TrunkSegment, PipeSpec, RectSpec } from './trunks/types'
	import { genId, splitSegment as splitTrunkSeg, snapToGrid, dist } from './trunks/geometry'
	import { SNAP_THRESHOLD_MM } from './trunks/constants'
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
	let trunks = $state<TrunkConfig[]>(data?.trunks ?? [])
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
	let selectedTrunkIds = $state<Set<string>>(new Set())
	let selectedNodeIds = $state<Set<string>>(new Set())
	let trunkPaletteRef: TrunkPalette | undefined = $state()
	let trunkDrawingActive = $state(false)
	let floorManagerOpen = $state(false)
	let floorFormat = $state<string>('L01')
	let gridMm = $state(100)

	// Check if selected node is at a junction between different trunks
	let selectedNodeIsJunction = $derived.by(() => {
		if (selectedNodeIds.size !== 1 || selectedTrunkIds.size !== 1) return false
		const trunkId = [...selectedTrunkIds][0]
		const nodeId = [...selectedNodeIds][0]
		const trunk = trunks.find(t => t.id === trunkId)
		const node = trunk?.nodes.find(n => n.id === nodeId)
		if (!node) return false
		return trunks.some(t => t.id !== trunkId && t.nodes.some(n =>
			n.position.x === node.position.x && n.position.y === node.position.y
		))
	})

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
		return JSON.stringify({ outlets: d?.outlets, rackPlacements: d?.rackPlacements, trunks: d?.trunks, selectedFileId: d?.selectedFileId, selectedPage: d?.selectedPage, activeZone: d?.activeZone })
	}

	$effect(() => {
		const d = data
		if (!d || dirty) return
		if (lastSavedSnapshot && snapshotOf(d) !== lastSavedSnapshot) return
		if (d.outlets) outlets = d.outlets
		if (d.rackPlacements) rackPlacements = d.rackPlacements
		if (d.trunks) trunks = d.trunks
		if (d.selectedFileId) selectedFileId = d.selectedFileId
		if (d.selectedPage) selectedPage = d.selectedPage
		if (d.activeZone) activeZone = d.activeZone
		lastSavedSnapshot = ''
	})

	// ── Auto-save ──
	let saveTimer: ReturnType<typeof setTimeout> | null = null
	let prevSnapshot = $state('')

	$effect(() => {
		const snapshot = JSON.stringify({ outlets, rackPlacements, trunks, selectedFileId, selectedPage, activeZone })
		if (!prevSnapshot) { prevSnapshot = snapshot; return }
		if (snapshot === prevSnapshot) return
		prevSnapshot = snapshot

		dirty = true
		if (saveTimer) clearTimeout(saveTimer)
		saveTimer = setTimeout(() => {
			const payload = { outlets, rackPlacements, trunks, selectedFileId, selectedPage, activeZone }
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
		const mm = snapToGrid(toMm(pagePosPixels), gridMm)
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
		// Snap to grid on release
		outlets = outlets.map(o => ids.has(o.id) ? { ...o, position: snapToGrid(o.position, gridMm) } : o)
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
		selectedTrunkIds = new Set()
		selectedNodeIds = new Set()
	}

	// ── Rack placement CRUD ──
	let stickyRotation = $state(0)

	function placeRack(rackId: string, room: string, position: Point) {
		const prev = rackPlacements
		const placement: RackPlacement = { rackId, room, position: snapToGrid(position, gridMm), rotation: stickyRotation }
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
			return { rackId: id, room, position: snapToGrid({ x: position.x + offset, y: position.y }, gridMm), rotation: stickyRotation }
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
	let preRackMoveTrunkSnapshot: TrunkConfig[] | null = null

	function moveRacks(ids: Set<string>, dxMm: number, dyMm: number, absolute?: boolean) {
		if (!preRackMoveSnapshot) {
			preRackMoveSnapshot = rackPlacements
			preRackMoveTrunkSnapshot = trunks
		}
		const base = absolute ? preRackMoveSnapshot : rackPlacements
		rackPlacements = base.map(p => {
			if (!ids.has(p.rackId)) return p
			return { ...p, position: { x: p.position.x + dxMm, y: p.position.y + dyMm } }
		})
		// Move connected trunk nodes with the racks
		const baseTrunks = absolute ? preRackMoveTrunkSnapshot! : trunks
		trunks = baseTrunks.map(t => {
			let changed = false
			const newNodes = t.nodes.map(n => {
				if (n.connectedRackId && ids.has(n.connectedRackId)) {
					changed = true
					return { ...n, position: { x: n.position.x + dxMm, y: n.position.y + dyMm } }
				}
				return n
			})
			return changed ? { ...t, nodes: newNodes } : t
		})
	}

	function moveRacksEnd(ids: Set<string>) {
		if (!preRackMoveSnapshot) return
		// Snap to grid on release
		rackPlacements = rackPlacements.map(p => ids.has(p.rackId) ? { ...p, position: snapToGrid(p.position, gridMm) } : p)
		// Snap connected trunk nodes to grid too
		trunks = trunks.map(t => {
			let changed = false
			const newNodes = t.nodes.map(n => {
				if (n.connectedRackId && ids.has(n.connectedRackId)) {
					changed = true
					return { ...n, position: snapToGrid(n.position, gridMm) }
				}
				return n
			})
			return changed ? { ...t, nodes: newNodes } : t
		})
		const prevRacks = preRackMoveSnapshot
		const finalRacks = rackPlacements
		const prevTrunks = preRackMoveTrunkSnapshot
		const finalTrunks = trunks
		preRackMoveSnapshot = null
		preRackMoveTrunkSnapshot = null
		history.record({
			label: `Move ${ids.size} rack(s)`,
			undo: () => { rackPlacements = prevRacks; trunks = prevTrunks! },
			redo: () => { rackPlacements = finalRacks; trunks = finalTrunks },
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

	// ── Trunk CRUD ──

	/** Check if two trunks have the same shape and spec (safe to merge into one graph) */
	function trunksCompatible(a: TrunkConfig, b: TrunkConfig): boolean {
		if (a.shape !== b.shape) return false
		if (a.location !== b.location) return false
		const sa = a.spec, sb = b.spec
		if ('catalog' in sa && 'catalog' in sb && sa.catalog !== sb.catalog) return false
		if ('outerDiameterMm' in sa && 'outerDiameterMm' in sb && sa.outerDiameterMm !== (sb as any).outerDiameterMm) return false
		if ('widthMm' in sa && 'widthMm' in sb && sa.widthMm !== (sb as any).widthMm) return false
		if ('heightMm' in sa && 'heightMm' in sb && (sa as any).heightMm !== (sb as any).heightMm) return false
		return true
	}

	function addTrunk(nodes: TrunkNode[], segments: TrunkSegment[], snaps?: Map<string, { trunkId: string; nodeId: string }>) {
		if (!trunkPaletteRef || nodes.length < 2 || segments.length === 0) return
		const prev = trunks

		// Build a temporary trunk config for the new drawing (to compare compatibility)
		const newTrunkSpec: TrunkConfig = {
			id: '',
			shape: trunkPaletteRef.currentShape(),
			location: trunkPaletteRef.currentLocation(),
			spec: trunkPaletteRef.currentSpec(),
			nodes, segments, isPrimary: true,
		}

		// Collect unique trunk IDs that are being connected to
		const connectedTrunkIds = new Set<string>()
		if (snaps) for (const s of snaps.values()) connectedTrunkIds.add(s.trunkId)

		// Filter to only compatible trunks for actual merging
		const compatibleTrunkIds = new Set<string>()
		for (const tid of connectedTrunkIds) {
			const t = trunks.find(tr => tr.id === tid)
			if (t && trunksCompatible(newTrunkSpec, t)) compatibleTrunkIds.add(tid)
		}

		if (compatibleTrunkIds.size > 0) {
			// Merge: add new nodes/segments into compatible existing trunk(s)
			const targetTrunkIds = [...compatibleTrunkIds]
			const primaryTargetId = targetTrunkIds[0]

			// Gather all compatible trunks being merged
			const mergeTargets = trunks.filter(t => compatibleTrunkIds.has(t.id))
			const otherTrunks = trunks.filter(t => !compatibleTrunkIds.has(t.id))
			const primaryTarget = mergeTargets.find(t => t.id === primaryTargetId)!

			// Start with the primary target's nodes and segments
			const existingNodeIds = new Set<string>()
			const mergedNodes = [...primaryTarget.nodes]
			const mergedSegments = [...primaryTarget.segments]
			for (const n of mergedNodes) existingNodeIds.add(n.id)

			// Add nodes/segments from other compatible trunks being merged
			for (const t of mergeTargets) {
				if (t.id === primaryTargetId) continue
				for (const n of t.nodes) {
					if (!existingNodeIds.has(n.id)) {
						mergedNodes.push(n)
						existingNodeIds.add(n.id)
					}
				}
				mergedSegments.push(...t.segments)
			}

			// Add new drawing nodes (skip ones that snapped to existing nodes)
			for (const n of nodes) {
				if (!existingNodeIds.has(n.id)) {
					mergedNodes.push(n)
					existingNodeIds.add(n.id)
				}
			}

			// Add new drawing segments
			mergedSegments.push(...segments)

			const mergedTrunk: TrunkConfig = { ...primaryTarget, nodes: mergedNodes, segments: mergedSegments }
			trunks = [...otherTrunks, mergedTrunk]
			selectedTrunkIds = new Set([primaryTargetId])
			selectedNodeIds = new Set()
			history.record({
				label: compatibleTrunkIds.size > 1 ? 'Merge trunks' : 'Extend trunk',
				undo: () => { trunks = prev; selectedTrunkIds = new Set() },
				redo: () => { trunks = [...otherTrunks, mergedTrunk]; selectedTrunkIds = new Set([primaryTargetId]) },
			})
		} else {
			// No connections — create a new trunk
			const id = genId('trunk')
			const trunk: TrunkConfig = {
				id,
				shape: trunkPaletteRef.currentShape(),
				location: trunkPaletteRef.currentLocation(),
				spec: trunkPaletteRef.currentSpec(),
				nodes,
				segments,
				isPrimary: true,
			}
			trunks = [...trunks, trunk]
			selectedTrunkIds = new Set([id])
			selectedNodeIds = new Set()
			history.record({
				label: 'Add trunk',
				undo: () => { trunks = prev; selectedTrunkIds = new Set() },
				redo: () => { trunks = [...prev, trunk]; selectedTrunkIds = new Set([id]) },
			})
		}
	}

	function deleteTrunks() {
		if (selectedTrunkIds.size === 0) return
		const prev = trunks
		const ids = new Set(selectedTrunkIds)
		trunks = trunks.filter(t => !ids.has(t.id))
		selectedTrunkIds = new Set()
		selectedNodeIds = new Set()
		history.record({
			label: `Delete ${ids.size} trunk(s)`,
			undo: () => { trunks = prev; selectedTrunkIds = ids },
			redo: () => { trunks = prev.filter(t => !ids.has(t.id)); selectedTrunkIds = new Set() },
		})
	}

	function deleteSelectedNodes() {
		if (selectedNodeIds.size === 0 || selectedTrunkIds.size !== 1) return
		const trunkId = [...selectedTrunkIds][0]
		const trunk = trunks.find(t => t.id === trunkId)
		if (!trunk) return

		const prev = trunks
		const nodeIds = new Set(selectedNodeIds)
		let newSegments = [...trunk.segments]

		// For each deleted node that connects exactly 2 segments, merge them into one
		for (const delId of nodeIds) {
			const connected = newSegments.filter(s => s.nodes[0] === delId || s.nodes[1] === delId)
			if (connected.length === 2) {
				// Find the two other endpoints
				const otherA = connected[0].nodes[0] === delId ? connected[0].nodes[1] : connected[0].nodes[0]
				const otherB = connected[1].nodes[0] === delId ? connected[1].nodes[1] : connected[1].nodes[0]
				if (otherA !== otherB) {
					// Remove the two old segments and add a merged one
					const removeIds = new Set(connected.map(s => s.id))
					newSegments = newSegments.filter(s => !removeIds.has(s.id))
					// Only add if this segment doesn't already exist
					const exists = newSegments.some(s =>
						(s.nodes[0] === otherA && s.nodes[1] === otherB) || (s.nodes[0] === otherB && s.nodes[1] === otherA)
					)
					if (!exists) {
						newSegments.push({ id: genId('ts'), nodes: [otherA, otherB] })
					}
				} else {
					// Both segments connect to the same node (loop of 2) — just remove them
					newSegments = newSegments.filter(s => s.nodes[0] !== delId && s.nodes[1] !== delId)
				}
			} else {
				// Node has 1 or 3+ connections — just remove its segments
				newSegments = newSegments.filter(s => s.nodes[0] !== delId && s.nodes[1] !== delId)
			}
		}

		const newNodes = trunk.nodes.filter(n => !nodeIds.has(n.id))

		if (newNodes.length < 2 || newSegments.length === 0) {
			trunks = trunks.filter(t => t.id !== trunkId)
			selectedTrunkIds = new Set()
		} else {
			trunks = trunks.map(t => t.id === trunkId ? { ...t, nodes: newNodes, segments: newSegments } : t)
		}
		selectedNodeIds = new Set()
		const final = trunks
		history.record({
			label: `Delete ${nodeIds.size} node(s)`,
			undo: () => { trunks = prev; selectedNodeIds = nodeIds; selectedTrunkIds = new Set([trunkId]) },
			redo: () => { trunks = final; selectedNodeIds = new Set(); if (!final.find(t => t.id === trunkId)) selectedTrunkIds = new Set() },
		})
	}

	function updateTrunk(trunkId: string, updates: Partial<TrunkConfig>) {
		const prev = trunks
		trunks = trunks.map(t => t.id === trunkId ? { ...t, ...updates } : t)
		history.record({
			label: 'Update trunk',
			undo: () => { trunks = prev },
			redo: () => { trunks = prev.map(t => t.id === trunkId ? { ...t, ...updates } : t) },
		})
	}

	function toggleTrunkVisibility(trunkId: string) {
		const trunk = trunks.find(t => t.id === trunkId)
		if (!trunk) return
		trunks = trunks.map(t => t.id === trunkId ? { ...t, visible: t.visible === false ? true : false } : t)
	}

	function selectTrunk(trunkId: string, multi: boolean) {
		if (multi) {
			const next = new Set(selectedTrunkIds)
			if (next.has(trunkId)) next.delete(trunkId)
			else next.add(trunkId)
			selectedTrunkIds = next
		} else {
			selectedTrunkIds = new Set([trunkId])
		}
		selectedNodeIds = new Set()
		selectedIds = new Set()
		selectedRackIds = new Set()
	}

	function selectTrunkNode(nodeId: string, multi: boolean) {
		if (multi) {
			const next = new Set(selectedNodeIds)
			if (next.has(nodeId)) next.delete(nodeId)
			else next.add(nodeId)
			selectedNodeIds = next
		} else {
			selectedNodeIds = new Set([nodeId])
		}
	}

	let preTrunkNodeMoveSnapshot: TrunkConfig[] | null = null

	function moveTrunkNodes(trunkId: string, nodeIds: Set<string>, dxMm: number, dyMm: number, independent?: boolean, absolute?: boolean) {
		if (!preTrunkNodeMoveSnapshot) preTrunkNodeMoveSnapshot = trunks
		// Find positions of moved nodes before the move (from snapshot) to identify coincident nodes in other trunks
		const srcTrunk = preTrunkNodeMoveSnapshot.find(t => t.id === trunkId)
		const movedPositions = new Set<string>()
		if (!independent && srcTrunk) {
			for (const n of srcTrunk.nodes) {
				if (nodeIds.has(n.id)) movedPositions.add(`${n.position.x},${n.position.y}`)
			}
		}
		trunks = (absolute ? preTrunkNodeMoveSnapshot : trunks).map(t => {
			if (t.id === trunkId) {
				return {
					...t,
					nodes: t.nodes.map(n =>
						nodeIds.has(n.id) ? { ...n, position: { x: n.position.x + dxMm, y: n.position.y + dyMm } } : n
					),
				}
			}
			if (independent) return t  // Alt+drag: only move this trunk's nodes
			// Move coincident nodes in other trunks (connected at same position but separate trunk)
			const origT = preTrunkNodeMoveSnapshot!.find(ot => ot.id === t.id)
			if (!origT) return t
			const coincidentIds = origT.nodes
				.filter(n => movedPositions.has(`${n.position.x},${n.position.y}`))
				.map(n => n.id)
			if (coincidentIds.length === 0) return t
			const baseT = absolute ? origT : t
			return {
				...baseT,
				nodes: baseT.nodes.map(n =>
					coincidentIds.includes(n.id) ? { ...n, position: { x: n.position.x + dxMm, y: n.position.y + dyMm } } : n
				),
			}
		})
	}

	function moveTrunkNodesEnd(trunkId: string, nodeIds: Set<string>, independent?: boolean) {
		if (!preTrunkNodeMoveSnapshot) return

		// Find original positions of moved nodes to identify coincident nodes in other trunks
		const srcTrunk = preTrunkNodeMoveSnapshot.find(t => t.id === trunkId)
		const origPositions = new Set<string>()
		if (srcTrunk) {
			for (const n of srcTrunk.nodes) {
				if (nodeIds.has(n.id)) origPositions.add(`${n.position.x},${n.position.y}`)
			}
		}

		// Snap to grid on release — also snap coincident nodes in other trunks (unless independent)
		const movedTrunk = trunks.find(t => t.id === trunkId)!
		const snappedPositions = new Map<string, Point>()  // nodeId → snapped position
		for (const n of movedTrunk.nodes) {
			if (nodeIds.has(n.id)) snappedPositions.set(n.id, snapToGrid(n.position, gridMm))
		}
		if (independent) {
			// Alt+drag: only snap this trunk's nodes, skip coincident and merge logic
			trunks = trunks.map(t => {
				if (t.id !== trunkId) return t
				return { ...t, nodes: t.nodes.map(n => nodeIds.has(n.id) ? { ...n, position: snappedPositions.get(n.id) ?? n.position } : n) }
			})
			const prev = preTrunkNodeMoveSnapshot
			const final = trunks
			preTrunkNodeMoveSnapshot = null
			history.record({
				label: `Disconnect ${nodeIds.size} node(s)`,
				undo: () => { trunks = prev },
				redo: () => { trunks = final },
			})
			return
		}
		// Build a map of original position → snapped position for coincident node updates
		const positionMap = new Map<string, Point>()
		if (srcTrunk) {
			for (const n of srcTrunk.nodes) {
				if (nodeIds.has(n.id)) {
					const snapped = snappedPositions.get(n.id)
					if (snapped) positionMap.set(`${n.position.x},${n.position.y}`, snapped)
				}
			}
		}
		trunks = trunks.map(t => {
			if (t.id === trunkId) {
				return { ...t, nodes: t.nodes.map(n => nodeIds.has(n.id) ? { ...n, position: snappedPositions.get(n.id) ?? n.position } : n) }
			}
			// Snap coincident nodes in other trunks too
			const origT = preTrunkNodeMoveSnapshot!.find(ot => ot.id === t.id)
			if (!origT) return t
			let changed = false
			const newNodes = t.nodes.map(n => {
				const origNode = origT.nodes.find(on => on.id === n.id)
				if (!origNode) return n
				const key = `${origNode.position.x},${origNode.position.y}`
				if (origPositions.has(key)) {
					const snapped = positionMap.get(key)
					if (snapped) { changed = true; return { ...n, position: snapped } }
				}
				return n
			})
			return changed ? { ...t, nodes: newNodes } : t
		})

		// Check if any moved node landed near another node → reconnect or merge
		const sourceTrunk = trunks.find(t => t.id === trunkId)
		if (sourceTrunk) {
			for (const movedNodeId of nodeIds) {
				const movedNode = sourceTrunk.nodes.find(n => n.id === movedNodeId)
				if (!movedNode) continue

				// Same-trunk reconnection: merge moved node into a nearby node in the same trunk
				for (const targetNode of sourceTrunk.nodes) {
					if (targetNode.id === movedNodeId || nodeIds.has(targetNode.id)) continue
					if (dist(movedNode.position, targetNode.position) <= SNAP_THRESHOLD_MM) {
						// Rewire all segments referencing movedNode to use targetNode, then remove movedNode
						trunks = trunks.map(t => {
							if (t.id !== trunkId) return t
							const newSegments = t.segments
								.map(s => ({
									...s,
									nodes: s.nodes.map(nid => nid === movedNodeId ? targetNode.id : nid) as [string, string],
								}))
								.filter(s => s.nodes[0] !== s.nodes[1])  // remove self-loops
								// deduplicate
								.filter((s, i, arr) => !arr.slice(0, i).some(prev =>
									(prev.nodes[0] === s.nodes[0] && prev.nodes[1] === s.nodes[1]) ||
									(prev.nodes[0] === s.nodes[1] && prev.nodes[1] === s.nodes[0])
								))
							return { ...t, nodes: t.nodes.filter(n => n.id !== movedNodeId), segments: newSegments }
						})
						selectedNodeIds = new Set([targetNode.id])
						const prev = preTrunkNodeMoveSnapshot!
						const final = trunks
						preTrunkNodeMoveSnapshot = null
						history.record({
							label: 'Reconnect node',
							undo: () => { trunks = prev; selectedNodeIds = new Set() },
							redo: () => { trunks = final; selectedNodeIds = new Set([targetNode.id]) },
						})
						return
					}
				}

				for (const otherTrunk of trunks) {
					if (otherTrunk.id === trunkId || otherTrunk.visible === false) continue
					for (const targetNode of otherTrunk.nodes) {
						if (dist(movedNode.position, targetNode.position) <= SNAP_THRESHOLD_MM) {
							if (trunksCompatible(sourceTrunk, otherTrunk)) {
								// Compatible: merge trunks together
								trunks = mergeTrunks(trunks, trunkId, movedNodeId, otherTrunk.id, targetNode.id)
								selectedTrunkIds = new Set([trunkId])
								selectedNodeIds = new Set()

								const prev = preTrunkNodeMoveSnapshot!
								const final = trunks
								preTrunkNodeMoveSnapshot = null
								history.record({
									label: 'Merge trunks',
									undo: () => { trunks = prev; selectedTrunkIds = new Set() },
									redo: () => { trunks = final; selectedTrunkIds = new Set([trunkId]) },
								})
								return
							} else {
								// Incompatible: snap position to target node but keep trunks separate
								trunks = trunks.map(t => {
									if (t.id !== trunkId) return t
									return { ...t, nodes: t.nodes.map(n =>
										n.id === movedNodeId ? { ...n, position: { ...targetNode.position } } : n
									)}
								})
							}
						}
					}
				}
			}
		}

		// Check if moved nodes landed on a rack or outlet → set connection
		const updatedTrunk = trunks.find(t => t.id === trunkId)
		if (updatedTrunk) {
			trunks = trunks.map(t => {
				if (t.id !== trunkId) return t
				return {
					...t, nodes: t.nodes.map(n => {
						if (!nodeIds.has(n.id)) return n
						// Check racks — use edge midpoints for matching
						for (const rp of rackPlacements) {
							const rc = allRackConfigs.find(r => r.id === rp.rackId)
							if (!rc) continue
							const w = rc.widthMm, dp = rc.depthMm ?? rc.widthMm
							const cx = rp.position.x + w / 2, cy = rp.position.y + dp / 2
							const rot = (rp.rotation ?? 0) * Math.PI / 180
							const cos = Math.cos(rot), sin = Math.sin(rot)
							const rotPt = (lx: number, ly: number): Point => ({
								x: cx + (lx - cx) * cos - (ly - cy) * sin,
								y: cy + (lx - cx) * sin + (ly - cy) * cos,
							})
							const edges = [rotPt(cx, rp.position.y), rotPt(cx, rp.position.y + dp), rotPt(rp.position.x, cy), rotPt(rp.position.x + w, cy)]
							if (edges.some(ep => dist(n.position, ep) <= SNAP_THRESHOLD_MM)) {
								return { ...n, connectedRackId: rp.rackId, connectedOutletId: undefined }
							}
						}
						// Check outlets
						for (const o of outlets) {
							if (dist(n.position, o.position) <= SNAP_THRESHOLD_MM) {
								return { ...n, connectedOutletId: o.id, connectedRackId: undefined }
							}
						}
						// Clear connections if moved away
						if (n.connectedRackId || n.connectedOutletId) {
							return { ...n, connectedRackId: undefined, connectedOutletId: undefined }
						}
						return n
					}),
				}
			})
		}

		const prev = preTrunkNodeMoveSnapshot
		const final = trunks
		preTrunkNodeMoveSnapshot = null
		history.record({
			label: `Move ${nodeIds.size} node(s)`,
			undo: () => { trunks = prev },
			redo: () => { trunks = final },
		})
	}

	/** Merge two trunks by connecting movedNodeId to targetNodeId.
	 *  All references to movedNode are rewired to targetNode, then trunks are combined. */
	function mergeTrunks(
		allTrunks: TrunkConfig[],
		srcTrunkId: string, movedNodeId: string,
		dstTrunkId: string, targetNodeId: string,
	): TrunkConfig[] {
		const src = allTrunks.find(t => t.id === srcTrunkId)!
		const dst = allTrunks.find(t => t.id === dstTrunkId)!

		// Collect all nodes: src nodes (replacing moved node with target node's position) + dst nodes
		const existingNodeIds = new Set(dst.nodes.map(n => n.id))
		const mergedNodes = [...dst.nodes]
		for (const n of src.nodes) {
			if (n.id === movedNodeId) continue  // drop the moved node, we'll use target node instead
			if (!existingNodeIds.has(n.id)) {
				mergedNodes.push(n)
				existingNodeIds.add(n.id)
			}
		}

		// Rewire src segments: replace movedNodeId references with targetNodeId
		const mergedSegments = [...dst.segments]
		for (const seg of src.segments) {
			const n0 = seg.nodes[0] === movedNodeId ? targetNodeId : seg.nodes[0]
			const n1 = seg.nodes[1] === movedNodeId ? targetNodeId : seg.nodes[1]
			if (n0 === n1) continue  // skip self-loops
			// Skip duplicate segments
			const isDup = mergedSegments.some(s =>
				(s.nodes[0] === n0 && s.nodes[1] === n1) || (s.nodes[0] === n1 && s.nodes[1] === n0)
			)
			if (!isDup) mergedSegments.push({ ...seg, nodes: [n0, n1] })
		}

		const merged: TrunkConfig = { ...src, nodes: mergedNodes, segments: mergedSegments }
		return allTrunks.filter(t => t.id !== srcTrunkId && t.id !== dstTrunkId).concat(merged)
	}

	/** Disconnect a segment from a node by creating a new node at the same position.
	 *  Returns the new node ID so the canvas can start dragging it. */
	function disconnectTrunkNode(trunkId: string, nodeId: string, segmentId: string): string | null {
		const trunk = trunks.find(t => t.id === trunkId)
		if (!trunk) return null
		const node = trunk.nodes.find(n => n.id === nodeId)
		const seg = trunk.segments.find(s => s.id === segmentId)
		if (!node || !seg) return null

		const prev = trunks
		const newNodeId = genId('tn')
		const newNode: TrunkNode = { id: newNodeId, position: { ...node.position }, z: node.z }
		// Rewire the segment to use the new node instead
		const newSeg: TrunkSegment = {
			...seg,
			nodes: seg.nodes[0] === nodeId ? [newNodeId, seg.nodes[1]] : [seg.nodes[0], newNodeId],
		}
		trunks = trunks.map(t => {
			if (t.id !== trunkId) return t
			return {
				...t,
				nodes: [...t.nodes, newNode],
				segments: t.segments.map(s => s.id === segmentId ? newSeg : s),
			}
		})
		const final = trunks
		history.record({
			label: 'Disconnect segment',
			undo: () => { trunks = prev; selectedNodeIds = new Set() },
			redo: () => { trunks = final; selectedNodeIds = new Set([newNodeId]) },
		})
		return newNodeId
	}

	function splitTrunkSegment(trunkId: string, segmentId: string, point: Point) {
		const trunk = trunks.find(t => t.id === trunkId)
		if (!trunk) return

		const prev = trunks
		const { trunk: updated, newNodeId } = splitTrunkSeg(trunk, segmentId, snapToGrid(point, gridMm))
		trunks = trunks.map(t => t.id === trunkId ? updated : t)
		selectedNodeIds = new Set([newNodeId])
		const final = trunks
		history.record({
			label: 'Split segment',
			undo: () => { trunks = prev; selectedNodeIds = new Set() },
			redo: () => { trunks = final; selectedNodeIds = new Set([newNodeId]) },
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
			// Cascade: drawing handled by canvas → clear selection → revert to select mode
			// (If trunk drawing is active, the canvas Escape handler finishes it and
			//  sets trunkDrawingActive=false via ontrunkdrawingchange. Skip this handler.)
			if (trunkDrawingActive) return
			if (selectedIds.size > 0 || selectedRackIds.size > 0 || selectedTrunkIds.size > 0 || selectedNodeIds.size > 0) {
				clearSelection()
			} else if (activeTool !== 'select') {
				activeTool = 'select'
			}
		}
		else if (e.key === 'Delete' || e.key === 'Backspace') {
			if (selectedNodeIds.size > 0) deleteSelectedNodes()
			else if (selectedTrunkIds.size > 0) deleteTrunks()
			else if (selectedRackIds.size > 0) removeRackPlacements()
			else deleteSelected()
		}
		else if (e.key === 'r' || e.key === 'R') {
			if (selectedRackIds.size > 0) rotateSelectedRacks()
		}
		else if (e.key === 't' || e.key === 'T') {
			if (sidebarTab === 'trunks') activeTool = activeTool === 'trunk' ? 'select' : 'trunk'
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
				<button
					class="flex-1 py-1.5 text-[11px] font-medium transition-colors
						{sidebarTab === 'trunks' ? 'text-blue-600 border-b-2 border-blue-500 bg-white' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}"
					onclick={() => sidebarTab = 'trunks'}
				>Trunks</button>
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
				{:else if sidebarTab === 'racks'}
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
				{:else}
					<TrunkPalette
						bind:this={trunkPaletteRef}
						{trunks}
						{selectedTrunkIds}
						{selectedNodeIds}
						{activeTool}
						onselect={selectTrunk}
						ontoolchange={(t) => activeTool = t}
						ondelete={() => { if (selectedNodeIds.size > 0) deleteSelectedNodes(); else deleteTrunks() }}
						ontogglevisibility={toggleTrunkVisibility}
						onupdatetrunk={updateTrunk}
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
					{trunks}
					{selectedTrunkIds}
					{selectedNodeIds}
					trunkPalette={trunkPaletteRef}
					{gridMm}
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
					onaddtrunk={addTrunk}
					ontrunkdrawingchange={active => trunkDrawingActive = active}
					onselecttrunk={selectTrunk}
					onselecttrunknode={selectTrunkNode}
					onmovetrunknodes={moveTrunkNodes}
					onmovetrunknodesend={moveTrunkNodesEnd}
					ondeletetrunks={deleteTrunks}
					onsplittrunksegment={splitTrunkSegment}
					ondisconnecttrunknode={disconnectTrunkNode}
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
								title="Remove selected rack(s) from floor plan (does not delete the rack)"
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
					{#if trunks.length > 0}<span>{trunks.length} trunk{trunks.length !== 1 ? 's' : ''}</span>{/if}
					{#if selectedNodeIsJunction}<span class="text-amber-500">Alt+drag to disconnect</span>{/if}
					{#if calibration}
						<span>Scale: 1px = {calibration.scaleFactor.toFixed(1)}mm</span>
					{/if}
					<label class="flex items-center gap-1" title="Grid snap size in mm (0 = off)">
						Grid
						<input type="number" min="0" max="1000" step="10"
							class="w-12 h-4 px-1 text-[10px] text-center border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
							value={gridMm}
							onchange={e => { gridMm = Math.max(0, parseInt(e.currentTarget.value) || 0) }}
						/>mm
					</label>
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
