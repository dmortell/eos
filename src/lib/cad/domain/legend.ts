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

export interface LegendRow { key: string; kind: 'block' | 'layer'; id: Id; name: string; count: number; color?: string }

/** Everything a legend over `levelIds` could list: the symbols in use (outlet symbols and inserts, A → Z), then the
 *  layers with items on them (in layer order). */
export function legendCandidates(ix: ProjectIndex, levelIds: ReadonlySet<Id>, blockOf: (id: Id) => Block | undefined): LegendRow[] {
	const blocks = new Map<Id, number>()
	const add = (id: Id) => blocks.set(id, (blocks.get(id) ?? 0) + 1)
	for (const o of ix.outlets) if (levelIds.has(o.levelId) && o.at) add((o as Outlet).blockId ?? defaultOutletBlock(o))
	for (const s of ix.shapes) if (s.levelId && levelIds.has(s.levelId) && s.geom.kind === 'insert') add(s.geom.blockId)
	const symbolRows = [...blocks].map(([id, count]): LegendRow => ({ key: `block:${id}`, kind: 'block', id, name: blockOf(id)?.name ?? 'Missing block', count }))
		.sort((a, b) => naturalCompare(a.name, b.name))
	const layers = layersOf(ix.layers), known = new Set(layers.map((l) => l.id)), perLayer = new Map<Id, number>()
	const onLevels = (e: Entity) => { const lv = (e as { levelId?: Id }).levelId; return !!lv && levelIds.has(lv) }
	for (const e of ix.byId.values()) {
		if ((e.type !== 'outlet' && e.type !== 'rack' && e.type !== 'shape') || !onLevels(e)) continue
		if (e.type === 'shape' && e.geom.kind === 'legend') continue
		const l = layerOf(e, known)
		if (l) perLayer.set(l, (perLayer.get(l) ?? 0) + 1)
	}
	const layerRows = layers.filter((l) => perLayer.has(l.id)).map((l): LegendRow => ({ key: `layer:${l.id}`, kind: 'layer', id: l.id, name: l.name, count: perLayer.get(l.id)!, color: l.color ?? l.look }))
	return [...symbolRows, ...layerRows]
}

/** The rows a legend shows: those it chose (in the candidates' order; ones no longer in use drop out), else every
 *  symbol in use. */
export const legendShown = (all: LegendRow[], chosen: string[] | undefined): LegendRow[] =>
	chosen ? all.filter((r) => chosen.includes(r.key)) : all.filter((r) => r.kind === 'block')
