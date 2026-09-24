// D10: the project's DRAWING DEFAULTS — the style a freshly drawn shape starts with (colour, text size, line
// weight / type, dimension heads + unit). Stored on the project doc (`pages.drawingDefaults`), which is saved
// by MERGE (never deletes a field), so "unset" is stored as '' / 0, never undefined. Only NEW shapes take
// them (DocEdit.addEnt), and only in fields the shape doesn't already set — existing drawings never change.
import type { Dash, Ent, Head } from './geometry'

export type DimUnit = 'mm' | 'cm' | 'm'
export type DrawingDefaults = {
	/** '' = ByLayer */
	color?: string
	/** 0 = the tool default (STYLE_DEFAULTS) */
	fontPt?: number
	weight?: number
	/** '' = ByLayer */
	dash?: Dash | ''
	/** Dimension end heads; '' = arrow. */
	dimHead?: Head | ''
	dimUnit?: DimUnit
}

const STROKED = new Set<Ent['type']>(['polyline', 'dim', 'rect', 'ellipse'])
const DRAWN = new Set<Ent['type']>(['polyline', 'dim', 'rect', 'ellipse', 'text'])

/** A new shape with the defaults filled into the fields it leaves unset (blocks / images are untouched). */
export function withDefaults(e: Ent, d?: DrawingDefaults | null): Ent {
	if (!d || !DRAWN.has(e.type)) return e
	const out: Ent = { ...e }
	if (d.color && out.color === undefined) out.color = d.color
	if (e.type === 'text' && d.fontPt && out.fontPt === undefined) out.fontPt = d.fontPt
	if (STROKED.has(e.type)) {
		if (d.weight && out.weight === undefined) out.weight = d.weight
		if (d.dash && out.dash === undefined) out.dash = d.dash
	}
	if (e.type === 'dim') {
		if (d.dimHead && out.headStart === undefined) out.headStart = d.dimHead
		if (d.dimHead && out.headEnd === undefined) out.headEnd = d.dimHead
		if (d.dimUnit && d.dimUnit !== 'mm' && out.unit === undefined) out.unit = d.dimUnit
	}
	return out
}

/** A dimension's figure: a length in model mm shown in its unit (m to 2 dp, cm to 1 dp, mm whole). */
export function dimLabel(lenMm: number, unit?: DimUnit): string {
	if (unit === 'm') return (lenMm / 1000).toFixed(2)
	if (unit === 'cm') return String(Math.round(lenMm) / 10)
	return String(Math.round(lenMm))
}
