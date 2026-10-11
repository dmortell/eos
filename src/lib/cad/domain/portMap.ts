// The PORT MAP (port-map-plan.md, Dave 2026-10-11): every port of the chosen panels / switches with what it reaches —
// the outlet(s) at the ends of its circuit, the port its cord goes to, and any device port beyond — so network
// engineers can assign VLANs. Pure; tested in portMap.test.ts. The Excel is render/exports.ts `exportPortMap`.
import type { ProjectIndex } from './project'
import type { Cord, Device, Id, Rack } from './types'
import { traceCircuit } from './cords'
import { naturalCompare } from './labels'

export interface PortMapRow {
	deviceId: Id
	room: string
	rack: string
	device: string
	u: number
	port: number
	/** The label the port shows (the outlet port's label through its link, or its own). */
	label: string
	/** The outlet port(s) at the ends of the circuit ('' = none; two for a panel-to-panel cross-connect, " / ") and
	 *  where they are (level · room / zone). */
	outlet: string
	outletAt: string
	/** The other end of the cord on this port, with its label ("P3C · P3C-35 : 15 (front) · 01A.031B"). */
	patchedTo: string
	/** A device port at the far end of the circuit beyond the cord (e.g. the switch behind a panel-to-panel tie). */
	farEnd: string
	cordId: string
	/** The status of the cord on this port ('' = no cord): `add` = planned, not yet on site. */
	cordStatus: Cord['status'] | ''
}

/** The devices in the map's order: room, rack (by name), then from the top U down. */
export function portMapDevices(ix: ProjectIndex, ids: Id[]): Device[] {
	const rackOf = (d: Device) => ix.get(d.rackId) as Rack | undefined
	return ids.map((id) => ix.get(id)).filter((d): d is Device => d?.type === 'device' && (d.portCount ?? 0) > 0)
		.sort((a, b) => naturalCompare(ix.nameOf(rackOf(a)?.spaceId), ix.nameOf(rackOf(b)?.spaceId)) || naturalCompare(ix.nameOf(a.rackId), ix.nameOf(b.rackId)) || b.u - a.u)
}

export function portMapRows(ix: ProjectIndex, deviceIds: Id[]): PortMapRow[] {
	const out: PortMapRow[] = []
	for (const d of portMapDevices(ix, deviceIds)) {
		const room = ix.nameOf((ix.get(d.rackId) as Rack | undefined)?.spaceId), rack = ix.nameOf(d.rackId)
		for (let port = 1; port <= (d.portCount ?? 0); port++) {
			const steps = traceCircuit(ix, { on: d.id, port })
			const isMe = (r: { on: Id; port: number }) => r.on === d.id && r.port === port
			// the circuit's two ends, other than this port: outlets, and device ports
			const ends = [...new Set([0, steps.length - 1])].map((i) => steps[i].ref).filter((r) => !isMe(r))
			const outlets = ends.filter((r) => ix.get(r.on)?.type === 'outlet')
			const cord = ix.cords.find((c) => c.status !== 'remove' && (isMe(c.a) || isMe(c.b)))
			const other = cord && (isMe(cord.a) ? cord.b : cord.a)
			const at = (r: { on: Id }) => { const o = ix.get(r.on) as { levelId: Id; roomId?: Id; zoneId?: Id }; return [ix.nameOf(o.levelId), ix.nameOf(o.roomId ?? o.zoneId)].filter(Boolean).join(' · ') }
			const labelled = (r: { on: Id; port: number }) => { const l = ix.portLabel(r); return `${ix.portPlace(r)}${l ? ` · ${l}` : ''}` }
			out.push({
				deviceId: d.id, room, rack, device: d.name, u: d.u, port,
				label: ix.portLabel({ on: d.id, port }),
				outlet: outlets.map((r) => ix.portLabel(r)).join(' / '),
				outletAt: [...new Set(outlets.map(at))].join(' / '),
				patchedTo: other ? labelled(other) : '',
				farEnd: ends.filter((r) => ix.get(r.on)?.type === 'device' && !(other && r.on === other.on && r.port === other.port)).map((r) => ix.portPlace(r)).join(' / '),
				cordId: cord?.cordId ?? '',
				cordStatus: cord?.status ?? '',
			})
		}
	}
	return out
}
