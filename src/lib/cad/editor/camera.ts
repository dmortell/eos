// A surface's camera: screen px = (drawing mm) × k + (x, y). Pure functions over a plain record, so the Svelte layer
// keeps it in $state and tests need nothing.
import type { Pt } from '../domain/types'
import type { Bounds } from '../views/display'

export interface Camera { x: number; y: number; k: number }

export const MIN_K = 0.001, MAX_K = 50

export const toModel = (c: Camera, s: Pt): Pt => ({ x: (s.x - c.x) / c.k, y: (s.y - c.y) / c.k })
export const toScreen = (c: Camera, p: Pt): Pt => ({ x: p.x * c.k + c.x, y: p.y * c.k + c.y })

/** Zoom by `factor` keeping the model point under the screen point `s` fixed. */
export function zoomAt(c: Camera, s: Pt, factor: number): Camera {
	const k = Math.min(MAX_K, Math.max(MIN_K, c.k * factor))
	const m = toModel(c, s)
	return { k, x: s.x - m.x * k, y: s.y - m.y * k }
}

export const panBy = (c: Camera, dx: number, dy: number): Camera => ({ ...c, x: c.x + dx, y: c.y + dy })

/** Fit bounds into a w × h viewport with `pad` px around. */
export function fit(b: Bounds, w: number, h: number, pad = 24): Camera {
	const bw = Math.max(1, b.x1 - b.x0), bh = Math.max(1, b.y1 - b.y0)
	const k = Math.min(MAX_K, Math.max(MIN_K, Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh)))
	return { k, x: (w - bw * k) / 2 - b.x0 * k, y: (h - bh * k) / 2 - b.y0 * k }
}

/** What a `w` × `h` px view shows through this camera, in drawing mm. */
export const visibleArea = (c: Camera, w: number, h: number): Bounds => ({ x0: -c.x / c.k, y0: -c.y / c.k, x1: (w - c.x) / c.k, y1: (h - c.y) / c.k })

/** Bring `b` into view gently (a row picked in a table, review R52): null when it's already wholly in view (`pad` px
 *  in from the edges); else the same zoom, panned so it's in the middle — or, bigger than the view, fitted to it. */
export function reveal(c: Camera, b: Bounds, w: number, h: number, pad = 24): Camera | null {
	const v = visibleArea(c, w, h), m = pad / c.k
	if (b.x0 >= v.x0 + m && b.x1 <= v.x1 - m && b.y0 >= v.y0 + m && b.y1 <= v.y1 - m) return null
	if ((b.x1 - b.x0) * c.k > w - 2 * pad || (b.y1 - b.y0) * c.k > h - 2 * pad) return fit(b, w, h, pad)
	return { k: c.k, x: w / 2 - ((b.x0 + b.x1) / 2) * c.k, y: h / 2 - ((b.y0 + b.y1) / 2) * c.k }
}

/** Zoom previous (AutoCAD ZOOM P, Dave 2026-10-14): each view's settled cameras — every zoom or pan once it pauses —
 *  newest last, up to `max`. `settle` records where the view came to rest; `back` steps to the one before. */
export class ZoomHistory {
	#stacks = new Map<string, Camera[]>()
	#last = new Map<string, Camera>()
	constructor(private max = 20) {}
	settle(view: string, c: Camera): void {
		const l = this.#last.get(view)
		if (l && l.k === c.k && Math.abs(l.x - c.x) < 0.5 && Math.abs(l.y - c.y) < 0.5) return
		if (l) { const s = this.#stacks.get(view) ?? []; s.push(l); if (s.length > this.max) s.shift(); this.#stacks.set(view, s) }
		this.#last.set(view, { ...c })
	}
	back(view: string): Camera | null {
		const c = this.#stacks.get(view)?.pop()
		if (c) this.#last.set(view, c)
		return c ?? null
	}
}
