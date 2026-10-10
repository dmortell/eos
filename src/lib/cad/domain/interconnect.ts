// INTERCONNECTS (Phase 5): permanent cables panel ↔ panel — a BACKBONE between server rooms (through a riser,
// across floors) or a TIE within one room. Like bulk patching: ports picked on one panel go, in order, to the free
// ports of the other from the one clicked. A port that already has a cable is skipped. A multi-core cable type puts
// the links, in order, into cables of its cores (domain/multicore.ts). Pure; tested in interconnect.test.ts.
import type { Id, Link, PortRef, Device, Rack, Level } from './types'
import type { ProjectIndex } from './project'
import { newId } from './ids'
import { intoCables } from './multicore'

/** `a.more`: further panels after the first (several panels selected, Dave 2026-10-10: four 24-port panels onto one
 *  96-port switch) — their ports carry on from where the one before stopped on the other device. */
export function bulkInterconnect(ix: ProjectIndex, a: { on: Id; ports: number[]; face?: 'front' | 'rear'; more?: { on: Id; ports: number[] }[] }, b: { on: Id; start: number; face?: 'front' | 'rear' },
	o: { cableType: string; via?: Id; /** A multi-core type: the links go, in order, into cables of this many cores. */ cores?: number }): { links: Link[]; skipped: string[] } {
	const devB = ix.get<Device>(b.on)
	const links: Link[] = [], skipped: string[] = []
	if (devB?.type !== 'device') return { links, skipped: ['Not a device'] }
	const busy = (r: PortRef) => !!ix.linkAt({ on: r.on, port: r.port })
	let nb = b.start
	sources: for (const src of [a, ...(a.more ?? [])]) {
		const devA = ix.get<Device>(src.on)
		if (devA?.type !== 'device') { skipped.push('Not a device'); continue }
		if (devA.id === devB.id) { skipped.push('Pick a port on ANOTHER panel'); continue }
		const roomA = ix.get<Rack>(devA.rackId)?.spaceId, roomB = ix.get<Rack>(devB.rackId)?.spaceId
		const kind: Link['kind'] = roomA && roomA === roomB ? 'tie' : 'backbone'
		for (const pa of src.ports) {
			const ra: PortRef = { on: src.on, port: pa, ...(a.face ? { face: a.face } : {}) }
			if (busy(ra)) { skipped.push(`${devA.name} port ${pa} already has a cable`); continue }
			while (nb <= devB.portCount && busy({ on: b.on, port: nb })) nb++
			if (nb > devB.portCount) { skipped.push(`${devB.name} has no free port left`); break sources }
			const rb: PortRef = { on: b.on, port: nb, ...(b.face ? { face: b.face } : {}) }
			links.push({ type: 'link', id: newId(), kind, a: ra, b: rb, cableType: o.cableType, ...(o.via ? { via: o.via } : {}), status: 'design' })
			nb++
		}
	}
	return { links: intoCables(links, o.cores ?? 1), skipped }
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

/** Every containment run a cable can be sent through (Port Properties › Route through): risers first, then by level
 *  and label — "TR1 · 1F", "R2 (riser)". */
export function containmentRuns(ix: ProjectIndex): { id: Id; label: string }[] {
	const order = (id: Id | undefined) => ix.get<Level>(id)?.order ?? 0
	return ix.shapes.filter((s) => s.role?.kind === 'containment' && s.geom.kind === 'path').map((s) => {
		const lv = new Set(s.geom.kind === 'path' ? s.geom.nodes.map((n) => n.levelId ?? s.levelId) : []), riser = lv.size > 1
		return { id: s.id, riser, order: order(s.levelId), label: `${s.label || (riser ? 'Riser' : 'Run')}${riser ? ' (riser)' : ` · ${ix.nameOf(s.levelId)}`}` }
	}).sort((a, b) => Number(b.riser) - Number(a.riser) || a.order - b.order || a.label.localeCompare(b.label, undefined, { numeric: true }))
		.map(({ id, label }) => ({ id, label }))
}
