// Legacy import, plan half: Outlets docs (one per floor or tenant area) → outlet positions (merged into the outlet
// imported from its Frames location), standalone outlets, trunks → containment shapes, rack placements → rack
// positions, the selected floorplan → an underlay. Coordinates are already plan mm, y down (outlets/parts/types.ts).
import type { Outlet, Rack } from '../../domain/types'
import type { Shape, Section, ContainmentRole, PathNode } from '../../domain/shapes'
import { portLabelsFor } from '../../domain/labels'
import { floorOfDocId, type ImportCtx } from './ctx'
import { DEFAULT_HEIGHTS } from './legacy'

/* eslint-disable @typescript-eslint/no-explicit-any -- legacy docs are untyped Firestore data */
const MOUNTS = new Set(['wall', 'floor', 'box'])

export function importOutletsDocs(c: ImportCtx): void {
	const merged = new Map<string, string>()   // location id → the outlets-doc outlet that took it
	for (const [docId, od] of Object.entries(c.src.outlets)) {
		const f = floorOfDocId(c.src.pid, docId)
		if (!f || !od) continue
		const levelId = c.levelId(f.floor)
		for (const o of od.outlets ?? []) importOutlet(c, docId, f.floor, levelId, o, merged)
		for (const t of od.trunks ?? []) importTrunk(c, docId, f.floor, levelId, t)
		for (const p of od.rackPlacements ?? []) placeRack(c, f.floor, p)
		if (od.selectedFileId) c.add({ type: 'underlay', id: c.id(`underlay:${docId}`), levelId, fileId: od.selectedFileId, page: od.selectedPage ?? 1 })
		if (od.routes?.length) c.issue(levelId, 'routes-skipped', `${od.routes.length} hand-drawn outlet routes on ${docId} were not imported (routing is rebuilt from links in Phase 5)`)
	}
}

function importOutlet(c: ImportCtx, docId: string, floor: number, levelId: string, o: any, merged: Map<string, string>): void {
	const placed = {
		at: { x: o.position?.x ?? 0, y: o.position?.y ?? 0 },
		...(o.rotation ? { rot: o.rotation } : {}),
		...(MOUNTS.has(o.mountType) ? { mount: o.mountType as Outlet['mount'] } : {}),
		...(o.locked ? { locked: true } : {}),
	}
	let locKey = `${floor}:${o.locationId}`
	let locId = o.locationId && c.known(`location:${locKey}`)
	// Never linked in the Outlets tool, but labelled like a Frames location on the same floor → the same outlet.
	if (!locId && o.label) {
		const twin = c.entities.find((e): e is Outlet => e.type === 'outlet' && e.levelId === levelId && e.label === o.label && !e.at)
		const key = twin && Object.keys(c.ids).find((k) => k.startsWith(`location:${floor}:`) && c.ids[k] === twin.id)
		if (twin && key) {
			locKey = key.slice('location:'.length)
			locId = twin.id
			c.issue(twin.id, 'matched-by-label', `The drawn outlet ${o.label} was not linked to a Frames location; matched it to the location with the same label`)
		}
	}
	if (locId) {
		if (merged.has(locKey)) {
			c.issue(locId, 'location-shared', `Two drawn outlets point at one Frames location (${o.label ?? o.id} and ${merged.get(locKey)}) — kept the first; this one was skipped`, 'error')
			return
		}
		merged.set(locKey, o.label ?? o.id)
		const out = c.get<Outlet>(locId)!
		Object.assign(out, placed, { tier: o.level === 'high' ? 'high' : out.tier })
		if (o.cableType) for (const p of out.ports) p.cableType = o.cableType
		c.ids[`outlet:${docId}:${o.id}`] = out.id
		if (o.label && o.label !== out.label) c.issue(out.id, 'outlet-label-differs', `The plan said "${o.label}"; the Frames location gives "${out.label}" — kept "${out.label}"`)
		if ((o.portCount ?? out.ports.length) !== out.ports.length) c.issue(out.id, 'port-count-differs', `The plan said ${o.portCount} ports; the Frames location has ${out.ports.length} — kept ${out.ports.length}`)
		return
	}
	const label = o.label || `${docId.slice(-4)}-${o.id}`
	const count = Math.max(1, o.portCount ?? 1)
	const portLabels: string[] = o.portLabels?.length ? o.portLabels : portLabelsFor(label, count)
	const out: Outlet = {
		type: 'outlet', id: c.id(`outlet:${docId}:${o.id}`), levelId, label,
		tier: o.level === 'high' ? 'high' : 'low', usage: o.usage ?? 'desk', mount: 'floor', ...placed,
		...(o.roomNumber ? { roomId: c.space(floor, 'room', o.roomNumber) } : {}),
		ports: Array.from({ length: count }, (_, i) => ({ port: i + 1, label: portLabels[i] ?? `${label}.${i + 1}`, cableType: o.cableType ?? 'cat6a' })),
	}
	c.add(out)
	if (!o.label) c.issue(out.id, 'outlet-unlabelled', `An outlet on ${docId} had no label — named ${label}`)
}

