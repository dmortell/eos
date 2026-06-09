import { SurfaceEditor } from '../../edit/surface.svelte'
import { buildFloorBands } from './engine'
import { DEFAULT_RISER_SETTINGS } from './types'
import type { RiserRoom, Ladder, Cable, CableSegment, TextLabel, RiserDocData, RiserSettings, FloorHeights, RoomKind, LadderLevel, CableLevel } from './types'

/** Editor for a risers viewport — rooms, ladders, cables (hop routes). */
export class RisersEditor extends SurfaceEditor {
	rooms = $state<RiserRoom[]>([])
	ladders = $state<Ladder[]>([])
	cables = $state<Cable[]>([])
	labels = $state<TextLabel[]>([])
	floorHeights = $state<Record<number, FloorHeights>>({})
	hiddenFloors = $state<number[]>([])
	settings = $state<RiserSettings | null>(null)

	seed(d: RiserDocData | null) {
		this.rooms = (d?.rooms ?? []).map(r => ({ ...r }))
		this.ladders = (d?.ladders ?? []).map(l => ({ ...l }))
		this.cables = (d?.cables ?? []).map(c => ({ ...c, segments: c.segments.map(s => ({ ...s })) }))
		this.labels = (d?.labels ?? []).map(l => ({ ...l }))
		this.floorHeights = d?.floorHeights ?? {}
		this.hiddenFloors = d?.hiddenFloors ?? []
		this.settings = d?.settings ?? null
	}
	snapshot() {
		return { rooms: $state.snapshot(this.rooms), ladders: $state.snapshot(this.ladders), cables: $state.snapshot(this.cables), labels: $state.snapshot(this.labels) }
	}

	selRoom = $derived(this.sel?.kind === 'room' ? this.rooms.find(r => r.id === this.sel!.id) ?? null : null)
	selLadder = $derived(this.sel?.kind === 'ladder' ? this.ladders.find(l => l.id === this.sel!.id) ?? null : null)
	selCable = $derived(this.sel?.kind === 'cable' ? this.cables.find(c => c.id === this.sel!.id) ?? null : null)

	// ── add ──
	addRoom(kind: RoomKind, floor: number) {
		const x = (this.settings?.widthMm ?? 30000) / 2
		const r: RiserRoom = { id: this.uid('rm'), kind, floor, xMm: x, widthMm: 3000, label: kind === 'server' ? 'Server' : 'EPS' }
		this.rooms.push(r); this.select('room', r.id); this.notify()
	}
	addLadder(fromFloor: number, toFloor: number) {
		const x = (this.settings?.widthMm ?? 30000) / 2
		this.addLadderAt(x, fromFloor, toFloor)
	}
	addLadderAt(x: number, fromFloor: number, toFloor: number) {
		const l: Ladder = { id: this.uid('ld'), label: 'Riser', xMm: x, fromFloor, toFloor, level: 'both' }
		this.ladders.push(l); this.select('ladder', l.id); this.notify()
	}
	/** Click-to-place a room, then drag to size it (left edge anchored at the click x). `onDone`
	 *  (e.g. switch to Select) runs on mouse-up so the placed room is draggable. */
	addRoomAt(kind: RoomKind, x: number, floor: number, onDone?: () => void) {
		const r: RiserRoom = { id: this.uid('rm'), kind, floor, xMm: x, widthMm: 600, label: kind === 'server' ? 'Server' : 'EPS' }
		this.rooms.push(r); this.select('room', r.id)
		this.startDrag(e => {
			const w = this.toWorld(e); if (!w) return
			const width = Math.max(400, Math.abs(w.x - x))
			r.widthMm = width; r.xMm = Math.min(x, w.x) + width / 2
		}, () => { this.notify(); onDone?.() })
	}
	/** Drag out a riser ladder spanning a floor range: down-floor is fixed, drag vertically to set
	 *  the other end. */
	addLadderDrag(x: number, downFloor: number, from: number, to: number, onDone?: () => void) {
		const l: Ladder = { id: this.uid('ld'), label: 'Riser', xMm: x, fromFloor: downFloor, toFloor: downFloor, level: 'both' }
		this.ladders.push(l); this.select('ladder', l.id)
		this.startDrag(e => {
			const w = this.toWorld(e); if (!w) return
			const f = this.floorAtY(w.y, from, to); if (f == null) return
			l.fromFloor = Math.min(downFloor, f); l.toFloor = Math.max(downFloor, f)
		}, () => { this.notify(); onDone?.() })
	}
	/** Drag a room's left/right edge to resize its width (opposite edge stays put). */
	resizeRoomEdge(room: RiserRoom, side: 'l' | 'r', e0: MouseEvent) {
		this.select('room', room.id)
		const w0 = this.toWorld(e0); if (!w0) return
		const half = room.widthMm / 2, left0 = room.xMm - half, right0 = room.xMm + half
		this.startDrag(e => {
			const w = this.toWorld(e); if (!w) return
			if (side === 'l') { const l = Math.min(w.x, right0 - 400); room.widthMm = right0 - l; room.xMm = (l + right0) / 2 }
			else { const r = Math.max(w.x, left0 + 400); room.widthMm = r - left0; room.xMm = (left0 + r) / 2 }
		}, () => this.notify())
	}
	addCable() {
		const c: Cable = { id: this.uid('cb'), type: 'CAT6A', media: 'copper', segments: [] }
		this.cables.push(c); this.select('cable', c.id); this.notify()
	}

