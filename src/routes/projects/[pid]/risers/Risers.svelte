<script lang="ts">
	import { Titlebar } from '$lib'
	import type { FloorConfig } from '$lib/types/project'
	import type { Firestore } from '$lib/db.svelte'
	import Canvas from './parts/Canvas.svelte'
	import FloorBand from './parts/FloorBand.svelte'
	import RoomBox from './parts/RoomBox.svelte'
	import Ladder from './parts/Ladder.svelte'
	import CablePath from './parts/CablePath.svelte'
	import CableEditor from './parts/CableEditor.svelte'
	import CableList from './parts/CableList.svelte'
	import LabelNode from './parts/Label.svelte'
	import PropertiesPanel from './parts/PropertiesPanel.svelte'
	import RiserToolbar from './parts/RiserToolbar.svelte'
	import {
		DEFAULT_RISER_SETTINGS,
		type Cable,
		type RiserDocData,
		type RiserMode,
		type RiserRoom,
		type TextLabel,
		type Ladder as LadderType,
		type ViewState,
	} from './parts/types'
	import type { ChangeDetail } from '$lib/logger'
	import {
		bandAtY,
		buildFloorBands,
		clampRange,
		compressionBreaks,
		computeCableLanes,
		nextId,
		svgPointFromClient,
		totalStackHeightMm,
	} from './parts/engine'

	let {
		data = null,
		floors = [],
		projectId: _projectId = '',
		projectName = '',
		floorFormat = 'L01',
		drawingId: _drawingId = '',
		db: _db,
		uid: _uid = '',
		onsave,
		onupdatefloors: _onupdatefloors,
		ondeletefloor: _ondeletefloor,
	}: {
		data?: RiserDocData | null
		floors?: FloorConfig[]
		projectId?: string
		projectName?: string
		floorFormat?: string
		drawingId?: string
		db: Firestore
		uid?: string
		onsave: (payload: Partial<RiserDocData>, changes: any[]) => void
		onupdatefloors?: (updated: FloorConfig[]) => void
		ondeletefloor?: (fl: number) => void
	} = $props()

	// ────────────────────────────────────────────────────────────────────
	// Doc state — defaults applied when no Firestore doc exists yet.
	// ────────────────────────────────────────────────────────────────────
	const floorNumbers = $derived(floors.map((f) => f.number))
	const defaultFrom = $derived(Math.min(...(floorNumbers.length ? floorNumbers : [1])))
	const defaultTo = $derived(Math.max(...(floorNumbers.length ? floorNumbers : [1])))

	let fromFloor = $state(data?.fromFloor ?? 1)
	let toFloor = $state(data?.toFloor ?? 1)
	let floorHeights = $state<Record<number, any>>(data?.floorHeights ?? {})
	let settings = $state(data?.settings ?? DEFAULT_RISER_SETTINGS)
	let rooms = $state(data?.rooms ?? [])
	let ladders = $state(data?.ladders ?? [])
	let cables = $state(data?.cables ?? [])
	let labels = $state<TextLabel[]>(data?.labels ?? [])
	let hiddenFloors = $state<number[]>(data?.hiddenFloors ?? [])
	let initialised = $state(!!data)

	// First-time initialisation: pick whole-building range if doc didn't exist.
	$effect(() => {
		if (!initialised && floorNumbers.length) {
			fromFloor = defaultFrom
			toFloor = defaultTo
			initialised = true
		}
	})

	// Keep range valid as floors change.
	$effect(() => {
		const r = clampRange(fromFloor, toFloor, floorNumbers)
		if (r.from !== fromFloor) fromFloor = r.from
		if (r.to !== toFloor) toFloor = r.to
	})

	// ────────────────────────────────────────────────────────────────────
	// Geometry — bands + size
	// ────────────────────────────────────────────────────────────────────
	const doc = $derived({
		projectId: _projectId,
		floorHeights,
		settings,
		fromFloor,
		toFloor,
		hiddenFloors,
		rooms,
		ladders,
		cables,
		labels,
	} as RiserDocData)

	const bands = $derived(buildFloorBands(doc, fromFloor, toFloor))
	const breaks = $derived(compressionBreaks(bands))
	const stackHeightMm = $derived(totalStackHeightMm(bands))
	const buildingWidthMm = $derived(settings.widthMm)
	const wallY = $derived(bands[0]?.topMm ?? 0)
	const wallH = $derived(stackHeightMm)

	// SVG viewBox includes a left margin for the floor labels.
	const LEFT_MARGIN_MM = 1500
	const RIGHT_MARGIN_MM = 500
	const TOP_MARGIN_MM = 500
	const BOTTOM_MARGIN_MM = 500
	const svgWidthMm = $derived(LEFT_MARGIN_MM + buildingWidthMm + RIGHT_MARGIN_MM)
	const svgHeightMm = $derived(TOP_MARGIN_MM + stackHeightMm + BOTTOM_MARGIN_MM)

	// ────────────────────────────────────────────────────────────────────
	// Canvas viewport
	// ────────────────────────────────────────────────────────────────────
	let canvasEl: HTMLDivElement | null = $state(null)
	let canvasWidth = $state(800)
	let canvasHeight = $state(600)

	$effect(() => {
		if (!canvasEl) return
		const ro = new ResizeObserver((entries) => {
			for (const e of entries) {
				canvasWidth = e.contentRect.width
				canvasHeight = e.contentRect.height
			}
		})
		ro.observe(canvasEl)
		return () => ro.disconnect()
	})

	// Initial fit: scale so the full stack fits with some padding.
	let view = $state<ViewState>({
		x: 20,
		y: 20,
		zoom: 0.06,
		width: 0,
		height: 0,
		panning: false,
		button: 0,
	})

	let mode = $state<RiserMode>('select')

	// Fit-to-view
	function zoomFit() {
		if (!svgWidthMm || !svgHeightMm) return
		const padding = 40
		const sx = (canvasWidth - padding * 2) / pxFromMm(svgWidthMm)
		const sy = (canvasHeight - padding * 2) / pxFromMm(svgHeightMm)
		view.zoom = Math.max(0.001, Math.min(sx, sy))
		view.x = padding
		view.y = padding
	}

	// mm → px at zoom 1 (SVG viewBox units are mm; we scale visually via the wrapper).
	function pxFromMm(mm: number) {
		// We render SVG with width = svgWidthMm px (1mm = 1px in the SVG world),
		// then the Canvas transform scales it. So pxFromMm at zoom 1 == mm.
		return mm
	}

	function zoomIn() {
		view.zoom = Math.min(5, view.zoom * 1.2)
	}
	function zoomOut() {
		view.zoom = Math.max(0.001, view.zoom / 1.2)
	}

	// Re-fit when stack dimensions change meaningfully (only before the user
	// has interacted — afterwards, leave their zoom/pan alone).
	let userInteracted = $state(false)
	$effect(() => {
		// Touch dependencies so this effect fires when geometry changes.
		void svgWidthMm
		void svgHeightMm
		void canvasWidth
		void canvasHeight
		if (!userInteracted && canvasWidth > 0 && canvasHeight > 0) zoomFit()
	})
	$effect(() => {
		// Mark interaction on any pan / explicit zoom.
		if (view.panning) userInteracted = true
	})

	// ────────────────────────────────────────────────────────────────────
	// Persist + change logging
	// ────────────────────────────────────────────────────────────────────
	let saveTimer: ReturnType<typeof setTimeout> | null = null
	let pendingChanges: ChangeDetail[] = []

	function logChange(c: ChangeDetail) {
		// Firestore rejects undefined field values — strip them.
		const cleaned: ChangeDetail = { action: c.action }
		for (const [k, v] of Object.entries(c)) {
			if (v !== undefined) (cleaned as any)[k] = v
		}
		pendingChanges.push(cleaned)
	}

	function scheduleSave() {
		if (saveTimer) clearTimeout(saveTimer)
		saveTimer = setTimeout(() => {
			const changes = pendingChanges
			pendingChanges = []
			onsave(
				{
					fromFloor,
					toFloor,
					floorHeights,
					settings,
					rooms,
					ladders,
					cables,
					labels,
					hiddenFloors,
				},
				changes,
			)
		}, 400)
	}

	$effect(() => {
		// Track all persisted fields.
		void fromFloor
		void toFloor
		void floorHeights
		void settings
		void rooms
		void ladders
		void cables
		void labels
		void hiddenFloors
		if (initialised) scheduleSave()
	})

	// ────────────────────────────────────────────────────────────────────
	// Selection + interaction
	// ────────────────────────────────────────────────────────────────────
	let selection = $state<{ kind: 'room' | 'ladder' | 'cable' | 'label'; id: string } | null>(null)
	let svgEl: SVGSVGElement | null = $state(null)

	// Drag state for moving rooms / ladders horizontally
	type DragState =
		| null
		| { kind: 'room'; id: string; startMmX: number; itemStartX: number; moved: boolean }
		| { kind: 'ladder'; id: string; startMmX: number; itemStartX: number; moved: boolean }
		| { kind: 'ladderResize'; id: string; edge: 'high' | 'low'; moved: boolean }
		| { kind: 'ladderDraft'; startMmX: number; startFloor: number; currentFloor: number; currentMmX: number }
		| {
				kind: 'label'
				id: string
				startMmX: number
				startMmY: number
				itemStartX: number
				itemStartY: number
				moved: boolean
			}
		| {
				kind: 'wall'
				side: 'left' | 'right'
				startMmX: number
				startWidthMm: number
				startRoomsX: Map<string, number>
				startLaddersX: Map<string, number>
				moved: boolean
			}
	let drag = $state<DragState>(null)

	function clientToMm(e: MouseEvent) {
		if (!svgEl) return { x: 0, y: 0 }
		return svgPointFromClient(svgEl, e.clientX, e.clientY)
	}

	function selectRoom(id: string) { selection = { kind: 'room', id } }
	function selectLadder(id: string) { selection = { kind: 'ladder', id } }
	function selectCable(id: string) { selection = { kind: 'cable', id } }
	function selectLabel(id: string) { selection = { kind: 'label', id } }
	function clearSelection() { selection = null }

	function onLabelMouseDown(labelId: string, e: MouseEvent) {
		if (e.button !== 0) return
		e.stopPropagation()
		selectLabel(labelId)
		const lbl = labels.find((l) => l.id === labelId)
		if (!lbl) return
		const start = clientToMm(e)
		drag = {
			kind: 'label',
			id: labelId,
			startMmX: start.x,
			startMmY: start.y,
			itemStartX: lbl.xMm,
			itemStartY: lbl.yMm,
			moved: false,
		}
		document.addEventListener('mousemove', onDragMove)
		document.addEventListener('mouseup', onDragEnd)
	}

	function updateLabel(id: string, patch: Partial<TextLabel>) {
		const idx = labels.findIndex((l) => l.id === id)
		if (idx < 0) return
		const before = labels[idx]
		labels[idx] = { ...before, ...patch }
		for (const [k, v] of Object.entries(patch)) {
			logChange({ action: 'update', field: `label.${k}`, from: (before as any)[k], to: v })
		}
	}

	function deleteLabel(id: string) {
		const l = labels.find((x) => x.id === id)
		labels = labels.filter((x) => x.id !== id)
		if (l) logChange({ action: 'delete', field: 'label', from: l.text.split('\n')[0]?.slice(0, 40) })
		if (selection?.kind === 'label' && selection.id === id) selection = null
	}

	// ────────────────────────────────────────────────────────────────────
	// Cable drawing flow (click rooms + ladders to build a route)
	// ────────────────────────────────────────────────────────────────────
	/** Draft cable being assembled; null = not currently drawing. */
	let cableDraft = $state<Cable | null>(null)
	/** Pending ladder pick — set after a room hop, cleared by a ladder pick. */
	let awaitingLadder = $state(false)

	// ────────────────────────────────────────────────────────────────────
	// Cable lane assignment (recomputed when cables / rooms / ladders change).
	// The in-progress draft is included so it renders alongside committed cables.
	// ────────────────────────────────────────────────────────────────────
	const cablesForRender = $derived(cableDraft ? [...cables, cableDraft] : cables)
	const cableLanes = $derived(computeCableLanes(cablesForRender, { rooms, ladders }))

	const selectedCable = $derived.by(() => {
		const s = selection
		if (!s || s.kind !== 'cable') return null
		return cables.find((c) => c.id === s.id) ?? null
	})
	const selectedLabel = $derived.by(() => {
		const s = selection
		if (!s || s.kind !== 'label') return null
		return labels.find((l) => l.id === s.id) ?? null
	})
	const propsSelection = $derived.by((): { kind: 'room' | 'ladder'; id: string } | null => {
		const s = selection
		if (!s) return null
		if (s.kind === 'room' || s.kind === 'ladder') return { kind: s.kind, id: s.id }
		return null
	})

	function startNewCable() {
		cableDraft = {
			id: nextId('cable'),
			type: 'OM4 48-core',
			media: 'fiber',
			mediaSpec: 'OM4',
			count: 48,
			countUnit: 'core',
			segments: [],
			color: '#14b8a6',
		}
		awaitingLadder = false
		mode = 'addCable'
	}

	function appendCableHop(pick: { roomId?: string; ladderId?: string }) {
		if (mode !== 'addCable') return
		if (!cableDraft) startNewCable()
		const d = cableDraft!

		if (pick.roomId) {
			const newRoom = rooms.find((r) => r.id === pick.roomId)
			if (!newRoom) return

			if (d.segments.length === 0) {
				// First room of the cable.
				d.segments = [{ roomId: pick.roomId, level: 'high' }]
				awaitingLadder = true
				cableDraft = { ...d }
				return
			}

			const lastSeg = d.segments[d.segments.length - 1]
			const lastRoom = rooms.find((r) => r.id === lastSeg.roomId)

			const prevLevel = lastSeg.level ?? 'high'

			if (awaitingLadder) {
				if (lastRoom && lastRoom.floor === newRoom.floor) {
					d.segments = [...d.segments, { roomId: pick.roomId, level: 'high', entryLevel: prevLevel }]
					awaitingLadder = true
					cableDraft = { ...d }
				}
				return
			}

			// Previous hop is closed (has a ladder) — this room is the next destination.
			// Default entryLevel to the prev hop's exit level (cable rides the ladder
			// at that level and arrives at the same level). User can change in editor.
			d.segments = [...d.segments, { roomId: pick.roomId, level: 'high', entryLevel: prevLevel }]
			awaitingLadder = true
			cableDraft = { ...d }
		} else if (pick.ladderId) {
			if (d.segments.length === 0 || !awaitingLadder) return
			const last = d.segments[d.segments.length - 1]
			d.segments = [...d.segments.slice(0, -1), { ...last, ladderId: pick.ladderId }]
			awaitingLadder = false
			cableDraft = { ...d }
		}
	}

	function commitCableDraft() {
		if (!cableDraft) return
		const draft = cableDraft
		if (draft.segments.length < 2) {
			// Not a valid cable — discard.
			cableDraft = null
			awaitingLadder = false
			return
		}
		cables = [...cables, draft]
		selectCable(draft.id)
		logChange({ action: 'add', field: 'cable', to: draft.type, details: draft.label })
		cableDraft = null
		awaitingLadder = false
		mode = 'select'
	}

	function cancelCableDraft() {
		cableDraft = null
		awaitingLadder = false
	}

	function updateCable(id: string, patch: Partial<Cable>) {
		const idx = cables.findIndex((c) => c.id === id)
		if (idx < 0) return
		const before = cables[idx]
		cables[idx] = { ...before, ...patch }
		for (const [k, v] of Object.entries(patch)) {
			logChange({ action: 'update', field: `cable.${k}`, from: (before as any)[k], to: v, details: before.label || before.type })
		}
	}

	function deleteCable(id: string) {
		const c = cables.find((x) => x.id === id)
		cables = cables.filter((x) => x.id !== id)
		if (c) logChange({ action: 'delete', field: 'cable', from: c.label || c.type })
		if (selection?.kind === 'cable' && selection.id === id) selection = null
	}

	function onRoomMouseDown(roomId: string, e: MouseEvent) {
		if (e.button !== 0) return
		e.stopPropagation()
		if (mode === 'addCable') {
			appendCableHop({ roomId })
			return
		}
		selectRoom(roomId)
		const room = rooms.find((r) => r.id === roomId)
		if (!room) return
		const start = clientToMm(e)
		drag = { kind: 'room', id: roomId, startMmX: start.x, itemStartX: room.xMm, moved: false }
		document.addEventListener('mousemove', onDragMove)
		document.addEventListener('mouseup', onDragEnd)
	}

	function onCableMouseDown(cableId: string, e: MouseEvent) {
		if (e.button !== 0) return
		e.stopPropagation()
		selectCable(cableId)
	}

	function onWallMouseDown(side: 'left' | 'right', e: MouseEvent) {
		if (e.button !== 0) return
		e.stopPropagation()
		const start = clientToMm(e)
		drag = {
			kind: 'wall',
			side,
			startMmX: start.x,
			startWidthMm: settings.widthMm,
			startRoomsX: new Map(rooms.map((r) => [r.id, r.xMm])),
			startLaddersX: new Map(ladders.map((l) => [l.id, l.xMm])),
			moved: false,
		}
		document.addEventListener('mousemove', onDragMove)
		document.addEventListener('mouseup', onDragEnd)
	}

	function onLadderHandleMouseDown(ladderId: string, edge: 'high' | 'low', e: MouseEvent) {
		if (e.button !== 0) return
		e.stopPropagation()
		selectLadder(ladderId)
		drag = { kind: 'ladderResize', id: ladderId, edge, moved: false }
		document.addEventListener('mousemove', onDragMove)
		document.addEventListener('mouseup', onDragEnd)
	}

	function onLadderMouseDown(ladderId: string, e: MouseEvent) {
		if (e.button !== 0) return
		e.stopPropagation()
		if (mode === 'addCable') {
			appendCableHop({ ladderId })
			return
		}
		selectLadder(ladderId)
		const ladder = ladders.find((l) => l.id === ladderId)
		if (!ladder) return
		const start = clientToMm(e)
		drag = { kind: 'ladder', id: ladderId, startMmX: start.x, itemStartX: ladder.xMm, moved: false }
		document.addEventListener('mousemove', onDragMove)
		document.addEventListener('mouseup', onDragEnd)
	}

	function onSvgMouseDown(e: MouseEvent) {
		if (e.button !== 0) return
		const p = clientToMm(e)
		const band = bandAtY(bands, p.y)

		if (mode === 'addServer' || mode === 'addEps') {
			if (!band) return
			const kind = mode === 'addServer' ? 'server' : 'eps'
			const newRoom: RiserRoom = {
				id: nextId('room'),
				kind,
				floor: band.floor,
				xMm: Math.max(1000, Math.min(buildingWidthMm - 1000, p.x)),
				widthMm: 2000,
				label: defaultRoomLabel(kind, band.floor),
			}
			rooms = [...rooms, newRoom]
			selectRoom(newRoom.id)
			logChange({ action: 'add', field: kind === 'server' ? 'server-room' : 'eps-room', to: newRoom.label, details: `floor ${band.floor}` })
			// Stay in add mode so multiple rooms can be dropped quickly.
			return
		}

		if (mode === 'addCable') {
			// Background click commits the draft (if any).
			commitCableDraft()
			return
		}

		if (mode === 'addLabel') {
			const newLabel: TextLabel = {
				id: nextId('label'),
				xMm: Math.round(p.x),
				yMm: Math.round(p.y),
				text: 'Label',
				fontSizeMm: 240,
				color: '#1f2937',
			}
			labels = [...labels, newLabel]
			selectLabel(newLabel.id)
			logChange({ action: 'add', field: 'label', to: newLabel.text })
			mode = 'select'
			return
		}

		if (mode === 'addLadder') {
			if (!band) return
			drag = {
				kind: 'ladderDraft',
				startMmX: Math.max(0, Math.min(buildingWidthMm, p.x)),
				startFloor: band.floor,
				currentFloor: band.floor,
				currentMmX: p.x,
			}
			document.addEventListener('mousemove', onDragMove)
			document.addEventListener('mouseup', onDragEnd)
			return
		}

		// Select mode: background click clears selection.
		clearSelection()
	}

	function onDragMove(e: MouseEvent) {
		const d = drag
		if (!d) return
		const p = clientToMm(e)

		if (d.kind === 'room') {
			const idx = rooms.findIndex((r) => r.id === d.id)
			if (idx < 0) return
			const newX = Math.round(
				Math.max(100, Math.min(buildingWidthMm - 100, d.itemStartX + (p.x - d.startMmX))),
			)
			rooms[idx] = { ...rooms[idx], xMm: newX }
			d.moved = true
		} else if (d.kind === 'ladder') {
			const idx = ladders.findIndex((l) => l.id === d.id)
			if (idx < 0) return
			const newX = Math.round(
				Math.max(50, Math.min(buildingWidthMm - 50, d.itemStartX + (p.x - d.startMmX))),
			)
			ladders[idx] = { ...ladders[idx], xMm: newX }
			d.moved = true
		} else if (d.kind === 'label') {
			const idx = labels.findIndex((l) => l.id === d.id)
			if (idx < 0) return
			const newX = Math.round(d.itemStartX + (p.x - d.startMmX))
			const newY = Math.round(d.itemStartY + (p.y - d.startMmY))
			labels[idx] = { ...labels[idx], xMm: newX, yMm: newY }
			d.moved = true
		} else if (d.kind === 'ladderResize') {
			const band = bandAtY(bands, p.y)
			if (!band) return
			const idx = ladders.findIndex((l) => l.id === d.id)
			if (idx < 0) return
			const cur = ladders[idx]
			const lo = Math.min(cur.fromFloor, cur.toFloor)
			const hi = Math.max(cur.fromFloor, cur.toFloor)
			if (d.edge === 'high') {
				const newHi = Math.max(lo, band.floor)
				if (newHi !== hi) {
					ladders[idx] = { ...cur, fromFloor: lo, toFloor: newHi }
					d.moved = true
				}
			} else {
				const newLo = Math.min(hi, band.floor)
				if (newLo !== lo) {
					ladders[idx] = { ...cur, fromFloor: newLo, toFloor: hi }
					d.moved = true
				}
			}
		} else if (d.kind === 'ladderDraft') {
			const band = bandAtY(bands, p.y)
			d.currentFloor = band ? band.floor : d.currentFloor
			d.currentMmX = p.x
		} else if (d.kind === 'wall') {
			const delta = Math.round(p.x - d.startMmX)
			const minRoomX = Math.min(...Array.from(d.startRoomsX.values()), Infinity)
			const maxRoomX = Math.max(...Array.from(d.startRoomsX.values()), -Infinity)
			const minLadX = Math.min(...Array.from(d.startLaddersX.values()), Infinity)
			const maxLadX = Math.max(...Array.from(d.startLaddersX.values()), -Infinity)
			const leftmost = Math.min(minRoomX, minLadX)
			const rightmost = Math.max(maxRoomX, maxLadX)
			const MIN_WIDTH = 5000
			if (d.side === 'right') {
				// Drag right wall: width += delta. Clamp so right wall stays past rightmost item.
				const maxDelta = -d.startWidthMm + Math.max(MIN_WIDTH, rightmost + 1000)
				const clamped = Math.max(maxDelta, delta)
				settings = { ...settings, widthMm: Math.round(d.startWidthMm + clamped) }
				if (clamped !== 0) d.moved = true
			} else {
				// Drag left wall: width -= delta, shift everything by -delta.
				// Clamp so leftmost item stays past 0 (left wall) after shift.
				// new pos = old - delta ≥ 0  ⇒  delta ≤ old
				const maxDeltaLeft = leftmost - 1000
				// And don't shrink below MIN_WIDTH: new width = startWidth - delta ≥ MIN_WIDTH ⇒ delta ≤ startWidth - MIN_WIDTH
				const maxDeltaWidth = d.startWidthMm - MIN_WIDTH
				const clamped = Math.min(delta, maxDeltaLeft, maxDeltaWidth)
				settings = { ...settings, widthMm: Math.round(d.startWidthMm - clamped) }
				rooms = rooms.map((r) => {
					const start = d.startRoomsX.get(r.id)
					return start != null ? { ...r, xMm: Math.round(start - clamped) } : r
				})
				ladders = ladders.map((l) => {
					const start = d.startLaddersX.get(l.id)
					return start != null ? { ...l, xMm: Math.round(start - clamped) } : l
				})
				if (clamped !== 0) d.moved = true
			}
		}
	}

	function onDragEnd(_e: MouseEvent) {
		document.removeEventListener('mousemove', onDragMove)
		document.removeEventListener('mouseup', onDragEnd)
		const d = drag
		if (!d) return

		if (d.kind === 'room' && d.moved) {
			const r = rooms.find((x) => x.id === d.id)
			if (r) logChange({ action: 'update', field: 'room.xMm', to: r.xMm, details: r.label })
		} else if (d.kind === 'ladder' && d.moved) {
			const l = ladders.find((x) => x.id === d.id)
			if (l) logChange({ action: 'update', field: 'ladder.xMm', to: l.xMm, details: l.label })
		} else if (d.kind === 'label' && d.moved) {
			const l = labels.find((x) => x.id === d.id)
			if (l) logChange({ action: 'move', field: 'label', to: `${l.xMm},${l.yMm}` })
		} else if (d.kind === 'wall' && d.moved) {
			logChange({ action: 'update', field: `building.${d.side}-wall`, to: settings.widthMm, details: `width ${settings.widthMm}mm` })
		} else if (d.kind === 'ladderResize' && d.moved) {
			const l = ladders.find((x) => x.id === d.id)
			if (l) {
				logChange({
					action: 'update',
					field: d.edge === 'high' ? 'ladder.toFloor' : 'ladder.fromFloor',
					to: d.edge === 'high' ? l.toFloor : l.fromFloor,
					details: l.label,
				})
			}
		} else if (d.kind === 'ladderDraft') {
			const lo = Math.min(d.startFloor, d.currentFloor)
			const hi = Math.max(d.startFloor, d.currentFloor)
			const newLadder: LadderType = {
				id: nextId('ladder'),
				label: `RISER-${ladders.length + 1}`,
				xMm: Math.max(50, Math.min(buildingWidthMm - 50, d.startMmX)),
				fromFloor: lo,
				toFloor: hi,
				level: 'both',
				widthMm: 450,
			}
			ladders = [...ladders, newLadder]
			selectLadder(newLadder.id)
			logChange({ action: 'add', field: 'ladder', to: newLadder.label, details: `floors ${lo}–${hi}` })
		}
		drag = null
	}

	// Cleanup if component unmounts mid-drag.
	$effect(() => {
		return () => {
			document.removeEventListener('mousemove', onDragMove)
			document.removeEventListener('mouseup', onDragEnd)
		}
	})

	// ────────────────────────────────────────────────────────────────────
	// CRUD helpers (exposed to PropertiesPanel)
	// ────────────────────────────────────────────────────────────────────
	function defaultRoomLabel(kind: 'server' | 'eps', floor: number) {
		const fl = String(floor).padStart(2, '0')
		if (kind === 'server') {
			const existing = rooms.filter((r) => r.kind === 'server' && r.floor === floor).length
			const tag = ['A', 'B', 'C', 'D'][existing] ?? `${existing + 1}`
			return `SER${fl}-${tag}`
		}
		const existing = rooms.filter((r) => r.kind === 'eps' && r.floor === floor).length
		const tag = ['A', 'B', 'C', 'D'][existing] ?? `${existing + 1}`
		return `EPS${fl}-${tag}`
	}

	function updateRoom(id: string, patch: Partial<RiserRoom>) {
		const idx = rooms.findIndex((r) => r.id === id)
		if (idx < 0) return
		const before = rooms[idx]
		rooms[idx] = { ...before, ...patch }
		for (const [k, v] of Object.entries(patch)) {
			logChange({ action: 'update', field: `room.${k}`, from: (before as any)[k], to: v, details: before.label })
		}
	}

	function updateLadder(id: string, patch: Partial<LadderType>) {
		const idx = ladders.findIndex((l) => l.id === id)
		if (idx < 0) return
		const before = ladders[idx]
		ladders[idx] = { ...before, ...patch }
		for (const [k, v] of Object.entries(patch)) {
			logChange({ action: 'update', field: `ladder.${k}`, from: (before as any)[k], to: v, details: before.label })
		}
	}

	function deleteSelected() {
		if (!selection) return
		if (selection.kind === 'cable') {
			deleteCable(selection.id)
			return
		}
		if (selection.kind === 'label') {
			deleteLabel(selection.id)
			return
		}
		if (selection.kind === 'room') {
			const room = rooms.find((r) => r.id === selection!.id)
			rooms = rooms.filter((r) => r.id !== selection!.id)
			// Strip the room from any cables that referenced it.
			cables = cables
				.map((c) => ({ ...c, segments: c.segments.filter((s) => s.roomId !== selection!.id) }))
				.filter((c) => c.segments.length >= 2)
			if (room) logChange({ action: 'delete', field: 'room', from: room.label })
		} else {
			const ladder = ladders.find((l) => l.id === selection!.id)
			ladders = ladders.filter((l) => l.id !== selection!.id)
			cables = cables.map((c) => ({
				...c,
				segments: c.segments.map((s) => (s.ladderId === selection!.id ? { ...s, ladderId: undefined } : s)),
			}))
			if (ladder) logChange({ action: 'delete', field: 'ladder', from: ladder.label })
		}
		selection = null
	}

	function onKeyDown(e: KeyboardEvent) {
		const target = e.target as HTMLElement
		if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT') return
		if (e.key === 'Delete' || e.key === 'Backspace') {
			if (selection) {
				e.preventDefault()
				deleteSelected()
			}
		} else if (e.key === 'Escape') {
			if (cableDraft) { cancelCableDraft(); mode = 'select'; return }
			clearSelection()
			drag = null
		} else if (e.key === 'Enter') {
			if (cableDraft) { e.preventDefault(); commitCableDraft() }
		}
	}

	$effect(() => {
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	})

	// ────────────────────────────────────────────────────────────────────
	// Ladder draft preview (during click-drag in addLadder mode)
	// ────────────────────────────────────────────────────────────────────
	const draftLadder = $derived.by(() => {
		if (!drag || drag.kind !== 'ladderDraft') return null
		const lo = Math.min(drag.startFloor, drag.currentFloor)
		const hi = Math.max(drag.startFloor, drag.currentFloor)
		const top = bands.find((b) => b.floor === hi)
		const bot = bands.find((b) => b.floor === lo)
		if (!top || !bot) return null
		return {
			x: drag.startMmX - 225,
			y: top.topMm,
			width: 450,
			height: bot.slabBottomMm - top.topMm,
		}
	})
