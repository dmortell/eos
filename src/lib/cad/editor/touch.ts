// TOUCH on a view (backlog "Touch: pan and pinch zoom"; the touch pass found nothing worked on an iPad): two fingers
// pan and pinch-zoom anywhere (a tool's half-done gesture is cancelled); one finger on EMPTY space pans (with Select —
// a drawing tool places its points on empty space, so there one finger draws and two pan), and a tap there clears the
// selection; one finger on a thing goes to the tool as a mouse press would. Screen px in, cameras out. Pure apart from
// the callbacks; tested in touch.test.ts.
import type { Pt } from '../domain/types'
import { MIN_K, MAX_K, type Camera } from './camera'
import { SCALES } from '../views/sheet'

/** The camera after a pinch: the drawing point under the fingers' first midpoint stays under their midpoint now, zoomed
 *  by how far apart they are now against then. */
export function pinchCamera(c: Camera, a0: Pt, b0: Pt, a1: Pt, b1: Pt): Camera {
	const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y), d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y)
	const k = Math.min(MAX_K, Math.max(MIN_K, c.k * (d0 > 0 ? d1 / d0 : 1)))
	const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 }, m1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 }
	const p = { x: (m0.x - c.x) / c.k, y: (m0.y - c.y) / c.k }
	return { k, x: m1.x - p.x * k, y: m1.y - p.y * k }
}

/** A sheet viewport's view after two fingers on the PAPER (mm): pinching apart zooms the view in (a smaller 1:N), the
 *  view point under the fingers' first midpoint stays under their midpoint now (pan + scale in one gesture). */
export function pinchContent(vp: { rect: { x: number; y: number; w: number; h: number }; centre: Pt; scale: number }, a0: Pt, b0: Pt, a1: Pt, b1: Pt): { centre: Pt; scale: number } {
	const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y), d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y)
	const scale = Math.max(1, Math.round(d0 > 0 && d1 > 0 ? vp.scale * d0 / d1 : vp.scale))
	const rc = { x: vp.rect.x + vp.rect.w / 2, y: vp.rect.y + vp.rect.h / 2 }
	const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 }, m1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 }
	const at = { x: vp.centre.x + (m0.x - rc.x) * vp.scale, y: vp.centre.y + (m0.y - rc.y) * vp.scale }
	return { centre: { x: at.x - (m1.x - rc.x) * scale, y: at.y - (m1.y - rc.y) * scale }, scale }
}
/** The standard scale a pinch ends on: the nearest 1:N (by ratio) if within 10 %, else the pinched scale as it is. */
export function settleScale(scale: number): number {
	let best = scale, off = 0.1
	for (const n of SCALES) { const r = Math.abs(Math.log(n / scale)); if (r < off) { off = r; best = n } }
	return best
}

/** Two fingers on a viewport's content: a pan + scale of its view (the camera stays). */
export interface ContentGesture { update(a0: Pt, b0: Pt, a1: Pt, b1: Pt): void; end(): void }

export interface TouchHost {
	/** Two fingers at this screen midpoint on a viewport whose content is being edited (or "Pan / zoom content" is on):
	 *  they pan and scale ITS view instead of the camera. Null = the camera's. */
	content?(mid: Pt): ContentGesture | null
	cam(): Camera
	setCam(c: Camera): void
	/** Is the screen point over empty space that one finger may pan (Select tool, nothing pickable)? */
	emptyAt(s: Pt): boolean
	/** A second finger arrived while the tool had a press going: drop it. */
	cancel(): void
	/** One finger tapped empty space. */
	tap(): void
}

/** Touch pointers for one view; each method returns true when it handled the event (the tool mustn't get it). */
export class TouchNav {
	#pts = new Map<number, Pt>()
	#mode: null | 'pan' | 'pinch' | 'content' | 'done' = null
	#start: { cam: Camera; a: Pt; b?: Pt; moved: boolean } | null = null
	#content: ContentGesture | null = null
	constructor(private host: TouchHost) {}

	down(id: number, s: Pt): boolean {
		this.#pts.set(id, s)
		if (this.#pts.size === 2) {
			const [a, b] = [...this.#pts.values()]
			this.host.cancel()
			this.#content = this.host.content?.({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }) ?? null
			this.#mode = this.#content ? 'content' : 'pinch'; this.#start = { cam: this.host.cam(), a, b, moved: true }
			return true
		}
		if (this.#pts.size > 2) return true
		if (this.host.emptyAt(s)) { this.#mode = 'pan'; this.#start = { cam: this.host.cam(), a: s, moved: false }; return true }
		this.#mode = null
		return false
	}
	move(id: number, s: Pt): boolean {
		if (!this.#pts.has(id)) return false
		this.#pts.set(id, s)
		const st = this.#start
		if (this.#mode === 'content' && st?.b && this.#pts.size >= 2 && this.#content) {
			const [a, b] = [...this.#pts.values()]
			this.#content.update(st.a, st.b, a, b)
			return true
		}
		if (this.#mode === 'pinch' && st?.b && this.#pts.size >= 2) {
			const [a, b] = [...this.#pts.values()]
			this.host.setCam(pinchCamera(st.cam, st.a, st.b, a, b))
			return true
		}
		if (this.#mode === 'pan' && st) {
			const dx = s.x - st.a.x, dy = s.y - st.a.y
			if (!st.moved && Math.hypot(dx, dy) < 4) return true
			st.moved = true
			this.host.setCam({ ...st.cam, x: st.cam.x + dx, y: st.cam.y + dy })
			return true
		}
		return this.#mode === 'done'
	}
	up(id: number): boolean {
		if (!this.#pts.delete(id)) return false
		const mode = this.#mode
		if (mode === 'pan' && this.#start && !this.#start.moved) this.host.tap()
		// after a pinch, the finger left behind does nothing until every finger is up
		if (mode === 'content' && this.#content) { this.#content.end(); this.#content = null }
		this.#mode = this.#pts.size ? (mode === 'pinch' || mode === 'content' || mode === 'done' ? 'done' : mode) : null
		if (!this.#pts.size) this.#start = null
		return mode !== null
	}
}
