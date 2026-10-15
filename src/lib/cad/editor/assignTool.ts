// Assign by hand (Phase 3.4): with outlets chosen in the grid, click a panel port in a rack view — their ports go
// onto consecutive free ports from there (moving off wherever they were), pinned so re-allocation never moves them.
// User: allocate automatically, then grab a bunch of outlets and put them on other panels.
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
		// a port: from there; the panel itself (User: drag the outlet rows "to a panel"): from its first free port
		if (d?.type !== 'device' || d.kind !== 'panel') { c.say?.('Click a panel (or one of its ports) in a rack view — the outlets go on from there'); return }
		const outlets = this.outlets.map((id) => c.index.get(id)).filter((o) => o?.type === 'outlet').sort((a, b) => naturalCompare(a!.label, b!.label))
		const wants = outlets.flatMap((o) => (o!.type === 'outlet' ? o!.ports.map((p) => ({ outletId: o!.id, port: p.port })) : []))
		const r = assignFrom(c.index, wants, { on: d.id, port: sub ? Number(sub) : 1 })
		if (!r.add.length) { c.say?.(`No free panel ports from there${r.skipped ? ` (labelled ports are left alone: ${r.skipped})` : ''}`); return }
		this.apply(`Assign ${outlets.length} outlet(s) to ${d.name}`, r.add, r.remove)
		// a hand placement may cross tiers on purpose — say so rather than refuse
		const tier = d.panel?.tier ?? 'low', crossed = outlets.filter((o) => o!.type === 'outlet' && o!.tier !== tier).length
		const passed = r.skipped ? ` · passed over labelled ports ${r.skipped}` : ''
		if (r.left) c.say?.(`${r.left} port(s) didn't fit — the panels after that one are full${passed}`)
		else if (crossed) c.say?.(`Note: ${crossed} ${tier === 'high' ? 'low' : 'high'}-level outlet(s) now on a ${tier}-level panel${passed}`)
		else if (passed) c.say?.(`Assigned${passed} (a hand label or a labelled range: kept for what they're labelled)`)
		this.outlets = []
		this.done()
	}
	move(): void {}
	up(): void {}
	cancel(): void { this.outlets = [] }
}
