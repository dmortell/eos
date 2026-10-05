// Dragging devices in a rack row (the Select tool): by whole U, and dropped on another rack they go INTO it — several
// at once too, keeping their spacing. With Ctrl the drag copies them (new devices; links and cords stay behind).
// A move or copy that would overlap or run off a rack is refused: the caller keeps the last good place.
import type { Id, Device, Rack } from '../domain/types'
import { placementProblem, narrowDevice } from '../domain/devices'
import { newId } from '../domain/ids'

export interface DeviceDrag {
	/** The devices as they were at the press (every step is computed from these). */
	base: Device[]
	/** New ids for the copies, made once per drag (so the selection is stable while dragging). */
	copyIds: Map<Id, Id>
}

export const startDeviceDrag = (base: Device[]): DeviceDrag => ({ base, copyIds: new Map(base.map((d) => [d.id, newId()])) })

/**
 * The devices moved by `dU` (whole U), into `target` when given — only when they all come from ONE rack (devices from
 * several racks just change U). `copy` = new devices instead (the originals stay). `others` = every device in the
 * project (the originals included). Returns what to write, or why not.
 */
export function dragDevices(g: DeviceDrag, dU: number, target: Rack | undefined, copy: boolean, others: Device[], rackOf: (id: Id) => Rack | undefined, side?: { dx: number; face: 'front' | 'rear' }): { put: Device[] } | { problem: string } {
	const oneRack = new Set(g.base.map((d) => d.rackId)).size === 1
	const put = g.base.map((b): Device => {
		const rackId = target && oneRack ? target.id : b.rackId
		// sideways only within its own rack (a drop into another rack keeps the offset it had)
		return { ...b, ...(copy ? { id: g.copyIds.get(b.id)! } : {}), u: b.u + dU, rackId, ...(rackId === b.rackId ? sideways(b, rackOf(rackId), side) : {}) }
	})
	const moving = new Set(copy ? [] : g.base.map((d) => d.id))
	const rest = others.filter((o) => !moving.has(o.id))
	for (const n of put) {
		const rack = rackOf(n.rackId)
		if (!rack) return { problem: 'No rack there' }
		const p = placementProblem(n, rack, [...rest, ...put.filter((x) => x.id !== n.id)])
		if (p) return { problem: p }
	}
	return { put }
}

/** A device narrower than a 19" one (a tower PC, a monitor — `narrowDevice`) also slides sideways with the drag, in
 *  25 mm steps, kept inside the rack; seen from the rear, sideways is mirrored. 19" devices don't move sideways. */
function sideways(b: Device, rack: Rack | undefined, side?: { dx: number; face: 'front' | 'rear' }): Partial<Device> {
	// a 0U PDU: dragged across the rack it goes to the other side (left / right as seen from the front)
	if (b.kind === 'pdu') {
		if (!side || !rack) return {}
		const fx = side.face === 'rear' ? -side.dx : side.dx, was = b.pduSide ?? 'left', far = rack.widthMm * 0.4
		const now = was === 'left' && fx > far ? 'right' : was === 'right' && fx < -far ? 'left' : was
		return now === 'right' ? { pduSide: 'right' } : { pduSide: undefined }
	}
	const w = b.widthMm ?? 0
	if (!side || !rack || !narrowDevice(b) || w >= rack.widthMm) return {}
	const room = (rack.widthMm - w) / 2
	const off = Math.round(((b.offsetX ?? 0) + (side.face === 'rear' ? -side.dx : side.dx)) / 25) * 25
	const x = Math.max(-room, Math.min(room, off))
	return x ? { offsetX: x } : { offsetX: undefined }
}
