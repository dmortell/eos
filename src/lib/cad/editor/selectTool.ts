// The SELECT tool (split out of editor/tools.ts, UX review B0): picking, moving, copying, marquee, node / region /
// note / handle grips, viewport moves on a sheet, devices in rack rows, logo grips. Pure input → store edits; the
// surface (ui/ViewCanvas.svelte) routes pointer events here like any tool.
import type { Gesture } from '../store/store'
import type { Id, Pt, ProjectSettings, Rack, Device } from '../domain/types'
import type { Shape } from '../domain/shapes'
import type { Sheet } from '../domain/drawing'
import type { Prim } from '../views/display'
import type { Snap } from './snap'
import { pickPrim, pickInside, pickStack, pickTouching } from './pick'
import { moveBy, canMove, followAttached } from './behaviours'
import { pathGrips, gripAt, moveNodes, moveNodesBy, joinDropped, type Grip } from './grips'
import { insertNode, branchFrom, canJoin, joinShapes } from '../domain/pathEdit'
import { makeClip, pasteClip, type Clip } from '../domain/clipboard'
import { startDeviceDrag, dragDevices, type DeviceDrag } from './deviceDrag'
import { RU_MM } from '../views/rackRow'
import { newId } from '../domain/ids'
import type { Entity } from '../domain/drawing'
import { handlesFor, handleAt, type Handle } from './handles'
import { noteGrips, moveNotePoint, tiedViewport } from './noteTool'
import { segAt, segNodes, followersOf, joinAcross } from './pathSel'
import { angleStep, axisLock } from './constrain'
import { gripSpace, regionGrips, dragRegionGrip, type GripSpace } from './shapeGrips'
import { withGroups } from '../domain/groups'
import { labelKind } from '../domain/labelEdit'
import { elevationHandles } from './elevHandles'
import { logoHandles, logoBoxes, logoAt, type LogoKey } from './logoHandles'
import { viewportAt } from '../views/sheet'
import { TOL_PX, snapPt, box, sq, snapMark, tiedScale, type Tool, type ToolCtx, type PointerIn } from './tools'

