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
import { makeClip, pasteClip, type Clip } from '../domain/clipboard'
import { startDeviceDrag, dragDevices, type DeviceDrag } from './deviceDrag'
import { RU_MM } from '../views/rackRow'
import { newId } from '../domain/ids'
import type { Entity } from '../domain/drawing'
import { handlesFor, handleAt, type Handle } from './handles'
import { noteGrips, moveNotePoint, tiedViewport } from './noteTool'

/** View mm per paper mm for a note tied to a viewport (1 for anything else): a paper drag moves it by this much. */
export function tiedScale(e: Entity, get: (id: Id) => Entity | undefined): number {
	if (e.type !== 'shape' || !e.vpId || !e.sheetId) return 1
	const sheet = get(e.sheetId)
	return (sheet?.type === 'sheet' && sheet.viewports.find((v) => v.id === e.vpId)?.scale) || 1
}

export interface PointerIn { p: Pt; shift: boolean; ctrl: boolean; alt: boolean; /** 2 = double click */ count?: number }

/** Options of the drawing tools, shown in the tool bar (reactive in the workspace). */
export interface DrawOpts { z: number; w: number; h: number }

export interface ToolCtx {
	store: EntityStore
	index: ProjectIndex
	levelId: Id
	settings?: ProjectSettings
	/** The user's current layer: new lines and notes go on it (walls, trunks, outlets, racks keep their own). */
	layerId?: Id | null
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
	/** One opening of a wall selected (null = none) and which one is (Phase 6: holes are selectable). */
	selectOpening?(wallId: Id, openingId: string | null): void
	openingId?(): string | null
	/** Ask for text (the tool-bar prompt); `apply` runs on Enter. */
	askText?(label: string, value: string, apply: (t: string) => void): void
	/** Sheet views only: select one viewport of the selected sheet (null = the sheet itself), and which one is. */
	selectViewport?(id: Id | null): void
	viewportId?(): Id | null
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
/** Moves snap to 10 mm (model), 0.5 mm on a sheet's paper; Alt = free. */
export const snapPt = (p: Pt, alt: boolean, step = 10): Pt => (alt ? p : { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step })

/** Select: click picks (Ctrl toggles; Shift is kept for constraints — ports in racks still take Shift ranges), press-drag moves the selection as ONE undo step (attached nodes
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
	/** A rack-row device drag (editor/deviceDrag.ts). */
	#dev: DeviceDrag | null = null
	/** The pressed items as a clip, for Ctrl-drag copy (taken at the press, before anything moves). */
	#clip: Clip | null = null
	/** Ctrl-pressed on this: a click (no drag) toggles it in the selection. */
	#toggle: Id | null = null
	/** The copies a Ctrl-drag made (selected when it ends). */
	#copied: Id[] = []
	/** A viewport being dragged on a sheet (the sheet as it was at the press): moved, resized by a corner, or its view
	 *  panned (Ctrl). */
	#vp: { sheet: Sheet; vpId: Id; mode: 'move' | 'resize' | 'pan'; corner?: number } | null = null

	/** A handle being used (an opening's / a section's, editor/handles.ts) and its entity as it was at the press. */
	#handle: { h: Handle; base: Entity } | null = null
	/** A note's grip being dragged: the note as it was at the press, and the viewport it's tied to. */
	#note: { base: Shape; vp?: Sheet['viewports'][number]; index: number } | null = null

