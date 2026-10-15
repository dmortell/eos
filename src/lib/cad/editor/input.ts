// Typed points while drawing (ADR 0005 "typed input"). The numbers are the MODEL's, the same as Properties show
// (User: "typed y-points must be consistent with the rest of the model"): in a plan or on a sheet x,y are the stored
// coordinates (y down the sheet); in an elevation (`yUp`) y is HEIGHT, as Properties show Z. Results are VIEW points
// (y down on screen), ready to hand to a tool.
//   x,y        absolute            @dx,dy     relative to the last point
//   d<a        polar from 0,0      @d<a       polar from the last point (a = degrees, anticlockwise on screen from +x)
//   d          direct distance: d mm from the last point towards the cursor
import type { Pt } from '../domain/types'
import type { Tool, ToolCtx } from './tools'

export type Typed = { kind: 'point'; p: Pt } | { kind: 'error'; message: string }

const NUM = /^-?\d+(\.\d+)?$|^-?\.\d+$/

/** A numpad has no comma (User 2026-10-14): `..` types one — `1200..600` = `1200,600`. A single `.` stays a decimal point. */
export const numpadCommas = (text: string): string => text.replace(/\.\./g, ',')

/** What the typing box's text does to the active tool: a value the tool reads itself first (Rotate's angle, a box's
 *  width,depth — null = taken), else a point (x,y · @dx,dy · @d<a · a distance towards the cursor). Returns an error
 *  to show, or null. (A taken value must NOT be read again as a point: a second box started at "1200,600".) */
export function typeInto(tool: Pick<Tool, 'typed' | 'typedText' | 'lastPoint'>, text0: string, c: ToolCtx, cursor: Pt | null, yUp: boolean): string | null {
	if (!tool.typed) return 'This tool takes no typed points'
	const text = numpadCommas(text0)
	const own = tool.typedText ? tool.typedText(text, c) : false
	if (own !== false) return own
	const r = parseTyped(text, tool.lastPoint?.(c) ?? null, cursor, yUp)
	if (r.kind === 'error') return r.message
	tool.typed(r.p, c)
	return null
}

export function parseTyped(text: string, last: Pt | null, cursor: Pt | null, yUp = false): Typed {
	let t = numpadCommas(text.trim().replace(/\s+/g, ''))
	if (!t) return { kind: 'error', message: 'Type a point: x,y · @dx,dy · @d<angle · or a distance' }
	if (NUM.test(t)) {
		if (!last) return { kind: 'error', message: 'Pick or type a first point before a distance' }
		const d = Number(t), dx = (cursor?.x ?? last.x + 1) - last.x, dy = (cursor?.y ?? last.y) - last.y, len = Math.hypot(dx, dy)
		return len ? { kind: 'point', p: { x: last.x + (dx / len) * d, y: last.y + (dy / len) * d } } : { kind: 'point', p: { x: last.x + d, y: last.y } }
	}
	const rel = t.startsWith('@')
	if (rel) t = t.slice(1)
	if (rel && !last) return { kind: 'error', message: '@ is relative to the last point — there is none yet' }
	let vx: number, vy: number   // in VIEW terms (y down on screen)
	if (t.includes('<')) {
		const [d, a] = t.split('<')
		if (!NUM.test(d) || !NUM.test(a)) return { kind: 'error', message: `Can't read “${text}” — polar is d<angle` }
		const r = (Number(a) * Math.PI) / 180
		vx = Number(d) * Math.cos(r); vy = -Number(d) * Math.sin(r)   // anticlockwise as seen
	} else {
		const xy = t.split(',')
		if (xy.length !== 2 || !xy.every((v) => NUM.test(v))) return { kind: 'error', message: `Can't read “${text}” — type x,y or @dx,dy` }
		vx = Number(xy[0]); vy = yUp ? -Number(xy[1]) : Number(xy[1])   // an elevation's y is height
	}
	const clean = (n: number) => (Math.abs(n) < 1e-9 ? 0 : n)   // cos 90° etc. → exact 0, never −0
	const v = { x: clean(vx), y: clean(vy) }
	return { kind: 'point', p: rel && last ? { x: last.x + v.x, y: last.y + v.y } : v }
}
