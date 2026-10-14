// Port labels as edits (Phase 3.3, ADR 0002): a label is stored ONCE. A panel port linked to an outlet shows the
// outlet port's label, so editing it there edits the outlet; any other device port keeps its own text. Panels whose
// labels were printed keep a snapshot of what was printed, so a later change is caught before it happens (and shown
// after, if someone else made it).
import type { Entity } from './drawing'
import type { Id, Device, Outlet, PortRef } from './types'
import { ProjectIndex } from './project'
import { portLabelsFor, type PortSep } from './labels'

/** The entity to write so that `ref` shows `text`: the linked outlet (its port label) or the device (its own label). */
export function setPortLabel(ix: ProjectIndex, ref: PortRef, text: string): Entity | null {
	const e = ix.get(ref.on)
	if (e?.type === 'outlet') return withOutletPort(e, ref.port, text)
	if (e?.type !== 'device') return null
	const far = ix.farEnd(ref), fe = far && ix.get(far.on)
	if (fe?.type === 'outlet') return withOutletPort(fe, far!.port, text)
	const labels = { ...e.portLabels }
	if (text.trim()) labels[String(ref.port)] = text.trim()
	else delete labels[String(ref.port)]
	return { ...e, portLabels: Object.keys(labels).length ? labels : undefined }
}

function withOutletPort(o: Outlet, port: number, text: string): Outlet {
	return { ...o, ports: o.ports.map((p) => (p.port === port ? { ...p, label: text.trim() } : p)) }
}

/** Rename an outlet: its own label, and every port label that starts with the old one (A.001A → A.002A). */
export function renameOutlet(o: Outlet, next: string): Outlet {
	return { ...o, label: next, ports: o.ports.map((p) => (p.label.startsWith(o.label) ? { ...p, label: next + p.label.slice(o.label.length) } : p)) }
}

/**
 * Change an outlet's number of ports. New ports continue the existing labels' pattern (…201B → …201C, …-01 → …-02),
 * the server room and cable type of the last port. Removed ports take their links with them — `dropLinks` lists
 * those for the caller to delete (and to ask about first).
 */
export function setPortCount(ix: ProjectIndex, o: Outlet, n: number, defaultCable = 'cat6a', fmt: { style: 'alpha' | 'numeric'; sep: PortSep } = { style: 'alpha', sep: '.' }): { outlet: Outlet; dropLinks: Id[] } {
	n = Math.max(1, Math.min(48, Math.round(n)))
	const ports = o.ports.slice(0, n)
	const fallback = portLabelsFor(o.label, n, fmt.style, fmt.sep)
	while (ports.length < n) {
		const prev = ports[ports.length - 1]
		ports.push({ port: ports.length + 1, label: prev ? nextPortLabel(prev.label) : fallback[ports.length], serverRoomId: prev?.serverRoomId, cableType: prev?.cableType ?? defaultCable })
	}
	const dropLinks = o.ports.slice(n).flatMap((p) => { const l = ix.linkAt({ on: o.id, port: p.port }); return l ? [l.id] : [] })
	return { outlet: { ...o, ports }, dropLinks }
}

/** The label after a port label: a trailing letter goes up (A → B, Z → AA), a trailing number counts up keeping its
 *  width (01 → 02), anything else gets ".2". */
export function nextPortLabel(prev: string): string {
	const letters = prev.match(/^(.*?)([A-Z]+)$/)
	if (letters && !/\d$/.test(prev)) {
		const s = letters[2].split('')
		let i = s.length - 1
		while (i >= 0 && s[i] === 'Z') { s[i] = 'A'; i-- }
		if (i < 0) s.unshift('A'); else s[i] = String.fromCharCode(s[i].charCodeAt(0) + 1)
		return letters[1] + s.join('')
	}
	const num = prev.match(/^(.*?)(\d+)$/)
	if (num) return num[1] + String(Number(num[2]) + 1).padStart(num[2].length, '0')
	return `${prev}.2`
}

/** What a panel shows on each port now (non-empty only), by port number. */
export function shownLabels(ix: ProjectIndex, d: Device): Record<string, string> {
	const out: Record<string, string> = {}
	for (let n = 1; n <= d.portCount; n++) { const l = ix.portLabel({ on: d.id, port: n }); if (l) out[String(n)] = l }
	return out
}

