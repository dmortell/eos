// SCRIPTED commands for the command line (AutoCAD style): each is an async function that asks for what it needs —
// "Specify base point:" — and then edits through the viewport's command target. Answers come from typed tokens or
// viewport clicks (ui/commandRunner.svelte.ts routes them). Coordinates are USER coords (model mm, Y up); angles
// are degrees CCW from +X.
import { dist, arc3, type Pt, type Ent } from './geometry'
import type { VpCommandTarget } from './cmdBus.svelte'
import { svgMarkup, svgToPng, download } from './svgExport'
import { arrange } from './arrange'
import { offsetEnt, outline, crossings, trim, extend, breakAt, setLength, polyLength, project, arcLength, setArcLength, joinChains, corner, stretchEnt, cornerInPolyline } from './modify'

export type CmdHost = {
	/** Arm a tool in the focused pane ('Line', 'Rectangle', … or 'Select'). */
	tool(name: string): void
	run(id: string): string | void   // every other command (views, toggles, panels, files) — may return an error
	/** NEWLAYER: add a layer to the focused model and make it current; LAYMCUR: make a layer current. Both return
	 *  the layer's name, or an error. */
	newLayer(name: string): { name: string } | string
	setCurrentLayer(id: string): { name: string } | string
	/** LAYOFF / LAYFRZ / LAYISO / LAYUNISO / LAYON on the focused model's layers: a message, or `{ err }`. */
	layerOp(op: 'off' | 'frz' | 'iso' | 'uniso' | 'on', ids: string[]): string | { err: string }
	/** The focused model's layers (QSELECT). */
	layers(): { id: string; name: string }[]
	/** The block library (PURGE / AUDIT / QSELECT): id, name, built-in or custom. */
	blocks(): { id: string; name: string; custom: boolean }[]
	/** Block inserts across this project's LOADED models: the block ids in use, and inserts whose block is missing. */
	blockUsage(): { used: Set<string>; missing: { model: string; id: string; block?: string }[]; models: number }
	/** Delete custom blocks from the (shared) library. */
	deleteBlocks(ids: string[]): void
	/** Named views of the active drawing (VIEW): read / write the stored set. */
	namedViews(): Record<string, NamedView>
	saveNamedViews(v: Record<string, NamedView>): void
	/** A file name for an export of the active view ('3F Plan - Front'). */
	exportName(): string
}
/** What a command asks for. Any combination; `options` are matched by their leading letters. */
export type Want = {
	prompt: string
	/** a point: typed X,Y / @DX,DY (relative to `base`) / a distance toward the cursor, or a click; `box` draws the
	 *  rubber band as a rectangle (a window) */
	point?: { base?: Pt; ghost?: (u: Pt) => Ent[]; box?: boolean }
	ent?: boolean
	/** "Select shapes": clicks select as usual; a typed point adds the shape there to the selection */
	select?: boolean
	number?: boolean
	/** free text: the REST of the typed line (a name with spaces) */
	text?: boolean
	enter?: boolean
	options?: string[]
	/** used for an empty Enter (shown as <default>) */
	def?: string
}
export type Answer = { kind: 'point'; p: Pt } | { kind: 'number'; n: number } | { kind: 'ent'; id: string; p: Pt } | { kind: 'enter' } | { kind: 'option'; key: string } | { kind: 'text'; s: string }
/** Esc. */
export class Cancel extends Error {}
/** An expected failure a script reports (shown in red, not logged as a bug). */
export class CmdError extends Error {}
/** What a script gets: ask for input, the viewport, the page, and the log. */
export type CmdCtx = { ask(w: Want): Promise<Answer>; t: VpCommandTarget; host: CmdHost; out(msg: string): void }
export type Script = (c: CmdCtx) => Promise<void>
export type NamedView = { view: { zoom: number; x: number; y: number }; scale: string }

export const fmt = (n: number) => String(Math.round(n * 100) / 100)
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]]
const angleOf = (base: Pt, u: Pt) => (Math.atan2(u[1] - base[1], u[0] - base[0]) * 180) / Math.PI
/** A non-null message from the target is a failure. */
const chk = (m: string | null | void) => { if (m) throw new CmdError(m) }

/** Ask for a point (Enter / an option isn't accepted here). */
export async function point(c: CmdCtx, prompt: string, base?: Pt, extra: Partial<NonNullable<Want['point']>> = {}): Promise<Pt> {
	const a = await c.ask({ prompt, point: { base, ...extra } })
	if (a.kind !== 'point') throw new Cancel()
	return a.p
}
/** Ask for a number (with an optional default for Enter). */
export async function number(c: CmdCtx, prompt: string, def?: number): Promise<number> {
	const a = await c.ask({ prompt, number: true, def: def != null ? String(def) : undefined })
	if (a.kind !== 'number') throw new Cancel()
	return a.n
}
/** The shapes to act on: the current selection, else ask for one (clicks select as usual; Enter ends). */
export async function selection(c: CmdCtx): Promise<string[]> {
	c.host.tool('Select')
	let s = c.t.selected()
	if (s.length) return s
	for (;;) {
		const a = await c.ask({ prompt: 'Select shapes (click; Shift adds), then Enter', enter: true, select: true })
		s = c.t.selected()
		if (a.kind === 'enter') break
	}
	if (!s.length) throw new CmdError('Nothing selected')
	c.out(`${s.length} shape${s.length > 1 ? 's' : ''} selected`)
	return s
}

/** User coords → this view's drawing coords (3D has none). */
const D = (c: CmdCtx, u: Pt): Pt => { const d = c.t.toDraw(u); if (!d) throw new CmdError('Draw in a plan or elevation view (not 3D)'); return d }
const add = (c: CmdCtx, e: Ent) => c.t.apply({ add: [e] })
const arcEnt = (c: CmdCtx, us: Pt[]) => c.t.newEnt({ type: 'arc', pts: us.map((u) => D(c, u)) })
const circleEnt = (c: CmdCtx, ctr: Pt, r: number) => { const d = D(c, ctr); return c.t.newEnt({ type: 'ellipse', a: [d[0] - r, d[1] - r], b: [d[0] + r, d[1] + r] }) }
/** A regular polygon's vertices (user coords): `n` sides about `ctr`, the first vertex toward angle `a0` at radius
 *  `r` (inscribed = vertices on the circle; circumscribed = edge midpoints on it). */