</script>

<div class="page">
	<Titlebar title={projectName ? `Risers — ${projectName}` : 'Risers'} menu />

	<RiserToolbar
		bind:fromFloor
		bind:toFloor
		bind:mode
		bind:hiddenFloors
		{floors}
		{floorFormat}
		onZoomIn={zoomIn}
		onZoomOut={zoomOut}
		onZoomFit={() => {
			userInteracted = false
			zoomFit()
		}}
	/>

	<div class="body" class:cursor-crosshair={mode !== 'select'}>
		<div class="canvas-wrap" bind:this={canvasEl}>
			<Canvas bind:view width={canvasWidth} height={canvasHeight}>
				<svg
					bind:this={svgEl}
					width={svgWidthMm}
					height={svgHeightMm}
					viewBox="{-LEFT_MARGIN_MM} {-TOP_MARGIN_MM} {svgWidthMm} {svgHeightMm}"
					xmlns="http://www.w3.org/2000/svg"
					class="elevation-svg"
					onmousedown={onSvgMouseDown}
				>
					<!-- Optional grid -->
					{#if settings.showGrid}
						<defs>
							<pattern
								id="riser-grid"
								width="1000"
								height="1000"
								patternUnits="userSpaceOnUse"
							>
								<path
									d="M 1000 0 L 0 0 0 1000"
									fill="none"
									stroke="rgba(120,120,140,0.12)"
									stroke-width="2"
								/>
							</pattern>
						</defs>
						<rect
							x={-LEFT_MARGIN_MM}
							y={-TOP_MARGIN_MM}
							width={svgWidthMm}
							height={svgHeightMm}
							fill="url(#riser-grid)"
						/>
					{/if}

					<!-- Floor bands -->
					{#each bands as band (band.floor)}
						<FloorBand {band} widthMm={buildingWidthMm} {floors} {floorFormat} />
					{/each}

					<!-- Building walls (draggable) -->
					<g
						class="wall left-wall"
						onmousedown={(e) => onWallMouseDown('left', e)}
						role="button"
						tabindex="-1"
					>
						<rect x={-150} y={wallY} width={300} height={wallH} class="wall-hit" />
						<line x1={0} y1={wallY} x2={0} y2={wallY + wallH} class="wall-line" />
					</g>
					<g
						class="wall right-wall"
						onmousedown={(e) => onWallMouseDown('right', e)}
						role="button"
						tabindex="-1"
					>
						<rect x={buildingWidthMm - 150} y={wallY} width={300} height={wallH} class="wall-hit" />
						<line x1={buildingWidthMm} y1={wallY} x2={buildingWidthMm} y2={wallY + wallH} class="wall-line" />
					</g>

					<!-- Ladders (drawn before rooms so rooms read in front at the floor level) -->
					{#each ladders as ladder (ladder.id)}
						<Ladder
							{ladder}
							{bands}
							{breaks}
							selected={selection?.kind === 'ladder' && selection.id === ladder.id}
							onmousedown={(e) => onLadderMouseDown(ladder.id, e)}
							onHandleMouseDown={(edge, e) => onLadderHandleMouseDown(ladder.id, edge, e)}
						/>
					{/each}

					<!-- Cables (drawn before rooms so room boxes overlay them) -->
					{#each cablesForRender as cable (cable.id)}
						{@const runs = cableLanes.get(cable.id) ?? []}
						<CablePath
							{cable}
							{runs}
							{rooms}
							{ladders}
							{bands}
							selected={selection?.kind === 'cable' && selection.id === cable.id}
							onmousedown={(e) => onCableMouseDown(cable.id, e)}
						/>
					{/each}

					<!-- Rooms -->
					{#each rooms as room (room.id)}
						{@const band = bands.find((b) => b.floor === room.floor)}
						{#if band}
							<RoomBox
								{room}
								{band}
								selected={selection?.kind === 'room' && selection.id === room.id}
								onmousedown={(e) => onRoomMouseDown(room.id, e)}
							/>
						{/if}
					{/each}

					<!-- Labels (drawn on top so they sit above rooms/cables) -->
					{#each labels as label (label.id)}
						<LabelNode
							{label}
							selected={selection?.kind === 'label' && selection.id === label.id}
							onmousedown={(e) => onLabelMouseDown(label.id, e)}
						/>
					{/each}

					<!-- Ladder draft preview -->
					{#if draftLadder}
						<rect
							x={draftLadder.x}
							y={draftLadder.y}
							width={draftLadder.width}
							height={draftLadder.height}
							class="draft-ladder"
						/>
					{/if}
				</svg>
			</Canvas>
		</div>

		<aside class="sidebar">
			{#if selectedCable}
				<CableEditor
					cable={selectedCable}
					{rooms}
					{ladders}
					onUpdate={(patch) => updateCable(selectedCable!.id, patch)}
					onDelete={() => deleteCable(selectedCable!.id)}
				/>
			{:else if selectedLabel}
				{@const l = selectedLabel}
				<div class="label-editor">
					<header>
						<span class="kind">Label</span>
						<button type="button" class="del" onclick={() => deleteLabel(l.id)} title="Delete">✕</button>
					</header>
					<label>
						<span>Text (multi-line)</span>
						<textarea
							rows="5"
							value={l.text}
							oninput={(e) => updateLabel(l.id, { text: (e.target as HTMLTextAreaElement).value })}
						></textarea>
					</label>
					<div class="row">
						<label>
							<span>Font (mm)</span>
							<input
								type="number"
								min="40"
								step="20"
								value={l.fontSizeMm ?? 240}
								oninput={(e) => updateLabel(l.id, { fontSizeMm: Number((e.target as HTMLInputElement).value) })}
							/>
						</label>
						<label>
							<span>Width (mm, 0=auto)</span>
							<input
								type="number"
								min="0"
								step="100"
								value={l.widthMm ?? 0}
								oninput={(e) => updateLabel(l.id, { widthMm: Number((e.target as HTMLInputElement).value) || undefined })}
							/>
						</label>
					</div>
					<div class="row">
						<label>
							<span>Color</span>
							<input
								type="color"
								value={l.color ?? '#1f2937'}
								oninput={(e) => updateLabel(l.id, { color: (e.target as HTMLInputElement).value })}
							/>
						</label>
						<label>
							<span>Background</span>
							<input
								type="text"
								placeholder="transparent / #fff"
								value={l.background ?? ''}
								oninput={(e) => updateLabel(l.id, { background: (e.target as HTMLInputElement).value || undefined })}
							/>
						</label>
					</div>
					<div class="row">
						<label>
							<span>X (mm)</span>
							<input
								type="number"
								step="100"
								value={l.xMm}
								oninput={(e) => updateLabel(l.id, { xMm: Number((e.target as HTMLInputElement).value) })}
							/>
						</label>
						<label>
							<span>Y (mm)</span>
							<input
								type="number"
								step="100"
								value={l.yMm}
								oninput={(e) => updateLabel(l.id, { yMm: Number((e.target as HTMLInputElement).value) })}
							/>
						</label>
					</div>
				</div>
			{:else}
				<PropertiesPanel
					selection={propsSelection}
					{rooms}
					{ladders}
					onUpdateRoom={updateRoom}
					onUpdateLadder={updateLadder}
					onDelete={deleteSelected}
				/>
			{/if}
			<div class="sidebar-divider"></div>
			<CableList
				{cables}
				{rooms}
				selectedId={selection?.kind === 'cable' ? selection.id : null}
				onSelect={selectCable}
				onAddCable={startNewCable}
			/>
		</aside>
	</div>

	<div class="status-bar">
		<span class="status-item">
			Floors {fromFloor === toFloor ? fromFloor : `${Math.min(fromFloor, toFloor)}–${Math.max(fromFloor, toFloor)}`}
		</span>
		<span class="status-sep">·</span>
		<span class="status-item">
			Stack {(stackHeightMm / 1000).toFixed(1)} m
		</span>
		{#if mode === 'addLabel'}
			<span class="status-sep">·</span>
			<span class="status-item hint">Click on the drawing to drop a label</span>
		{:else if mode === 'addCable'}
			<span class="status-sep">·</span>
			<span class="status-item hint">
				{#if !cableDraft || cableDraft.segments.length === 0}
					Click a room to start the route
				{:else if awaitingLadder}
					Click a ladder, or a room to finish · Enter = save · Esc = cancel
				{:else}
					Click the next room · Enter = save · Esc = cancel
				{/if}
			</span>
		{:else if selection?.kind === 'ladder'}
			<span class="status-sep">·</span>
			<span class="status-item hint">Drag top/bottom handles to extend across floors</span>
		{:else if selection?.kind === 'room'}
			<span class="status-sep">·</span>
			<span class="status-item hint">Drag to reposition horizontally · Delete to remove</span>
		{:else if selection?.kind === 'cable'}
			<span class="status-sep">·</span>
			<span class="status-item hint">Edit route in sidebar · Delete to remove</span>
		{:else if selection?.kind === 'label'}
			<span class="status-sep">·</span>
			<span class="status-item hint">Drag to reposition · Edit text in sidebar · Delete to remove</span>
		{/if}
		<span class="status-grow"></span>
		<span class="status-item zoom-indicator" title="Click to fit">
			<button type="button" class="zoom-btn" onclick={() => { userInteracted = false; zoomFit() }}>
				Zoom {(view.zoom * 100).toFixed(view.zoom < 0.1 ? 2 : 0)}%
			</button>
		</span>
	</div>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		height: 100vh;
		overflow: hidden;
	}
	.body {
		flex: 1;
		display: flex;
		min-height: 0;
	}
	.body.cursor-crosshair {
		cursor: crosshair;
	}
	.canvas-wrap {
		position: relative;
		flex: 1;
		overflow: hidden;
		min-height: 0;
	}
	.elevation-svg {
		display: block;
		user-select: none;
	}
	.draft-ladder {
		fill: rgba(100, 70, 140, 0.3);
		stroke: rgb(100, 70, 140);
		stroke-width: 3;
		stroke-dasharray: 16 8;
		vector-effect: non-scaling-stroke;
		pointer-events: none;
	}
	.wall {
		cursor: ew-resize;
	}
	.wall-hit {
		fill: transparent;
	}
	.wall-line {
		stroke: rgb(80, 80, 95);
		stroke-width: 4;
		vector-effect: non-scaling-stroke;
		pointer-events: none;
	}
	.wall:hover .wall-line {
		stroke: rgb(59, 130, 246);
		stroke-width: 6;
	}
	:global(.dark) .wall-line {
		stroke: rgb(180, 180, 200);
	}
	.sidebar {
		width: 340px;
		display: flex;
		flex-direction: column;
		border-left: 1px solid rgb(228, 228, 231);
		background: rgb(250, 250, 252);
		overflow-y: auto;
		min-height: 0;
	}
	:global(.dark) .sidebar {
		background: rgb(24, 24, 27);
		border-left-color: rgb(39, 39, 42);
	}
	.sidebar-divider {
		height: 1px;
		background: rgb(228, 228, 231);
		margin: 0.5rem 0;
	}
	:global(.dark) .sidebar-divider {
		background: rgb(39, 39, 42);
	}
	.sidebar > :global(*) {
		padding: 0 0.75rem;
	}
	.sidebar :global(aside.props) {
		border-left: none !important;
		padding: 0.75rem !important;
		width: auto !important;
		background: transparent !important;
		overflow-y: visible !important;
	}
	.label-editor {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		font-size: 0.8rem;
	}
	.label-editor header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-weight: 700;
		padding-bottom: 0.4rem;
		border-bottom: 1px solid rgb(228, 228, 231);
	}
	:global(.dark) .label-editor header {
		border-bottom-color: rgb(39, 39, 42);
	}
	.label-editor .kind {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: rgb(82, 82, 91);
	}
	.label-editor .del {
		background: none;
		border: 1px solid rgb(228, 228, 231);
		border-radius: 0.25rem;
		padding: 0.05rem 0.4rem;
		cursor: pointer;
		font-size: 0.8rem;
		color: rgb(120, 30, 30);
	}
	.label-editor label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.label-editor label > span {
		font-size: 0.7rem;
		color: rgb(82, 82, 91);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.label-editor .row {
		display: flex;
		gap: 0.4rem;
	}
	.label-editor .row label {
		flex: 1;
		min-width: 0;
	}
	.label-editor input,
	.label-editor textarea {
		font: inherit;
		padding: 0.2rem 0.4rem;
		border: 1px solid rgb(212, 212, 216);
		border-radius: 0.25rem;
		background: white;
		resize: vertical;
	}
	:global(.dark) .label-editor input,
	:global(.dark) .label-editor textarea {
		background: rgb(39, 39, 42);
		border-color: rgb(63, 63, 70);
		color: rgb(244, 244, 245);
	}
	.label-editor input[type='color'] {
		padding: 0;
		height: 1.8rem;
	}
	.sidebar > :global(.cable-list) {
		padding: 0 0.75rem 0.75rem;
	}
	.status-bar {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.25rem 0.7rem;
		border-top: 1px solid rgb(228, 228, 231);
		background: rgb(250, 250, 252);
		font-size: 0.75rem;
		color: rgb(82, 82, 91);
		font-variant-numeric: tabular-nums;
	}
	:global(.dark) .status-bar {
		background: rgb(24, 24, 27);
		border-top-color: rgb(39, 39, 42);
		color: rgb(161, 161, 170);
	}
	.status-sep { opacity: 0.4; }
	.status-grow { flex: 1; }
	.hint {
		color: rgb(59, 130, 246);
		font-weight: 500;
	}
	:global(.dark) .hint {
		color: rgb(96, 165, 250);
	}
	.zoom-btn {
		background: none;
		border: none;
		color: inherit;
		font: inherit;
		font-variant-numeric: tabular-nums;
		cursor: pointer;
		padding: 0.05rem 0.35rem;
		border-radius: 0.25rem;
	}
	.zoom-btn:hover {
		background: rgba(120, 120, 140, 0.15);
		color: rgb(24, 24, 27);
	}
	:global(.dark) .zoom-btn:hover {
		background: rgba(180, 180, 200, 0.15);
		color: rgb(244, 244, 245);
	}
</style>