/** Mark a panel's labels as printed: the time, and a snapshot of what was printed. */
export function markPrinted(ix: ProjectIndex, d: Device, now: number): Device {
	return { ...d, panel: { tier: 'low', ...d.panel, labelsPrintedAt: now, printedLabels: shownLabels(ix, d) } }
}

/** Ports of a printed panel whose label is no longer what was printed (empty when not printed). */
export function changedSincePrinted(ix: ProjectIndex, d: Device): number[] {
	const printed = d.panel?.printedLabels
	if (!printed) return []
	const now = shownLabels(ix, d), out: number[] = []
	for (let n = 1; n <= d.portCount; n++) if ((printed[String(n)] ?? '') !== (now[String(n)] ?? '')) out.push(n)
	return out
}

/**
 * The printed panels an edit would change the labels of (ADR 0002: "asks first"). `edits` are the entities about to be
 * written. Returns each panel with the ports that would show something new.
 */
export function printedPanelsAffected(ix: ProjectIndex, edits: Entity[]): { device: Device; ports: number[] }[] {
	const printed = ix.devices.filter((d) => d.panel?.labelsPrintedAt)
	if (!printed.length) return []
	const changed = new Map<Id, Entity>(edits.map((e) => [e.id, e]))
	const after = new ProjectIndex([...ix.byId.values()].map((e) => changed.get(e.id) ?? e).concat(edits.filter((e) => !ix.byId.has(e.id))))
	const out: { device: Device; ports: number[] }[] = []
	for (const d of printed) {
		const ports: number[] = []
		for (let n = 1; n <= d.portCount; n++) if (ix.portLabel({ on: d.id, port: n }) !== after.portLabel({ on: d.id, port: n })) ports.push(n)
		if (ports.length) out.push({ device: d, ports })
	}
	return out
}

/** A device's port reservations: a panel's (`panel.reservations`), else its own (a switch, W16). */
export const reservationsOf = (d: Pick<Device, 'panel' | 'reservations'>): NonNullable<Device['reservations']> => d.panel?.reservations ?? d.reservations ?? []
/** The usage port `n` is reserved for, if any. */
export const reservedFor = (d: Pick<Device, 'panel' | 'reservations'>, n: number): string | undefined => reservationsOf(d).find((r) => r.ports.includes(n))?.usage

/** The device with `ports` reserved for `usage` ('' = their reservation cleared): a port is in at most one
 *  reservation. A panel keeps them in `panel.reservations`, any other device (a switch, W16) in `reservations`. Null
 *  when nothing would change (clearing ports that weren't reserved). */
export function reservePorts(d: Device, ports: number[], usage: string, id: Id): Device | null {
	const had = reservationsOf(d)
	if (!usage && !had.some((r) => r.ports.some((p) => ports.includes(p)))) return null
	const without = had.map((r) => ({ ...r, ports: r.ports.filter((p) => !ports.includes(p)) })).filter((r) => r.ports.length)
	const reservations = usage ? [...without, { id, usage, ports: [...ports] }] : without
	if (d.panel) return { ...d, panel: { ...d.panel, reservations: reservations.length ? reservations : undefined } }
	const { reservations: _old, ...rest } = d
	return reservations.length ? { ...rest, reservations } : rest
}

/** "3–7, 12" for a list of port numbers. */
/** The permanent cables (outlet links, ties, backbone) and patch cords on any port of these devices — what "Remove
 *  links / cords" on selected devices takes off (Dave 2026-10-10: unlink P3A's panels U4–U10 at once). Cords already
 *  marked for removal aren't counted. */
export function cablesOnDevices(ix: ProjectIndex, deviceIds: Id[]): { links: Id[]; cords: Id[] } {
	const on = new Set(deviceIds)
	return {
		links: ix.links.filter((l) => on.has(l.a.on) || on.has(l.b.on)).map((l) => l.id),
		cords: ix.cords.filter((c) => c.status !== 'remove' && (on.has(c.a.on) || on.has(c.b.on))).map((c) => c.id),
	}
}

export function portRanges(ports: number[]): string {
	const s = [...new Set(ports)].sort((a, b) => a - b), out: string[] = []
	for (let i = 0; i < s.length; ) {
		let j = i
		while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++
		out.push(j > i ? `${s[i]}–${s[j]}` : String(s[i]))
		i = j + 1
	}
	return out.join(', ')
}