export function polygonPts(ctr: Pt, n: number, r: number, a0: number, inscribed: boolean): Pt[] {
	const R = inscribed ? r : r / Math.cos(Math.PI / n), s = inscribed ? 0 : Math.PI / n
	return Array.from({ length: n }, (_, i) => { const t = a0 + s + (i * 2 * Math.PI) / n; return [ctr[0] + R * Math.cos(t), ctr[1] + R * Math.sin(t)] as Pt })
}

/** Ask for a shape (a click on it, or a typed point on it); Enter → null when `enter`. */
async function pickEnt(c: CmdCtx, prompt: string, enter = false): Promise<{ e: Ent; p: Pt } | null> {
	const a = await c.ask({ prompt, ent: true, enter })
	if (a.kind !== 'ent') return null
	const e = c.t.ents([a.id])[0]; if (!e) throw new CmdError('That shape is gone')
	return { e, p: D(c, a.p) }
}
/** A line's pieces after TRIM / BREAK: the first replaces it, the rest are new shapes like it; none = deleted. */
function replaceWith(c: CmdCtx, e: Ent, parts: Pt[][]) {
	const [first, ...rest] = parts.filter((p) => p.length >= 2)
	if (!first) return c.t.apply({ remove: [e.id] })
	const { id: _id, groupId: _g, ...base } = e
	c.t.apply({ update: [{ ...e, pts: first }], add: rest.map((pts) => c.t.newEnt({ ...base, pts })) })
}
function layerMsg(c: CmdCtx, r: string | { err: string }) { if (typeof r !== 'string') throw new CmdError(r.err); c.out(r) }
/** LAYOFF / LAYFRZ: each picked shape's layer, until Enter. */
async function layerPicks(c: CmdCtx, op: 'off' | 'frz', prompt: string) {
	c.host.tool('Select')
	for (;;) {
		const pk = await pickEnt(c, prompt, true); if (!pk) return
		if (!pk.e.layer) { c.out('That shape has no layer'); continue }
		layerMsg(c, c.host.layerOp(op, [pk.e.layer]))
	}
}
const isLine = (e: Ent) => e.type === 'polyline' && (e.pts?.length ?? 0) >= 2 && !e.rot
let lastOffset: number | undefined
let filletR = 0, chamferD: [number, number] = [0, 0]
/** Where two lines (as infinite lines) meet, or null when parallel. */
function lineIntersect(l1: [Pt, Pt], l2: [Pt, Pt]): Pt | null {
	const [a, b] = l1, [c2, d] = l2, r: Pt = [b[0] - a[0], b[1] - a[1]], q: Pt = [d[0] - c2[0], d[1] - c2[1]], den = r[0] * q[1] - r[1] * q[0]
	if (Math.abs(den) < 1e-12) return null
	const t = ((c2[0] - a[0]) * q[1] - (c2[1] - a[1]) * q[0]) / den
	return [a[0] + r[0] * t, a[1] + r[1] * t]
}
/** The dimension to chain from: the selected one, else pick one. */
async function sourceDim(c: CmdCtx): Promise<Ent> {
	const sel = c.t.ents(c.t.selected()).filter((e) => e.type === 'dim')
	if (sel.length === 1) return sel[0]
	const pk = await pickEnt(c, 'Select the dimension to continue from'); if (!pk) throw new Cancel()
	if (pk.e.type !== 'dim') throw new CmdError('That is not a dimension')
	return pk.e
}
/** DIMCONTINUE: each new dimension starts where the last one ended. DIMBASELINE: each measures from the first
 *  one's start, stacked a step further out (8 paper mm) so they don't overlap. Enter ends. */
async function dimChain(c: CmdCtx, baseline: boolean) {
	c.host.tool('Select')
	const src = await sourceDim(c), A = src.a!, B = src.b!
	const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, nx = -(B[1] - A[1]) / L, ny = (B[0] - A[0]) / L
	const step = 8 * c.t.paperMm() * (src.dimOff != null && src.dimOff < 0 ? -1 : 1)
	let from = B, k = 0
	const make = (to: Pt, kk: number): Ent => {
		const o = baseline ? step * kk : 0, a: Pt = baseline ? [A[0] + nx * o, A[1] + ny * o] : from
		// the new point is projected onto the chain's line (continue) / measured along it (baseline), like AutoCAD
		const t = (to[0] - A[0]) * (B[0] - A[0]) / L / L + (to[1] - A[1]) * (B[1] - A[1]) / L / L
		const b: Pt = [A[0] + (B[0] - A[0]) * t + nx * o, A[1] + (B[1] - A[1]) * t + ny * o]
		const { id: _id, groupId: _g, text: _t, ...style } = src
		return c.t.newEnt({ ...style, type: 'dim', a, b })
	}
	for (;;) {
		const kk = k + 1
		const q = await c.ask({ prompt: 'Specify next point or <Enter ends>', point: { base: c.t.toUser(from) ?? undefined, ghost: (u) => [make(D(c, u), kk)] }, enter: true })
		if (q.kind !== 'point') return
		const e = make(D(c, q.p), kk); add(c, e); k = kk
		if (!baseline) from = e.b!
	}
}
/** DIMRADIUS / DIMDIAMETER on an arc or a circle: from the centre toward the pick (radius, 'R<>') or right across it
 *  through the centre (diameter, 'Ø<>'). */