const REGION = new Set(['rect', 'circle', 'ellipse', 'polygon'])

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
	/** Nodes the grip drag has joined into another node (said on release). */
	#joined = 0
	/** Other runs' nodes sitting on the dragged ones (they move along): shape → node ids; a run the drop joined in. */
	#followers = new Map<Id, Id[]>()
	#absorbed = 0
	/** A selected segment being dragged whole: its run and end nodes. */
	#segDrag: { shape: Id; nodes: Id[] } | null = null
	/** Pressed on a segment of the selected run: a click (no drag) picks that segment. */
	#segPick: { shape: Id; seg: Id } | null = null
	#snap: Snap | null = null
	/** A rack-row device drag (editor/deviceDrag.ts). */
	#dev: DeviceDrag | null = null
	/** The pressed items as a clip, for Ctrl-drag copy (taken at the press, before anything moves). */
	#clip: Clip | null = null
	/** Ctrl-pressed on this: a click (no drag) toggles it in the selection. */
	#toggle: Id | null = null
	/** The copies a Ctrl-drag made (selected when it ends); the selection before the press (undoing the copy gives it back). */
	#copied: Id[] = []
	#before: Id[] = []
	/** The last press point, and what a click there now steps to (stacked items). */
	#last: Pt | null = null
	#cycle: Id | null = null
	/** A viewport being dragged on a sheet (the sheet as it was at the press): moved, resized by a corner, or its view
	 *  panned (Ctrl). */
	#vp: { sheet: Sheet; vpId: Id; mode: 'move' | 'resize' | 'pan'; corner?: number } | null = null

	/** A handle being used (an opening's / a section's, editor/handles.ts) and its entity as it was at the press. */
	#handle: { h: Handle; base: Entity } | null = null
	/** A note's grip being dragged: the note as it was at the press, and the viewport it's tied to. */
	#note: { base: Shape; vp?: Sheet['viewports'][number]; index: number } | null = null
	/** A drawn region's resize grip being dragged (editor/shapeGrips.ts): the shape as it was, which grip, its space. */
	#region: { base: Shape; index: number; space: GripSpace } | null = null
	/** A title-block logo picked on a sheet (its height grip shows); dropped by a press anywhere else on the paper. */
	#logo: { sheet: Id; key: LogoKey } | null = null
	/** What a click here would take (UX06): drawn as a thin outline, and the cursor says what a press does. */
	#hov: { id: Id; sub?: string } | null = null
	/** The grip under the pointer: drawn larger (UX07). */
	#hovGrip: Pt | null = null
	#cursor = 'default'
	/** A double-clicked text, edited in place when the button comes up. */
	#editOnUp: Id | null = null

	/** The single selected region's grips (rect / ellipse / circle / polygon) where they show in this view. */
	#regionGrips(c: ToolCtx): { s: Shape; space: GripSpace; at: Pt[] } | null {
		const s = c.selection.length === 1 ? c.store.get(c.selection[0]) : undefined
		if (s?.type !== 'shape') return null
		const pts = regionGrips(s.geom), space = pts.length ? gripSpace(s, c.space, (id) => c.store.get(id)) : null
		return space ? { s, space, at: pts.map(space.to) } : null
	}

	/** The cursor for what's under the pointer: a grip → crosshair, something that moves → move, else pointer / arrow. */
	cursorNow(): string { return this.#cursor }
	unhover(): void { this.#hov = null; this.#hovGrip = null; this.#cursor = 'default' }
	hover(e: PointerIn, c: ToolCtx): void {
		const t = c.tol() * 1.5, near = (q: Pt) => Math.hypot(q.x - e.p.x, q.y - e.p.y) <= t
		const rg = this.#regionGrips(c), ng = this.#noteGrips(c)
		const h = handleAt(this.#handles(c).handles, e.p, t), g = gripAt(this.grips(c), e.p, t)
		const onGrip = (h && h.shape !== 'bar' ? h.at : null) ?? g?.at ?? rg?.at.find(near) ?? ng?.grips.find((q) => q.index >= 0 && near(q.at))?.at ?? null
		this.#hovGrip = onGrip
		if (onGrip || h) { this.#hov = null; this.#cursor = 'crosshair'; return }
		const hit = pickPrim(c.prims(), e.p, c.tol()), id = hit?.src, en = id ? c.store.get(id) : undefined
		const sub = hit && hit.k !== 'image' ? hit.sub : undefined
		// the bare paper of a sheet isn't something to point at; its viewports are
		if (!id || !en || (en.type === 'sheet' && !sub)) { this.#hov = null; this.#cursor = 'default'; return }
		this.#hov = { id, sub }
		this.#cursor = c.rowHit ? (en.type === 'device' && !sub ? 'move' : 'pointer') : canMove(en) || (en.type === 'sheet' && sub) ? 'move' : 'pointer'
	}

	dragFrom(): Pt | null { return this.#gesture ? (this.#grip?.grip.at ?? this.#start) : null }

	/** Where the node at the other end of a dragged node's (first) segment shows: Shift's 15° steps turn about it. */
	#neighbour(c: ToolCtx, shape: Id, nodeIds: Id[]): Pt | null {
		const s = c.store.get(shape)
		if (s?.type !== 'shape' || s.geom.kind !== 'path') return null
		const g = s.geom.segs.find((x) => nodeIds.includes(x.a) !== nodeIds.includes(x.b))
		const other = g && s.geom.nodes.find((n) => n.id === (nodeIds.includes(g.a) ? g.b : g.a))
		return other ? c.space.fromWorld(other) : null
	}

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
	/** The single selected thing's handles: on the plan (openings, sections); in an elevation / section a wall's top and bottom edges. */
	#handles(c: ToolCtx): ReturnType<typeof handlesFor> {
		const one = c.selection.length === 1 ? c.store.get(c.selection[0]) : undefined
		if (!one) return { handles: [], decor: [] }
		if (c.space.spec.kind === 'plan') return handlesFor(one)
		// a selected sheet: its title block's logos have a height grip on the paper
		if (c.space.spec.kind === 'sheet') {
			// the picked logo's height grip, with its outline
			if (one.type !== 'sheet' || this.#logo?.sheet !== one.id || c.viewportId?.()) { this.#logo = null; return { handles: [], decor: [] } }
			const l = logoHandles(c.index, one, c.store.get('settings') as ProjectSettings | undefined, this.#logo.key)
			return { handles: l.handles, decor: l.outline.length ? [{ k: 'line', pts: l.outline, closed: true, cls: 'logo-sel' }] : [] }
		}
		return { handles: elevationHandles(one, c.space), decor: [] }   // a wall's top / bottom edges in an elevation / section
	}

	down(e: PointerIn, c: ToolCtx): void {
		this.#hov = null; this.#hovGrip = null
		this.#before = c.selection
		// handles first (they sit on a wall / a cut line, where a node grip or a click would also land)
		const hBest = handleAt(this.#handles(c).handles, e.p, c.tol() * 1.5)
		if (hBest) { this.#handle = { h: hBest, base: c.store.get(c.selection[0])! }; this.#start = e.p; return }
		const g = gripAt(this.grips(c), e.p, c.tol() * 1.5)
		// Ctrl on a grip = BRANCH: a new segment from that node, dragged out
		if (g) {
			this.#grip = { shape: c.selection[0], grip: g, ...(e.ctrl ? { branch: newId() } : {}) }
			const s = c.store.get(c.selection[0])
			// other runs' nodes on this one move along; Alt-drag moves it alone (pulls apart runs that only touch there)
			if (!e.ctrl && !e.alt && s?.type === 'shape') this.#followers = followersOf(c.store.ofType('shape'), s, g.nodeIds)
			return
		}
		// a leader / cloud point drags alone; a text's grip (its anchor) is where you grab the text, so that drags it whole
		// a drawn region's resize grip (corner / edge / axis end / polygon corner)
		const rg = this.#regionGrips(c), ri = rg ? rg.at.findIndex((q) => Math.hypot(q.x - e.p.x, q.y - e.p.y) <= c.tol() * 1.5) : -1
		if (rg && ri >= 0) { this.#region = { base: rg.s, index: ri, space: rg.space }; return }
		const ng = this.#noteGrips(c), np = ng?.grips.find((q) => q.index >= 0 && Math.hypot(q.at.x - e.p.x, q.at.y - e.p.y) <= c.tol() * 1.5)
		if (ng && np) { this.#note = { base: ng.s, vp: ng.vp, index: np.index }; return }
		if ((e.count ?? 1) >= 2 && this.#insertNode(e, c)) return
		const hit = pickPrim(c.prims(), e.p, c.tol()), id = hit?.src, sub = hit && hit.k !== 'image' ? hit.sub : undefined
		// double-click on something with words — a text, a leader, an outlet, a rack, a run's label (on its words): edit
		// them in place (backlog "Text options", "Edit a label in place")
		const lk = id && (e.count ?? 1) >= 2 ? labelKind(c.store.get(id)) : null
		if (id && c.editText && lk && (lk !== 'run' || hit?.k === 'text')) { c.select([id]); this.#editOnUp = id; return }   // opened on RELEASE: on press, the click's own mousedown would take the focus from the box (it blurred, saved and closed)
		// a sheet: its viewports are picked (and dragged) by their FRAME; the paper selects the sheet
		if (c.space.spec.kind === 'sheet' && c.selectViewport) {
			// a double-click anywhere inside a viewport edits inside it (its middle isn't its handle any more)
			if ((e.count ?? 1) >= 2 && c.enterViewport) {
				const sh = c.store.get(c.space.spec.sheetId), inside = sh?.type === 'sheet' ? viewportAt(sh, e.p) : undefined
				if (sh?.type === 'sheet' && inside) { c.select([sh.id]); c.selectViewport(inside.id); c.enterViewport(inside.id); return }
			}
			// the selected viewport first: a corner grip resizes it, Alt-drag inside pans its view (T126: Ctrl-drag copies)
			const cur = c.viewportId?.(), curSheet = c.selection.length === 1 ? c.store.get(c.selection[0]) : undefined
			const sel = curSheet?.type === 'sheet' && cur ? curSheet.viewports.find((v) => v.id === cur) : undefined
			if (curSheet?.type === 'sheet' && sel && !sel.locked) {
				const r = sel.rect, corners = [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }]
				const ci = corners.findIndex((q) => Math.hypot(q.x - e.p.x, q.y - e.p.y) <= c.tol() * 1.5)
				if (ci >= 0) { this.#vp = { sheet: curSheet, vpId: sel.id, mode: 'resize', corner: ci }; this.#start = e.p; return }
				const inside = e.p.x > r.x && e.p.x < r.x + r.w && e.p.y > r.y && e.p.y < r.y + r.h
				if (inside && (e.count ?? 1) >= 2 && c.enterViewport) { c.enterViewport(sel.id); return }   // double-click: edit inside it
				if (inside && (e.alt || c.contentNav?.())) { this.#vp = { sheet: curSheet, vpId: sel.id, mode: 'pan' }; this.#start = e.p; c.say?.('Panning the view — the wheel (with Pan / zoom content on, or Alt+wheel) changes its scale'); return }
			}
			const sheet = id ? c.store.get(id) : undefined
			// a title-block logo: a click picks it (its height grip shows); a press anywhere else drops it
			const logo = sheet?.type === 'sheet' ? logoAt(logoBoxes(c.index, sheet, c.store.get('settings') as ProjectSettings | undefined), e.p) : null
			this.#logo = sheet && logo ? { sheet: sheet.id, key: logo } : null
			if (sheet && logo) { c.select([sheet.id]); c.selectViewport(null); c.say?.('Logo: drag the grip on its bottom edge to change its height (on every sheet)'); return }
			if (sheet?.type === 'sheet') {
				c.select([sheet.id])
				const vp = sub ? sheet.viewports.find((v) => v.id === sub) : undefined
				c.selectViewport(vp ? vp.id : null)
				if (vp && (e.count ?? 1) >= 2 && c.enterViewport) { c.enterViewport(vp.id); return }   // double-click: edit inside it
				if (vp) c.say?.(vp.locked ? 'Viewport locked — it can\'t be moved, resized or panned (Properties → Locked) · double-click to edit inside it'
					: 'Viewport: drag to move · a corner resizes · double-click edits inside it · Pan / zoom content (or Alt) pans / scales its view')
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
		// the selected run, pressed again: on a picked segment, drag those segments whole; elsewhere a click picks the
		// segment under the cursor (a drag still moves the whole run)
		if (id && c.selectPath && hitEnt?.type === 'shape' && hitEnt.geom.kind === 'path' && c.selection.length === 1 && c.selection[0] === id && !e.shift) {
			const seg = segAt(hitEnt, c.space, e.p, c.tol()), ps = c.pathSel?.()
			if (seg && !e.ctrl && ps?.shape === id && ps.segs.includes(seg)) {
				const nodes = segNodes(hitEnt, ps.segs)
				this.#segDrag = { shape: id, nodes }
				this.#followers = followersOf(c.store.ofType('shape'), hitEnt, nodes)
				this.#start = e.p
				return
			}
			if (seg) this.#segPick = { shape: id, seg }
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
		// clicking the same spot again steps down through what's stacked there (the release picks the next; a drag moves
		// the current one)
		const again = !e.ctrl && c.selection.length === 1 && !!this.#last && Math.hypot(e.p.x - this.#last.x, e.p.y - this.#last.y) <= c.tol()
		const stack = again ? pickStack(c.prims(), e.p, c.tol()) : [], at = stack.indexOf(c.selection[0])
		this.#cycle = at >= 0 && stack.length > 1 && !this.#segPick ? stack[(at + 1) % stack.length] : null
		this.#last = e.p
		const pid = this.#cycle ? c.selection[0] : id
		if (pid) {
			const id = pid
			// Ctrl: a click toggles it (Dave: Shift is kept for constraints while dragging; port ranges in racks still use
			// Shift); a Ctrl-DRAG copies the selection with it — let go of Ctrl mid-drag and it moves instead
			if (e.ctrl) this.#toggle = id
			const grp = withGroups(c.index.shapes, [id])   // a member of a group picks the whole group
			const sel = c.selection.includes(id) ? c.selection : e.ctrl ? [...new Set([...c.selection, ...grp])] : grp
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
		if (this.#region) {
			const { base, index, space } = this.#region
			// snapped like any point here (paper: 0.5 mm), then into the shape's own space
			const p = c.space.spec.kind === 'sheet' ? snapPt(e.p, e.alt, 0.5) : c.snap(e.p, e.alt, base.id).p
			this.#gesture ??= c.store.begin(REGION.has(base.geom.kind) ? 'Resize shape' : 'Move point')
			this.#gesture.update((tx) => tx.put(dragRegionGrip(base, index, space.from(p), e.shift)))
			return
		}
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
			this.#gesture ??= c.store.begin(h.label ?? (this.#handle.base.type === 'section' ? 'Edit section' : 'Edit opening'))
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
				let x0 = left ? Math.min(r.x + d.x, r.x + r.w - 10) : r.x, x1 = left ? r.x + r.w : Math.max(r.x + r.w + d.x, r.x + 10)
				let y0 = top ? Math.min(r.y + d.y, r.y + r.h - 10) : r.y, y1 = top ? r.y + r.h : Math.max(r.y + r.h + d.y, r.y + 10)
				// Shift: square (the longer side wins; the opposite corner stays put)
				if (e.shift) {
					const s = Math.max(x1 - x0, y1 - y0)
					if (left) x0 = x1 - s; else x1 = x0 + s
					if (top) y0 = y1 - s; else y1 = y0 + s
				}
				// the view stays put on the paper: the centre moves with the window's middle
				const cx = v.centre.x + ((x0 + x1) / 2 - (r.x + r.w / 2)) * v.scale, cy = v.centre.y + ((y0 + y1) / 2 - (r.y + r.h / 2)) * v.scale
				return { ...v, rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, centre: { x: cx, y: cy } }
			}
			this.#gesture.update((tx) => tx.put({ ...sheet, viewports: sheet.viewports.map((v) => (v.id === vpId ? next(v) : v)) }))
			return
		}
		if (this.#grip) {
			const { shape, grip, branch } = this.#grip, fol = this.#followers
			// a click wobbles a pixel or two: not a drag (it picks the node instead)
			if (!this.#gesture && Math.hypot(e.p.x - grip.at.x, e.p.y - grip.at.y) < c.tol() / 2) return
			// back where it started → exactly there (not the nearest grid point), so a drag-and-return changes nothing
			const home = !branch && Math.hypot(e.p.x - grip.at.x, e.p.y - grip.at.y) <= c.tol()
			// Shift: 15° steps — a branch from its node, a node from the node at the other end of its segment
			const pivot = e.shift ? (branch ? grip.at : this.#neighbour(c, shape, grip.nodeIds)) : null
			const sn: Snap = home ? { p: grip.at, kind: 'node' } : pivot ? { p: angleStep(pivot, e.p), kind: 'grid' }
				: c.snap(e.p, e.alt, [shape, ...fol.keys()], branch ? undefined : [...grip.nodeIds, ...[...fol.values()].flat()])
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
				const plan = c.space.spec.kind === 'plan', d = c.space.deltaToWorld({ x: sn.p.x - grip.at.x, y: sn.p.y - grip.at.y })
				// a run of the same kind whose node sits on this one is already connected here: it becomes part of this run
				// (Dave: two trunks touching at a point move as one); other runs' nodes there just move along
				const absorbed: Id[] = []
				let base = s
				for (const [fid, ids] of fol) {
					const f = tx.get(fid) as Shape | undefined
					if (!f || !canJoin(base, f) || base.geom.kind !== 'path') continue
					const mine = base.geom.nodes.filter((n) => grip.nodeIds.includes(n.id)), theirs = f.geom.kind === 'path' ? f.geom.nodes.filter((n) => ids.includes(n.id)) : []
					const m = joinShapes(base, f, theirs.map((n): [Id, Id] => [n.id, [...mine].sort((a, b) => Math.abs(a.z - n.z) - Math.abs(b.z - n.z))[0].id]))
					if (m) { base = m; absorbed.push(fid); tx.del(fid) }
				}
				const moved = plan ? moveNodes(base, grip.nodeIds, sn.p, sn.attach ?? (home ? undefined : null)) : moveNodesBy(base, grip.nodeIds, d)
				for (const [fid, ids] of fol) {
					if (absorbed.includes(fid)) continue
					const f = tx.get(fid) as Shape | undefined
					if (f) tx.put(plan ? moveNodes(f, ids, sn.p) : moveNodesBy(f, ids, d))
				}
				// dropped on another node of the path (snapped onto it): JOIN them — shows while dragging, undone by dragging on
				const j = joinDropped(moved, grip.nodeIds, c.space)
				this.#joined = j.joined
				// …or on a node of ANOTHER run of the same kind: the two runs become one (cables choosing that run follow)
				const across = j.joined ? null : joinAcross(j.shape, grip.nodeIds, c.store.ofType('shape').filter((o) => o.id !== shape && !fol.has(o.id)), c.space)
				if (across) { tx.del(across.absorbed); absorbed.push(across.absorbed) }
				this.#absorbed = absorbed.length
				tx.put(across?.shape ?? j.shape)
				// a cable that chose a joined-in run (a backbone's riser) now uses this one
				if (absorbed.length) for (const l of c.store.ofType('link')) if (l.via && absorbed.includes(l.via)) tx.put({ ...l, via: shape })
			})
		} else if (this.#segDrag && this.#start) {
			// a selected segment (or several) dragged whole: their end nodes move by the drag; other runs' nodes on them too
			const { shape, nodes } = this.#segDrag, fol = this.#followers
			const dv0 = { x: e.p.x - this.#start.x, y: e.p.y - this.#start.y }, dv = e.shift ? axisLock(dv0) : dv0   // Shift: H / V
			if (!this.#gesture && Math.hypot(dv.x, dv.y) < c.tol()) return
			const d = c.space.deltaToWorld(snapPt(dv, e.alt, c.grid ?? 10))
			this.#gesture ??= c.store.begin('Move segment')
			this.#gesture.update((tx) => {
				const s = tx.get(shape) as Shape | undefined
				if (s) tx.put(moveNodesBy(s, nodes, d))
				for (const [fid, ids] of fol) { const f = tx.get(fid) as Shape | undefined; if (f) tx.put(moveNodesBy(f, ids, d)) }
			})
		} else if (this.#start && this.#ids.length && c.rowHit) {
			// Rack rows: devices move by whole U, and into another rack when dropped on it; a move that would overlap or
			// run off the rack is refused (the device stays at its last good place).
			const d = { x: e.p.x - this.#start.x, y: e.p.y - this.#start.y }
			if (!this.#gesture && Math.hypot(d.x, d.y) < c.tol()) return
			this.#dev ??= startDeviceDrag(this.#ids.map((id) => c.store.get(id)).filter((x): x is Device => x?.type === 'device'))
			const face = c.space.spec.kind === 'row' ? c.space.spec.face : 'front'
			const r = dragDevices(this.#dev, Math.round(-d.y / RU_MM), c.rowHit(e.p)?.rack, e.ctrl, c.store.ofType('device'), (id) => c.store.get(id) as Rack | undefined, { dx: d.x, face })
			if ('problem' in r) { c.say?.(r.problem); return }
			this.#gesture ??= c.store.begin(e.ctrl ? 'Copy devices' : 'Move device')
			this.#gesture.update((tx) => { for (const n of r.put) tx.put(n) })
			this.#copied = e.ctrl ? r.put.map((n) => n.id) : []
		} else if (this.#start && this.#ids.length) {
			const d0 = { x: e.p.x - this.#start.x, y: e.p.y - this.#start.y }, d = e.shift ? axisLock(d0) : d0   // Shift: H / V
			if (!this.#gesture && Math.hypot(d.x, d.y) < c.tol()) return
			const s = c.space.deltaToWorld(snapPt(d, e.alt, c.space.spec.kind === 'sheet' ? 0.5 : c.grid ?? 10))
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
			c.setMarquee(box(this.#marquee, e.p), e.p.x < this.#marquee.x)
		}
	}

	up(e: PointerIn, c: ToolCtx): void {
		if (this.#editOnUp) { const id = this.#editOnUp; this.#reset(c); c.editText?.(id); return }
		if (!this.#gesture && this.#handle) {
			const { h, base } = this.#handle
			if (h.selects) c.selectOpening?.(base.id, h.selects)   // a click on a hole selects it
			else if (h.click) { const click = h.click; c.store.transact('Door swing', (tx) => tx.put(click())) }
		}
		if (this.#gesture) {
			this.#gesture.commit(this.#before)
			if (this.#copied.length) c.select(this.#copied)
			if (this.#grip) c.selectPath?.(null)   // its nodes may have joined others
			if (this.#joined) c.say?.(`Joined ${this.#joined === 1 ? "the node" : `${this.#joined} nodes`} to the one it was dropped on · Ctrl+Z undoes`)
			else if (this.#absorbed) c.say?.(`Joined ${this.#absorbed === 1 ? 'the two runs' : `${this.#absorbed + 1} runs`} into one · Ctrl+Z undoes · click the node, then Disconnect (Properties) to separate them`)
		}
		// a click on a grip picks that node (Ctrl-click: adds / drops it — Ctrl-DRAG still branches); a click on a
		// segment of the selected run picks it (Ctrl: adds / drops it)
		else if (this.#grip) {
			const { shape, grip } = this.#grip, ps = c.pathSel?.(), had = ps?.shape === shape ? ps.nodes : []
			const nodes = !this.#grip.branch ? grip.nodeIds
				: grip.nodeIds.every((n) => had.includes(n)) ? had.filter((n) => !grip.nodeIds.includes(n)) : [...new Set([...had, ...grip.nodeIds])]
			c.selectPath?.(nodes.length ? { shape, nodes, segs: [] } : null)
		}
		else if (this.#segPick) {
			const { shape, seg } = this.#segPick, ps = c.pathSel?.(), had = ps?.shape === shape ? ps.segs : []
			c.selectPath?.({ shape, nodes: [], segs: e.ctrl ? (had.includes(seg) ? had.filter((x) => x !== seg) : [...had, seg]) : [seg] })
		}
		else if (this.#toggle) { const t = withGroups(c.index.shapes, [this.#toggle]); c.select(c.selection.includes(t[0]) ? c.selection.filter((x) => !t.includes(x)) : [...new Set([...c.selection, ...t])]) }
		else if (this.#cycle) c.select([this.#cycle])
		else if (this.#marquee && Math.hypot(e.p.x - this.#marquee.x, e.p.y - this.#marquee.y) > c.tol()) {
			// left → right: what it encloses (window); right → left: what it touches (crossing)
			const b = box(this.#marquee, e.p), ids = e.p.x < this.#marquee.x ? pickTouching(c.prims(), b) : pickInside(c.prims(), b)
			const grouped = withGroups(c.index.shapes, ids)
			c.select(e.ctrl ? [...new Set([...c.selection, ...grouped])] : grouped)
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
		// picked segments of the run (under the grips), then the grips — a picked node's grip filled blue
		const ps = c.pathSel?.(), run = ps ? c.store.get(ps.shape) : undefined, out: Prim[] = [...decor]
		if (ps && run?.type === 'shape' && run.geom.kind === 'path') {
			const at = new Map(run.geom.nodes.map((n) => [n.id, c.space.fromWorld(n)]))
			for (const g of run.geom.segs) if (ps.segs.includes(g.id) && at.get(g.a) && at.get(g.b)) out.push({ k: 'line', pts: [at.get(g.a)!, at.get(g.b)!], cls: 'seg-sel' })
		}
		// what a click would take (UX06), unless it's already selected: its outline (a port: just that cell)
		const hv = this.#hov
		if (hv && !this.#gesture && (hv.sub ? true : !c.selection.includes(hv.id))) {
			for (const p of c.prims()) {
				if (p.src !== hv.id || p.k === 'image' || (hv.sub && p.sub !== hv.sub)) continue
				out.push(p.k === 'text' ? { ...p, cls: 'hover' } : p.k === 'line' ? { ...p, cls: 'hover', fill: false, w: undefined } : { ...p, cls: 'hover', fill: false })
			}
		}
		const picked = new Set(ps?.nodes ?? [])
		out.push(...[...this.grips(c), ...(this.#noteGrips(c)?.grips ?? [])].map((g): Prim => ({ k: 'line', pts: sq(g.at, 8 * px), closed: true, fill: true, cls: 'nodeIds' in g && g.nodeIds.some((n) => picked.has(n)) ? 'grip grip-sel' : 'grip' })))
		// a selected region's resize grips
		const rg = this.#regionGrips(c)
		if (rg) rg.at.forEach((p) => out.push({ k: 'line', pts: sq(p, 8 * px), closed: true, fill: true, cls: 'grip' }))
		const opSel = c.openingId?.()
		// bars under the point grips
		for (const h of handles) if (h.span) out.push({ k: 'line', pts: h.span, cls: `grip-bar${h.selects === opSel ? ' grip-bar-sel' : ''}` })
		for (const h of handles) {
			if (h.shape === 'round') out.push({ k: 'circle', c: h.at, r: 5 * px, fill: true, cls: 'grip grip-round' })
			else out.push({ k: 'line', pts: sq(h.at, 8 * px), closed: true, fill: true, cls: 'grip' })   // square / grip: one look (Sheets')
		}
		// the grip under the pointer, larger (UX07: "larger on hover")
		if (this.#hovGrip && !this.#gesture) out.push({ k: 'line', pts: sq(this.#hovGrip, 11 * px), closed: true, fill: true, cls: 'grip grip-hover' })
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
		this.#start = null; this.#ids = []; this.#gesture = null; this.#marquee = null; this.#grip = null; this.#snap = null; this.#dev = null; this.#clip = null; this.#toggle = null; this.#copied = []; this.#cycle = null; this.#vp = null; this.#handle = null; this.#note = null; this.#region = null; this.#joined = 0; this.#editOnUp = null
		this.#followers = new Map(); this.#absorbed = 0; this.#segDrag = null; this.#segPick = null
		c.setMarquee(null)
	}
}
