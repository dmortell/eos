// The RACK-ROW generator (Phase 3, elevations-plan D1): the racks of a server room (or one row) side by side at their
// real widths, seen from the front or rear, in mm — view x along the row, view y = −height above the floor.
// Devices on that face at their U, port cells with level-of-detail labels (short form when small, full stacked form
// when big — elevations-plan §3.3), patch cords between ports on this face. Labels come from ProjectIndex.portLabel:
// a panel port shows the label of the outlet port it is linked to (ADR 0002).
import type { Id, Rack, Device, Level, Space } from '../domain/types'
import type { ProjectIndex } from '../domain/project'
import type { Prim } from './display'
import { changedSincePrinted } from '../domain/ports'
import { racksInOrder, RACK_DEVICE_W, sidesOf, sharesU, clashUs, roomFloor, portAt } from '../domain/devices'
import { channelRoute, type RackFrame } from './cordRoute'
import { rangeLabel } from '../domain/portGroups'

export const RU_MM = 44.45
const RAIL_W = RACK_DEVICE_W  // the 19" mounting frame / device width (no ears — domain/devices.ts)
const PORT_AREA_W = 430       // the part of a 19" front that holds ports
const MAX_PORT_W = 18, MAX_PORT_H = 30   // one port cell at most (≈ a 24-port panel's spacing)
const ON_PORTS_NAME_MM = 6.85 // a device name drawn over its ports: a 1U 48-port panel's stacked port label size
const ROW_GAP = 800           // between rows in a room view
const LABEL_MIN_PX = 7        // port labels start showing at this screen height
const FULL_MIN_PX = 9         // and switch to the full stacked form here

export interface RowSpec { spaceId: Id; rowId?: Id; face: 'front' | 'rear' }

/**
 * Where each rack sits along the view (x0). Rows one after another (by row order) with a gap; within a row, racks
 * drawn on the plan run LEFT TO RIGHT AS SEEN FROM THEIR FRONT (Dave: racks are drawn on the floor plan, then assigned
 * to rows — no row builder); racks not on the plan follow, by their order field.
 */
export function rackLayout(ix: ProjectIndex, spec: RowSpec): { rack: Rack; x0: number }[] {
	const racks = racksInOrder(ix, spec.spaceId, spec.rowId)
	const out: { rack: Rack; x0: number }[] = []
	let x = 0, prevRow: Id | undefined | null = null
	for (const r of racks) {
		if (prevRow !== null && r.rowId !== prevRow) x += ROW_GAP
		out.push({ rack: r, x0: x })
		x += r.widthMm
		prevRow = r.rowId
	}
	// seen from the rear the row reads right-to-left
	if (spec.face === 'rear') return out.map((o) => ({ rack: o.rack, x0: x - o.x0 - o.rack.widthMm }))
	return out
}

export const rackHeight = (r: Rack) => r.heightMm ?? r.heightU * RU_MM + 150

/** Which rack and which U are under a view point (U = the rack unit the point is in, 1-based from the bottom). */
export function rowHit(ix: ProjectIndex, spec: RowSpec, p: { x: number; y: number }): { rack: Rack; u: number } | null {
	for (const { rack, x0 } of rackLayout(ix, spec)) {
		if (p.x < x0 || p.x > x0 + rack.widthMm) continue
		const base = (rackHeight(rack) - rack.heightU * RU_MM) / 2 + roomFloor(ix, spec.spaceId)   // racks stand on the room's floor
		const u = Math.floor((-p.y - base) / RU_MM) + 1
		return u >= 1 && u <= rack.heightU ? { rack, u } : null
	}
	return null
}

