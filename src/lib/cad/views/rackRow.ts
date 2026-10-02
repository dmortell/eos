// The RACK-ROW generator (Phase 3, elevations-plan D1): the racks of a server room (or one row) side by side at their
// real widths, seen from the front or rear, in mm — view x along the row, view y = −height above the floor.
// Devices on that face at their U, port cells with level-of-detail labels (short form when small, full stacked form
// when big — elevations-plan §3.3), patch cords between ports on this face. Labels come from ProjectIndex.portLabel:
// a panel port shows the label of the outlet port it is linked to (ADR 0002).
import type { Id, Rack, Device } from '../domain/types'
import type { ProjectIndex } from '../domain/project'
import type { Prim } from './display'
import { naturalCompare } from '../domain/labels'
import { rotate } from '../domain/conventions'
import { changedSincePrinted } from '../domain/ports'

export const RU_MM = 44.45
const RAIL_W = 482.6          // 19" device width
const PORT_AREA_W = 430       // the part of a 19" front that holds ports
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
	const racks = ix.racks.filter((r) => r.spaceId === spec.spaceId && (!spec.rowId || r.rowId === spec.rowId))
	const rowOrder = (r: Rack) => { const row = r.rowId ? ix.get(r.rowId) : undefined; return row?.type === 'rackRow' ? row.order : 1e6 }
	// the viewer's right for each row, from its first placed rack's front
	const right = new Map<string, { x: number; y: number }>()
	for (const r of racks) if (r.at && !right.has(r.rowId ?? '')) right.set(r.rowId ?? '', rotate({ x: 1, y: 0 }, r.rot ?? 0))
	const along = (r: Rack) => { const t = right.get(r.rowId ?? ''); return r.at && t ? r.at.x * t.x + r.at.y * t.y : Infinity }
	racks.sort((a, b) => rowOrder(a) - rowOrder(b) || (a.rowId ?? '').localeCompare(b.rowId ?? '') || along(a) - along(b) || a.order - b.order || naturalCompare(a.name, b.name))
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
		const base = (rackHeight(rack) - rack.heightU * RU_MM) / 2
		const u = Math.floor((-p.y - base) / RU_MM) + 1
		return u >= 1 && u <= rack.heightU ? { rack, u } : null
	}
	return null
}

/** The cell of port `n` (1-based) on a device, in view mm, or null if the device shows no ports. */
export function portCell(d: Device, n: number, devX: number, devZ0: number): { x: number; y: number; w: number; h: number } | null {
	if (!d.portCount || d.kind === 'pdu') return null
	const rows = d.portCount > 24 && d.heightU <= 2 ? 2 : 1
	const cols = Math.ceil(d.portCount / rows)
	const w = PORT_AREA_W / cols, hDev = d.heightU * RU_MM, h = Math.min((hDev * 0.8) / rows, w * 1.6)
	const i = n - 1
	const [row, col] = d.portNumbering === 'column' ? [i % rows, Math.floor(i / rows)] : [Math.floor(i / cols), i % cols]
	const top = devZ0 + hDev / 2 + (rows * h) / 2   // the grid is centred vertically on the device
	return { x: devX - PORT_AREA_W / 2 + col * w, y: -(top - row * h), w, h }
}

/** A label split for stacking: "L01.A.001-A01" → ["L01.A", "001", "A01"]; short form = the last two parts. */
export function labelLines(label: string): { full: string[]; short: string[] } {
	const parts = label.split(/[.\-]/).filter(Boolean)
	if (parts.length <= 2) return { full: [label], short: [label] }
	const full = parts.length > 3 ? [parts.slice(0, parts.length - 2).join('.'), ...parts.slice(-2)] : parts
	return { full, short: parts.slice(-2) }
}

