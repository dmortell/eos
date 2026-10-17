// The CHANGE LIST drawn on a sheet (design log step 2, User 2026-10-17): a framed table from its top-left point — a
// title, then No · What for each change of the current round linked to the package's sheets (domain/changes.ts
// listChanges). The clouds' numbers refer to it. Drawn from the Log each time; paper mm. Every prim is the list's (picked
// and dragged as one). Looks like a legend (views/legend.ts).
import type { Prim } from './display'
import type { ProjectIndex } from '../domain/project'
import type { Shape } from '../domain/shapes'
import type { DesignChange, Sheet, SheetPackage } from '../domain/drawing'
import type { ProjectSettings } from '../domain/types'
import { currentCycle, listChanges, listSheets, wrap } from '../domain/changes'

/** Characters on a line of What before it wraps. */
const WRAP = 48

export function changeListPrims(ix: ProjectIndex, s: Shape, sheet: Sheet): Prim[] {
	if (s.geom.kind !== 'changeList') return []
	const all = ix.ofType('change') as DesignChange[], st = ix.get('settings') as ProjectSettings | undefined
	const rows = listChanges(all, listSheets(ix.ofType('package') as SheetPackage[], sheet.id), currentCycle(all, st?.changeCycle))
	const at = s.geom.at, id = s.id, size = s.geom.sizeMm ?? 2.5, lineH = size * 1.5, pad = size * 0.6, noW = size * 2.6
	const lines = rows.map((c) => wrap(c.what, WRAP))
	const textW = Math.max(size * 16, ...lines.flat().map((l) => l.length * size * 0.55))
	const w = pad + noW + pad + textW + pad, head = lineH * 1.6
	const h = head + lineH * 1.1 + Math.max(1, lines.reduce((n, ls) => n + ls.length, 0)) * lineH + pad
	const box = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
	const out: Prim[] = [
		{ k: 'line', pts: box(at.x, at.y, at.x + w, at.y + h), closed: true, fill: true, cls: 'legend', src: id },
		{ k: 'text', at: { x: at.x + pad, y: at.y + head * 0.7 }, text: s.geom.title?.trim() || 'CHANGES', size: size * 1.2, cls: 'legend-title', src: id },
		{ k: 'line', pts: [{ x: at.x, y: at.y + head }, { x: at.x + w, y: at.y + head }], cls: 'legend-rule', src: id },
		{ k: 'text', at: { x: at.x + pad, y: at.y + head + lineH * 0.8 }, text: 'No', size: size * 0.9, cls: 'legend-text', src: id },
		{ k: 'text', at: { x: at.x + pad + noW + pad, y: at.y + head + lineH * 0.8 }, text: 'What', size: size * 0.9, cls: 'legend-text', src: id },
		{ k: 'line', pts: [{ x: at.x, y: at.y + head + lineH * 1.1 }, { x: at.x + w, y: at.y + head + lineH * 1.1 }], cls: 'legend-rule', src: id },
	]
	let y = at.y + head + lineH * 1.1
	rows.forEach((c, i) => {
		out.push({ k: 'text', at: { x: at.x + pad, y: y + lineH * 0.75 }, text: String(c.n), size, cls: 'legend-text', src: id })
		lines[i].forEach((l, j) => out.push({ k: 'text', at: { x: at.x + pad + noW + pad, y: y + lineH * (0.75 + j) }, text: l, size, cls: 'legend-text', src: id }))
		y += lines[i].length * lineH
	})
	if (!rows.length) out.push({ k: 'text', at: { x: at.x + pad, y: y + lineH * 0.75 }, text: 'No changes yet — link changes to this package’s sheets (Properties › Changes)', size: size * 0.8, cls: 'legend-text', src: id })
	return out
}
