// The LEGEND tool (backlog "Legend on the drawing", User 2026-10-05): a click puts a legend there — its top-left corner —
// on the plan (it lists that level) or on a sheet's paper (it lists the levels its viewports show). It starts with every
// symbol in use; Properties chooses its rows (symbols and layers), title and size. One undo step; it's then selected.
import type { Tool, ToolCtx, PointerIn } from './tools'
import type { Shape } from '../domain/shapes'
import { newId } from '../domain/ids'
import { snapPt } from './tools'

export class LegendTool implements Tool {
	readonly id = 'legend'
	readonly cursor = 'crosshair'

	down(e: PointerIn, c: ToolCtx): void {
		const spec = c.space.spec
		const at = spec.kind === 'sheet' ? snapPt(e.p, e.alt, 1) : c.snap(e.p, e.alt).p
		const owner = spec.kind === 'sheet' ? { sheetId: spec.sheetId } : spec.kind === 'plan' ? { levelId: c.levelId, ...(c.layerId ? { layerId: c.layerId } : {}) } : null
		if (!owner) { c.say?.('A legend goes on a plan or a sheet'); return }
		const sz = c.settings?.toolDefaults?.legend?.sizeMm   // Use as default on a legend
		const s = { type: 'shape', id: newId(), ...owner, geom: { kind: 'legend', at, ...(sz ? { sizeMm: sz } : {}) } } as Shape
		c.store.transact('Legend', (tx) => tx.put(s))
		c.select([s.id])
		c.say?.('Legend placed · choose its rows, title and size in Properties · drag to move')
	}
	move(): void {}
	up(): void {}
	cancel(): void {}
}
