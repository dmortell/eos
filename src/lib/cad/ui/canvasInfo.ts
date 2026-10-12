// Small pure parts of a view surface (split out of ViewCanvas): the drawn GRID, the status bar's length · angle
// READOUT, the CAMERA MEMORY (each view keeps its pan / zoom; the view a pane opened with gets its saved one back after
// a refresh), and the CLICK COUNTER (a pointerdown's `detail` is always 0, so double-clicks are counted here).
import type { Pt } from '../domain/types'
import { MIN_K, visibleArea, type Camera } from '../editor/camera'

/** Grid lines every `step` mm, coarsened ×10 until at least 8 px apart; every 5th `major`. */
export function gridLines(cam: Camera, w: number, h: number, step0: number): { a: Pt; b: Pt; major: boolean }[] {
	let step = step0 > 0 ? step0 : 10   // any typed step (600, 44.45)
	while (step * cam.k < 8) step *= 10
	const { x0, y0, x1, y1 } = visibleArea(cam, w, h), out: { a: Pt; b: Pt; major: boolean }[] = []
	// by line number, so a step like 44.45 gathers no float error across the view
	for (let i = Math.ceil(x0 / step); i * step <= x1; i++) { const x = i * step; out.push({ a: { x, y: y0 }, b: { x, y: y1 }, major: i % 5 === 0 }) }
	for (let i = Math.ceil(y0 / step); i * step <= y1; i++) { const y = i * step; out.push({ a: { x: x0, y }, b: { x: x1, y }, major: i % 5 === 0 }) }
	return out
}

/** "L 1200 · ∠ 45° · ΔX 849 · ΔY 849" from `from` to the cursor; elevations read ΔZ (up), a sheet to 0.1 mm. */
export function readoutText(cursor: Pt, from: Pt, kind: string): string {
	const dx = cursor.x - from.x, dy = cursor.y - from.y, up = kind !== 'plan' && kind !== 'sheet'
	const deg = Math.round(((Math.atan2(-dy, dx) * 180) / Math.PI + 360) % 360 * 10) / 10   // anticlockwise from →, up the screen positive
	const r = (v: number) => (kind === 'sheet' ? Math.round(v * 10) / 10 : Math.round(v))
	return `L ${r(Math.hypot(dx, dy))} · ∠ ${deg}° · ΔX ${r(dx)} · ${up ? 'ΔZ' : 'ΔY'} ${r(up ? -dy : dy)}`
}

/** A camera that came back from storage: no auto-fit over it (Fit / Home still fit). */
export const RESTORED = 'restored'

/** Each view's camera, by view key: kept for the session; the view the pane opened with restored from localStorage (a
 *  refresh of the same URL — UX review R2: other views fit their content first). Saves are debounced. */
export class CameraMemory {
	#cams = new Map<string, { cam: Camera; fitted: string | null }>()
	#checked = new Set<string>()
	#timer: ReturnType<typeof setTimeout> | undefined
	constructor(private pid: string, firstKey: string) {
		// a camera stuck at the smallest zoom is a bad saved fit, not a choice: that view fits again
		for (const [k, c] of Object.entries(this.#read())) if (k === firstKey && c && Number.isFinite(c.k) && c.k > MIN_K * 1.5) this.#cams.set(k, { cam: c, fitted: RESTORED })
	}
	#key = () => `cad-cams:${this.pid}`
	#read(): Record<string, Camera> { try { return JSON.parse(localStorage.getItem(this.#key()) ?? '{}') } catch { return {} } }
	has = (vk: string) => this.#cams.has(vk)
	get = (vk: string) => this.#cams.get(vk)
	set = (vk: string, cam: Camera, fitted: string | null) => { this.#cams.set(vk, { cam, fitted }) }
	/** True the first time it's asked for a view (a restored camera is checked once for showing the content). */
	firstCheck(vk: string): boolean { if (this.#checked.has(vk)) return false; this.#checked.add(vk); return true }
	/** Keep this view's camera across a refresh (storage blocked / full: it just fits again). */
	save(vk: string, c: Camera): void {
		clearTimeout(this.#timer)
		this.#timer = setTimeout(() => { try { localStorage.setItem(this.#key(), JSON.stringify({ ...this.#read(), [vk]: { x: c.x, y: c.y, k: c.k } })) } catch { /* blocked / full */ } }, 400)
	}
}

/** Presses counted into clicks: a second press within 400 ms and 5 px of the last is a double (and so on). `at` = the
 *  press's place on screen, `t` = when it HAPPENED (e.timeStamp: a slow render after the first click mustn't push the
 *  second past 400 ms). */
export class ClickCounter {
	#last: { t: number; x: number; y: number; n: number } | null = null
	press(at: Pt, t: number): number {
		const l = this.#last, n = l && t - l.t < 400 && Math.hypot(at.x - l.x, at.y - l.y) < 5 ? l.n + 1 : 1
		this.#last = { t, ...at, n }
		return n
	}
}