/** The cell of port `n` (1-based) on a device, in view mm, or null if the device shows no ports. */
export function portCell(d: Device, n: number, devX: number, devZ0: number): { x: number; y: number; w: number; h: number } | null {
	if (!d.portCount || d.kind === 'pdu') return null
	// ~24 ports a row, up to two rows a U: a 48-port 1U panel = 2 × 24; a 96-port 2U switch = 4 × 24 (Dave: it read as
	// 48 — its two rows of 48 tiny cells looked like one)
	const rows = d.portCount > 24 ? Math.min(d.heightU * 2, Math.ceil(d.portCount / 24)) : 1
	const cols = Math.ceil(d.portCount / rows)
	// a port is at most a patch panel port's size (24 across 19") — a 2-port server or a tower PC keeps small ports
	// the port area is the device's own front (less a margin): a narrow device (a tower PC) keeps its ports on itself
	const area = Math.min(PORT_AREA_W, (d.widthMm ?? RAIL_W) - 20)
	const w = Math.min(area / cols, MAX_PORT_W), hDev = d.heightU * RU_MM, h = Math.min((hDev * 0.8) / rows, w * 1.6, MAX_PORT_H)
	const [row, col] = portAt(d.portNumbering, n, rows, cols)
	const top = devZ0 + hDev / 2 + (rows * h) / 2   // the grid is centred vertically on the device
	return { x: devX - area / 2 + col * w, y: -(top - row * h), w, h }
}

/** A label split for stacking: "L01.A.001-A01" → ["L01.A", "001", "A01"]; short form = the last two parts. */
export function labelLines(label: string): { full: string[]; short: string[] } {
	const parts = label.split(/[.\-]/).filter(Boolean)
	if (parts.length <= 1) return { full: [label], short: [label] }
	// two parts stack too (Dave: "01A.014A" on one line was ~3 mm in an 18 mm port — unreadable; stacked it's twice the size)
	if (parts.length === 2) return { full: parts, short: parts }
	const full = parts.length > 3 ? [parts.slice(0, parts.length - 2).join('.'), ...parts.slice(-2)] : parts
	return { full, short: parts.slice(-2) }
}

/** Under a rack's name: "42U 4-post" ("1600 mm desk" for desks and shelves, which have no U scale), "· REAR" from behind. */
export function rackCaption(r: Rack, face: 'front' | 'rear'): string {
	return `${r.kind === 'desk' || r.kind === 'shelf' ? `${r.widthMm} mm` : `${r.heightU}U`} ${r.kind}${face === 'rear' ? ' · REAR' : ''}`
}

/** How patch cords are drawn: straight with a sag (the default), or along the cable channels (a project setting). */
export interface RowOpts { cords?: 'channels' | 'straight' }

