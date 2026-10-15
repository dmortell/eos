// The Section tool (Phase 6.2): on a plan, click the cut line's two ends (or type them). The section looks to the
// line's left as drawn (Flip in Properties turns it round) and shows 5 m beyond the cut by default. It is named A, B,
// C … per level and selected, so Properties can open it.
import type { Tool, ToolCtx, PointerIn } from './tools'
import type { Prim } from '../views/display'
import type { Pt } from '../domain/types'
import type { SectionCut } from '../domain/drawing'
import { newId } from '../domain/ids'
import { sectionMarks, sectionsOn } from '../views/section'
import { inPolygon } from '../views/primGeom'
import { roomElevations } from '../domain/roomElevations'

const area = (pts: Pt[]) => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p.x * q.y - q.x * p.y }, 0)) / 2

export const DEFAULT_SECTION_DEPTH = 5000

/** The next free name on a level: A … Z, then AA … */
export function nextSectionName(taken: string[]): string {
	const used = new Set(taken)
	for (let i = 0; ; i++) {
		let n = i, s = ''
		do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1 } while (n >= 0)
		if (!used.has(s)) return s
	}
}

export class SectionTool implements Tool {
	readonly id = 'section'
	readonly cursor = 'crosshair'
	#a: Pt | null = null
	#hover: Pt | null = null

	/** `room`: the Room elevations (A–D) item — a click inside a room drawn with the Room tool makes its four. */
	constructor(private mode: () => 'line' | 'room' = () => 'line') {}

	down(e: PointerIn, c: ToolCtx): void {
		if (this.mode() === 'room') { this.#room(e.p, c); return }
		this.#point(c.snap(e.p, e.alt).p, c)
	}
	#room(p: Pt, c: ToolCtx): void {
		const room = c.index.spaces.filter((s) => s.levelId === c.levelId && !!s.boundary?.length && inPolygon(p, s.boundary!))
			.sort((a, b) => area(a.boundary!) - area(b.boundary!))[0]   // the smallest one the click is in (an EPS inside a riser room)
		if (!room) { c.say?.('Click inside a room drawn with the Room tool (Draw › Room) — its outline gives the four walls'); return }
		const secs = roomElevations(room, newId, sectionsOn(c.index, c.levelId).map((s) => s.name))
		if (!secs.length) { c.say?.(`${room.name} already has its elevations A–D`); return }
		c.store.transact(`Room elevations ${room.name}`, (tx) => { for (const s of secs) tx.put(s) })
		c.select(secs.map((s) => s.id))
		c.say?.(`${room.name}: ${secs.map((s) => s.name.slice(room.name.length + 1)).join(', ')} — each looks at its wall from inside; they’re in the Navigator under the level (put them on a sheet from there)`)
	}
	typed(p: Pt, c: ToolCtx): void { this.#point(p, c) }
	lastPoint(): Pt | null { return this.#a }

	#point(p: Pt, c: ToolCtx): void {
		if (!this.#a) { this.#a = p; return }
		if (Math.hypot(p.x - this.#a.x, p.y - this.#a.y) < 100) { c.say?.('Make the cut line longer'); return }
		const sec: SectionCut = { type: 'section', id: newId(), levelId: c.levelId, name: nextSectionName(sectionsOn(c.index, c.levelId).map((s) => s.name)), a: this.#a, b: p, depth: c.settings?.toolDefaults?.section?.depth ?? DEFAULT_SECTION_DEPTH }
		c.store.transact(`Section ${sec.name}`, (tx) => tx.put(sec))
		c.select([sec.id])
		this.#a = null
	}
	move(e: PointerIn, c: ToolCtx): void { this.#hover = c.snap(e.p, e.alt).p }
	hover(e: PointerIn, c: ToolCtx): void { this.#hover = c.snap(e.p, e.alt).p }
	up(): void {}
	cancel(): void { this.#a = null; this.#hover = null }
	key(e: KeyboardEvent): boolean {
		if (e.key === 'Escape' && this.#a) { this.cancel(); return true }
		return false
	}
	/** The cut line so far, marked as it will be. */
	preview(c: ToolCtx): Prim[] {
		if (!this.#a || !this.#hover || Math.hypot(this.#hover.x - this.#a.x, this.#hover.y - this.#a.y) < 1) return []
		// drawn at the plan's plot scale (1:100), like the finished marks
		return sectionMarks({ type: 'section', id: '', levelId: c.levelId, name: '', a: this.#a, b: this.#hover, depth: 0 }, 100).map((p): Prim => (p.k === 'image' ? p : { ...p, cls: p.cls + ' draft', src: undefined }))
	}
}
