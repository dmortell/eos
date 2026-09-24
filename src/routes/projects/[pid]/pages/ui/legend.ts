// D1: the LEGEND smart block (`block: 'legend'`) — its rows are computed from the model it sits in: each visible
// layer that holds something (Background layers left out, and any named in the insert's EXCLUDE attribute), with
// the layer's colour / line type as the swatch and, when COUNTS isn't 'no', how many items are on it. Sized in
// PAPER mm (annotative). Pure; tested in legend.test.ts.
import type { Model } from '../3dview/types'
import type { Ent } from './geometry'

export const LEGEND_BLOCK = 'legend'
export type LegendRow = { id: string; name: string; color: string; dash?: string; line: boolean; count: number }
/** Paper-mm layout of a legend: row pitch, title height, width. */
export const LEGEND = { row: 5, title: 6, w: 62, pad: 2 } as const

export function legendRows(model: Model | undefined, attrs: Record<string, string> | undefined): LegendRow[] {
	if (!model) return []
	const skip = new Set((attrs?.EXCLUDE ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))
	const count = new Map<string, number>()
	const add = (l?: string) => { if (l) count.set(l, (count.get(l) ?? 0) + 1) }
	for (const o of model.objects) add(o.layer)
	for (const e of model.shapes ?? []) if (!(e.type === 'insert' && e.block === LEGEND_BLOCK)) add(e.layer)
	return (model.layers ?? [])
		.filter((l) => l.visible && l.group !== 'Background' && (count.get(l.id) ?? 0) > 0 && !skip.has(l.id.toLowerCase()) && !skip.has(l.name.toLowerCase()))
		.map((l) => ({ id: l.id, name: l.name, color: l.color, dash: l.dash, line: l.swatch === 'line' || !!l.dash && l.dash !== 'solid', count: count.get(l.id) ?? 0 }))
}
/** The legend's box in paper mm (from its top-left insertion point): [w, h]. */
export const legendSize = (rows: number): [number, number] => [LEGEND.w, LEGEND.title + Math.max(1, rows) * LEGEND.row + LEGEND.pad]
export const isLegend = (e: Ent) => e.type === 'insert' && e.block === LEGEND_BLOCK
