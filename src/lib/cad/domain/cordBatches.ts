// CORD LABEL BATCHES (backlog "Cord label batches by type, length and color", User 2026-10-11): the patch cords bought,
// as batches of pre-printed labels per type × length × color — "2AR-0001 to 2AR-0100" = 100 × 2 m CAT6A red. The labels
// are typed by hand (the client's format); a batch's range is its first and last label: the same text before a number
// that counts up. From the cords' Cord IDs: which labels of each batch are used and which are free, the cords still
// short of a label against the batches, and where the next order continues (the label after the last one bought).
// Pure; tested in cordBatches.test.ts.
import type { Cord, CordBatch } from './types'

/** A label range: the text before the number, the first and last number, and the number's width ("0001" = 4). */
export interface LabelRange { prefix: string; from: number; to: number; width: number }

const split = (label: string): { prefix: string; n: number; width: number } | null => {
	const m = label.trim().match(/^(.*?)(\d+)$/)
	return m ? { prefix: m[1], n: Number(m[2]), width: m[2].length } : null
}

/** "2AR-0001" … "2AR-0100" → { prefix "2AR-", 1 … 100, width 4 }; null when they don't share a prefix or count down. */
export function labelRange(first: string, last: string): LabelRange | null {
	const a = split(first), b = split(last)
	if (!a || !b || a.prefix !== b.prefix || b.n < a.n) return null
	return { prefix: a.prefix, from: a.n, to: b.n, width: a.width }
}
export const formatLabel = (r: Pick<LabelRange, 'prefix' | 'width'>, n: number) => `${r.prefix}${String(n).padStart(r.width, '0')}`
/** The label's number when it is in the range, else null ("2AR-0042" → 42; "2AR-42" too). */
export function inRange(r: LabelRange, label: string): number | null {
	const s = split(label)
	return s && s.prefix === r.prefix && s.n >= r.from && s.n <= r.to ? s.n : null
}

/** One cord type × length × color (a batch's, a cord's). */
export const cordKey = (x: { cableType: string; lengthM: number; colour: string }) => `${x.cableType}|${x.lengthM}|${x.colour.toLowerCase()}`

export interface BatchUse {
	batch: CordBatch
	range: LabelRange | null
	/** labels in the range */
	count: number
	/** cords carrying one of its labels; those of another type, length or color are `wrong` */
	used: Cord[]
	wrong: Cord[]
	free: number
	/** the highest label used, and the next free one after it (the first, when none is used) */
	lastUsed?: string
	next?: string
}

/** Each batch with the cords that carry its labels (a cord being removed doesn't count). */
export function batchUse(batches: CordBatch[], cords: Cord[]): BatchUse[] {
	const live = cords.filter((c) => c.status !== 'remove' && c.cordId)
	return batches.map((batch) => {
		const range = labelRange(batch.first, batch.last)
		if (!range) return { batch, range, count: 0, used: [], wrong: [], free: 0 }
		const used = live.filter((c) => inRange(range, c.cordId!) !== null)
		const nums = new Set(used.map((c) => inRange(range, c.cordId!)!))
		const top = nums.size ? Math.max(...nums) : null
		let next: number | null = top === null ? range.from : null
		for (let n = (top ?? range.from) + 1; next === null && n <= range.to; n++) if (!nums.has(n)) next = n
		const count = range.to - range.from + 1
		return { batch, range, count, used, wrong: used.filter((c) => cordKey(c) !== cordKey(batch)), free: count - nums.size,
			...(top !== null ? { lastUsed: formatLabel(range, top) } : {}), ...(next !== null ? { next: formatLabel(range, next) } : {}) }
	})
}

export interface LabelNeed {
	key: string
	cableType: string; lengthM: number; colour: string
	/** cords of this kind (not being removed) */
	cords: number
	/** labels bought in batches of this kind (ordered), and delivered so far */
	labels: number
	delivered: number
	/** cords more than the labels bought */
	short: number
	/** where the next order continues: the label after the last one bought */
	nextOrder?: string
}

/** Per type × length × color: cords against labels bought, and where the next order continues. */
export function labelNeeds(batches: CordBatch[], cords: Cord[]): LabelNeed[] {
	const by = new Map<string, LabelNeed & { top?: { r: LabelRange; n: number } }>()
	const at = (x: { cableType: string; lengthM: number; colour: string }) => {
		const k = cordKey(x)
		return by.get(k) ?? by.set(k, { key: k, cableType: x.cableType, lengthM: x.lengthM, colour: x.colour, cords: 0, labels: 0, delivered: 0, short: 0 }).get(k)!
	}
	for (const c of cords) if (c.status !== 'remove') at(c).cords++
	for (const b of batches) {
		const r = labelRange(b.first, b.last), e = at(b)
		if (!r) continue
		e.labels += b.ordered ?? r.to - r.from + 1
		e.delivered += b.delivered ?? 0
		if (!e.top || r.to > e.top.n) e.top = { r, n: r.to }
	}
	return [...by.values()].map(({ top, ...e }) => ({ ...e, short: Math.max(0, e.cords - e.labels), ...(top ? { nextOrder: formatLabel(top.r, top.n + 1) } : {}) }))
}
