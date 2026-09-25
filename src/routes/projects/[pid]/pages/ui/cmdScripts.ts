// SCRIPTED commands for the command line (AutoCAD style): each is an async function that asks for what it needs —
// "Specify base point:" — and then edits through the viewport's command target. Answers come from typed tokens or
// viewport clicks (ui/commandRunner.svelte.ts routes them). Coordinates are USER coords (model mm, Y up); angles
// are degrees CCW from +X.
import { dist, type Pt, type Ent } from './geometry'
import type { VpCommandTarget } from './cmdBus.svelte'
import { svgMarkup, svgToPng, download } from './svgExport'
import { arrange } from './arrange'
import { offsetEnt, outline, crossings, trim, extend, breakAt, setLength, polyLength, project, arcLength, setArcLength, joinChains, corner } from './modify'

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
		const e = c.t.ents([a.id])[0]; if (!e || !isLine(e) || e.pts!.length !== 2) { c.out('Pick a straight line (a 2-point line)'); continue }
		first = { e, p: D(c, a.p) }; break
	}
	const b = await pickEnt(c, 'Select second line'); if (!b) return
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
