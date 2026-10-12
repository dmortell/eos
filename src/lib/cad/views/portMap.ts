// The PORT MAP view (port-map-plan.md, Dave 2026-10-11): the chosen panels / switches, each drawn like its faceplate —
// its ports where they are on the real thing (the rack view's rows and numbering: a 48-port 1U = 2 × 24) — every
// port with its number small in the top-left corner and, as big as fits, the label of the item at its far end (the
// outlet a switch port reaches, the switch port a panel port is patched to). For network engineers assigning VLANs.
// Paper mm at 1:1, y down, devices stacked down the page. Pure; tested in portMap.test.ts (domain) and here.
import type { ProjectIndex } from '../domain/project'
import type { Device, Id } from '../domain/types'
import type { Prim } from './display'
import { portAt, portGrid } from '../domain/devices'
import { portMapRows, type PortMapRow } from '../domain/portMap'
import { labelLines } from './rackRow'

/** A port cell (mm): 24 across ≈ 290 mm, fits an A3 landscape sheet at 1:1; tall enough for three stacked lines. */
const CELL_W = 12, CELL_H = 11, PAD = 2, TITLE_H = 6, GAP = 8

export { portGrid }

/** The far item's text, in lines for stacking: an outlet port's label split at its dots / dashes; a device's name
 *  then its port. */
export function farLines(far: PortMapRow['far']): string[] {
	if (!far) return []
	return far.kind === 'outlet' ? labelLines(far.label).full : [far.name, far.port]
}

/** The text size (mm) that fits these lines in a cell under the corner number. */
function fitSize(lines: string[]): number {
	const chars = Math.max(...lines.map((l) => l.length), 1)
	return Math.min(2.6, (CELL_W - 1.2) / (chars * 0.58), (CELL_H - 3.4) / (lines.length * 1.2))
}

export function portMapDisplayList(ix: ProjectIndex, deviceIds: Id[]): Prim[] {
	const out: Prim[] = [], rows = portMapRows(ix, deviceIds)
	let y = 0
	for (const id of [...new Set(rows.map((r) => r.deviceId))]) {
		const d = ix.get<Device>(id)!, mine = rows.filter((r) => r.deviceId === id), g = portGrid(d), first = mine[0]
		const w = g.cols * CELL_W + 2 * PAD, h = g.rows * CELL_H + 2 * PAD, top = y + TITLE_H
		out.push({ k: 'text', at: { x: 0, y: y + 4 }, text: `${d.name} — ${first.rack} U${d.u}${first.room ? ` · ${first.room}` : ''} · ${d.portCount} ports`, size: 3.2, cls: 'device-label', src: d.id })
		out.push({ k: 'line', pts: [{ x: 0, y: top }, { x: w, y: top }, { x: w, y: top + h }, { x: 0, y: top + h }], closed: true, fill: true, cls: `device device-${d.kind}`, src: d.id })
		for (const r of mine) {
			const [row, col] = portAt(d.portNumbering, r.port, g.rows, g.cols), x = PAD + col * CELL_W, cy = top + PAD + row * CELL_H
			out.push({ k: 'line', pts: [{ x, y: cy }, { x: x + CELL_W, y: cy }, { x: x + CELL_W, y: cy + CELL_H }, { x, y: cy + CELL_H }], closed: true, fill: true,
				cls: r.far ? `port port-linked${r.cordStatus ? ' port-patched' : ''}` : 'port', src: d.id, sub: String(r.port) })
			out.push({ k: 'text', at: { x: x + 0.7, y: cy + 2 }, text: d.portLabels?.[String(r.port)] || String(r.port), size: 1.6, cls: 'u-label' })
			const lines = farLines(r.far)
			if (!lines.length) continue
			const size = fitSize(lines), lh = size * 1.2, t = cy + 2.4 + (CELL_H - 2.4 - lines.length * lh) / 2 + size * 0.85
			lines.forEach((s, i) => out.push({ k: 'text', at: { x: x + CELL_W / 2, y: t + i * lh }, text: s, size, anchor: 'middle', cls: 'port-label' }))
		}
		y = top + h + GAP
	}
	return out
}
