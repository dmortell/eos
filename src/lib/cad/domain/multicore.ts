// MULTI-CORE CABLES (backlog "Multi-core cables", T079): one cable with many cores — a 24-core fibre between two
// panels — is its cores' LINKS (one per core, port ↔ port, as any link) sharing `Link.cable`. The cable TYPE says how
// many cores it has (`cores` in Settings › Cable types; absent = 1). The cores share the cable's type, route, length
// and status. A link takes 2 cores on LC ports (a duplex pair, User 2026-10-22), else 1 (`coresPerPort`): a 24-core
// cable fills 12 LC ports. Fill, the BOM, the cable schedule, the cable list and the riser view count the cable ONCE. Pure.
import type { Id, Link, ProjectSettings, Device } from './types'
import type { Entity } from './drawing'
import { cableTypeOf } from './cableTypes'
import { newId } from './ids'

/** The cable a link belongs to: its multi-core cable, else the link itself (a single-core cable). */
export const cableKey = (l: Pick<Link, 'id' | 'cable'>): Id => l.cable ?? l.id

/** A cable type's core count (1 = an ordinary cable). */
export function coresOf(settings: Pick<ProjectSettings, 'cableTypes'> | undefined, type: string | undefined): number {
	const n = type ? cableTypeOf(settings, type)?.cores : undefined
	return n && n > 1 ? Math.floor(n) : 1
}

/** Cores a port takes (User 2026-10-22: a fiber PORT is a pair of CORES): 2 on an LC (duplex) port, else 1. */
export const coresPerPort = (d: Pick<Device, 'portType'> | undefined): number => (d?.portType === 'LC' ? 2 : 1)

/** Cores a link takes: by the device at its `a` end, else its `b` end (an outlet: 1). */
export function linkCores(get: (id: Id) => Entity | undefined, l: Pick<Link, 'a' | 'b'>): number {
	const d = [get(l.a.on), get(l.b.on)].find((e): e is Device => e?.type === 'device')
	return coresPerPort(d)
}

/** Ports one cable of `cores` cores fills, at `perPort` cores a port (a 24-core cable: 12 LC ports). */
export const portsPerCable = (cores: number, perPort: number): number => Math.max(1, Math.floor(cores / perPort))

/** The links grouped by cable, in first-seen order; each cable's cores by port at its `a` end. */
export function cablesOf<L extends Pick<Link, 'id' | 'cable' | 'a'>>(links: L[]): L[][] {
	const by = new Map<Id, L[]>()
	for (const l of links) { const k = cableKey(l); const g = by.get(k); if (g) g.push(l); else by.set(k, [l]) }
	return [...by.values()].map((g) => g.sort((x, y) => x.a.port - y.a.port))
}

/** New links made into cables of `cores` cores, in order (24 ports on 12-core cable type → 2 cables). One core or
 *  fewer = left as single cables. */
export function intoCables(links: Link[], cores: number): Link[] {
	if (cores <= 1) return links
	let cable = ''
	return links.map((l, i) => { if (i % cores === 0) cable = newId(); return { ...l, cable } })
}

/** "core 3 of 24" for each link of a multi-core cable (its place among the cable's cores by port; of the type's
 *  cores, or of the cores linked when more); "cores 5–6 of 24" on a port of 2 cores (LC, `perPort`). */
export function coreLabels(links: Link[], cores: (type: string | undefined) => number, perPort: (l: Link) => number = () => 1): Map<Id, string> {
	const out = new Map<Id, string>()
	for (const g of cablesOf(links.filter((l) => l.cable))) {
		const k = perPort(g[0]), of = Math.max(cores(g[0].cableType), g.length * k)
		g.forEach((l, i) => out.set(l.id, k === 1 ? `core ${i + 1} of ${of}` : `cores ${i * k + 1}–${(i + 1) * k} of ${of}`))
	}
	return out
}