export function rackRowDisplayList(ix: ProjectIndex, spec: RowSpec, o: RowOpts = {}): Prim[] {
	const out: Prim[] = [], cords: Prim[] = []
	// "deviceId:port" → cell centre, half its height and its rack's frame, for cords
	const portAt = new Map<string, { x: number; y: number; hh: number; rack: RackFrame }>()
	// "deviceId:port" with a cord in (one being removed doesn't count): its cell gets a green edge (Dave: "patched ports
	// should have an indicator")
	const patched = new Set(ix.cords.filter((c) => c.status !== 'remove').flatMap((c) => [`${c.a.on}:${c.a.port}`, `${c.b.on}:${c.b.port}`]))
	const layout = rackLayout(ix, spec)
	if (!layout.length) return [{ k: 'text', at: { x: 0, y: 0 }, text: 'No racks in this room yet — draw them on the plan with the Rack tool', size: 120, cls: 'datum-label' }]
	// the title over the elevation: "4F — IDF 2 · front" (one row: "… · Row A")
	const room = ix.get(spec.spaceId) as { name?: string; levelId?: string } | undefined, top = Math.max(...layout.map((l) => rackHeight(l.rack)))
	const title = [ix.nameOf(room?.levelId), room?.name].filter(Boolean).join(' — ') + (spec.rowId ? ` · ${ix.nameOf(spec.rowId)}` : '') + ` · ${spec.face}`
	out.push({ k: 'text', at: { x: layout[0].x0, y: -top - 230 }, text: title, size: 110, cls: 'label' })
	for (const { rack, x0 } of layout) {
		const h = rackHeight(rack), base = (h - rack.heightU * RU_MM) / 2, mid = x0 + rack.widthMm / 2
		const uScale: Prim[] = []
		out.push({ k: 'line', pts: [{ x: x0, y: 0 }, { x: x0 + rack.widthMm, y: 0 }, { x: x0 + rack.widthMm, y: -h }, { x: x0, y: -h }], closed: true, fill: true, cls: 'rack', src: rack.id })
		// U ticks and numbers (every U) INSIDE the rack's own edges — racks narrower
		// than 19" rails (cable managers, desks) have no U scale (theirs would land on the neighbours)
		if (rack.widthMm >= RAIL_W && rack.kind !== 'vcm' && rack.kind !== 'desk') {
			// the 19" mounting frame: rail to rail, U1 to the top U
			const top = base + rack.heightU * RU_MM
			out.push({ k: 'line', pts: [{ x: mid - RAIL_W / 2, y: -base }, { x: mid + RAIL_W / 2, y: -base }, { x: mid + RAIL_W / 2, y: -top }, { x: mid - RAIL_W / 2, y: -top }], closed: true, cls: 'rack-rails' })
			// numbers sit in the margin beside the rails when it's wide enough; a narrow frame (P3C: 17 mm) puts them
			// just outside its left edge, where panels can't cover them
			const roomy = (rack.widthMm - RAIL_W) / 2 >= 48
			// a tick and a number on every U, on both rails (left: reading out from the left edge; right: mirrored)
			const tl = x0 + (roomy ? 6 : 2), tr = x0 + rack.widthMm - (roomy ? 6 : 2)
			// Us where devices on one side overlap (allowed: a shelf, or "May overlap") read bold red with a "!"
			const clash = clashUs(ix.devicesIn(rack.id))
			for (let u = 1; u <= rack.heightU; u++) {
				const z = base + (u - 1) * RU_MM, y = -(z + RU_MM * 0.25)
				const num = clash.has(u) ? { text: `${u}!`, size: RU_MM * 0.55, cls: 'u-label u-clash', minPx: 5 } : { text: String(u), size: RU_MM * 0.55, cls: 'u-label', minPx: 5 }
				uScale.push({ k: 'line', pts: [{ x: tl, y: -z }, { x: tl + 10, y: -z }], cls: 'rack-x' })
				uScale.push({ k: 'line', pts: [{ x: tr - 10, y: -z }, { x: tr, y: -z }], cls: 'rack-x' })
				uScale.push({ k: 'text', at: { x: roomy ? tl + 12 : x0 - 4, y }, anchor: roomy ? 'start' : 'end', ...num })
				// a narrow frame numbers its left side only: outside its right edge the numbers would land on the next rack
				if (roomy) uScale.push({ k: 'text', at: { x: tr - 12, y }, anchor: 'end', ...num })
			}
		}
		out.push({ k: 'text', at: { x: mid, y: -h - 60 }, text: rack.name, size: 90, anchor: 'middle', cls: 'label', src: rack.id })
		out.push({ k: 'text', at: { x: mid, y: -h - 14 }, text: rackCaption(rack, spec.face), size: 40, anchor: 'middle', cls: 'datum-label' })
		const inRack = ix.devicesIn(rack.id)
		// the rack's cable channels (along the panel edges, outside the port area; a narrow rack: inside its edges) and
		// its horizontal managers on this face — for cords drawn along the channels
		const frame: RackFrame = {
			id: rack.id, mid, chan: rack.widthMm >= RAIL_W ? PORT_AREA_W / 2 + 6 : Math.max(5, rack.widthMm / 2 - 15),
			managers: inRack.filter((d) => d.kind === 'manager' && sidesOf(d).includes(spec.face)).map((d) => -(base + (d.u - 1) * RU_MM + (d.heightU * RU_MM) / 2)),
		}
		for (const d of inRack) {
			if (d.face === 'none') continue
			// a device on the other face only: a faint outline, "(rear)" / "(front)" — what takes the U from behind (Dave);
			// not pickable, so clicks reach this face's devices. A both-face device MOUNTED on the other side is drawn so
			// too where a device on this side shares its U (else it shows as usual: its ports on this face stay usable).
			const behind = d.kind !== 'pdu' && ((d.face !== 'both' && d.face !== spec.face)
				|| (!!d.mount && d.mount !== spec.face && inRack.some((o) => o.id !== d.id && sidesOf(o).includes(spec.face) && sharesU(o, d))))
			if (behind) {
				const w = Math.min(rack.widthMm, d.widthMm ?? RAIL_W), dx = mid + (spec.face === 'rear' ? -(d.offsetX ?? 0) : d.offsetX ?? 0)
				const z0 = base + (d.u - 1) * RU_MM, z1 = z0 + d.heightU * RU_MM
				out.push({ k: 'line', pts: [{ x: dx - w / 2, y: -z0 }, { x: dx + w / 2, y: -z0 }, { x: dx + w / 2, y: -z1 }, { x: dx - w / 2, y: -z1 }], closed: true, cls: 'device-other' })
				out.push({ k: 'text', at: { x: dx - w / 2 + 6, y: -(z0 + z1) / 2 + 10 }, text: `${d.name} (${d.mount ?? d.face})`, size: Math.min(RU_MM * 0.35, (z1 - z0) * 0.4), cls: 'device-other-label', minPx: 6 })
				continue
			}
			if (d.kind === 'pdu') {   // a 0U strip hugging the outside of the rails (clear of the U numbers in the margin)
				// on its side (left / right as seen from the front — mirrored from the rear; backlog "0U PDUs")
				const onLeft = ((d.pduSide ?? 'left') === 'left') === (spec.face !== 'rear')
				const x = onLeft ? Math.max(x0 + 2, mid - RAIL_W / 2 - 44) : Math.min(x0 + rack.widthMm - 42, mid + RAIL_W / 2 + 4)
				const z0 = base + (d.u - 1) * RU_MM, z1 = z0 + d.heightU * RU_MM
				out.push({ k: 'line', pts: [{ x, y: -z0 }, { x: x + 40, y: -z0 }, { x: x + 40, y: -z1 }, { x, y: -z1 }], closed: true, fill: true, cls: 'device device-pdu', src: d.id })
				// its name up the strip, its power inlets at the bottom (where the feed comes in), its sockets along it
				out.push({ k: 'text', at: { x: x + 30, y: -(z0 + z1) / 2 }, text: d.name, size: 22, anchor: 'middle', rot: -90, cls: 'device-label', src: d.id, minPx: 6 })
				for (let n = 0; n < (d.inlets ?? 0); n++) {
					const iz = z0 + 10 + n * 34
					out.push({ k: 'line', pts: [{ x: x + 6, y: -iz }, { x: x + 22, y: -iz }, { x: x + 22, y: -(iz + 24) }, { x: x + 6, y: -(iz + 24) }], closed: true, fill: true, cls: 'pdu-inlet', src: d.id })
				}
				const sockets = d.outlets ?? 0, from = z0 + 14 + (d.inlets ?? 0) * 34, to = z1 - 14 - d.portCount * 40
				const step = sockets > 1 ? Math.max(12, (to - from) / (sockets - 1)) : 0
				for (let n = 0; n < sockets && from + n * step <= to + 0.5; n++)
					out.push({ k: 'circle', c: { x: x + 14, y: -(from + n * step) }, r: 6, cls: 'pdu-socket', src: d.id })
				// its network ports (a metered / switched PDU's management port …), stacked from the top — patchable
				for (let n = 1; n <= d.portCount; n++) {
					const cy = z1 - 8 - (n - 1) * 40, c = { x: x + 4, y: -cy, w: 32, h: 32 }
					const ref = { on: d.id, port: n, face: spec.face }, linked = !!ix.linkAt(ref)
					out.push({ k: 'line', pts: [{ x: c.x, y: c.y }, { x: c.x + c.w, y: c.y }, { x: c.x + c.w, y: c.y + c.h }, { x: c.x, y: c.y + c.h }], closed: true, fill: true, cls: (linked ? 'port port-linked' : 'port') + (patched.has(`${d.id}:${n}`) ? ' port-patched' : ''), src: d.id, sub: String(n) })
					portAt.set(`${d.id}:${n}`, { x: c.x + c.w / 2, y: c.y + c.h / 2, hh: c.h / 2, rack: frame })
				}
				continue
			}
			const w = Math.min(rack.widthMm, d.widthMm ?? RAIL_W), dx = mid + (spec.face === 'rear' ? -(d.offsetX ?? 0) : d.offsetX ?? 0)
			const z0 = base + (d.u - 1) * RU_MM, z1 = z0 + d.heightU * RU_MM
			// a printed panel whose labels have changed since says so, and the changed ports are flagged
			const stale = new Set(changedSincePrinted(ix, d))
			const note = d.panel?.labelsPrintedAt ? (stale.size ? `  ⚠ ${stale.size} label${stale.size > 1 ? 's' : ''} changed since printed` : '  · printed') : ''
			out.push({ k: 'line', pts: [{ x: dx - w / 2, y: -z0 }, { x: dx + w / 2, y: -z0 }, { x: dx + w / 2, y: -z1 }, { x: dx - w / 2, y: -z1 }], closed: true, fill: true, cls: `device device-${d.kind}`, src: d.id })
			const nameCls = stale.size ? 'device-label device-stale' : 'device-label'
			// with ports, the name is drawn AFTER them, at the top left with a halo (Dave: the panel's own label was hidden
			// behind its ports; the strip above a 1U panel's ports is only ~8 mm, too small to read); without, it sits in
			// the device as before
			const grid = portCell(d, 1, dx, z0), nameSize = Math.min(RU_MM * 0.35, (z1 - z0) * 0.4)
			const nameText: Prim = grid
				// no src: drawn over the ports, it must not take their clicks (the device is picked by its body)
				? { k: 'text', at: { x: dx - w / 2 + 4, y: -(z1 - nameSize * 0.95) }, text: d.name + note, size: nameSize, cls: `${nameCls} on-ports`, minPx: 6 }
				: { k: 'text', at: { x: dx - w / 2 + 6, y: -(z1 - Math.min(RU_MM * 0.75, (z1 - z0) * 0.8)) }, text: d.name + note, size: Math.min(RU_MM * 0.45, (z1 - z0) * 0.5), cls: nameCls, src: d.id, minPx: 6 }
			if (!grid) out.push(nameText)
			let minLabel = Infinity   // the smallest port label: once it can be read, the name over the ports shrinks
			let gx0 = Infinity, gx1 = -Infinity, gBottom = -Infinity   // the port grid's left / right edges and its bottom (view y)
			for (let n = 1; n <= d.portCount; n++) {
				const c = portCell(d, n, dx, z0)
				if (!c) break
				gx0 = Math.min(gx0, c.x); gx1 = Math.max(gx1, c.x + c.w); gBottom = Math.max(gBottom, c.y + c.h)
				const ref = { on: d.id, port: n, face: spec.face }
				const label = ix.portLabel(ref), linked = !!ix.linkAt(ref)
				const reserved = d.panel?.reservations?.some((r) => r.ports.includes(n))
				const cls = (label ? (linked ? 'port port-linked' : 'port port-labelled') : 'port') + (patched.has(`${d.id}:${n}`) ? ' port-patched' : '') + (stale.has(n) ? ' port-stale' : '') + (reserved && !linked ? ' port-reserved' : '')
				out.push({ k: 'line', pts: [{ x: c.x + 1, y: c.y + 1 }, { x: c.x + c.w - 1, y: c.y + 1 }, { x: c.x + c.w - 1, y: c.y + c.h - 1 }, { x: c.x + 1, y: c.y + c.h - 1 }], closed: true, fill: true, cls, src: d.id, sub: String(n) })
				portAt.set(`${d.id}:${n}`, { x: c.x + c.w / 2, y: c.y + c.h / 2, hh: c.h / 2, rack: frame })
				if (!label) continue
				const { full, short } = labelLines(label)
				const sizeFor = (lines: string[]) => Math.min((c.h * 0.85) / lines.length, (c.w * 0.92) / (Math.max(...lines.map((l) => l.length)) * 0.6))
				const sS = sizeFor(short), sF = sizeFor(full)
				minLabel = Math.min(minLabel, sS)
				short.forEach((t, li) => out.push({ k: 'text', at: { x: c.x + c.w / 2, y: c.y + c.h / 2 + (li - (short.length - 1) / 2) * sS + sS * 0.35 }, text: t, size: sS, anchor: 'middle', cls: 'port-label', src: d.id, sub: String(n), minPx: LABEL_MIN_PX, maxPx: full.length > short.length ? FULL_MIN_PX * (sS / sF) : undefined }))
				if (full.length > short.length) full.forEach((t, li) => out.push({ k: 'text', at: { x: c.x + c.w / 2, y: c.y + c.h / 2 + (li - (full.length - 1) / 2) * sF + sF * 0.35 }, text: t, size: sF, anchor: 'middle', cls: 'port-label', src: d.id, sub: String(n), minPx: FULL_MIN_PX }))
			}
			// 24 ports or more: a tick under the middle of the ports, up from the device's bottom edge to the ports (6 mm at most)
			// (Dave: cable a frame's left-hand outlets to the switch's left-hand ports, its right-hand ones to the right)
			if (d.portCount >= 24 && gx1 > gx0) {
				const x = (gx0 + gx1) / 2
				out.push({ k: 'line', pts: [{ x, y: -z0 }, { x, y: Math.max(gBottom, -z0 - 6) }], cls: 'port-mid' })
			}
			// over the ports (Dave: P3C U32 / U37's name covered them): the name is normal size until the port labels can be
			// read, then small (a 1U 48-port panel's port label size) and see-through, in the top-left corner
			// a panel split into labelled ranges (P3A-R301 / P3A-R302): each range's label at the top left of its first port
			// instead of the one name (its top edge where the name's would be, for the first row)
			const ranges = (d.panel?.groups ?? []).map((g) => ({ g, c: portCell(d, g.from, dx, z0) })).filter((x) => x.c)
			const names = ranges.length ? ranges.map(({ g, c }) => ({ text: rangeLabel(ix, d, g) + (g.from === ranges[0].g.from ? note : ''), top: -c!.y + (z1 - (-grid!.y)), x: c!.x === grid!.x ? dx - w / 2 + 4 : c!.x }))
				: [{ text: d.name + note, top: z1, x: dx - w / 2 + 4 }]
			if (grid && nameText.k === 'text') for (const nm of names) {
				const t: Prim = { ...nameText, text: nm.text, at: { x: nm.x, y: -(nm.top - nameSize * 0.95) } }
				if (minLabel === Infinity) out.push(t)
				else {
					const k = LABEL_MIN_PX / minLabel   // px per mm where the port labels appear
					const small = Math.min(ON_PORTS_NAME_MM, nameSize)
					out.push({ ...t, maxPx: nameSize * k })
					out.push({ ...t, at: { x: nm.x, y: -(nm.top - small * 0.95) }, size: small, cls: `${nameCls} on-ports on-ports-small`, minPx: small * k })
				}
			}
		}
		// the U scale last: nothing in the rack (a PDU, a deep device) covers it
		out.push(...uScale)
	}
	// patch cords whose both ends are drawn on this face (ones marked `remove` too, faded — they still have to come out)
	let lane = 0
	for (const c of ix.cords) {
		const a = portAt.get(`${c.a.on}:${c.a.port}`), b = portAt.get(`${c.b.on}:${c.b.port}`)
		if (!a || !b || (c.a.face && c.a.face !== spec.face) || (c.b.face && c.b.face !== spec.face)) continue
		if (o.cords === 'channels') { cords.push({ k: 'line', pts: channelRoute(a, b, lane++), cls: `cord cord-${c.status}`, src: c.id, color: c.colour }); continue }
		const sag = Math.min(200, Math.abs(a.x - b.x) * 0.15 + Math.abs(a.y - b.y) * 0.05)
		cords.push({ k: 'line', pts: [a, { x: (a.x + b.x) / 2, y: Math.max(a.y, b.y) + sag }, b], cls: `cord cord-${c.status}`, src: c.id, color: c.colour })
	}
	// the racks stand on the room's own floor (Space.floorMm, above FFL): everything drawn so far goes up by it
	const lift = roomFloor(ix, spec.spaceId)
	const up = (ps: Prim[]) => (lift ? ps.map((p) => liftPrim(p, lift)) : ps)
	const lines: Prim[] = []
	if (layout.length) {
		const x1 = Math.max(...layout.map((l) => l.x0 + l.rack.widthMm)), sp = ix.get(spec.spaceId)
		lines.push({ k: 'line', pts: [{ x: -400, y: 0 }, { x: x1 + 400, y: 0 }], cls: 'datum datum-ffl room-line' }, { k: 'text', at: { x: -400, y: -30 }, text: 'FFL', size: 60, cls: 'datum-label room-line' },
			...storeyPrims(ix.get<Level>((sp as { levelId?: Id } | undefined)?.levelId), sp?.type === 'space' ? sp : undefined, -400, x1 + 400))
	}
	return [...lines, ...up(out), ...up(cords)]
}

