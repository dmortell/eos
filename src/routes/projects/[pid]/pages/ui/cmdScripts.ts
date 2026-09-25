// SCRIPTED commands for the command line (AutoCAD style): each is an async function that asks for what it needs —
// "Specify base point:" — and then edits through the viewport's command target. Answers come from typed tokens or
// viewport clicks (ui/commandRunner.svelte.ts routes them). Coordinates are USER coords (model mm, Y up); angles
// are degrees CCW from +X.
import type { Pt, Ent } from './geometry'
import type { VpCommandTarget } from './cmdBus.svelte'

export type CmdHost = {
	/** Arm a tool in the focused pane ('Line', 'Rectangle', … or 'Select'). */
	tool(name: string): void
	run(id: string): string | void   // every other command (views, toggles, panels, files) — may return an error
	/** NEWLAYER: add a layer to the focused model and make it current; LAYMCUR: make a layer current. Both return
	 *  the layer's name, or an error. */
	newLayer(name: string): { name: string } | string
	setCurrentLayer(id: string): { name: string } | string
}
/** What a command asks for. Any combination; `options` are matched by their leading letters. */
export type Want = {
	prompt: string
	/** a point: typed X,Y / @DX,DY (relative to `base`) / a distance toward the cursor, or a click; `box` draws the
	 *  rubber band as a rectangle (a window) */
	point?: { base?: Pt; ghost?: (u: Pt) => Ent[]; box?: boolean }
	ent?: boolean
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
		const a = await c.ask({ prompt: 'Select shapes (click; Shift adds), then Enter', enter: true })
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
	zoomwin: (c) => zoomWindow(c),
	zoomprev: async (c) => chk(c.t.zoomPrev()),
}
