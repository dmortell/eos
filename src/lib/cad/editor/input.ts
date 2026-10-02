// Typed points while drawing (ADR 0005 "typed input"). The text is read like AutoCAD, Y UP: in a plan that's up the
// sheet, in an elevation it's height. Results are VIEW points (y down on screen), ready to hand to a tool.
//   x,y        absolute            @dx,dy     relative to the last point
//   d<a        polar from 0,0      @d<a       polar from the last point (a = degrees, anticlockwise from +x)
//   d          direct distance: d mm from the last point towards the cursor
import type { Pt } from '../domain/types'

export type Typed = { kind: 'point'; p: Pt } | { kind: 'error'; message: string }

const NUM = /^-?\d+(\.\d+)?$|^-?\.\d+$/

export function parseTyped(text: string, last: Pt | null, cursor: Pt | null): Typed {
	let t = text.trim().replace(/\s+/g, '')
	if (!t) return { kind: 'error', message: 'Type a point: x,y · @dx,dy · @d<angle · or a distance' }
	if (NUM.test(t)) {
		if (!last) return { kind: 'error', message: 'Pick or type a first point before a distance' }
		const d = Number(t), dx = (cursor?.x ?? last.x + 1) - last.x, dy = (cursor?.y ?? last.y) - last.y, len = Math.hypot(dx, dy)
		return len ? { kind: 'point', p: { x: last.x + (dx / len) * d, y: last.y + (dy / len) * d } } : { kind: 'point', p: { x: last.x + d, y: last.y } }
	}
	const rel = t.startsWith('@')
	if (rel) t = t.slice(1)
	if (rel && !last) return { kind: 'error', message: '@ is relative to the last point — there is none yet' }
	let ux: number, uy: number   // typed, Y up
	if (t.includes('<')) {
		const [d, a] = t.split('<')
		if (!NUM.test(d) || !NUM.test(a)) return { kind: 'error', message: `Can't read “${text}” — polar is d<angle` }
		const r = (Number(a) * Math.PI) / 180
		ux = Number(d) * Math.cos(r); uy = Number(d) * Math.sin(r)
	} else {
		const xy = t.split(',')
		if (xy.length !== 2 || !xy.every((v) => NUM.test(v))) return { kind: 'error', message: `Can't read “${text}” — type x,y or @dx,dy` }
		ux = Number(xy[0]); uy = Number(xy[1])
	}
	const clean = (n: number) => (Math.abs(n) < 1e-9 ? 0 : n)   // cos 90° etc. → exact 0, never −0
	const v = { x: clean(ux), y: clean(-uy) }   // Y up → view y down
	return { kind: 'point', p: rel && last ? { x: last.x + v.x, y: last.y + v.y } : v }
}