async function dimCircle(c: CmdCtx, diameter: boolean) {
	c.host.tool('Select')
	const pk = await pickEnt(c, 'Select an arc or a circle'); if (!pk) return
	const e = pk.e
	let ctr: Pt, r: number
	if (e.type === 'arc' && e.pts?.length === 3) { const g = arc3(e.pts[0], e.pts[1], e.pts[2]); if (!g) throw new CmdError('That arc is straight'); ctr = g.c; r = g.r }
	else if (e.type === 'ellipse') {
		const rx = Math.abs(e.b![0] - e.a![0]) / 2, ry = Math.abs(e.b![1] - e.a![1]) / 2
		if (Math.abs(rx - ry) > 0.01 * Math.max(rx, ry)) throw new CmdError('That is an ellipse, not a circle')
		ctr = [(e.a![0] + e.b![0]) / 2, (e.a![1] + e.b![1]) / 2]; r = rx
	} else throw new CmdError('Select an arc or a circle')
	const dx = pk.p[0] - ctr[0], dy = pk.p[1] - ctr[1], l = Math.hypot(dx, dy) || 1, u: Pt = [dx / l, dy / l]
	const b: Pt = [ctr[0] + u[0] * r, ctr[1] + u[1] * r], a: Pt = diameter ? [ctr[0] - u[0] * r, ctr[1] - u[1] * r] : ctr
	add(c, c.t.newEnt({ type: 'dim', a, b, text: diameter ? 'Ø<>' : 'R<>', ...(diameter ? {} : { headStart: 'none' as const }) }))
}
/** FILLET / CHAMFER: two lines (picked on the side to keep) → a corner, a tangent arc (Radius) or a bevel (Distance). */
async function cornerCmd(c: CmdCtx, bevel: boolean) {
	c.host.tool('Select')
	c.out(bevel ? `Chamfer distances ${fmt(chamferD[0])}, ${fmt(chamferD[1])}` : `Fillet radius ${fmt(filletR)}`)
	let first: { e: Ent; p: Pt } | null = null
	for (;;) {
		const a = await c.ask({ prompt: 'Select first line', ent: true, options: [bevel ? 'Distance' : 'Radius'] })
		if (a.kind === 'option') {
			if (bevel) { const d1 = await number(c, 'Specify first chamfer distance', chamferD[0]); chamferD = [d1, await number(c, 'Specify second chamfer distance', d1)] }
			else filletR = await number(c, 'Specify fillet radius', filletR)
			continue
		}
		if (a.kind !== 'ent') return
		const e = c.t.ents([a.id])[0]; if (!e || !isLine(e)) { c.out('Pick a line or polyline'); continue }
		first = { e, p: D(c, a.p) }; break
	}
	const b = await pickEnt(c, first.e.pts!.length > 2 ? 'Select the other segment of the corner (same polyline)' : 'Select second line'); if (!b) return
	if (first.e.pts!.length > 2) {   // a POLYLINE corner: the two picks are adjacent segments of it
		if (b.e.id !== first.e.id) throw new CmdError('Pick the other segment of the same polyline')
		const ps = first.e.pts!, segAt = (p: Pt) => { let best = 0, bd = Infinity; for (let i = 0; i + 1 < ps.length; i++) { const d = project([ps[i], ps[i + 1]], p).d; if (d < bd) { bd = d; best = i } } return best }
		const s1 = segAt(first.p), s2 = segAt(b.p)
		if (Math.abs(s1 - s2) !== 1) throw new CmdError('Pick two segments that meet at a corner')
		const pts = cornerInPolyline(ps, Math.max(s1, s2), bevel ? { chamfer: chamferD } : { r: filletR })
		if (!pts) throw new CmdError('Too short for that radius / distance')
		return c.t.apply({ update: [{ ...first.e, pts }] })
	}
	if (!isLine(b.e) || b.e.pts!.length !== 2 || b.e.id === first.e.id) throw new CmdError('Pick a second, different straight line')
	const r = corner(first.e.pts as [Pt, Pt], first.p, b.e.pts as [Pt, Pt], b.p, bevel ? { chamfer: chamferD } : { r: filletR })
	if (!r) throw new CmdError('They are parallel, or too short for that radius / distance')
	const { id: _id, groupId: _g, ...style } = first.e
	c.t.apply({ update: [{ ...first.e, pts: r.a }, { ...b.e, pts: r.b }],
		add: r.arc ? [c.t.newEnt({ ...style, type: 'arc', pts: r.arc })] : r.bevel ? [c.t.newEnt({ ...style, type: 'polyline', pts: r.bevel })] : [] })
}

async function zoomWindow(c: CmdCtx, first?: Pt) {
	const p = first ?? (await point(c, 'Specify first corner', undefined))
	const q = await point(c, 'Specify opposite corner', p, { box: true })
	c.t.zoomWindow(p, q)
}

