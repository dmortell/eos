// Tools (analysis §6.7): one object per tool behind one interface; the surface routes pointer events to the active
// tool with the point already in model mm. No `tool === '…'` chains anywhere else.
import type { EntityStore, Gesture } from '../store/store'
import type { ProjectIndex } from '../domain/project'
import type { Id, Pt, Outlet, ProjectSettings, Rack, Device } from '../domain/types'
import type { Shape } from '../domain/shapes'
import type { Sheet } from '../domain/drawing'
import type { Prim, Bounds } from '../views/display'
import type { Snap } from './snap'
import { pickPrim, pickInside } from './pick'
import { moveBy, canMove, followAttached } from './behaviours'
import { pathGrips, gripAt, moveNodes, moveNodesBy, type Grip } from './grips'
import type { ViewSpace, WorkPlane } from '../views/space'
import { nextLabel, portLabelsFor, naturalCompare } from '../domain/labels'
import { insertNode, branchFrom } from '../domain/pathEdit'
import { placementProblem } from '../domain/devices'
import { RU_MM } from '../views/rackRow'
import { newId } from '../domain/ids'

export interface PointerIn { p: Pt; shift: boolean; ctrl: boolean; alt: boolean; /** 2 = double click */ count?: number }

/** Options of the drawing tools, shown in the tool bar (reactive in the workspace). */
export interface DrawOpts { z: number; w: number; h: number }

export interface ToolCtx {
	store: EntityStore
	index: ProjectIndex
	levelId: Id
	settings?: ProjectSettings
	opts: DrawOpts
	/** The view the tool works in (plan or an elevation) and where its clicks land. Points in PointerIn are VIEW mm. */
	space: ViewSpace
	work: WorkPlane
	prims(): Prim[]
	/** Pick tolerance in model mm (a few screen px at the current zoom). */
	tol(): number
	/** Object snap / grid at a point (Alt = none). */
	snap(p: Pt, alt: boolean, skip?: Id): Snap
	selection: Id[]
	select(ids: Id[]): void
	setMarquee(b: Bounds | null): void
	/** Ask the user for a number (the tool bar prompt); `apply` runs on Enter. */
	ask(label: string, value: number, apply: (v: number) => void): void
	/** Rack-row views only: the rack and U under a view point. */
	rowHit?(p: Pt): { rack: Rack; u: number } | null
	/** Sheet views only: select one viewport of the selected sheet (null = the sheet itself). */
	selectViewport?(id: Id | null): void
	/** Rack-row views only: the selected ports (of one device). */
	portSel?(): PortSel | null
	selectPorts?(s: PortSel | null): void
	/** A short message in the status area (why something was refused). */
	say?(msg: string): void
}

export interface Tool {
	readonly id: string
	readonly cursor: string
	down(e: PointerIn, c: ToolCtx): void
	move(e: PointerIn, c: ToolCtx): void
	up(e: PointerIn, c: ToolCtx): void
	cancel(c: ToolCtx): void
	/** Pointer moving with no button down (rubber bands, snap markers). */
	hover?(e: PointerIn, c: ToolCtx): void
	/** What to draw on top while the tool works. */
	preview?(c: ToolCtx): Prim[]
	/** A key while this tool is active; true = handled. */
	key?(e: KeyboardEvent, c: ToolCtx): boolean
	/** Enter / right-click: finish what is being drawn. */
	finish?(c: ToolCtx): void
	/** A TYPED point (view mm, no snapping) — the tool treats it like a click there. */
	typed?(p: Pt, c: ToolCtx): void
	/** The point typed input is relative to (@dx,dy, direct distance), in view mm. */
	lastPoint?(c: ToolCtx): Pt | null
}

/** Ports selected on one device (rack rows): click one, Shift-click a range from `anchor`, Ctrl-click toggles. */
export interface PortSel { on: Id; face: 'front' | 'rear'; ports: number[]; anchor: number }

/** The pick tolerance in screen px (ToolCtx.tol() is this many px, in model mm). */
export const TOL_PX = 6

/** Snap to a 10 mm grid (Alt = no snap). */
export const snapPt = (p: Pt, alt: boolean): Pt => (alt ? p : { x: Math.round(p.x / 10) * 10, y: Math.round(p.y / 10) * 10 })

/** Select: click picks (Shift / Ctrl toggles), press-drag moves the selection as ONE undo step (attached nodes
 *  follow), drag on empty space draws a window, and a selected path shows node grips to drag. Selection happens on
 *  press, so there is no click / press split to reconcile. */
