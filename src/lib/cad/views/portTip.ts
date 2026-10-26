// The PORT TIP in a rack view (backlog "Port hover tips"): the port under the pointer — its place and full label, the
// cable plugged into it (to an outlet port, or another panel's port: a tie / backbone) and the patch cords on it.
// Pure; tested in portTip.test.ts. Shown by PortTip.svelte.
import type { ProjectIndex } from '../domain/project'
import type { Outlet, PortRef } from '../domain/types'
import type { Prim } from './display'
import { inPolygon, primDist } from './primGeom'
import { patchProblem, cordAt } from '../domain/cords'
import { linkLands } from '../domain/interconnect'

/** The port cell under `p` in a rack-view display list (a `port…` box with the device as src and the port as sub). */
export function portUnder(prims: Prim[], p: { x: number; y: number }, face: 'front' | 'rear'): PortRef | null {
	const q = portCellUnder(prims, p)
	return q ? { on: q.src!, port: Number(q.sub), face } : null
}
/** The port CELL drawn under `p` (its outline: the rack view lights it up, User 2026-10-17 "tiny ports"). */
export function portCellUnder(prims: Prim[], p: { x: number; y: number }): Extract<Prim, { k: 'line' }> | null {
	for (let i = prims.length - 1; i >= 0; i--) {
		const q = prims[i]
		if (q.k === 'line' && q.closed && q.src && q.sub && q.role === 'port' && inPolygon(p, q.pts)) return q
	}
	return null
}

/** The tip's lines: where the port is and its label, then what it connects to. */
export function portTip(ix: ProjectIndex, r: PortRef): string[] {
	const out = [ix.portPlace(r)], label = ix.portLabel(r)
	if (label) out.push(label)
	const l = ix.linkAt(r), far = ix.farEnd(r)
	if (l && far) {
		const fe = ix.get(far.on)
		out.push(fe?.type === 'outlet'
			? `cable → outlet ${fe.label} port ${far.port}${ix.nameOf(fe.levelId) ? ` (${ix.nameOf(fe.levelId)})` : ''}`
			: `${l.kind === 'tie' ? 'tie' : l.kind} → ${ix.portPlace(far)}`)
	}
	const same = (a: PortRef) => a.on === r.on && a.port === r.port && (!a.face || !r.face || a.face === r.face)
	for (const c of ix.cords) {
		const other = same(c.a) ? c.b : same(c.b) ? c.a : null
		if (other) out.push(`cord → ${ix.portPlace(other)} · ${c.lengthM} m${c.status !== 'installed' ? ` · ${c.status}` : ''}`)
	}
	if (out.length === 1 && !label) {
		// a panel port with no label can't take a cord yet (User 2026-10-26: "not connected · 24 free" read as patchable)
		const d = ix.get(r.on)
		out.push(d?.type === 'device' && d.kind === 'panel' ? 'not connected · no label — tie or label it before patching' : 'not connected')
	}
	return out
}

/** The tip's foot line: how the device's ports are used — "Panel 1: 4 of 24 used · 20 free" ('' off a device). */
export function portTipUse(ix: ProjectIndex, r: PortRef): string {
	const d = ix.get(r.on)
	if (d?.type !== 'device' || !d.portCount) return ''
	// the permanent cable and the cord counted apart (User 2026-10-26: a tied panel read "24 of 24 used · 0 free", its
	// ports all free for cords): cabled (outlet / tie / backbone), patched, free to patch, and — a panel — the ports
	// with no label yet, which can't take a cord
	const ports = Array.from({ length: d.portCount }, (_, i) => i + 1), ref = (n: number) => ({ on: d.id, port: n })
	const cabled = ports.filter((n) => ix.linkAt(ref(n))).length, patched = ports.filter((n) => cordAt(ix, ref(n))).length
	const bare = d.kind === 'panel' ? ports.filter((n) => !cordAt(ix, ref(n)) && !ix.portLabel(ref(n))).length : 0
	const free = d.portCount - patched - bare
	return `${d.name}: ${cabled ? `${cabled} cabled · ` : ''}${patched} patched · ${free} free to patch${bare ? ` · ${bare} unlabelled` : ''}`
}

