// The FORMAT PAINTER tool (Modify › Format painter; was Match properties): the source is the shape selected when it starts (or the first
// shape clicked); each click on another shape gives it the source's layer and look (domain/match.ts), one undo step
// each. Esc / right-click ends it.
import type { Tool, ToolCtx, PointerIn } from './tools'
import type { Shape } from '../domain/shapes'
import { pickPrim } from './pick'
import { matchProps } from '../domain/match'

export class MatchTool implements Tool {
	readonly id = 'match'
	readonly cursor = 'copy'
	/** The shape whose properties are copied; set when the tool starts, else by the first click. */
	source: string | null = null

	down(e: PointerIn, c: ToolCtx): void {
		const id = pickPrim(c.prims(), e.p, c.tol())?.src, hit = id ? c.store.get(id) : undefined
		const src = this.source ? c.store.get(this.source) : undefined
		if (src?.type !== 'shape') {
			if (hit?.type !== 'shape') { c.say?.('Click the shape to copy from (lines, boxes, notes …)'); return }
			this.source = hit.id
			c.select([hit.id])
			c.say?.('Now click the shapes to give its layer and look')
			return
		}
		if (hit?.type !== 'shape') { c.say?.('Click a shape to give it the layer and look of the selected one'); return }
		const next = matchProps(src as Shape, hit, c.index.layers)
		if (!next) { c.say?.(hit.id === src.id ? 'That is the source — click another shape' : 'It already matches'); return }
		c.store.transact('Format painter', (tx) => tx.put(next))
	}
	move(): void {}
	up(): void {}
	cancel(): void {}
}