export class SelectTool implements Tool {
	readonly id = 'select'
	readonly cursor = 'default'
	#start: Pt | null = null
	#ids: Id[] = []
	#gesture: Gesture | null = null
	#marquee: Pt | null = null
	#grip: { shape: Id; grip: Grip; branch?: Id } | null = null
	#snap: Snap | null = null
	/** Devices as they were when a rack-row drag started (each move is computed from these). */
	#base = new Map<Id, Device>()
	/** A viewport being dragged on a sheet (the sheet as it was at the press). */
	#vp: { sheet: Sheet; vpId: Id } | null = null

	/** Grips of the single selected path shape, in the view. */
	grips(c: ToolCtx): Grip[] {
		const s = c.selection.length === 1 ? c.store.get(c.selection[0]) : undefined
		return s?.type === 'shape' ? pathGrips(s, c.space) : []
	}

	down(e: PointerIn, c: ToolCtx): void {
		const g = gripAt(this.grips(c), e.p, c.tol() * 1.5)
		// Ctrl on a grip = BRANCH: a new segment from that node, dragged out
		if (g) { this.#grip = { shape: c.selection[0], grip: g, ...(e.ctrl ? { branch: newId() } : {}) }; return }
		if ((e.count ?? 1) >= 2 && this.#insertNode(e, c)) return
		const hit = pickPrim(c.prims(), e.p, c.tol()), id = hit?.src, sub = hit && hit.k !== 'image' ? hit.sub : undefined
		// a sheet: its viewports are picked (and dragged) by their window; the paper selects the sheet
		if (c.space.spec.kind === 'sheet' && c.selectViewport) {
			const sheet = id ? c.store.get(id) : undefined
			if (sheet?.type !== 'sheet') { c.select([]); c.selectViewport(null); return }
			c.select([sheet.id])
			const vp = sub ? sheet.viewports.find((v) => v.id === sub) : undefined
			c.selectViewport(vp ? vp.id : null)
			if (vp && !vp.locked) { this.#vp = { sheet, vpId: vp.id }; this.#start = e.p }
			return
		}
		// a port on a device (rack rows): select the port; Shift = a range from the first, Ctrl = toggle one
		if (sub && id && c.selectPorts && c.space.spec.kind === 'row' && c.store.get(id)?.type === 'device') {
			const n = Number(sub), face = c.space.spec.face, prev = c.portSel?.()
			if (prev && prev.on === id && (e.shift || e.ctrl)) {
				const cur = prev
				const ports = e.shift
					? Array.from({ length: Math.abs(n - cur.anchor) + 1 }, (_, i) => Math.min(n, cur.anchor) + i)
					: cur.ports.includes(n) ? cur.ports.filter((x) => x !== n) : [...cur.ports, n].sort((a, b) => a - b)
				c.selectPorts({ ...cur, ports })
				return
			}
			c.select([id])
			c.selectPorts({ on: id, face, ports: [n], anchor: n })
		} else if (c.selectPorts && !(e.shift || e.ctrl)) c.selectPorts(null)
		if (id) {
			if (e.shift || e.ctrl) { c.select(c.selection.includes(id) ? c.selection.filter((x) => x !== id) : [...c.selection, id]); return }
			const sel = c.selection.includes(id) ? c.selection : [id]
			if (sel !== c.selection) c.select(sel)
			// in a rack row, devices move (by U / into another rack); elsewhere what has a plan position moves
			this.#ids = sel.filter((x) => { const en = c.store.get(x); return !!en && (c.rowHit ? en.type === 'device' : canMove(en)) })
			this.#start = e.p
		} else {
			this.#marquee = e.p
			if (!e.shift && !e.ctrl) c.select([])
		}
	}

	move(e: PointerIn, c: ToolCtx): void {
		// sheets: drag a viewport's window on the paper (whole mm); a locked one stays put
		if (this.#vp && this.#start) {
			const { sheet, vpId } = this.#vp, d = { x: Math.round(e.p.x - this.#start.x), y: Math.round(e.p.y - this.#start.y) }
			if (!this.#gesture && Math.hypot(d.x, d.y) < c.tol()) return
			this.#gesture ??= c.store.begin('Move viewport')
			this.#gesture.update((tx) => tx.put({ ...sheet, viewports: sheet.viewports.map((v) => (v.id === vpId ? { ...v, rect: { ...v.rect, x: v.rect.x + d.x, y: v.rect.y + d.y } } : v)) }))
			return
		}
		if (this.#grip) {
			const { shape, grip, branch } = this.#grip
			const sn = c.snap(e.p, e.alt, shape)
			this.#snap = sn.kind === 'grid' ? null : sn
			this.#gesture ??= c.store.begin(branch ? 'Branch' : 'Move node')
			this.#gesture.update((tx) => {
				const s = tx.get(shape) as Shape
				if (branch && s.geom.kind === 'path') {
					const from = s.geom.nodes.find((n) => n.id === grip.nodeIds[grip.nodeIds.length - 1])!
					const w = c.space.spec.kind === 'plan' ? { x: sn.p.x, y: sn.p.y, z: from.z } : (() => { const d = c.space.deltaToWorld({ x: sn.p.x - grip.at.x, y: sn.p.y - grip.at.y }); return { x: from.x + d.x, y: from.y + d.y, z: from.z + (d.z ?? 0) } })()
					tx.put(branchFrom(s, from.id, { ...w, ...(from.levelId ? { levelId: from.levelId } : {}), ...(sn.attach && c.space.spec.kind === 'plan' ? { attach: sn.attach } : {}) }, branch))
					return
				}
				// plan: put the stack ON the snapped point (and attach to what it lands on); elevation: shift by the drag
				tx.put(c.space.spec.kind === 'plan'
					? moveNodes(s, grip.nodeIds, sn.p, sn.attach ?? null)
					: moveNodesBy(s, grip.nodeIds, c.space.deltaToWorld({ x: sn.p.x - grip.at.x, y: sn.p.y - grip.at.y })))
			})
		} else if (this.#start && this.#ids.length && c.rowHit) {
			// Rack rows: devices move by whole U, and into another rack when dropped on it; a move that would overlap or
			// run off the rack is refused (the device stays at its last good place).
			const d = { x: e.p.x - this.#start.x, y: e.p.y - this.#start.y }
			if (!this.#gesture && Math.hypot(d.x, d.y) < c.tol()) return
			const dU = Math.round(-d.y / RU_MM), target = c.rowHit(e.p)?.rack
			this.#gesture ??= c.store.begin('Move device')
			const all = c.store.ofType('device')
			const moved = this.#ids.map((id) => c.store.get(id)).filter((x): x is Device => x?.type === 'device')
			const base = new Map(moved.map((m) => [m.id, this.#base.get(m.id) ?? m]))
			for (const m of moved) this.#base.set(m.id, base.get(m.id)!)
			const next = moved.map((m) => { const b = base.get(m.id)!; return { ...b, u: b.u + dU, rackId: target && moved.length === 1 ? target.id : b.rackId } })
			const problem = next.map((n) => { const rack = c.store.get(n.rackId) as Rack; return placementProblem(n, rack, all.filter((o) => !this.#ids.includes(o.id))) }).find(Boolean)
			if (problem) { c.say?.(problem); return }
			this.#gesture.update((tx) => { for (const n of next) tx.put(n) })
		} else if (this.#start && this.#ids.length) {
			const d = { x: e.p.x - this.#start.x, y: e.p.y - this.#start.y }
			if (!this.#gesture && Math.hypot(d.x, d.y) < c.tol()) return
			const s = c.space.deltaToWorld(snapPt(d, e.alt))
			const moved = new Set(this.#ids)
			this.#gesture ??= c.store.begin(this.#ids.length === 1 ? 'Move' : `Move ${this.#ids.length} items`)
			this.#gesture.update((tx) => {
				for (const id of this.#ids) { const en = tx.get(id); if (en) tx.put(moveBy(en, s)) }
				for (const sh of followAttached(c.store.ofType('shape'), moved, s)) tx.put(sh)
			})
		} else if (this.#marquee) {
			c.setMarquee(box(this.#marquee, e.p))
		}
	}

	up(e: PointerIn, c: ToolCtx): void {
		if (this.#gesture) this.#gesture.commit()
		else if (this.#marquee && Math.hypot(e.p.x - this.#marquee.x, e.p.y - this.#marquee.y) > c.tol()) {
			const ids = pickInside(c.prims(), box(this.#marquee, e.p))
			c.select(e.shift || e.ctrl ? [...new Set([...c.selection, ...ids])] : ids)
		}
		this.#reset(c)
	}

	cancel(c: ToolCtx): void {
		this.#gesture?.rollback()
		this.#reset(c)
	}

	preview(c: ToolCtx): Prim[] {
		const px = c.tol() / TOL_PX   // one screen px in model mm
		const out: Prim[] = this.grips(c).map((g) => ({ k: 'line', pts: sq(g.at, 8 * px), closed: true, fill: true, cls: 'grip' }))
		if (this.#snap) out.push(snapMark(this.#snap, c.tol()))
		return out
	}

	/** Double-click on a segment of the selected path inserts a node there (interpolating z). */
	#insertNode(e: PointerIn, c: ToolCtx): boolean {
		const s = c.selection.length === 1 ? c.store.get(c.selection[0]) : undefined
		if (s?.type !== 'shape' || s.geom.kind !== 'path') return false
		const byId = new Map(s.geom.nodes.map((n) => [n.id, n]))
		let best: { seg: Id; t: number; d: number } | null = null
		for (const sg of s.geom.segs) {
			const a = byId.get(sg.a), b = byId.get(sg.b)
			if (!a || !b) continue
			const pa = c.space.fromWorld(a), pb = c.space.fromWorld(b)
			const dx = pb.x - pa.x, dy = pb.y - pa.y, l2 = dx * dx + dy * dy
			if (!l2) continue
			const t = Math.max(0, Math.min(1, ((e.p.x - pa.x) * dx + (e.p.y - pa.y) * dy) / l2))
			const d = Math.hypot(e.p.x - (pa.x + t * dx), e.p.y - (pa.y + t * dy))
			if (d <= c.tol() * 1.5 && (!best || d < best.d)) best = { seg: sg.id, t, d }
		}
		if (!best || best.t < 0.02 || best.t > 0.98) return false
		const { seg, t } = best
		c.store.transact('Insert node', (tx) => tx.put(insertNode(s, seg, t)))
		return true
	}

	#reset(c: ToolCtx): void {
		this.#start = null; this.#ids = []; this.#gesture = null; this.#marquee = null; this.#grip = null; this.#snap = null; this.#base.clear(); this.#vp = null
		c.setMarquee(null)
	}
}

/** Outlet: each click places the NEXT outlet (label = the last one placed + 1, ADR 0002) with sticky defaults. */
export class OutletTool implements Tool {
	readonly id = 'outlet'
	readonly cursor = 'crosshair'
	last: Outlet | null = null

	/** A typed point: `@1200,0` places the next outlet 1.2 m along from the last one. */
	typed(p: Pt, c: ToolCtx): void { this.down({ p, shift: false, ctrl: false, alt: true }, c) }
	lastPoint(c: ToolCtx): Pt | null { return this.last?.at ? c.space.fromWorld({ ...this.last.at, z: this.last.z ?? 0 }) : null }

	down(e: PointerIn, c: ToolCtx): void {
		const prev = this.last ?? lastOutletOn(c)
		const level = c.index.get(c.levelId)
		const used = new Set(c.index.outlets.filter((o) => o.levelId === c.levelId).map((o) => o.label))
		let label = prev ? nextLabel(prev.label) : `${level?.type === 'level' ? level.number : ''}-001`
		while (used.has(label)) label = nextLabel(label)   // never reuse a label already on this level
		const count = prev?.ports.length ?? 2
		const o: Outlet = {
			type: 'outlet', id: newId(), levelId: c.levelId, label,
			tier: prev?.tier ?? 'low', usage: prev?.usage ?? 'desk', mount: prev?.mount ?? 'floor',
			// in plan the height is sticky; on an elevation the click IS the height (an outlet placed on a wall elevation)
			...placeAt(c, e, prev?.z ?? 0),
			...(prev?.zoneId ? { zoneId: prev.zoneId } : {}),
			ports: portLabelsFor(label, count, c.settings?.portSuffix ?? 'alpha', c.settings?.portSeparator ?? '.').map((l, i) => ({
				port: i + 1, label: l, cableType: prev?.ports[i]?.cableType ?? c.settings?.defaults.outletCableType ?? 'cat6a',
				...(prev?.ports[i]?.serverRoomId ? { serverRoomId: prev.ports[i].serverRoomId } : {}),
			})),
		}
		c.store.transact(`Place outlet ${label}`, (tx) => tx.put(o))
		this.last = o
		c.select([o.id])
	}
	move(): void {}
	up(): void {}
	cancel(): void {}
}

/**
 * Rack, on the plan (Dave: racks are drawn on the floor plan, then assigned to rows).
 *  - With a `target` (Place from the racks list): put that rack where you click, then back to Select.
 *  - Without: each click draws a NEW rack, like the last one drawn (room, row, size, kind, rotation), named after it
 *    (A01 → A02). The tool stays on, so a row is just clicks in a line.
 */
export class RackTool implements Tool {
	readonly id = 'rack'
	readonly cursor = 'crosshair'
	target: Id | null = null
	last: Rack | null = null
	#hover: Pt | null = null

	constructor(private done: () => void) {}

	down(e: PointerIn, c: ToolCtx): void {
		const { at } = placeAt(c, e, 0)
		if (this.target) {
			const r = c.store.get(this.target)
			if (r?.type === 'rack') { c.store.transact(`Place rack ${r.name}`, (tx) => tx.put({ ...r, levelId: c.levelId, at })); c.select([r.id]) }
			this.target = null; this.#hover = null
			this.done()
			return
		}
		const onLevel = c.index.racks.filter((r) => r.levelId === c.levelId)
		const like = this.last ?? onLevel.at(-1)
		const room = like?.spaceId ?? c.index.spaces.find((s) => s.levelId === c.levelId && s.kind === 'server room')?.id
		if (!room) { c.say?.('Add a server room to this level first (racks belong to a room)'); return }
		const taken = new Set(c.index.racks.map((r) => r.name))
		let name = like ? nextLabel(like.name) : 'R01'
		while (taken.has(name)) name = nextLabel(name)
		const r: Rack = {
			type: 'rack', id: newId(), levelId: c.levelId, spaceId: room, order: onLevel.length, name,
			kind: like?.kind ?? 'cabinet', heightU: like?.heightU ?? 42, widthMm: like?.widthMm ?? 600, depthMm: like?.depthMm ?? 1000,
			...(like?.heightMm ? { heightMm: like.heightMm } : {}), ...(like?.rowId ? { rowId: like.rowId } : {}), ...(like?.rot ? { rot: like.rot } : {}),
			at,
		}
		c.store.transact(`Draw rack ${name}`, (tx) => tx.put(r))
		this.last = r
		c.select([r.id])
	}
	move(): void {}
	up(): void {}
	hover(e: PointerIn): void { this.#hover = snapPt(e.p, e.alt) }
	cancel(): void { this.target = null; this.#hover = null }

	/** The footprint of the rack about to be placed or drawn, under the cursor. */
	preview(c: ToolCtx): Prim[] {
		const t = this.target ? c.store.get(this.target) : undefined
		const r = t?.type === 'rack' ? t : this.last ?? c.index.racks.filter((x) => x.levelId === c.levelId).at(-1)
		if (!r || !this.#hover) return []
		const hw = (r.widthMm ?? 600) / 2, hd = (r.depthMm ?? 1000) / 2, h = this.#hover, rot = r.rot ?? 0
		const pts = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, y]) => { const q = rotateBy({ x, y }, rot); return { x: h.x + q.x, y: h.y + q.y } })
		return [{ k: 'line', pts, closed: true, cls: 'draft' }]
	}
}

const rotateBy = (p: Pt, deg: number): Pt => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return { x: p.x * c - p.y * s, y: p.x * s + p.y * c } }

/** A click → plan position (+ height). Plan: the click is x / y, the height is `planZ`. Elevation: the click on the
 *  work plane gives x / y AND the height. */
function placeAt(c: ToolCtx, e: PointerIn, planZ: number): { at: Pt; z: number } {
	const w = c.space.toWorld(snapPt(e.p, e.alt), c.work)
	return { at: { x: w.x, y: w.y }, z: c.space.spec.kind === 'plan' ? planZ : Math.round(w.z) }
}

function lastOutletOn(c: ToolCtx): Outlet | undefined {
	return c.index.outlets.filter((o) => o.levelId === c.levelId).sort((a, b) => naturalCompare(a.label, b.label)).at(-1)
}

export const box = (a: Pt, b: Pt): Bounds => ({ x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) })
export const sq = (c: Pt, s: number): Pt[] => [{ x: c.x - s / 2, y: c.y - s / 2 }, { x: c.x + s / 2, y: c.y - s / 2 }, { x: c.x + s / 2, y: c.y + s / 2 }, { x: c.x - s / 2, y: c.y + s / 2 }]

/** A snap marker: square = node / object, triangle-ish diamond = midpoint; sized in screen px through `tol`. */
export function snapMark(s: Snap, tol: number): Prim {
	const r = (tol / TOL_PX) * 6   // 6 screen px
	if (s.kind === 'mid') return { k: 'line', pts: [{ x: s.p.x, y: s.p.y - r }, { x: s.p.x + r, y: s.p.y + r }, { x: s.p.x - r, y: s.p.y + r }], closed: true, cls: 'snap' }
	return { k: 'line', pts: sq(s.p, r * 2), closed: true, cls: 'snap' }
}
