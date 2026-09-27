// ALIGN / DISTRIBUTE the selection (Properties › ARRANGE, and the ALIGN command). A GROUP moves as one unit (its
// members' union box). Align lines every unit up with the extreme one (the left-most left edge, the top-most top, …)
// or the selection's centre line; distribute spaces units so the GAPS between them are equal, the first and last
// staying put. Pure: drawing coords, y down ("top" = smallest y). `arrangeMoves` works on ANY items (shapes, 3D
// objects — the viewport measures each as drawn and moves it through the editing engine); `arrange` is the shapes-only
// form the Properties panel / tests use.
import { translate, type Ent } from './geometry'

export type AlignOp = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom' | 'hspace' | 'vspace'
type Box = [number, number, number, number]
type Unit<T> = { items: T[]; box: Box }

function units<T>(items: T[], bbox: (t: T) => Box, groupOf: (t: T) => string | undefined): Unit<T>[] {
	const by = new Map<string, T[]>()
	items.forEach((t, i) => { const g = groupOf(t), k = g ? 'g:' + g : 'e:' + i; by.set(k, [...(by.get(k) ?? []), t]) })
	return [...by.values()].map((ts) => {
		const bs = ts.map(bbox)
		return { items: ts, box: [Math.min(...bs.map((b) => b[0])), Math.min(...bs.map((b) => b[1])), Math.max(...bs.map((b) => b[2])), Math.max(...bs.map((b) => b[3]))] }
	})
}

/** Each item that moves under `op`, with its (dx, dy). Needs ≥ 2 units (≥ 3 to distribute); else none. */
export function arrangeMoves<T>(items: T[], op: AlignOp, bbox: (t: T) => Box, groupOf: (t: T) => string | undefined = () => undefined): [T, number, number][] {
	const us = units(items, bbox, groupOf)
	if (us.length < (op === 'hspace' || op === 'vspace' ? 3 : 2)) return []
	const dx = new Map<Unit<T>, [number, number]>()
	if (op === 'hspace' || op === 'vspace') {
		const lo = op === 'hspace' ? 0 : 1, hi = lo + 2
		const s = [...us].sort((a, b) => a.box[lo] - b.box[lo])
		const span = s[s.length - 1].box[hi] - s[0].box[lo], sizes = s.reduce((t, u) => t + u.box[hi] - u.box[lo], 0)
		const gap = (span - sizes) / (s.length - 1)
		let at = s[0].box[hi] + gap
		for (const u of s.slice(1, -1)) { const d = at - u.box[lo]; dx.set(u, lo === 0 ? [d, 0] : [0, d]); at += u.box[hi] - u.box[lo] + gap }
	} else {
		const horiz = op === 'left' || op === 'hcenter' || op === 'right'
		const lo = horiz ? 0 : 1, hi = lo + 2
		const target = op === 'left' || op === 'top' ? Math.min(...us.map((u) => u.box[lo]))
			: op === 'right' || op === 'bottom' ? Math.max(...us.map((u) => u.box[hi]))
			: (Math.min(...us.map((u) => u.box[lo])) + Math.max(...us.map((u) => u.box[hi]))) / 2
		for (const u of us) {
			const cur = op === 'left' || op === 'top' ? u.box[lo] : op === 'right' || op === 'bottom' ? u.box[hi] : (u.box[lo] + u.box[hi]) / 2
			const d = target - cur
			dx.set(u, horiz ? [d, 0] : [0, d])
		}
	}
	return [...dx].filter(([, d]) => Math.abs(d[0]) > 1e-9 || Math.abs(d[1]) > 1e-9).flatMap(([u, d]) => u.items.map((t): [T, number, number] => [t, d[0], d[1]]))
}

/** The shapes after `op` (only the ones that moved). */
export function arrange(ents: Ent[], op: AlignOp, bbox: (e: Ent) => Box): Ent[] {
	return arrangeMoves(ents, op, bbox, (e) => e.groupId).map(([e, x, y]) => translate(e, x, y))
}
