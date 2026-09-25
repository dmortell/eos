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
}
/** What a command asks for. Any combination; `options` are matched by their leading letters. */
export type Want = {
	prompt: string
	/** a point: typed X,Y / @DX,DY (relative to `base`) / a distance toward the cursor, or a click; `box` draws the
	 *  rubber band as a rectangle (a window) */
	point?: { base?: Pt; ghost?: (u: Pt) => Ent[]; box?: boolean }
	ent?: boolean
	number?: boolean
	enter?: boolean
	options?: string[]
	/** used for an empty Enter (shown as <default>) */
	def?: string
}
export type Answer = { kind: 'point'; p: Pt } | { kind: 'number'; n: number } | { kind: 'ent'; id: string; p: Pt } | { kind: 'enter' } | { kind: 'option'; key: string }
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
	zoomwin: (c) => zoomWindow(c),
	zoomprev: async (c) => chk(c.t.zoomPrev()),
}