const FORMS: Record<string, ContainmentRole['form']> = { ladder: 'ladder', tray: 'tray', mat: 'tray' }

function importTrunk(c: ImportCtx, docId: string, floor: number, levelId: string, t: any): void {
	const spec = t.spec ?? {}
	const section: Section = t.shape === 'pipe'
		? { w: spec.outerDiameterMm ?? 25, h: spec.outerDiameterMm ?? 25, round: true, anchor: 'centre', ...(spec.innerDiameterMm ? { inner: { w: spec.innerDiameterMm, h: spec.innerDiameterMm } } : {}) }
		: { w: spec.widthMm ?? 100, h: spec.heightMm ?? 50 }
	const tier: ContainmentRole['tier'] = t.location === 'floor' ? 'low' : t.location === 'wall' ? 'wall' : 'high'
	const serves = (t.rooms ?? []).map((r: string) => c.serverRoom(floor, r))
	const attachOf = (n: any) => {
		if (n.connectedOutletId) return c.known(`outlet:${docId}:${n.connectedOutletId}`)
		if (n.connectedRackId) return rackIdOn(c, floor, n.connectedRackId)
		return undefined
	}
	const nodes: PathNode[] = (t.nodes ?? []).map((n: any) => {
		const attach = attachOf(n)
		// Legacy trunk z is from the slab; cad z is from FFL (ADR 0004 import mapping).
		return { id: n.id, x: n.position.x, y: n.position.y, z: (n.z ?? 0) - DEFAULT_HEIGHTS.raisedFloorMm, ...(n.radius ? { radius: n.radius } : {}), ...(attach ? { attach } : {}) }
	})
	if (nodes.length < 2) { c.issue(levelId, 'trunk-short', `Trunk ${t.label ?? t.id} on ${docId} has fewer than two nodes — skipped`); return }
	const shape: Shape = {
		type: 'shape', id: c.id(`trunk:${docId}:${t.id}`), levelId,
		geom: { kind: 'path', nodes, segs: (t.segments ?? []).map((s: any) => ({ id: s.id, a: s.nodes[0], b: s.nodes[1] })) },
		section,
		role: { kind: 'containment', form: t.shape === 'pipe' ? 'conduit' : FORMS[spec.catalog] ?? 'trunk', tier, ...(serves.length ? { serves } : {}), ...(t.isPrimary ? { primary: true } : {}) },
		...(t.label ? { label: t.label } : {}), ...(spec.catalog && spec.catalog !== 'custom' ? { catalogId: spec.catalog } : {}),
		...(t.color ? { style: { stroke: t.color } } : {}),
	}
	c.add(shape)
}

/** The cad rack for a legacy rack id on a floor (rack ids are only unique within a racks doc, so search the floor). */
function rackIdOn(c: ImportCtx, floor: number, legacyRackId: string): string | undefined {
	const prefix = `rack:${c.src.pid}_F${String(floor).padStart(2, '0')}_R`
	const key = Object.keys(c.ids).find((k) => k.startsWith(prefix) && k.endsWith(`:${legacyRackId}`))
	return key ? c.ids[key] : undefined
}

/** Outlets stores a rack's top-left corner and turns it about its centre; cad stores the centre. */
function placeRack(c: ImportCtx, floor: number, p: any): void {
	const id = rackIdOn(c, floor, p.rackId)
	const rack = id ? c.get<Rack>(id) : undefined
	if (!rack) { c.issue(c.levelId(floor), 'placement-orphan', `A rack placement points at missing rack ${p.rackId}`); return }
	rack.at = { x: p.position.x + rack.widthMm / 2, y: p.position.y + rack.depthMm / 2 }
	if (p.rotation) rack.rot = p.rotation
}
