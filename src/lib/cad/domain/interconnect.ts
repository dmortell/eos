// INTERCONNECTS (Phase 5): permanent cables panel ↔ panel — a BACKBONE between server rooms (through a riser,
// across floors) or a TIE within one room. Like bulk patching: ports picked on one panel go, in order, to the free
// ports of the other from the one clicked. A port that already has a cable is skipped. Pure; tested in
// interconnect.test.ts.
import type { Id, Link, PortRef, Device, Rack } from './types'
import type { ProjectIndex } from './project'
import { newId } from './ids'

export function bulkInterconnect(ix: ProjectIndex, a: { on: Id; ports: number[]; face?: 'front' | 'rear' }, b: { on: Id; start: number; face?: 'front' | 'rear' },
	o: { cableType: string; via?: Id }): { links: Link[]; skipped: string[] } {
	const devA = ix.get<Device>(a.on), devB = ix.get<Device>(b.on)
	const links: Link[] = [], skipped: string[] = []
	if (devA?.type !== 'device' || devB?.type !== 'device') return { links, skipped: ['Not a device'] }
	if (devA.id === devB.id) return { links, skipped: ['Pick a port on ANOTHER panel'] }
	const roomA = ix.get<Rack>(devA.rackId)?.spaceId, roomB = ix.get<Rack>(devB.rackId)?.spaceId
	const kind: Link['kind'] = roomA && roomA === roomB ? 'tie' : 'backbone'
	const busy = (r: PortRef) => !!ix.linkAt({ on: r.on, port: r.port })
	let nb = b.start
	for (const pa of a.ports) {
		const ra: PortRef = { on: a.on, port: pa, ...(a.face ? { face: a.face } : {}) }
		if (busy(ra)) { skipped.push(`${devA.name} port ${pa} already has a cable`); continue }
		while (nb <= devB.portCount && busy({ on: b.on, port: nb })) nb++
		if (nb > devB.portCount) { skipped.push(`${devB.name} has no free port left`); break }
		const rb: PortRef = { on: b.on, port: nb, ...(b.face ? { face: b.face } : {}) }
		links.push({ type: 'link', id: newId(), kind, a: ra, b: rb, cableType: o.cableType, ...(o.via ? { via: o.via } : {}), status: 'design' })
		nb++
	}
	return { links, skipped }
}

/** Runs that can be a cable's "via": risers (a vertical segment between two levels) first, by label. */
export function riserRuns(ix: ProjectIndex): { id: Id; label: string }[] {
	return ix.shapes.filter((s) => {
		if (s.role?.kind !== 'containment' || s.geom.kind !== 'path') return false
		const lv = new Set(s.geom.nodes.map((n) => n.levelId ?? s.levelId))
		return lv.size > 1
	}).map((s) => ({ id: s.id, label: s.label || `Riser ${ix.nameOf(s.levelId)}` }))
		.sort((x, y) => x.label.localeCompare(y.label, undefined, { numeric: true }))
}
