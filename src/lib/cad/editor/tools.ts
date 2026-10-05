// Tools (analysis §6.7): one object per tool behind one interface; the surface routes pointer events to the active
// tool with the point already in model mm. No `tool === '…'` chains anywhere else.
import type { EntityStore } from '../store/store'
import type { ProjectIndex } from '../domain/project'
import type { Id, Pt, ProjectSettings, Rack } from '../domain/types'
import type { Entity } from '../domain/drawing'
import type { Prim, Bounds } from '../views/display'
import type { Snap } from './snap'
import type { ViewSpace, WorkPlane } from '../views/space'
import type { PathSel } from './pathSel'

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
	/** `skip` = shapes left out (the ones being edited); `dragged` = their nodes being dragged: their OTHER nodes still
	 *  snap (so a node can be dropped on one to join them). */
	snap(p: Pt, alt: boolean, skip?: Id | Id[], dragged?: Id[]): Snap
	/** Nodes / segments picked within the selected run (Delete removes them; Properties acts on them). */
	pathSel?(): PathSel | null
	selectPath?(s: PathSel | null): void
	/** Edit a text's words in place, on the drawing (double-click / F2). */
	editText?(id: Id): void
	selection: Id[]
	select(ids: Id[]): void
	/** The selection box being dragged; `crossing` = dragged right → left (selects what it touches). */
	setMarquee(b: Bounds | null, crossing?: boolean): void
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
	/** The model grid step for moves and placing (mm; 0 = SNAP off; absent = 10). Paper steps stay 0.5 / 1 mm. */
	grid?: number
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
	/** Pointer moving with no button down (rubber bands, snap markers, what a click would take). */
	hover?(e: PointerIn, c: ToolCtx): void
	/** The pointer left the view: drop any hover highlight. */
	unhover?(): void
	/** The cursor now (it can change with what's under the pointer); absent = `cursor`. */
	cursorNow?(): string
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
	/** While dragging: where the drag started (view mm) — the status bar shows the move's length / angle / Δ. */
	dragFrom?(): Pt | null
}

/** Ports selected on one device (rack rows): click one, Shift-click a range from `anchor`, Ctrl-click toggles. */
export interface PortSel { on: Id; face: 'front' | 'rear'; ports: number[]; anchor: number }

/** The pick tolerance in screen px (ToolCtx.tol() is this many px, in model mm). */
export const TOL_PX = 6

/** Snap to a 10 mm grid (Alt = no snap). */
/** Moves snap to 10 mm (model), 0.5 mm on a sheet's paper; Alt = free. */
export const snapPt = (p: Pt, alt: boolean, step = 10): Pt => (alt || !step ? p : { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step })


/** A click → plan position (+ height). Plan: the click is x / y, the height is `planZ`. Elevation: the click on the
 *  work plane gives x / y AND the height. */
export function placeAt(c: ToolCtx, e: PointerIn, planZ: number): { at: Pt; z: number } {
	const w = c.space.toWorld(snapPt(e.p, e.alt, c.grid ?? 10), c.work)
	return { at: { x: w.x, y: w.y }, z: c.space.spec.kind === 'plan' ? planZ : Math.round(w.z) }
}

export const box = (a: Pt, b: Pt): Bounds => ({ x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) })
export const sq = (c: Pt, s: number): Pt[] => [{ x: c.x - s / 2, y: c.y - s / 2 }, { x: c.x + s / 2, y: c.y - s / 2 }, { x: c.x + s / 2, y: c.y + s / 2 }, { x: c.x - s / 2, y: c.y + s / 2 }]

/** A snap marker: square = node / object, triangle-ish diamond = midpoint; sized in screen px through `tol`. */
export function snapMark(s: Snap, tol: number): Prim {
	const r = (tol / TOL_PX) * 6   // 6 screen px
	if (s.kind === 'mid') return { k: 'line', pts: [{ x: s.p.x, y: s.p.y - r }, { x: s.p.x + r, y: s.p.y + r }, { x: s.p.x - r, y: s.p.y + r }], closed: true, cls: 'snap' }
	if (s.kind === 'centre') return { k: 'circle', c: s.p, r, cls: 'snap' }   // a circle = a centre
	return { k: 'line', pts: sq(s.p, r * 2), closed: true, cls: 'snap' }
}
