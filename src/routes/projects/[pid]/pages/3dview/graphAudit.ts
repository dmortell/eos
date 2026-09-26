// AUDIT for a model's node / segment graphs (walls + conduits) and its connections. Pure: `auditGraph` lists the
// faults, `fixGraph` returns the repaired objects (the caller writes them in one undo step).
//   - a segment naming a node that isn't there (dangling)            → the segment goes
//   - a zero-length segment (both ends one node / the same point)    → the segment goes, its ends merge
//   - two nodes at the same point in one object, not joined          → merged (their segments repointed)
//   - a node no segment uses (orphan)                                → removed
//   - a duplicate segment (the same two nodes again)                 → removed
//   - a wall / conduit left with no segments                         → deleted
//   - a node attached (`conn`) to a box / point / outlet that's gone → detached (it stays where it is)
//   - a rack device whose rack is gone, a panel port allocated to an outlet that's gone (this model) → reported;
//     the stale allocation is cleared
import type { Obj } from './types'
import type { Ent } from '../ui/geometry'
import type { GNode, GSeg } from './graph'
import { boxPoints } from './connect'
import { isOutletEnt } from '../store/allocate'

export type GraphIssue = { obj: string; label: string; kind: 'dangling' | 'zero' | 'duplicate-node' | 'orphan' | 'duplicate-seg' | 'empty' | 'conn' | 'rack' | 'alloc'; text: string }

type Graph = Extract<Obj, { type: 'wall' | 'conduit' }>
const isGraph = (o: Obj): o is Graph => o.type === 'wall' || o.type === 'conduit'
const same = (a: GNode, b: GNode) => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.z - b.z) < 0.5
const name = (o: Obj) => o.label || `${o.type} ${o.id ?? '?'}`

/** Repair one graph (a copy): merge coincident nodes, drop bad / duplicate segments and orphan nodes. Records what it did. */
function repair(o: Graph, out: GraphIssue[]): Graph {
	const say = (kind: GraphIssue['kind'], text: string) => out.push({ obj: o.id ?? '', label: name(o), kind, text })
	const ids = new Set(o.nodes.map((n) => n.id))
	// coincident nodes → the first one at that point (conn kept from whichever has one)
	const alias = new Map<string, string>(), keep: GNode[] = []
	for (const n of o.nodes) {
		const k = keep.find((m) => same(m, n))
		if (k) { alias.set(n.id, k.id); if (!k.conn && n.conn) k.conn = n.conn; continue }
		keep.push({ ...n })
	}
	const to = (id: string) => alias.get(id) ?? id
	const segs: GSeg[] = [], seen = new Set<string>()
	for (const s of o.segments) {
		if (!ids.has(s.a) || !ids.has(s.b)) { say('dangling', `segment ${s.id} names a missing node`); continue }
		const a = to(s.a), b = to(s.b)
		if (a === b) { say('zero', `segment ${s.id} has zero length`); continue }
		const key = a < b ? `${a}|${b}` : `${b}|${a}`
		if (seen.has(key)) { say('duplicate-seg', `segment ${s.id} repeats another`); continue }
		seen.add(key); segs.push({ ...s, a, b })
	}
	if (alias.size) say('duplicate-node', `${alias.size} node${alias.size > 1 ? 's' : ''} on top of another (merged)`)
	const used = new Set(segs.flatMap((s) => [s.a, s.b])), orphans = keep.filter((n) => !used.has(n.id))
	if (orphans.length && segs.length) say('orphan', `${orphans.length} node${orphans.length > 1 ? 's' : ''} no segment uses`)
	return { ...o, nodes: keep.filter((n) => used.has(n.id)), segments: segs } as Graph
}

/** The faults (and, in `objects`, the repaired model objects; `null` = delete that object). */
function run(objects: Obj[], shapes: Ent[]): { issues: GraphIssue[]; fixed: (Obj | null)[] } {
	const issues: GraphIssue[] = []
	const boxes = new Map(objects.filter((o) => o.id).map((o) => [o.id!, o]))
	const outlets = new Set(shapes.filter(isOutletEnt).map((e) => e.id)), shapeIds = new Set(shapes.map((e) => e.id))
	const fixed = objects.map((o): Obj | null => {
		if (isGraph(o)) {
			const g = repair(o, issues)
			if (!g.segments.length) { issues.push({ obj: o.id ?? '', label: name(o), kind: 'empty', text: 'has no segments left (deleted)' }); return null }
			let lost = 0
			const nodes = g.nodes.map((n) => {
				const c = n.conn; if (!c) return n
				const ok = c.ent ? shapeIds.has(c.ent) && outlets.has(c.ent) : c.obj ? (() => { const b = boxes.get(c.obj!); return !!b && boxPoints(b).some((p) => p.conn.pt === c.pt) })() : false
				if (ok) return n
				lost++; const { conn: _, ...rest } = n; return rest
			})
			if (lost) issues.push({ obj: o.id ?? '', label: name(o), kind: 'conn', text: `${lost} end${lost > 1 ? 's' : ''} attached to something that's gone (detached)` })
			return { ...g, nodes } as Obj
		}
		if (o.device && !boxes.get(o.device.rackId)?.rack) issues.push({ obj: o.id ?? '', label: name(o), kind: 'rack', text: `device in a rack that's gone (${o.device.rackId})` })
		return o
	})
	return { issues, fixed }
}

/** Allocation entries (panel port → outlet) pointing at an outlet of THIS model that's gone. */
function staleAlloc(o: Obj, modelId: string, outlets: Set<string>): string[] {
	return Object.entries(o.device?.alloc ?? {}).filter(([, a]) => a.model === modelId && !outlets.has(a.outlet)).map(([k]) => k)
}

/** List the model's graph / connection faults. */
export function auditGraph(m: { id: string; objects: Obj[]; shapes?: Ent[] }): GraphIssue[] {
	const { issues } = run(m.objects, m.shapes ?? [])
	const outlets = new Set((m.shapes ?? []).filter(isOutletEnt).map((e) => e.id))
	for (const o of m.objects) { const s = staleAlloc(o, m.id, outlets); if (s.length) issues.push({ obj: o.id ?? '', label: name(o), kind: 'alloc', text: `${s.length} panel port${s.length > 1 ? 's' : ''} allocated to an outlet that's gone` }) }
	return issues
}

/** The model's objects with every fixable fault repaired (see the header). */
export function fixGraph(m: { id: string; objects: Obj[]; shapes?: Ent[] }): Obj[] {
	const outlets = new Set((m.shapes ?? []).filter(isOutletEnt).map((e) => e.id))
	return run(m.objects, m.shapes ?? []).fixed.filter((o): o is Obj => !!o).map((o) => {
		const s = staleAlloc(o, m.id, outlets); if (!s.length || !o.device) return o
		const alloc = { ...o.device.alloc }; for (const k of s) delete alloc[k]
		return { ...o, device: { ...o.device, alloc } }
	})
}