export const SCRIPTS: Record<string, Script> = {
	move: async (c) => {
		await selection(c)
		const base = await point(c, 'Specify base point')
		const a = await c.ask({ prompt: 'Specify second point <use first point as displacement>', point: { base, ghost: (u) => c.t.preview({ move: sub(u, base) }) }, enter: true })
		const d = a.kind === 'point' ? sub(a.p, base) : base
		chk(c.t.move(d[0], d[1]))
	},
	copy: async (c) => {   // multiple: keep placing copies until Enter
		await selection(c)
		const base = await point(c, 'Specify base point')
		for (let first = true; ; first = false) {
			const a = await c.ask({ prompt: first ? 'Specify second point <use first point as displacement>' : 'Specify second point or <exit>', point: { base, ghost: (u) => c.t.preview({ move: sub(u, base) }) }, enter: true })
			if (a.kind !== 'point') { if (first) chk(c.t.copyBy(base[0], base[1])); return }
			const d = sub(a.p, base); chk(c.t.copyBy(d[0], d[1]))
		}
	},
	rotate: async (c) => {
		await selection(c)
		const base = await point(c, 'Specify base point')
		const a = await c.ask({ prompt: 'Specify rotation angle', number: true, point: { base, ghost: (u) => c.t.preview({ rotate: angleOf(base, u), base }) } })
		chk(c.t.rotate(a.kind === 'number' ? a.n : a.kind === 'point' ? angleOf(base, a.p) : 0, base))
	},
	scale: async (c) => {
		await selection(c)
		const base = await point(c, 'Specify base point')
		chk(c.t.scale(await number(c, 'Specify scale factor'), base))
	},
	dist: async (c) => {
		const p = await point(c, 'Specify first point')
		const q = await point(c, 'Specify second point', p)
		const [dx, dy] = sub(q, p)
		c.out(`Distance = ${fmt(Math.hypot(dx, dy))},  Angle = ${fmt(((angleOf(p, q) % 360) + 360) % 360)}°,  ΔX = ${fmt(dx)},  ΔY = ${fmt(dy)}`)
	},
	zoom: async (c) => {
		const a = await c.ask({ prompt: 'Specify corner of window, or', options: ['All', 'Extents', 'Previous', 'Window'], point: {}, def: 'Extents' })
		if (a.kind === 'point') return zoomWindow(c, a.p)
		if (a.kind !== 'option') return
		if (a.key === 'Window') return zoomWindow(c)
		if (a.key === 'Previous') return chk(c.t.zoomPrev())
		chk(c.host.run('fit'))
	},
	arc: async (c) => {   // 3-point
		c.host.tool('Select')
		const p0 = await point(c, 'Specify start point of arc')
		const p1 = await point(c, 'Specify second point of arc', p0)
		const p2 = await point(c, 'Specify end point of arc', p1, { ghost: (u) => [arcEnt(c, [p0, p1, u])] })
		add(c, arcEnt(c, [p0, p1, p2]))
	},
	circle: async (c) => {   // centre + radius (or Diameter)
		c.host.tool('Select')
		const ctr = await point(c, 'Specify center point for circle')
		const ghost = (k: number) => (u: Pt) => [circleEnt(c, ctr, Math.hypot(u[0] - ctr[0], u[1] - ctr[1]) * k)]
		let a = await c.ask({ prompt: 'Specify radius of circle', number: true, point: { base: ctr, ghost: ghost(1) }, options: ['Diameter'] })
		let k = 1
		if (a.kind === 'option') { k = 0.5; a = await c.ask({ prompt: 'Specify diameter of circle', number: true, point: { base: ctr, ghost: ghost(0.5) } }) }
		const r = (a.kind === 'number' ? a.n : a.kind === 'point' ? Math.hypot(a.p[0] - ctr[0], a.p[1] - ctr[1]) : 0) * k
		if (!(r > 0)) throw new CmdError('The radius must be positive')
		add(c, circleEnt(c, ctr, r))
	},
	polygon: async (c) => {
		c.host.tool('Select')
		const n = Math.round(await number(c, 'Enter number of sides', 4))
		if (n < 3 || n > 1024) throw new CmdError('3 to 1024 sides')
		const ctr = await point(c, 'Specify center of polygon')
		const o = await c.ask({ prompt: 'Enter an option', options: ['Inscribed in circle', 'Circumscribed about circle'], def: 'I' })
		const ins = o.kind !== 'option' || o.key.startsWith('I')
		const ent = (r: number, a0: number) => { const ps = polygonPts(ctr, n, r, a0, ins).map((u) => D(c, u)); return c.t.newEnt({ type: 'polyline', pts: [...ps, ps[0]] }) }
		const a = await c.ask({ prompt: 'Specify radius of circle', number: true, point: { base: ctr, ghost: (u) => [ent(Math.hypot(u[0] - ctr[0], u[1] - ctr[1]), Math.atan2(u[1] - ctr[1], u[0] - ctr[0]))] } })
		const r = a.kind === 'number' ? a.n : a.kind === 'point' ? Math.hypot(a.p[0] - ctr[0], a.p[1] - ctr[1]) : 0
		if (!(r > 0)) throw new CmdError('The radius must be positive')
		// a typed radius puts the first vertex (inscribed) / flat edge (circumscribed) straight down, like AutoCAD
		add(c, ent(r, a.kind === 'point' ? Math.atan2(a.p[1] - ctr[1], a.p[0] - ctr[0]) : -Math.PI / 2))
	},
	leader: async (c) => {   // an arrow to a note: a callout text with its leader tip
		c.host.tool('Select')
		const tip = await point(c, 'Specify leader arrowhead location')
		const at = await point(c, 'Specify leader landing location', tip)
		const a = await c.ask({ prompt: 'Enter the text', text: true, def: 'NOTE' })
		const s = a.kind === 'text' ? a.s : 'NOTE'
		add(c, c.t.newEnt({ type: 'text', a: D(c, at), text: s, callout: true, calloutBorder: 'underline', leader: D(c, tip) }))
	},
	offset: async (c) => {
		c.host.tool('Select')
		const d = await number(c, 'Specify offset distance', lastOffset)
		if (!(d > 0)) throw new CmdError('The distance must be positive')
		lastOffset = d
		for (;;) {
			const pk = await pickEnt(c, 'Select object to offset or <exit>', true); if (!pk) return
			const e = pk.e
			const s = await c.ask({ prompt: 'Specify point on side to offset', point: { ghost: (u) => { const o = offsetEnt(e, d, D(c, u)); return o ? [o] : [] } } })
			if (s.kind !== 'point') return
			const o = offsetEnt(e, d, D(c, s.p))
			if (!o) { c.out(e.type === 'polyline' || e.type === 'rect' || e.type === 'ellipse' || e.type === 'arc' ? 'It would collapse — pick the other side or a smaller distance' : 'OFFSET works on lines, polylines, rectangles, ellipses and arcs'); continue }
			const { id: _id, groupId: _g, ...base } = o
			add(c, c.t.newEnt(base))
		}
	},
	trim: async (c) => {   // quick mode: every other shape is a cutting edge
		c.host.tool('Select')
		for (;;) {
			const pk = await pickEnt(c, 'Select the part of a line to trim or <exit>', true); if (!pk) return
			const e = pk.e; if (!isLine(e)) { c.out('TRIM works on lines / polylines'); continue }
			const edges = c.t.visibleEnts().filter((x) => x.id !== e.id).flatMap(outline)
			const parts = trim(e.pts!, project(e.pts!, pk.p).s, crossings(e.pts!, edges))
			if (!parts) { c.out('Nothing crosses it there'); continue }
			replaceWith(c, e, parts)
		}
	},
	extend: async (c) => {   // the end nearer the click grows to the nearest shape beyond it
		c.host.tool('Select')
		for (;;) {
			const pk = await pickEnt(c, 'Select the end of a line to extend or <exit>', true); if (!pk) return
			const e = pk.e; if (!isLine(e)) { c.out('EXTEND works on lines / polylines'); continue }
			const edges = c.t.visibleEnts().filter((x) => x.id !== e.id).flatMap(outline)
			const pts = extend(e.pts!, project(e.pts!, pk.p).s < polyLength(e.pts!) / 2, edges)
			if (!pts) { c.out('No boundary beyond that end'); continue }
			c.t.apply({ update: [{ ...e, pts }] })
		}
	},
	break: async (c) => {
		c.host.tool('Select')
		const pk = await pickEnt(c, 'Select a line (the click is the first break point)'); if (!pk) return
		const e = pk.e; if (!isLine(e)) throw new CmdError('BREAK works on lines / polylines')
		const s1 = project(e.pts!, pk.p).s
		const b = await c.ask({ prompt: 'Specify second break point <the same point: split it>', point: {}, enter: true })
		replaceWith(c, e, breakAt(e.pts!, s1, b.kind === 'point' ? project(e.pts!, D(c, b.p)).s : s1))
	},
	lengthen: async (c) => {
		c.host.tool('Select')
		const o = await c.ask({ prompt: 'Enter an option', options: ['DElta', 'Percent', 'Total'], def: 'DE' })
		const mode = o.kind === 'option' ? o.key : 'DElta'
		const v = await number(c, mode === 'DElta' ? 'Enter delta length (negative shortens)' : mode === 'Percent' ? 'Enter percentage length' : 'Specify total length')
		for (;;) {
			const pk = await pickEnt(c, 'Select the end of a line / arc to change or <exit>', true); if (!pk) return
			const e = pk.e
			if (!isLine(e) && e.type !== 'arc') { c.out('LENGTHEN works on lines, polylines and arcs'); continue }
			const L = e.type === 'arc' ? arcLength(e) : polyLength(e.pts!)
			const len = mode === 'DElta' ? L + v : mode === 'Percent' ? (L * v) / 100 : v
			const atStart = e.type === 'arc' ? dist(pk.p, e.pts![0]) < dist(pk.p, e.pts![2]) : project(e.pts!, pk.p).s < L / 2
			const next = e.type === 'arc' ? setArcLength(e, atStart, len) : ((pts) => (pts ? { ...e, pts } : null))(setLength(e.pts!, atStart, len))
			if (!next) { c.out('The length must stay positive'); continue }
			c.t.apply({ update: [next] })
		}
	},
	align: async (c) => {   // ALIGN / DISTRIBUTE the selection (Properties › ARRANGE has the same as buttons)
		const ids = await selection(c)
		const a = await c.ask({ prompt: 'Align', options: ['Left', 'Center', 'Right', 'Top', 'Middle', 'Bottom', 'Horizontal spacing', 'Vertical spacing'], def: 'L' })
		if (a.kind !== 'option') return
		const op = ({ Left: 'left', Center: 'hcenter', Right: 'right', Top: 'top', Middle: 'vcenter', Bottom: 'bottom', 'Horizontal spacing': 'hspace', 'Vertical spacing': 'vspace' } as const)[a.key as 'Left']
		const out = arrange(c.t.ents(ids), op, (e) => c.t.bboxOf(e))
		if (!out.length) throw new CmdError(op.endsWith('space') ? 'Distribute needs 3 or more shapes (a group counts once)' : 'Nothing to move — they are already aligned')
		c.t.apply({ update: out })
	},
	array: async (c) => {
		await selection(c)
		const t = await c.ask({ prompt: 'Enter array type', options: ['Rectangular', 'Polar'], def: 'R' })
		if (t.kind === 'option' && t.key === 'Polar') {
			const ctr = await point(c, 'Specify center point of array')
			const n = Math.round(await number(c, 'Enter number of items (including the original)', 6))
			if (n < 2 || n > 1000) throw new CmdError('2 to 1000 items')
			const fill = await number(c, 'Specify the angle to fill (+ = counter-clockwise)', 360)
			const step = Math.abs(fill) >= 360 ? fill / n : fill / (n - 1)
			chk(c.t.copyMany(Array.from({ length: n - 1 }, (_, k) => ({ rotate: step * (k + 1), base: ctr }))))
			return
		}
		const cols = Math.round(await number(c, 'Enter the number of columns', 4))
		const rows = Math.round(await number(c, 'Enter the number of rows', 1))
		if (cols < 1 || rows < 1 || cols * rows > 2500) throw new CmdError('1 × 1 to 2500 items')
		if (cols * rows === 1) return
		const dx = cols > 1 ? await number(c, 'Specify the distance between columns (− = to the left)') : 0
		const dy = rows > 1 ? await number(c, 'Specify the distance between rows (− = downward)') : 0
		const ops = []
		for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) if (r || k) ops.push({ move: [k * dx, r * dy] as Pt })
		chk(c.t.copyMany(ops))
		c.out(`${ops.length} cop${ops.length === 1 ? 'y' : 'ies'} placed`)
	},
	mirror: async (c) => {
		await selection(c)
		const p1 = await point(c, 'Specify first point of mirror line')
		const p2 = await point(c, 'Specify second point of mirror line', p1, { ghost: (u) => (Math.hypot(u[0] - p1[0], u[1] - p1[1]) > 1e-6 ? c.t.preview({ mirror: [p1, u] }) : []) })
		if (Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) < 1e-6) throw new CmdError('The two points must differ')
		const e = await c.ask({ prompt: 'Erase source objects?', options: ['Yes', 'No'], def: 'N' })
		chk(e.kind === 'option' && e.key === 'Yes' ? c.t.transform({ mirror: [p1, p2] }) : c.t.copyMany([{ mirror: [p1, p2] }]))
	},
	matchprop: async (c) => {   // the source's layer + style onto each shape clicked after it
		c.host.tool('Select')
		const src = await pickEnt(c, 'Select source object'); if (!src) return
		const s = src.e, KEYS = ['layer', 'color', 'fill', 'weight', 'dash'] as const, TEXT = ['fontPt', 'align', 'valign'] as const
		for (;;) {
			const d = await pickEnt(c, 'Select destination object(s) or <exit>', true); if (!d) return
			const out: Ent = { ...d.e }
			for (const k of KEYS) { if (s[k] === undefined) delete out[k]; else (out as Record<string, unknown>)[k] = s[k] }
			if (s.type === 'text' && d.e.type === 'text') for (const k of TEXT) { if (s[k] === undefined) delete out[k]; else (out as Record<string, unknown>)[k] = s[k] }
			c.t.apply({ update: [out] })
		}
	},
	selectsimilar: async (c) => {   // the same type + layer (a block insert: the same block) as anything selected
		const ids = c.t.selected(); if (!ids.length) throw new CmdError('Select a shape first')
		const keys = new Set(c.t.ents(ids).map((e) => `${e.type}|${e.layer ?? ''}|${e.type === 'insert' ? e.block : ''}`))
		c.t.selectAll((e) => keys.has(`${e.type}|${e.layer ?? ''}|${e.type === 'insert' ? e.block : ''}`))
		c.out(`${c.t.selected().length} selected`)
	},
	layoff: (c) => layerPicks(c, 'off', 'Select a shape on the layer to turn off or <exit>'),
	layfrz: (c) => layerPicks(c, 'frz', 'Select a shape on the layer to freeze (in the active viewport, else everywhere) or <exit>'),
	layiso: async (c) => {   // the selection's layers (else a picked shape's) stay; every other layer goes off
		let ids = c.t.selected()
		if (!ids.length) { const pk = await pickEnt(c, 'Select a shape on the layer to isolate'); if (!pk) return; ids = [pk.e.id] }
		const ls = [...new Set(c.t.ents(ids).map((e) => e.layer).filter((x): x is string => !!x))]
		if (!ls.length) throw new CmdError('Those shapes have no layer')
		layerMsg(c, c.host.layerOp('iso', ls))
	},
	layuniso: async (c) => layerMsg(c, c.host.layerOp('uniso', [])),
	layon: async (c) => layerMsg(c, c.host.layerOp('on', [])),
	stretch: async (c) => {   // a crossing window: what's inside moves, what crosses it stretches
		c.host.tool('Select')
		const w1 = await point(c, 'Select what to stretch by a crossing window: first corner')
		const w2 = await point(c, 'Specify opposite corner', w1, { box: true })
		const a = D(c, w1), b = D(c, w2), box: [number, number, number, number] = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]
		const src = c.t.pickableEnts().filter((e) => stretchEnt(e, box, 0, 0))
		if (!src.length) throw new CmdError('Nothing in that window')
		c.out(`${src.length} shape${src.length > 1 ? 's' : ''}`)
		const base = await point(c, 'Specify base point')
		const delta = (u: Pt): [number, number] => { const p = D(c, base), q = D(c, u); return [q[0] - p[0], q[1] - p[1]] }
		const run = (u: Pt) => src.map((e) => stretchEnt(e, box, ...delta(u))!).filter(Boolean)
		const q = await point(c, 'Specify second point', base, { ghost: run })
		c.t.apply({ update: run(q) })
	},
	qselect: async (c) => {   // select every shape here matching a type / layer / colour / block
		c.host.tool('Select')
		const all = c.t.pickableEnts()
		const k = await c.ask({ prompt: 'Select by', options: ['Type', 'Layer', 'Colour', 'Block'], def: 'T' })
		if (k.kind !== 'option') return
		const TYPES: Record<string, Ent['type']> = { Rectangle: 'rect', Ellipse: 'ellipse', Line: 'polyline', Arc: 'arc', Dimension: 'dim', Text: 'text', Image: 'image', Block: 'insert' }
		let keep: (e: Ent) => boolean
		if (k.key === 'Type') {
			const present = Object.entries(TYPES).filter(([, t]) => all.some((e) => e.type === t)).map(([n]) => n)
			const a = await c.ask({ prompt: 'Which type', options: present })
			if (a.kind !== 'option') return
			keep = (e) => e.type === TYPES[a.key]
		} else {
			const names = k.key === 'Layer' ? c.host.layers().filter((l) => all.some((e) => e.layer === l.id))
				: k.key === 'Block' ? c.host.blocks().filter((b) => all.some((e) => e.block === b.id))
				: [...new Set(all.map((e) => e.color ?? 'ByLayer'))].map((x) => ({ id: x, name: x }))
			const a = await c.ask({ prompt: `Which ${k.key.toLowerCase()} (${names.map((n) => n.name).join(', ') || 'none here'})`, text: true })
			if (a.kind !== 'text') return
			const hit = names.find((n) => n.name.toLowerCase() === a.s.trim().toLowerCase()) ?? names.find((n) => n.name.toLowerCase().startsWith(a.s.trim().toLowerCase()))
			if (!hit) throw new CmdError(`No ${k.key.toLowerCase()} “${a.s}” here`)
			keep = k.key === 'Layer' ? (e) => e.layer === hit.id : k.key === 'Block' ? (e) => e.block === hit.id : (e) => (e.color ?? 'ByLayer') === hit.id
		}
		c.t.selectAll(keep)
		c.out(`${c.t.selected().length} selected`)
	},
	purge: async (c) => {   // unused CUSTOM blocks (layers: a later todo)
		const u = c.host.blockUsage(), unused = c.host.blocks().filter((b) => b.custom && !u.used.has(b.id))
		if (!unused.length) return c.out(`No unused custom blocks (checked ${u.models} loaded model${u.models === 1 ? '' : 's'})`)
		c.out(`Unused custom blocks: ${unused.map((b) => b.name).join(', ')}`)
		c.out(`The block library is SHARED by every project, and only this project's ${u.models} loaded model${u.models === 1 ? ' was' : 's were'} checked — another project may use them.`)
		const a = await c.ask({ prompt: `Delete these ${unused.length} from the library?`, options: ['Yes', 'No'], def: 'N' })
		if (a.kind === 'option' && a.key === 'Yes') { c.host.deleteBlocks(unused.map((b) => b.id)); c.out(`Deleted ${unused.length} block${unused.length > 1 ? 's' : ''}`) }
	},
	audit: async (c) => {   // block inserts whose block is gone from the library
		const u = c.host.blockUsage()
		if (!u.missing.length) return c.out(`Blocks OK — every block insert has its block (${u.models} loaded model${u.models === 1 ? '' : 's'})`)
		const byModel = new Map<string, number>(); for (const m of u.missing) byModel.set(m.model, (byModel.get(m.model) ?? 0) + 1)
		c.out(`${u.missing.length} insert${u.missing.length > 1 ? 's' : ''} of a missing block: ${[...byModel].map(([m, n]) => `${m} ${n}`).join(', ')} — drawn as a crossed box`)
		const here = new Set(u.missing.map((m) => m.id)), inView = c.t.pickableEnts().filter((e) => here.has(e.id)).map((e) => e.id)
		if (inView.length) { c.t.select(inView); c.out(`${inView.length} of them selected here (Delete removes them, or swap their block in Properties)`) }
	},
	view: async (c) => {   // NAMED VIEWS: Save / Restore / Delete this drawing's zoom + pan + scale
		const vs = c.host.namedViews(), names = Object.keys(vs)
		const a = await c.ask({ prompt: `Views${names.length ? ` (${names.join(', ')})` : ' (none saved)'}`, options: ['Save', 'Restore', 'Delete'], def: names.length ? 'R' : 'S' })
		if (a.kind !== 'option') return
		if (a.key === 'Save') {
			const n = await c.ask({ prompt: 'Enter a name for this view', text: true }); if (n.kind !== 'text' || !n.s.trim()) return
			c.host.saveNamedViews({ ...vs, [n.s.trim()]: c.t.viewState() }); return c.out(`View “${n.s.trim()}” saved`)
		}
		if (!names.length) throw new CmdError('No views saved for this drawing yet — VIEW › Save')
		const n = await c.ask({ prompt: `Which view (${names.join(', ')})`, text: true, options: names.length <= 8 ? names : undefined })
		const key = n.kind === 'text' || n.kind === 'option' ? (n.kind === 'text' ? n.s : n.key).trim().toLowerCase() : ''
		const name = names.find((x) => x.toLowerCase() === key) ?? names.find((x) => x.toLowerCase().startsWith(key))
		if (!name) throw new CmdError(`No view “${key}”`)
		if (a.key === 'Delete') { const { [name]: _gone, ...rest } = vs; c.host.saveNamedViews(rest); return c.out(`View “${name}” deleted`) }
		c.t.restoreView(vs[name]); c.out(`View “${name}”`)
	},
	dimangular: async (c) => {   // two lines, then where the arc goes (it picks which of the four angles): an arc + its figure, grouped
		c.host.tool('Select')
		const a = await pickEnt(c, 'Select first line'); if (!a) return
		const b = await pickEnt(c, 'Select second line'); if (!b) return
		const seg = (pk: { e: Ent; p: Pt }): [Pt, Pt] | null => {
			const ps = pk.e.type === 'polyline' ? pk.e.pts ?? [] : pk.e.type === 'dim' ? [pk.e.a!, pk.e.b!] : []
			if (ps.length < 2) return null
			let best: [Pt, Pt] = [ps[0], ps[1]], bd = Infinity
			for (let i = 0; i + 1 < ps.length; i++) { const d = project([ps[i], ps[i + 1]], pk.p).d; if (d < bd) { bd = d; best = [ps[i], ps[i + 1]] } }
			return best
		}
		const l1 = seg(a), l2 = seg(b); if (!l1 || !l2) throw new CmdError('Pick two lines')
		const X = lineIntersect(l1, l2); if (!X) throw new CmdError('The lines are parallel')
		const unit = (l: [Pt, Pt]): Pt => { const dx = l[1][0] - l[0][0], dy = l[1][1] - l[0][1], L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L] }
		const u1 = unit(l1), u2 = unit(l2), pm = c.t.paperMm()
		const build = (P: Pt): Ent[] => {
			const pd = [P[0] - X[0], P[1] - X[1]] as Pt, r = Math.hypot(...pd) || 1, pu: Pt = [pd[0] / r, pd[1] / r]
			// the two rays (±u1, ±u2) that enclose the pick direction: each within the other's angle of it
			let d1: Pt = u1, d2: Pt = u2, best = -Infinity
			for (const s1 of [1, -1]) for (const s2 of [1, -1]) {
				const q1: Pt = [u1[0] * s1, u1[1] * s1], q2: Pt = [u2[0] * s2, u2[1] * s2]
				const bis: Pt = [q1[0] + q2[0], q1[1] + q2[1]], bl = Math.hypot(...bis) || 1, sc = (bis[0] * pu[0] + bis[1] * pu[1]) / bl
				if (sc > best) { best = sc; d1 = q1; d2 = q2 }
			}
			const bis: Pt = [d1[0] + d2[0], d1[1] + d2[1]], bl = Math.hypot(...bis) || 1, bu: Pt = [bis[0] / bl, bis[1] / bl]
			const at = (u: Pt, k: number): Pt => [X[0] + u[0] * k, X[1] + u[1] * k]
			const deg = (Math.acos(Math.max(-1, Math.min(1, d1[0] * d2[0] + d1[1] * d2[1]))) * 180) / Math.PI
			const label = (Math.round(deg * 10) / 10).toString().replace(/\.0$/, '') + '°'
			const arc = c.t.newEnt({ type: 'arc', pts: [at(d1, r), at(bu, r), at(d2, r)] }), txt = c.t.newEnt({ type: 'text', a: at(bu, r + 4 * pm), text: label, align: 'center', valign: 'middle' })
			return [arc, txt]
		}
		const p = await point(c, 'Specify dimension arc location', undefined, { ghost: (u) => build(D(c, u)) })
		const [arc, txt] = build(D(c, p)), gid = 'g' + arc.id
		c.t.apply({ add: [{ ...arc, groupId: gid }, { ...txt, groupId: gid }] })
	},
	dimcontinue: (c) => dimChain(c, false),
	dimbaseline: (c) => dimChain(c, true),
	dimradius: (c) => dimCircle(c, false),
	dimdiameter: (c) => dimCircle(c, true),
	revcloud: async (c) => {   // Rectangular (two corners), Polygonal (points, Enter closes) or Object (a rect / closed polyline)
		c.host.tool('Select')
		const a = await c.ask({ prompt: 'Specify first corner, or', options: ['Polygonal', 'Object'], point: {} })
		if (a.kind === 'point') {
			const q = await point(c, 'Specify opposite corner', a.p, { box: true, ghost: (u) => [c.t.newEnt({ type: 'rect', a: D(c, a.p), b: D(c, u), cloud: true })] })
			return add(c, c.t.newEnt({ type: 'rect', a: D(c, a.p), b: D(c, q), cloud: true }))
		}
		if (a.kind !== 'option') return
		if (a.key === 'Object') {
			const pk = await pickEnt(c, 'Select a rectangle or a closed polyline'); if (!pk) return
			const e = pk.e, closed = e.type === 'polyline' && (e.pts?.length ?? 0) > 3 && dist(e.pts![0], e.pts![e.pts!.length - 1]) < 1e-6
			if (e.type !== 'rect' && !closed) throw new CmdError('REVCLOUD Object needs a rectangle or a closed polyline')
			return c.t.apply({ update: [{ ...e, cloud: true }] })
		}
		const us: Pt[] = [await point(c, 'Specify first point')]
		for (;;) {
			const b = await c.ask({ prompt: us.length < 3 ? 'Specify next point' : 'Specify next point or <Enter closes>', point: { base: us[us.length - 1], ghost: (u) => [c.t.newEnt({ type: 'polyline', pts: [...us, u, us[0]].map((x) => D(c, x)), cloud: us.length >= 2 })] }, enter: us.length >= 3 })
			if (b.kind !== 'point') break
			us.push(b.p)
		}
		const ps = us.map((x) => D(c, x))
		add(c, c.t.newEnt({ type: 'polyline', pts: [...ps, ps[0]], cloud: true }))
	},
	join: async (c) => {   // end-to-end lines → one polyline per chain (the first line keeps its style + id)
		const ids = await selection(c)
		const lines = c.t.ents(ids).filter(isLine)
		const chains = joinChains(lines.map((e) => e.pts!), 1)
		if (!chains.length) throw new CmdError('No lines meet end to end (JOIN works on lines / polylines)')
		c.t.apply({ update: chains.map((ch) => ({ ...lines[ch.idx[0]], pts: ch.pts })), remove: chains.flatMap((ch) => ch.idx.slice(1).map((i) => lines[i].id)) })
		c.t.select(chains.map((ch) => lines[ch.idx[0]].id))
		c.out(`${chains.reduce((t, ch) => t + ch.idx.length, 0)} lines joined into ${chains.length} polyline${chains.length > 1 ? 's' : ''}`)
	},
	explode: async (c) => {
		const ids = await selection(c)
		const r = c.t.explode(ids)
		if (!r.done) throw new CmdError('Nothing to explode — polylines, rectangles, blocks and groups explode')
		c.out(`Exploded ${r.done}${r.skipped ? ` (${r.skipped} can't be exploded)` : ''}`)
	},
	fillet: (c) => cornerCmd(c, false),
	chamfer: (c) => cornerCmd(c, true),
	draworder: async (c) => {
		const ids = await selection(c)
		const a = await c.ask({ prompt: 'Enter object ordering option', options: ['Front', 'Back', 'Above', 'Under'], def: 'Front' })
		if (a.kind !== 'option') return
		c.t.reorder(ids, a.key === 'Front' ? 'front' : a.key === 'Back' ? 'back' : a.key === 'Above' ? 'forward' : 'backward')
	},
	newlayer: async (c) => {
		const a = await c.ask({ prompt: 'Enter name for new layer', text: true })
		if (a.kind !== 'text') return
		const r = c.host.newLayer(a.s); if (typeof r === 'string') throw new CmdError(r)
		c.out(`Layer “${r.name}” created — it is now the current layer`)
	},
	laymcur: async (c) => {   // the layer of a shape becomes current (the selected one, else pick one)
		const sel = c.t.selected()
		const id = sel.length === 1 ? sel[0] : ((await c.ask({ prompt: 'Select a shape whose layer will become current', ent: true })) as { id: string }).id
		const e = c.t.ents([id])[0]; if (!e?.layer) throw new CmdError('That shape has no layer')
		const r = c.host.setCurrentLayer(e.layer); if (typeof r === 'string') throw new CmdError(r)
		c.out(`“${r.name}” is now the current layer`)
	},
	svgout: async (c) => {
		const s = c.t.svg(); if (!s) throw new CmdError('No view to export')
		const name = c.host.exportName() + '.svg'
		download(new Blob([svgMarkup(s)], { type: 'image/svg+xml' }), name)
		c.out(`Saved ${name} — the view as it is on screen`)
	},
	pngout: async (c) => {
		const s = c.t.svg(); if (!s) throw new CmdError('No view to export')
		const name = c.host.exportName() + '.png'
		download(await svgToPng(svgMarkup(s), s.clientWidth || 800, s.clientHeight || 600), name)
		c.out(`Saved ${name} (2× the on-screen size)`)
	},
	pdf: async (c) => {
		chk(c.host.run('plot'))
		c.out('Print → choose “Save as PDF” as the printer (a sheet prints at its true paper size)')
	},
	zoomwin: (c) => zoomWindow(c),
	zoomprev: async (c) => chk(c.t.zoomPrev()),
}
