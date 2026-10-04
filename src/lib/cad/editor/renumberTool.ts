// The Renumber tool: click outlets, racks or labelled shapes in the order they should be numbered. Each click adds
// the item to the selection (in click order), and its place in the order shows next to it. Clicking an item already
// picked goes BACK to it (the picks after it are dropped), to fix a wrong order; Backspace drops the last pick.
// The Renumber panel in Properties shows the new labels and applies them in one undo step. Esc / right-click ends it.
import type { Tool, ToolCtx, PointerIn } from './tools'
import type { Prim } from '../views/display'
import { pickPrim } from './pick'
import { primBounds, unionBounds } from '../views/display'
import { renumberable } from '../domain/renumber'

export class RenumberTool implements Tool {
	readonly id = 'renumber'
	readonly cursor = 'pointer'

	down(e: PointerIn, c: ToolCtx): void {
		const id = pickPrim(c.prims(), e.p, c.tol())?.src
		if (!id || !renumberable(c.store.get(id))) { c.say?.('Click outlets, racks or labelled shapes in the order they should be numbered'); return }
		const at = c.selection.indexOf(id)
		if (at < 0) c.select([...c.selection, id])
		else if (at < c.selection.length - 1) { c.select(c.selection.slice(0, at + 1)); c.say?.(`Back to pick ${at + 1} — carry on from there`) }
	}
	move(): void {}
	up(): void {}
	cancel(): void {}
	key(e: KeyboardEvent, c: ToolCtx): boolean {
		if (e.key !== 'Backspace' || !c.selection.length) return false
		c.select(c.selection.slice(0, -1))
		return true
	}
	/** Each pick's number in the order, at the top left of what was picked. */
	preview(c: ToolCtx): Prim[] {
		const prims = c.prims(), size = c.tol() * 2.2
		return c.selection.flatMap((id, i): Prim[] => {
			const b = unionBounds(prims.filter((p) => p.src === id && p.k !== 'image').map(primBounds))
			return b ? [{ k: 'text', at: { x: b.x0 - size * 0.2, y: b.y0 - size * 0.2 }, text: String(i + 1), size, anchor: 'end', cls: 'pick-order' }] : []
		})
	}
}
