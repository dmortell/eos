// D6: auto-number a selection of shapes — each gets the next number of a template in reading order.
// The template's run of `#` is the number, zero-padded to the run's length (`R-###` → R-001, R-002…);
// a template without `#` gets the number appended. Texts take it as their text, block inserts as one
// attribute (TAG), 2-point / poly lines as their label.
import type { Ent, Pt } from './geometry'

export type NumberOrder = 'rows' | 'cols'
export interface AutoNumberOpts {
	template: string
	start: number
	step: number
	/** rows = across then down (x within a row of similar y); cols = down then across. */
	order: NumberOrder
	/** Insert attribute to write (block inserts only); texts/lines ignore it. */
	tag?: string
	/** Two anchors closer than this (model mm) on the cross axis count as the same row / column. */
	tol?: number
}

/** The label for the i-th item (0-based). */
export function formatNumber(template: string, n: number): string {
	const m = /#+/.exec(template)
	if (!m) return template + n
	const s = String(Math.abs(n)).padStart(m[0].length, '0')
	return template.slice(0, m.index) + (n < 0 ? '-' : '') + s + template.slice(m.index + m[0].length)
}

function anchor(e: Ent): Pt {
	if (e.type === 'polyline') return e.pts?.[0] ?? [0, 0]
	return e.a ?? [0, 0]
}

/** Can this shape take a number (with this attribute tag for inserts)? */
export function numberable(e: Ent, tag?: string): boolean {
	return e.type === 'text' || e.type === 'polyline' || (e.type === 'insert' && !!tag)
}

/** Sort in reading order: cluster on the cross axis within `tol`, then along the main axis. */
export function readingOrder(ents: Ent[], order: NumberOrder, tol = 1): Ent[] {
	const [ci, mi] = order === 'rows' ? [1, 0] : [0, 1]   // cross-axis index, main-axis index
	const byCross = [...ents].sort((a, b) => anchor(a)[ci] - anchor(b)[ci])
	const bands: Ent[][] = []
	let ref = -Infinity
	for (const e of byCross) {
		const v = anchor(e)[ci]
		if (!bands.length || v - ref > tol) { bands.push([e]); ref = v } else bands[bands.length - 1].push(e)
	}
	return bands.flatMap((b) => b.sort((a, c) => anchor(a)[mi] - anchor(c)[mi]))
}

/** The renumbered copies (only the shapes that can take a number), in the order they were numbered. */
export function autoNumber(ents: Ent[], o: AutoNumberOpts): Ent[] {
	const todo = readingOrder(ents.filter((e) => numberable(e, o.tag)), o.order, o.tol)
	return todo.map((e, i) => {
		const v = formatNumber(o.template, o.start + i * o.step)
		return e.type === 'insert' ? { ...e, attrs: { ...(e.attrs ?? {}), [o.tag!]: v } } : { ...e, text: v }
	})
}
