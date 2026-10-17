// The CHANGE LIST tool (design log step 2, User 2026-10-17): a click on a sheet's paper puts the change list there — its
// top-left corner. It lists this round's changes linked to the sheet's package (views/changeList.ts), No and What;
// the clouds' numbers refer to it. One undo step; it's then selected.
import type { Tool, ToolCtx, PointerIn } from './tools'
import type { Shape } from '../domain/shapes'
import { newId } from '../domain/ids'
import { snapPt } from './tools'

export class ChangeListTool implements Tool {
	readonly id = 'changelist'
	readonly cursor = 'crosshair'

	down(e: PointerIn, c: ToolCtx): void {
		const spec = c.space.spec
		if (spec.kind !== 'sheet') { c.say?.('A change list goes on a sheet'); return }
		const s = { type: 'shape', id: newId(), sheetId: spec.sheetId, geom: { kind: 'changeList', at: snapPt(e.p, e.alt, 1) } } as Shape
		c.store.transact('Change list', (tx) => tx.put(s))
		c.select([s.id])
		c.say?.('Change list placed — it lists the changes linked to this package’s sheets (Properties › Changes, or a cloud’s Change) · drag to move')
	}
	move(): void {}
	up(): void {}
	cancel(): void {}
}
