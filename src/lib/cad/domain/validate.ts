// Validation: the store accepts any well-typed record; these checks report what is wrong for the issues grid and
// for importers. One entity at a time (`validateShape`, `validateEntity`) and across the project (`validateProject`).
import type { Entity } from './drawing'
import type { Id, Outlet, Device, Rack, Link, Cord, PortRef } from './types'
import type { Shape } from './shapes'
import { ownerOf } from './shapes'

export interface Issue { id: Id; code: string; message: string; severity: 'error' | 'warning' }

const err = (id: Id, code: string, message: string): Issue => ({ id, code, message, severity: 'error' })
const warn = (id: Id, code: string, message: string): Issue => ({ id, code, message, severity: 'warning' })

const REGION = new Set(['rect', 'circle', 'polygon'])

export function validateShape(s: Shape): Issue[] {
	const out: Issue[] = []
	const owners = [s.levelId, s.viewId, s.sheetId].filter(Boolean).length
	if (owners !== 1) out.push(err(s.id, 'owner', `A shape needs exactly one owner (has ${owners})`))
	const g = s.geom
	if (g.kind === 'path') {
		if (s.plane) out.push(err(s.id, 'plane-on-path', 'A path has node z values, not a plane'))
		if (s.extent) out.push(err(s.id, 'extent-on-path', 'A path is given 3D size by a section, not an extent'))
		const ids = new Set<string>()
		for (const n of g.nodes) {
			if (ids.has(n.id)) out.push(err(s.id, 'node-dup', `Node id ${n.id} is used twice`))
			ids.add(n.id)
		}
		for (const sg of g.segs) {
			if (!ids.has(sg.a) || !ids.has(sg.b)) out.push(err(s.id, 'seg-dangling', `Segment ${sg.id} points at a missing node`))
			if (sg.a === sg.b) out.push(err(s.id, 'seg-zero', `Segment ${sg.id} starts and ends at the same node`))
		}
		if (g.nodes.length < 2) out.push(err(s.id, 'path-short', 'A path needs at least two nodes'))
	} else {
		if (s.section) out.push(err(s.id, 'section-on-region', 'Only a path has a section'))
		if (s.extent && !REGION.has(g.kind)) out.push(err(s.id, 'extent-kind', `A ${g.kind} cannot be extended`))
		if (g.kind === 'polygon' && g.pts.length < 3) out.push(err(s.id, 'polygon-short', 'A polygon needs at least three points'))
	}
	const r = s.role
	if (r && (r.kind === 'wall' || r.kind === 'containment') && g.kind !== 'path') out.push(err(s.id, 'role-geom', `A ${r.kind} must be a path`))
	if (r && (r.kind === 'wall' || r.kind === 'containment') && !s.section) out.push(err(s.id, 'role-section', `A ${r.kind} needs a section`))
	if (r?.kind === 'wall' && g.kind === 'path') {
		const segs = new Set(g.segs.map((x) => x.id))
		for (const o of r.openings) {
			if (!segs.has(o.segId)) out.push(err(s.id, 'opening-seg', `Opening ${o.id} is on a missing segment`))
			if (o.head <= o.sill) out.push(err(s.id, 'opening-size', `Opening ${o.id} has its head below its sill`))
		}
	}
	if (r && (r.kind === 'wall' || r.kind === 'containment') && ownerOf(s).kind !== 'level') out.push(err(s.id, 'role-owner', `A ${r.kind} belongs in a level's model`))
	return out
}

export function validateEntity(e: Entity): Issue[] {
	switch (e.type) {
		case 'shape': return validateShape(e)
		case 'outlet': return validateOutlet(e)
		default: return []
	}
}

function validateOutlet(o: Outlet): Issue[] {
	const out: Issue[] = []
	if (!o.label.trim()) out.push(err(o.id, 'outlet-label', 'An outlet needs a label'))
	o.ports.forEach((p, i) => { if (p.port !== i + 1) out.push(err(o.id, 'ports-order', `Ports must be numbered 1..${o.ports.length} in order`)) })
	return out
}

/** Checks that need more than one entity: duplicates, overlaps, dangling references. */
export function validateProject(entities: Iterable<Entity>): Issue[] {
	const all = [...entities]
	const byId = new Map(all.map((e) => [e.id, e]))
	const out: Issue[] = all.flatMap(validateEntity)

	// Outlet labels are unique per LEVEL (common formats like "A.001" carry no floor, so they repeat floor to floor);
	// port labels should be unique in the project (a duplicate is a warning: it may be deliberate while renumbering).
	const seen = new Map<string, Id>(), seenPort = new Map<string, Id>()
	for (const o of all.filter((e): e is Outlet => e.type === 'outlet')) {
		const key = `${o.levelId}|${o.label.trim().toLowerCase()}`
		const first = seen.get(key)
		if (first) out.push(err(o.id, 'outlet-dup', `Label ${o.label} is already used on this level (by ${first})`))
		else seen.set(key, o.id)
		for (const p of o.ports) {
			const pk = p.label.trim().toLowerCase(), pf = seenPort.get(pk)
			if (pk && pf && pf !== o.id) out.push(warn(o.id, 'port-label-dup', `Port label ${p.label} is also used on ${pf}`))
			else if (pk) seenPort.set(pk, o.id)
		}
	}

	// Devices fit their rack and don't overlap on a shared face.
	const devices = all.filter((e): e is Device => e.type === 'device')
	for (const d of devices) {
		const rack = byId.get(d.rackId) as Rack | undefined
		if (!rack || rack.type !== 'rack') { out.push(err(d.id, 'device-rack', 'Device is in a missing rack')); continue }
		if (d.u < 1 || d.u + d.heightU - 1 > rack.heightU) out.push(err(d.id, 'device-fit', `${d.name} (U${d.u}, ${d.heightU}U) does not fit a ${rack.heightU}U rack`))
	}
	// A PDU is a vertical 0U strip beside the rails: it takes no rack units, so it never overlaps.
	const faces = (d: Device) => (d.kind === 'pdu' || d.face === 'none' ? [] : d.face === 'both' ? ['front', 'rear'] : [d.face])
	for (let i = 0; i < devices.length; i++) for (let j = i + 1; j < devices.length; j++) {
		const a = devices[i], b = devices[j]
		if (a.rackId !== b.rackId || !faces(a).some((f) => faces(b).includes(f))) continue
		if (a.u <= b.u + b.heightU - 1 && b.u <= a.u + a.heightU - 1) out.push(err(b.id, 'device-overlap', `${b.name} overlaps ${a.name} in the rack`))
	}

	// Links and cords reach real ports.
	const portOk = (r: PortRef) => {
		const e = byId.get(r.on)
		if (e?.type === 'outlet') return r.port >= 1 && r.port <= e.ports.length
		if (e?.type === 'device') return r.port >= 1 && r.port <= e.portCount
		return false
	}
	for (const l of all.filter((e): e is Link | Cord => e.type === 'link' || e.type === 'cord')) {
		for (const end of [l.a, l.b]) if (!portOk(end)) out.push(err(l.id, `${l.type}-end`, `${l.type === 'link' ? 'Link' : 'Cord'} end ${end.on}:${end.port} is not a real port`))
	}
	// A port carries at most one link.
	const used = new Map<string, Id>()
	for (const l of all.filter((e): e is Link => e.type === 'link')) for (const end of [l.a, l.b]) {
		const k = `${end.on}:${end.port}:${end.face ?? ''}`
		const first = used.get(k)
		if (first) out.push(warn(l.id, 'port-twice', `Port ${end.on}:${end.port} already has link ${first}`))
		else used.set(k, l.id)
	}
	return out
}
