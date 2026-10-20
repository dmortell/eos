// LEGENDS (backlog "Legend on the drawing", User 2026-10-05): what a legend can list — every symbol (block) in use on
// its levels with how many, and the layers that have something on them (a swatch) — and which rows one legend shows
// (each legend chooses its own; by default every symbol in use). Pure.
import type { Id, Outlet } from './types'
import type { Entity } from './drawing'
import type { ProjectIndex } from './project'
import type { Block } from './blocks'
import { defaultOutletBlock } from './blocks'
import { layersOf, layerOf } from './layers'
import { naturalCompare } from './labels'
import { runLengths } from './reports'

/** `count` = items in the row; `value` = what the legend prints beside it (User 2026-10-20: each kind its own measure)
 *  — outlets and their ports, a trunk layer's metres, racks counted, a symbol placed as a block counted; absent = a key
 *  only (walls, furniture, notes …). */
export interface LegendRow { key: string; kind: 'block' | 'layer'; id: Id; name: string; count: number; value?: string; color?: string }

/** Outlets with their ports ("56 · 284 ports"); one port each prints as just the count. */
const outletValue = (n: number, ports: number) => (ports > n ? `${n} · ${ports} ports` : String(n))
const metres = (m: number) => `${m < 10 ? m.toFixed(1) : Math.round(m)} m`

interface Tally { n: number; outlets: number; ports: number; racks: number; trunkM: number }
const tally = (): Tally => ({ n: 0, outlets: 0, ports: 0, racks: 0, trunkM: 0 })

/** Everything a legend over `levelIds` could list: the symbols in use (outlet symbols and inserts, A → Z), then the
 *  layers with items on them (in layer order). */
export function legendCandidates(ix: ProjectIndex, levelIds: ReadonlySet<Id>, blockOf: (id: Id) => Block | undefined): LegendRow[] {
	const blocks = new Map<Id, Tally>()
	const at = (m: Map<Id, Tally>, id: Id) => { let t = m.get(id); if (!t) m.set(id, (t = tally())); return t }
	for (const o of ix.outlets) if (levelIds.has(o.levelId) && o.at) { const t = at(blocks, (o as Outlet).blockId ?? defaultOutletBlock(o)); t.n++; t.outlets++; t.ports += o.ports.length }
	for (const s of ix.shapes) if (s.levelId && levelIds.has(s.levelId) && s.geom.kind === 'insert') at(blocks, s.geom.blockId).n++
	const symbolRows = [...blocks].map(([id, t]): LegendRow => ({ key: `block:${id}`, kind: 'block', id, name: blockOf(id)?.name ?? 'Missing block', count: t.n,
		value: t.outlets === t.n ? outletValue(t.n, t.ports) : String(t.n) }))
		.sort((a, b) => naturalCompare(a.name, b.name))
	const layers = layersOf(ix.layers), known = new Set(layers.map((l) => l.id)), perLayer = new Map<Id, Tally>()
	const onLevels = (e: Entity) => { const lv = (e as { levelId?: Id }).levelId; return !!lv && levelIds.has(lv) }
	let runM: Map<Id, number> | null = null
	for (const e of ix.byId.values()) {
		if ((e.type !== 'outlet' && e.type !== 'rack' && e.type !== 'shape') || !onLevels(e)) continue
		if (e.type === 'shape' && e.geom.kind === 'legend') continue
		const l = layerOf(e, known)
		if (!l) continue
		const t = at(perLayer, l)
		t.n++
		if (e.type === 'outlet') { t.outlets++; t.ports += e.ports.length }
		else if (e.type === 'rack') t.racks++
		else if (e.role?.kind === 'containment') { runM ??= new Map(runLengths(ix).map((r) => [r.id, r.horizontalM + r.verticalM])); t.trunkM += runM.get(e.id) ?? 0 }
	}
	// a layer's measure: its outlets (with ports), else its trunks' metres, else its racks; else a key only
	const layerValue = (t: Tally) => (t.outlets ? outletValue(t.outlets, t.ports) : t.trunkM ? metres(t.trunkM) : t.racks ? String(t.racks) : undefined)
	const layerRows = layers.filter((l) => perLayer.has(l.id)).map((l): LegendRow => { const t = perLayer.get(l.id)!; const value = layerValue(t); return { key: `layer:${l.id}`, kind: 'layer', id: l.id, name: l.name, count: t.n, ...(value ? { value } : {}), color: l.color ?? l.look } })
	return [...symbolRows, ...layerRows]
}

/** The rows a legend shows: those it chose (in the candidates' order; ones no longer in use drop out), else every
 *  symbol in use. */
export const legendShown = (all: LegendRow[], chosen: string[] | undefined): LegendRow[] =>
	chosen ? all.filter((r) => chosen.includes(r.key)) : all.filter((r) => r.kind === 'block')
