// The Section tool (Phase 6.2): on a plan, click the cut line's two ends (or type them). The section looks to the
// line's left as drawn (Flip in Properties turns it round) and shows 5 m beyond the cut by default. It is named A, B,
// C … per level and selected, so Properties can open it.
import type { Tool, ToolCtx, PointerIn } from './tools'
import type { Prim } from '../views/display'
import type { Pt } from '../domain/types'
import type { SectionCut } from '../domain/drawing'
import { newId } from '../domain/ids'
import { sectionMarks, sectionsOn } from '../views/section'

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

	down(e: PointerIn, c: ToolCtx): void { this.#point(c.snap(e.p, e.alt).p, c) }
	typed(p: Pt, c: ToolCtx): void { this.#point(p, c) }
	lastPoint(): Pt | null { return this.#a }

	#point(p: Pt, c: ToolCtx): void {
		if (!this.#a) { this.#a = p; return }
		if (Math.hypot(p.x - this.#a.x, p.y - this.#a.y) < 100) { c.say?.('Make the cut line longer'); return }
		const sec: SectionCut = { type: 'section', id: newId(), levelId: c.levelId, name: nextSectionName(sectionsOn(c.index, c.levelId).map((s) => s.name)), a: this.#a, b: p, depth: DEFAULT_SECTION_DEPTH }
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