	/** Grips of the single selected path shape, in the view. */
	grips(c: ToolCtx): Grip[] {
		const s = c.selection.length === 1 ? c.store.get(c.selection[0]) : undefined
		return s?.type === 'shape' ? pathGrips(s, c.space) : []
	}
	/** A note's point grips (text anchor, leader / cloud points): on its sheet, or a plan's own text. */
	#noteGrips(c: ToolCtx): { s: Shape; vp?: Sheet['viewports'][number]; grips: ReturnType<typeof noteGrips> } | null {
		const s = c.selection.length === 1 ? c.store.get(c.selection[0]) : undefined
		if (s?.type !== 'shape' || !(s.sheetId ? c.space.spec.kind === 'sheet' : s.levelId && c.space.spec.kind === 'plan')) return null
		const vp = tiedViewport(s, (id) => c.store.get(id))
		return { s, vp, grips: noteGrips(s, vp) }
	}
	/** The single selected thing's handles — on the plan only. */
	#handles(c: ToolCtx): ReturnType<typeof handlesFor> {
		const one = c.selection.length === 1 ? c.store.get(c.selection[0]) : undefined
		return one && c.space.spec.kind === 'plan' ? handlesFor(one) : { handles: [], decor: [] }
	}

	down(e: PointerIn, c: ToolCtx): void {
		// handles first (they sit on a wall / a cut line, where a node grip or a click would also land)
		const hBest = handleAt(this.#handles(c).handles, e.p, c.tol() * 1.5)
		if (hBest) { this.#handle = { h: hBest, base: c.store.get(c.selection[0])! }; this.#start = e.p; return }
		const g = gripAt(this.grips(c), e.p, c.tol() * 1.5)
		// Ctrl on a grip = BRANCH: a new segment from that node, dragged out
		if (g) { this.#grip = { shape: c.selection[0], grip: g, ...(e.ctrl ? { branch: newId() } : {}) }; return }
		// a leader / cloud point drags alone; a text's grip (its anchor) is where you grab the text, so that drags it whole
		const ng = this.#noteGrips(c), np = ng?.grips.find((q) => q.index >= 0 && Math.hypot(q.at.x - e.p.x, q.at.y - e.p.y) <= c.tol() * 1.5)
		if (ng && np) { this.#note = { base: ng.s, vp: ng.vp, index: np.index }; return }
		if ((e.count ?? 1) >= 2 && this.#insertNode(e, c)) return
		const hit = pickPrim(c.prims(), e.p, c.tol()), id = hit?.src, sub = hit && hit.k !== 'image' ? hit.sub : undefined
		// a sheet: its viewports are picked (and dragged) by their window; the paper selects the sheet
		if (c.space.spec.kind === 'sheet' && c.selectViewport) {
			// the selected viewport first: a corner grip resizes it, Ctrl-drag inside pans its view
			const cur = c.viewportId?.(), curSheet = c.selection.length === 1 ? c.store.get(c.selection[0]) : undefined
			const sel = curSheet?.type === 'sheet' && cur ? curSheet.viewports.find((v) => v.id === cur) : undefined
			if (curSheet?.type === 'sheet' && sel && !sel.locked) {
				const r = sel.rect, corners = [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }]
				const ci = corners.findIndex((q) => Math.hypot(q.x - e.p.x, q.y - e.p.y) <= c.tol() * 1.5)
				if (ci >= 0) { this.#vp = { sheet: curSheet, vpId: sel.id, mode: 'resize', corner: ci }; this.#start = e.p; return }
				const inside = e.p.x > r.x && e.p.x < r.x + r.w && e.p.y > r.y && e.p.y < r.y + r.h
				if (inside && e.ctrl) { this.#vp = { sheet: curSheet, vpId: sel.id, mode: 'pan' }; this.#start = e.p; return }
			}
			const sheet = id ? c.store.get(id) : undefined
			if (sheet?.type === 'sheet') {
				c.select([sheet.id])
				const vp = sub ? sheet.viewports.find((v) => v.id === sub) : undefined
				c.selectViewport(vp ? vp.id : null)
				if (vp && !vp.locked) { this.#vp = { sheet, vpId: vp.id, mode: 'move' }; this.#start = e.p }
				else if (!vp) this.#marquee = e.p   // the bare paper: a click selects the sheet, a drag windows its notes
				return
			}
			c.selectViewport(null)
			// a paper note (a shape on the sheet) is picked and dragged like any shape, below; off the paper: a window
			if (sheet?.type !== 'shape') { c.select([]); this.#marquee = e.p; return }
		}
		// a hole in a wall (plan): select the wall and that opening; dragging slides the hole at once
		const hitEnt = id ? c.store.get(id) : undefined
		if (id && sub && hitEnt?.type === 'shape' && hitEnt.role?.kind === 'wall' && c.space.spec.kind === 'plan' && !e.shift && !e.ctrl) {
			c.select([id])
			c.selectOpening?.(id, sub)
			const bar = handlesFor(hitEnt).handles.find((h) => h.selects === sub)
			if (bar) { this.#handle = { h: { ...bar, selects: undefined }, base: hitEnt }; this.#start = e.p }
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
			// Ctrl: a click toggles it (Dave: Shift is kept for constraints while dragging; port ranges in racks still use
			// Shift); a Ctrl-DRAG copies the selection with it — let go of Ctrl mid-drag and it moves instead
			if (e.ctrl) this.#toggle = id
			const sel = c.selection.includes(id) ? c.selection : e.ctrl ? [...c.selection, id] : [id]
			if (sel !== c.selection && !e.ctrl) c.select(sel)
			// in a rack row, devices move (by U / into another rack); elsewhere what has a plan position moves
			this.#ids = sel.filter((x) => { const en = c.store.get(x); return !!en && (c.rowHit ? en.type === 'device' : canMove(en) || e.ctrl) })
			if (!c.rowHit) this.#clip = makeClip(c.index, sel, '')
			this.#start = e.p
		} else {
			this.#marquee = e.p
			if (!e.ctrl) c.select([])
		}
	}

	move(e: PointerIn, c: ToolCtx): void {
		if (this.#note) {
			const { base, vp, index } = this.#note, to = c.space.spec.kind === 'sheet' ? snapPt(e.p, e.alt, 0.5) : c.snap(e.p, e.alt, base.id).p
			this.#gesture ??= c.store.begin('Move note point')
			this.#gesture.update((tx) => tx.put(moveNotePoint(base, index, to, vp)))
			return
		}
		if (this.#handle) {
			const { h } = this.#handle, start = this.#start
			if (!h.drag || !start || (!this.#gesture && Math.hypot(e.p.x - start.x, e.p.y - start.y) < c.tol())) return
			const drag = h.drag
			// a bar keeps the press point's offset along it (no jump to the pointer)
			const q = h.shape === 'bar' ? { x: h.at.x + e.p.x - start.x, y: h.at.y + e.p.y - start.y } : e.p
			this.#gesture ??= c.store.begin(this.#handle.base.type === 'section' ? 'Edit section' : 'Edit opening')
			this.#gesture.update((tx) => tx.put(drag(q, e.alt)))
			return
		}
		// sheets: drag a viewport's window on the paper (whole mm); a locked one stays put
		if (this.#vp && this.#start) {
			const { sheet, vpId, mode, corner } = this.#vp, d = { x: Math.round(e.p.x - this.#start.x), y: Math.round(e.p.y - this.#start.y) }
			if (!this.#gesture && Math.hypot(d.x, d.y) < c.tol()) return
			this.#gesture ??= c.store.begin(mode === 'resize' ? 'Resize viewport' : mode === 'pan' ? 'Pan viewport' : 'Move viewport')
			const next = (v: Sheet['viewports'][number]) => {
				const r = v.rect
				if (mode === 'pan') return { ...v, centre: { x: v.centre.x - d.x * v.scale, y: v.centre.y - d.y * v.scale } }
				if (mode === 'move') return { ...v, rect: { ...r, x: r.x + d.x, y: r.y + d.y } }
				// resize from a corner (0 TL, 1 TR, 2 BR, 3 BL), the opposite corner fixed; at least 10 mm
				const left = corner === 0 || corner === 3, top = corner === 0 || corner === 1
				const x0 = left ? Math.min(r.x + d.x, r.x + r.w - 10) : r.x, x1 = left ? r.x + r.w : Math.max(r.x + r.w + d.x, r.x + 10)
				const y0 = top ? Math.min(r.y + d.y, r.y + r.h - 10) : r.y, y1 = top ? r.y + r.h : Math.max(r.y + r.h + d.y, r.y + 10)
				// the view stays put on the paper: the centre moves with the window's middle
				const cx = v.centre.x + ((x0 + x1) / 2 - (r.x + r.w / 2)) * v.scale, cy = v.centre.y + ((y0 + y1) / 2 - (r.y + r.h / 2)) * v.scale
				return { ...v, rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, centre: { x: cx, y: cy } }
			}
			this.#gesture.update((tx) => tx.put({ ...sheet, viewports: sheet.viewports.map((v) => (v.id === vpId ? next(v) : v)) }))
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
			this.#dev ??= startDeviceDrag(this.#ids.map((id) => c.store.get(id)).filter((x): x is Device => x?.type === 'device'))
			const r = dragDevices(this.#dev, Math.round(-d.y / RU_MM), c.rowHit(e.p)?.rack, e.ctrl, c.store.ofType('device'), (id) => c.store.get(id) as Rack | undefined)
			if ('problem' in r) { c.say?.(r.problem); return }
			this.#gesture ??= c.store.begin(e.ctrl ? 'Copy devices' : 'Move device')
			this.#gesture.update((tx) => { for (const n of r.put) tx.put(n) })
			this.#copied = e.ctrl ? r.put.map((n) => n.id) : []
		} else if (this.#start && this.#ids.length) {
			const d = { x: e.p.x - this.#start.x, y: e.p.y - this.#start.y }
			if (!this.#gesture && Math.hypot(d.x, d.y) < c.tol()) return
			const s = c.space.deltaToWorld(snapPt(d, e.alt, c.space.spec.kind === 'sheet' ? 0.5 : 10))
			const moved = new Set(this.#ids), clip = e.ctrl ? this.#clip : null
			this.#gesture ??= c.store.begin(clip ? 'Copy' : this.#ids.length === 1 ? 'Move' : `Move ${this.#ids.length} items`)
			this.#copied = []
			this.#gesture.update((tx) => {
				if (clip && clip.from.kind !== 'rack') {   // Ctrl held: copies (as-is, moved by the drag); the originals stay
					const r = pasteClip(clip, { pid: '', ix: c.index, to: { kind: clip.from.kind, id: clip.from.id }, d: s })
					for (const x of r.put) tx.put(x)
					this.#copied = r.select
					return
				}
				for (const id of this.#ids) {
					const en = tx.get(id)
					if (!en) continue
					const k = tiedScale(en, (sid) => tx.get(sid))   // a note tied to a viewport moves in its view mm
					tx.put(moveBy(en, k === 1 ? s : { ...s, x: s.x * k, y: s.y * k }))
				}
				for (const sh of followAttached(c.store.ofType('shape'), moved, s)) tx.put(sh)
			})
		} else if (this.#marquee) {
			c.setMarquee(box(this.#marquee, e.p))
		}
	}

	up(e: PointerIn, c: ToolCtx): void {
		if (!this.#gesture && this.#handle) {
			const { h, base } = this.#handle
			if (h.selects) c.selectOpening?.(base.id, h.selects)   // a click on a hole selects it
			else if (h.click) { const click = h.click; c.store.transact('Door swing', (tx) => tx.put(click())) }
		}
		if (this.#gesture) { this.#gesture.commit(); if (this.#copied.length) c.select(this.#copied) }
		else if (this.#toggle) { const t = this.#toggle; c.select(c.selection.includes(t) ? c.selection.filter((x) => x !== t) : [...c.selection, t]) }
		else if (this.#marquee && Math.hypot(e.p.x - this.#marquee.x, e.p.y - this.#marquee.y) > c.tol()) {
			const ids = pickInside(c.prims(), box(this.#marquee, e.p))
			c.select(e.ctrl ? [...new Set([...c.selection, ...ids])] : ids)
		}
		this.#reset(c)
	}

	cancel(c: ToolCtx): void {
		this.#gesture?.rollback()
		this.#reset(c)
	}

	preview(c: ToolCtx): Prim[] {
		const px = c.tol() / TOL_PX   // one screen px in model mm
		const { handles, decor } = this.#handles(c)
		const out: Prim[] = [...decor, ...[...this.grips(c), ...(this.#noteGrips(c)?.grips ?? [])].map((g): Prim => ({ k: 'line', pts: sq(g.at, 8 * px), closed: true, fill: true, cls: 'grip' }))]
		const opSel = c.openingId?.()
		// bars under the point grips
		for (const h of handles) if (h.span) out.push({ k: 'line', pts: h.span, cls: `grip-bar${h.selects === opSel ? ' grip-bar-sel' : ''}` })
		for (const h of handles) {
			if (h.shape === 'round') out.push({ k: 'circle', c: h.at, r: 7 * px, fill: true, cls: 'grip grip-round' })
			else if (h.shape === 'square') out.push({ k: 'line', pts: sq(h.at, 11 * px), closed: true, fill: true, cls: 'grip grip-handle' })
		}
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
		this.#start = null; this.#ids = []; this.#gesture = null; this.#marquee = null; this.#grip = null; this.#snap = null; this.#dev = null; this.#clip = null; this.#toggle = null; this.#copied = []; this.#vp = null; this.#handle = null; this.#note = null
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

/** A click → plan position (+ height). Plan: the click is x / y, the height is `planZ`. Elevation: the click on the
 *  work plane gives x / y AND the height. */
export function placeAt(c: ToolCtx, e: PointerIn, planZ: number): { at: Pt; z: number } {
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
