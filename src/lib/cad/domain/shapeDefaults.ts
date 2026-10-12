// The project's drawing defaults for NEW shapes (Project settings › Drawing): a color, line type and lineweight that
// lines, boxes, circles and the like start with. A default only fills what the target layer leaves "by kind": a layer's
// own color / line type / lineweight rule (they are set on the layer, and a shape's own would override them), so those
// are left out. Unset ('' / 0) = by kind, as before.
import type { ProjectSettings } from './types'
import type { Shape } from './shapes'
import type { Layer } from './drawing'
import type { Id } from './types'
import { DASHES } from '../views/display'
import { layersOf } from './layers'

type Look = { color?: string; dash?: string; weightMm?: number }

/** The `style` a new shape starts with, or undefined (nothing set, or the layer sets it all). */
export function newShapeStyle(settings: ProjectSettings | undefined, layer?: Look): Shape['style'] | undefined {
	const d = settings?.shapeStyle
	if (!d) return undefined
	const st: NonNullable<Shape['style']> = {}
	if (d.color && !layer?.color) st.stroke = d.color
	if (d.dash && (DASHES as string[]).includes(d.dash) && !layer?.dash) st.dash = d.dash
	if (d.weightMm && d.weightMm > 0 && !layer?.weightMm) st.weightMm = d.weightMm
	return Object.keys(st).length ? st : undefined
}

/** The same for a tool: the style of a shape about to go on `layerId` (null = the Drawing layer, where plain shapes go). */
export function styleForNew(settings: ProjectSettings | undefined, layers: Layer[], layerId?: Id | null): Shape['style'] | undefined {
	return newShapeStyle(settings, layersOf(layers).find((l) => l.id === (layerId ?? 'sys:drawing')))
}

/** `{ style }` to spread into a new shape, or nothing. */
export function styleProp(settings: ProjectSettings | undefined, layers: Layer[], layerId?: Id | null): { style?: Shape['style'] } {
	const style = styleForNew(settings, layers, layerId)
	return style ? { style } : {}
}