export function rackRowDisplayList(ix: ProjectIndex, spec: RowSpec): Prim[] {
	const out: Prim[] = [], cords: Prim[] = []
	const portAt = new Map<string, { x: number; y: number }>()   // "deviceId:port" → cell centre, for cords
	const layout = rackLayout(ix, spec)
	for (const { rack, x0 } of layout) {
		const h = rackHeight(rack), base = (h - rack.heightU * RU_MM) / 2, mid = x0 + rack.widthMm / 2
		out.push({ k: 'line', pts: [{ x: x0, y: 0 }, { x: x0 + rack.widthMm, y: 0 }, { x: x0 + rack.widthMm, y: -h }, { x: x0, y: -h }], closed: true, fill: true, cls: 'rack', src: rack.id })
		// rails + U ticks (every U), numbers every 5 U (and the top one)
		const railL = mid - RAIL_W / 2 - 8
		for (let u = 1; u <= rack.heightU; u++) {
			const z = base + (u - 1) * RU_MM
			out.push({ k: 'line', pts: [{ x: railL, y: -z }, { x: railL + 8, y: -z }], cls: 'rack-x' })
			if (u === 1 || u % 5 === 0 || u === rack.heightU) out.push({ k: 'text', at: { x: railL - 4, y: -(z + RU_MM * 0.3) }, text: String(u), size: RU_MM * 0.6, anchor: 'end', cls: 'u-label', minPx: 5 })
		}
		out.push({ k: 'text', at: { x: mid, y: -h - 60 }, text: rack.name, size: 90, anchor: 'middle', cls: 'label', src: rack.id })
		for (const d of ix.devicesIn(rack.id)) {
			if (d.face === 'none' || (d.face !== 'both' && d.face !== spec.face && d.kind !== 'pdu')) continue
			if (d.kind === 'pdu') {   // a 0U strip beside the rails
				const x = spec.face === 'rear' ? x0 + rack.widthMm - 60 : x0 + 20, z0 = base + (d.u - 1) * RU_MM
				out.push({ k: 'line', pts: [{ x, y: -z0 }, { x: x + 40, y: -z0 }, { x: x + 40, y: -(z0 + d.heightU * RU_MM) }, { x, y: -(z0 + d.heightU * RU_MM) }], closed: true, fill: true, cls: 'device device-pdu', src: d.id })
				continue
			}
			const w = Math.min(rack.widthMm, d.widthMm ?? RAIL_W), dx = mid + (spec.face === 'rear' ? -(d.offsetX ?? 0) : d.offsetX ?? 0)
			const z0 = base + (d.u - 1) * RU_MM, z1 = z0 + d.heightU * RU_MM
			// a printed panel whose labels have changed since says so, and the changed ports are flagged
			const stale = new Set(changedSincePrinted(ix, d))
			const note = d.panel?.labelsPrintedAt ? (stale.size ? `  ⚠ ${stale.size} label${stale.size > 1 ? 's' : ''} changed since printed` : '  · printed') : ''
			out.push({ k: 'line', pts: [{ x: dx - w / 2, y: -z0 }, { x: dx + w / 2, y: -z0 }, { x: dx + w / 2, y: -z1 }, { x: dx - w / 2, y: -z1 }], closed: true, fill: true, cls: `device device-${d.kind}`, src: d.id })
			out.push({ k: 'text', at: { x: dx - w / 2 + 6, y: -(z1 - Math.min(RU_MM * 0.75, (z1 - z0) * 0.8)) }, text: d.name + note, size: Math.min(RU_MM * 0.45, (z1 - z0) * 0.5), cls: stale.size ? 'device-label device-stale' : 'device-label', src: d.id, minPx: 6 })
			for (let n = 1; n <= d.portCount; n++) {
				const c = portCell(d, n, dx, z0)
				if (!c) break
				const ref = { on: d.id, port: n, face: spec.face }
				const label = ix.portLabel(ref), linked = !!ix.linkAt(ref)
				const cls = (label ? (linked ? 'port port-linked' : 'port port-labelled') : 'port') + (stale.has(n) ? ' port-stale' : '')
				out.push({ k: 'line', pts: [{ x: c.x + 1, y: c.y + 1 }, { x: c.x + c.w - 1, y: c.y + 1 }, { x: c.x + c.w - 1, y: c.y + c.h - 1 }, { x: c.x + 1, y: c.y + c.h - 1 }], closed: true, fill: true, cls, src: d.id, sub: String(n) })
				portAt.set(`${d.id}:${n}`, { x: c.x + c.w / 2, y: c.y + c.h / 2 })
				if (!label) continue
				const { full, short } = labelLines(label)
				const sizeFor = (lines: string[]) => Math.min((c.h * 0.85) / lines.length, (c.w * 0.92) / (Math.max(...lines.map((l) => l.length)) * 0.6))
				const sS = sizeFor(short), sF = sizeFor(full)
				short.forEach((t, li) => out.push({ k: 'text', at: { x: c.x + c.w / 2, y: c.y + c.h / 2 + (li - (short.length - 1) / 2) * sS + sS * 0.35 }, text: t, size: sS, anchor: 'middle', cls: 'port-label', src: d.id, sub: String(n), minPx: LABEL_MIN_PX, maxPx: full.length > short.length ? FULL_MIN_PX * (sS / sF) : undefined }))
				if (full.length > short.length) full.forEach((t, li) => out.push({ k: 'text', at: { x: c.x + c.w / 2, y: c.y + c.h / 2 + (li - (full.length - 1) / 2) * sF + sF * 0.35 }, text: t, size: sF, anchor: 'middle', cls: 'port-label', src: d.id, sub: String(n), minPx: FULL_MIN_PX }))
			}
		}
	}
	// patch cords whose both ends are drawn on this face
	for (const c of ix.cords) {
		if (c.status === 'remove') continue
		const a = portAt.get(`${c.a.on}:${c.a.port}`), b = portAt.get(`${c.b.on}:${c.b.port}`)
		if (!a || !b || (c.a.face && c.a.face !== spec.face) || (c.b.face && c.b.face !== spec.face)) continue
		const sag = Math.min(200, Math.abs(a.x - b.x) * 0.15 + Math.abs(a.y - b.y) * 0.05)
		cords.push({ k: 'line', pts: [a, { x: (a.x + b.x) / 2, y: Math.max(a.y, b.y) + sag }, b], cls: `cord cord-${c.status}`, src: c.id, color: c.colour })
	}
	if (layout.length) {
		const x1 = Math.max(...layout.map((l) => l.x0 + l.rack.widthMm))
		out.unshift({ k: 'line', pts: [{ x: -400, y: 0 }, { x: x1 + 400, y: 0 }], cls: 'datum datum-ffl' }, { k: 'text', at: { x: -400, y: -30 }, text: 'FFL', size: 60, cls: 'datum-label' })
	}
	return [...out, ...cords]
}