/** The OUTLET under `p` on a plan (backlog "Usage colors and outlet tips"): the topmost prim of an outlet within
 *  `tol` mm. */
export function outletUnder(ix: ProjectIndex, prims: Prim[], p: { x: number; y: number }, tol: number): Outlet | null {
	for (let i = prims.length - 1; i >= 0; i--) {
		const q = prims[i]
		if (!q.src || primDist(q, p) > tol) continue
		const o = ix.get(q.src)
		if (o?.type === 'outlet') return o
	}
	return null
}

/** The outlet tip's lines: its label, its usage · tier · mount, then each port's label and the panel port it's on. */
export function outletTip(ix: ProjectIndex, o: Outlet): string[] {
	const st = ix.getOf('settings', 'settings')
	const usage = st?.usages?.find((u) => u.id === o.usage)?.label ?? o.usage
	const out = [o.label, [usage, o.tier, o.mount].filter(Boolean).join(' · ')]
	for (const pt of o.ports) {
		const far = ix.farEnd({ on: o.id, port: pt.port })
		out.push(`${pt.label} → ${far ? ix.portPlace(far) : 'not allocated'}`)
	}
	return out
}

/** How each port cell of a rack view is lit (User 2026-10-17, "ports are tiny"): key `device:port` →
 *  - `far`: the other end of a cord / cable on the port under the pointer (`hover`, in any pane);
 *  - while a cord is being patched (`patching`: the Patch cord tool's first port, or a bulk patch / link armed):
 *    `from` = the ports patched from, `taken` = a port already carrying a cord (for links: a cable), `blocked` = one a
 *    cord can't go on (a panel port without a label), `free` = the rest. */
export function portLights(ix: ProjectIndex, prims: Prim[], face: 'front' | 'rear', s: { hover: PortRef | null; first: PortRef | null; bulk: { on: string; ports: number[]; kind?: 'cord' | 'link' } | null; patching: boolean }): Map<string, string> {
	const m = new Map<string, string>()
	const onFace = (r: PortRef) => !r.face || r.face === face
	if (s.patching && (s.first || s.bulk)) {
		const link = s.bulk?.kind === 'link', corded = new Set<string>()
		if (!link) for (const c of ix.cords) for (const e of [c.a, c.b]) if (onFace(e)) corded.add(`${e.on}:${e.port}`)
		for (const p of prims) {
			if (p.k !== 'line' || !p.closed || !p.src || !p.sub || p.role !== 'port') continue
			const k = `${p.src}:${p.sub}`
			const r = { on: p.src, port: Number(p.sub), face }
			// a panel port with no label refuses a cord (Round 10: it showed free): blocked, grey; a link: a PDU / server port
			// refuses it (User 2026-10-26: they lit green)
			const d = link ? ix.getOf('device', p.src) : undefined
			m.set(k, (link ? ix.linkAt(r) : corded.has(k)) ? 'taken' : (link ? !!d && !linkLands(d) : patchProblem(ix, r)) ? 'blocked' : 'free')
		}
		if (s.first && onFace(s.first)) m.set(`${s.first.on}:${s.first.port}`, 'from')
		if (s.bulk) for (const n of s.bulk.ports) m.set(`${s.bulk.on}:${n}`, 'from')
	}
	const h = s.hover
	if (h) {
		const same = (a: PortRef) => a.on === h.on && a.port === h.port && (!a.face || !h.face || a.face === h.face)
		for (const c of ix.cords) {
			const o = same(c.a) ? c.b : same(c.b) ? c.a : null
			if (o && onFace(o)) m.set(`${o.on}:${o.port}`, 'far')
		}
		const far = ix.farEnd(h)
		if (far && ix.get(far.on)?.type === 'device') m.set(`${far.on}:${far.port}`, 'far')
	}
	return m
}
