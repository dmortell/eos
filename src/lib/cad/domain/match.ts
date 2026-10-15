// MATCH PROPERTIES (backlog, User 2026-10-10): copy one shape's layer and look onto another — color, fill, line type,
// lineweight, and a text's size onto a text. What it IS stays (its geometry, its role, a line's end marks).
import type { Id } from './types'
import type { Entity, Layer } from './drawing'
import type { Shape } from './shapes'
import { layersOf, layerOf, defaultLayer } from './layers'

const STYLE_KEYS = ['stroke', 'fill', 'weightMm', 'dash'] as const

/** `target` with `src`'s layer and style; null = nothing to change (not a shape, the same one, already matching). */
export function matchProps(src: Shape, target: Entity, layers: Layer[]): Shape | null {
	if (target.type !== 'shape' || target.id === src.id) return null
	const known = new Set<Id>(layersOf(layers).map((l) => l.id))
	const next: Shape = { ...target }
	// the source's layer as drawn (its own, or its kind's default); the target's own default needs no layerId
	const layer = layerOf(src, known)
	if (layer && layer !== defaultLayer(target)) next.layerId = layer
	else delete next.layerId
	const style: NonNullable<Shape['style']> = { ...target.style }
	for (const k of STYLE_KEYS) { const v = src.style?.[k]; if (v === undefined) delete style[k]; else (style as Record<string, unknown>)[k] = v }
	if (Object.keys(style).length) next.style = style
	else delete next.style
	if (src.geom.kind === 'text' && target.geom.kind === 'text') next.geom = { ...target.geom, sizeMm: src.geom.sizeMm }
	return JSON.stringify(next) === JSON.stringify(target) ? null : next
}