/** The storey around the racks (Dave): the top of the floor slab under the raised floor, the ceiling and the
 *  underside of the slab above, as lines (the slab ones a little heavier than FFL), from the level's heights (y up
 *  from FFL = negative) — and the server room's OWN floor and ceiling where it has them (they replace the level's
 *  ceiling). Drawn under the racks, on the Room lines layer; nothing from the level when it has no heights. */
function storeyPrims(lv: Level | undefined, room: Space | undefined, xa: number, xb: number): Prim[] {
	const h = lv?.type === 'level' ? lv.heights : undefined
	const line = (y: number, cls: string): Prim => ({ k: 'line', pts: [{ x: xa, y }, { x: xb, y }], cls: `${cls} room-line` })
	const label = (y: number, text: string): Prim => ({ k: 'text', at: { x: xa, y }, text, size: 50, cls: 'datum-label room-line' })
	const sign = (v: number) => (v < 0 ? `-${-v}` : `+${v}`)
	const out: Prim[] = []
	const roomCeil = room?.ceilingMm, rFloor = room?.floorMm
	if (h) {
		const ceil = h.clearHeightMm, soffit = ceil + h.plenumMm, floor = h.raisedFloorMm
		if (roomCeil == null) out.push(line(-ceil, 'riser-ceiling'), label(-ceil - 30, `CEILING FFL+${ceil}`))
		out.push(line(-soffit, 'datum datum-slab'), label(-soffit - 30, `SLAB FFL+${soffit}`))
		if (floor > 0) out.push(line(floor, 'datum datum-slab'), label(floor + 70, `SLAB FFL-${floor}`))
	}
	if (roomCeil != null) out.push(line(-roomCeil, 'riser-ceiling'), label(-roomCeil - 30, `${room?.name ?? 'ROOM'} CEILING FL${sign(roomCeil)}`))
	if (rFloor) out.push(line(-rFloor, 'datum datum-room-floor'), label(-rFloor - 30, `${room?.name ?? 'ROOM'} FLOOR FL${sign(rFloor)}`))
	return out
}

/** A prim moved up by `dz` mm (view y is −height). */
function liftPrim(p: Prim, dz: number): Prim {
	const m = (q: { x: number; y: number }) => ({ x: q.x, y: q.y - dz })
	switch (p.k) {
		case 'line': return { ...p, pts: p.pts.map(m), ...(p.holes ? { holes: p.holes.map((h) => h.map(m)) } : {}) }
		case 'circle': return { ...p, c: m(p.c) }
		case 'text': return { ...p, at: m(p.at) }
		case 'image': return { ...p, y: p.y - dz }
	}
}