	setRoom(patch: Partial<RiserRoom>) { const r = this.selRoom; if (!r) return; Object.assign(r, patch); this.notify() }
	setLadder(patch: Partial<Ladder>) { const l = this.selLadder; if (!l) return; Object.assign(l, patch); this.notify() }
	setCable(patch: Partial<Cable>) { const c = this.selCable; if (!c) return; Object.assign(c, patch); this.notify() }

	deleteSel() {
		const s = this.sel; if (!s) return
		if (s.kind === 'room') this.rooms = this.rooms.filter(r => r.id !== s.id)
		else if (s.kind === 'ladder') this.ladders = this.ladders.filter(l => l.id !== s.id)
		else if (s.kind === 'cable') this.cables = this.cables.filter(c => c.id !== s.id)
		this.clearSel(); this.notify()
	}

	// ── cable hops ──
	addSegment() {
		const c = this.selCable; if (!c) return
		c.segments = [...c.segments, { roomId: this.rooms[0]?.id ?? '', level: 'high' }]
		this.notify()
	}
	setSegment(i: number, patch: Partial<CableSegment>) {
		const c = this.selCable; if (!c) return
		c.segments = c.segments.map((s, idx) => idx === i ? { ...s, ...patch } : s)
		this.notify()
	}
	removeSegment(i: number) {
		const c = this.selCable; if (!c) return
		c.segments = c.segments.filter((_, idx) => idx !== i)
		this.notify()
	}

	// ── drag ── rooms move freely (xMm + reassigned to the floor band under the cursor); ladders
	// move horizontally (their span is set via the panel).
	floorAtY(y: number, from: number, to: number): number | null {
		const bands = buildFloorBands({ floorHeights: this.floorHeights, settings: this.settings ?? DEFAULT_RISER_SETTINGS, hiddenFloors: this.hiddenFloors }, from, to)
		if (!bands.length) return null
		for (const b of bands) if (y >= b.topMm && y <= b.slabBottomMm) return b.floor
		return y < bands[0].topMm ? bands[0].floor : bands[bands.length - 1].floor
	}
	dragRoom(room: RiserRoom, e0: MouseEvent, from: number, to: number) {
		this.select('room', room.id)
		const w0 = this.toWorld(e0); if (!w0) return
		const x0 = room.xMm
		this.startDrag(e => {
			const w = this.toWorld(e); if (!w) return
			room.xMm = x0 + (w.x - w0.x)
			const f = this.floorAtY(w.y, from, to); if (f != null) room.floor = f
		}, () => this.notify())
	}
	dragLadderX(ladder: Ladder, e0: MouseEvent) {
		this.select('ladder', ladder.id)
		const w0 = this.toWorld(e0); if (!w0) return
		const x0 = ladder.xMm
		this.startDrag(e => { const w = this.toWorld(e); if (w) ladder.xMm = x0 + (w.x - w0.x) }, () => this.notify())
	}
}

export const LEVELS: CableLevel[] = ['high', 'low']
export const LADDER_LEVELS: LadderLevel[] = ['high', 'low', 'both']
