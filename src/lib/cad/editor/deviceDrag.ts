// Dragging devices in a rack row (the Select tool): by whole U, and dropped on another rack they go INTO it — several
// at once too, keeping their spacing. With Ctrl the drag copies them (new devices; links and cords stay behind).
// A move or copy that would overlap or run off a rack is refused: the caller keeps the last good place.
import type { Id, Device, Rack } from '../domain/types'
import { placementProblem } from '../domain/devices'
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
export function dragDevices(g: DeviceDrag, dU: number, target: Rack | undefined, copy: boolean, others: Device[], rackOf: (id: Id) => Rack | undefined): { put: Device[] } | { problem: string } {
	const oneRack = new Set(g.base.map((d) => d.rackId)).size === 1
	const put = g.base.map((b): Device => ({ ...b, ...(copy ? { id: g.copyIds.get(b.id)! } : {}), u: b.u + dU, rackId: target && oneRack ? target.id : b.rackId }))
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
