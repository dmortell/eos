// RE-PATCH IN BULK (backlog W17, walkthrough B60): re-patching was ~9 actions a cord (find the row, select, drag a
// 12 px grip). The Patching table's To cell takes a typed port instead — "SW1:41", "R301 · SW1 : 41", or "41" for
// another port of the same device — and several selected cords go on from it to the next free ports. Every move goes
// through `repatch` (an installed cord becomes a change, one room only, labelled panel ports …).
import type { Cord, Device, PortRef, Rack } from './types'
import { ProjectIndex } from './project'
import { patchProblem, repatch } from './cords'

const TEXT = /^(?:(.+?)\s*·\s*)?(?:(.+?)\s*:\s*)?(\d+)\s*(?:\((front|rear)\))?$/i
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** The port a typed To cell means; `near` = the end as it is now (a bare number is another port of its device; a
 *  device name used in more than one rack means the one in its rack, else its room). */
export function portFromText(ix: ProjectIndex, text: string, near: PortRef): { to: PortRef } | { problem: string } {
	const m = TEXT.exec(text.trim())
	if (!m) return { problem: `“${text.trim()}” isn’t a port — type device : port, e.g. SW1:41 (or just 41 on the same device)` }
	const [, rackName, devName, port, face] = m
	const here = ix.get<Device>(near.on)
	let dev: Device | undefined
	if (!devName) {
		if (rackName) return { problem: 'Type the device too: rack · device : port' }
		dev = here?.type === 'device' ? here : undefined
	} else {
		const named = ix.devices.filter((d) => same(d.name, devName) && (!rackName || same(ix.nameOf(d.rackId), rackName)))
		const roomOf = (d: Device | undefined) => (d ? ix.get<Rack>(d.rackId)?.spaceId : undefined)
		dev = named.length === 1 ? named[0] : named.find((d) => d.rackId === here?.rackId) ?? (named.filter((d) => roomOf(d) === roomOf(here)).length === 1 ? named.find((d) => roomOf(d) === roomOf(here)) : undefined)
		if (!named.length) return { problem: `No device named ${devName.trim()}${rackName ? ` in ${rackName.trim()}` : ''}` }
		if (!dev) return { problem: `${named.length} devices are named ${devName.trim()} — type its rack too: ${ix.nameOf(named[0].rackId)} · ${named[0].name} : ${port}` }
	}
	if (!dev) return { problem: 'Type the device too: SW1:41' }
	const f = (face?.toLowerCase() as PortRef['face']) ?? near.face
	return { to: { on: dev.id, port: Number(port), ...(f ? { face: f } : {}) } }
}

/** Which end of a cord a re-patch onto `to` moves: the one on the same kind of device (a switch port typed → its
 *  switch end, whichever column it is in); both or neither → the To end (b). */
export function endFor(ix: ProjectIndex, c: Cord, to: PortRef): 'a' | 'b' {
	const kind = (on: string) => ix.get<Device>(on)?.kind, k = kind(to.on)
	const a = kind(c.a.on) === k, b = kind(c.b.on) === k
	return a && !b ? 'a' : 'b'
}

/**
 * The cords' `end`s re-patched from `first` on: the first cord to `first`, each next to the next port of that device
 * that no other cord holds (a port a cord of this batch is leaving counts as free). All or nothing: `problem` names the
 * first cord that can't move. The cords keep the order given (the table's). `end` = 'a' / 'b', or 'kind' (`endFor`).
 */
export function repatchRun(ix: ProjectIndex, cords: Cord[], which: 'a' | 'b' | 'kind', first: PortRef): { cords: Cord[] } | { problem: string } {
	const moving = new Set(cords.map((c) => c.id))
	const rest = new ProjectIndex([...ix.byId.values()].filter((e) => !moving.has(e.id)))   // the batch's own ports are free
	const dev = ix.get<Device>(first.on)
	const taken = new Set<number>(), out: Cord[] = []
	let port = first.port
	for (const [i, c] of cords.entries()) {
		const end = which === 'kind' ? endFor(ix, c, first) : which
		if (i > 0) {
			while (port <= (dev?.portCount ?? 0) && (taken.has(port) || /already patched/.test(patchProblem(rest, { ...first, port }) ?? ''))) port++
			if (dev && port > dev.portCount) return { problem: `${dev.name} has no free port left for ${ix.portPlace(c[end === 'a' ? 'b' : 'a'])} (${dev.portCount} ports)` }
		}
		const to = { ...first, port }
		const r = repatch(rest, c, end, to)
		if (!r.cord) return { problem: `${ix.portPlace(c[end === 'a' ? 'b' : 'a'])}: ${r.problem ?? 'can’t move'}` }
		out.push(r.cord)
		taken.add(port)
		port++
	}
	return { cords: out }
}
