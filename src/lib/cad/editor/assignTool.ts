// Assign by hand (Phase 3.4): with outlets chosen in the grid, click a panel port in a rack view — their ports go
// onto consecutive free ports from there (moving off wherever they were), pinned so re-allocation never moves them.
// Dave: allocate automatically, then grab a bunch of outlets and put them on other panels.
import type { Tool, ToolCtx, PointerIn } from './tools'
import type { Id, Link } from '../domain/types'
import { pickPrim } from './pick'
import { assignFrom } from '../domain/allocate'
import { naturalCompare } from '../domain/labels'

export class AssignTool implements Tool {
	readonly id = 'assign'
	readonly cursor = 'cell'
	/** The outlets whose ports are being placed (set by the grid). */
	outlets: Id[] = []

	constructor(private done: () => void, private apply: (label: string, add: Link[], remove: Id[]) => void) {}

	down(e: PointerIn, c: ToolCtx): void {
		const hit = pickPrim(c.prims(), e.p, c.tol())
		const sub = hit && hit.k !== 'image' ? hit.sub : undefined, d = hit?.src ? c.store.get(hit.src) : undefined
		if (!sub || d?.type !== 'device' || d.kind !== 'panel') { c.say?.('Click a panel port in a rack view — the outlets go on from there'); return }
		const outlets = this.outlets.map((id) => c.index.get(id)).filter((o) => o?.type === 'outlet').sort((a, b) => naturalCompare(a!.label, b!.label))
		const wants = outlets.flatMap((o) => (o!.type === 'outlet' ? o!.ports.map((p) => ({ outletId: o!.id, port: p.port })) : []))
		const r = assignFrom(c.index, wants, { on: d.id, port: Number(sub) })
		if (!r.add.length) { c.say?.('No free panel ports from there'); return }
		this.apply(`Assign ${outlets.length} outlet(s) to ${d.name}`, r.add, r.remove)
		// a hand placement may cross tiers on purpose — say so rather than refuse
		const tier = d.panel?.tier ?? 'low', crossed = outlets.filter((o) => o!.type === 'outlet' && o!.tier !== tier).length
		if (r.left) c.say?.(`${r.left} port(s) didn't fit — the panels after that one are full`)
		else if (crossed) c.say?.(`Note: ${crossed} ${tier === 'high' ? 'low' : 'high'}-level outlet(s) now on a ${tier}-level panel`)
		this.outlets = []
		this.done()
	}
	move(): void {}
	up(): void {}
	cancel(): void { this.outlets = [] }
}
