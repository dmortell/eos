// MULTI-CORE CABLES (backlog "Multi-core cables", T079): one cable with many cores — a 24-core fibre between two
// panels — is its cores' LINKS (one per core, port ↔ port, as any link) sharing `Link.cable`. The cable TYPE says how
// many cores it has (`cores` in Settings › Cable types; absent = 1). The cores share the cable's type, route, length
// and status; fill, the BOM, the cable schedule, the cable list and the riser view count the cable ONCE. Pure.
import type { Id, Link, ProjectSettings } from './types'
import { cableTypeOf } from './cableTypes'
import { newId } from './ids'

/** The cable a link belongs to: its multi-core cable, else the link itself (a single-core cable). */
export const cableKey = (l: Pick<Link, 'id' | 'cable'>): Id => l.cable ?? l.id

/** A cable type's core count (1 = an ordinary cable). */
export function coresOf(settings: Pick<ProjectSettings, 'cableTypes'> | undefined, type: string | undefined): number {
	const n = type ? cableTypeOf(settings, type)?.cores : undefined
	return n && n > 1 ? Math.floor(n) : 1
}

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
 *  cores, or of the cores linked when more). */
export function coreLabels(links: Link[], cores: (type: string | undefined) => number): Map<Id, string> {
	const out = new Map<Id, string>()
	for (const g of cablesOf(links.filter((l) => l.cable))) {
		const of = Math.max(cores(g[0].cableType), g.length)
		g.forEach((l, i) => out.set(l.id, `core ${i + 1} of ${of}`))
	}
	return out
}
