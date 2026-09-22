// Per-event coordinate mapping for a viewport (review.md §R1, step 2). Built ONCE from
// `svg.getBoundingClientRect()` (the caller passes the rect), then every conversion is arithmetic — so a
// hit/snap pass that tests many points does a single layout read instead of one per point (P1). Pure:
// no component state, unit-testable. The Viewport will build one per pointer event and hand it to the
// hit/grip/snap helpers; today those still call the Viewport's thin wrappers, which this replaces next.
import type { Pt, View } from './geometry'

export type Mapper = {
	/** Client px → drawing (view-local, ÷dscale model-mm) coords. Today's `toLocalXY`. */
	toModel(clientX: number, clientY: number): Pt
	/** Drawing coords → client px. Today's `localToClient`. */
	toClient(x: number, y: number): { x: number; y: number }
	/** Pick tolerance: `px` screen pixels → UNSCALED model mm (B9's `tolMm` = hitTol(px)/dscale). */
	tolMm(px: number): number
}

export type MapperArgs = {
	rect: DOMRect                 // svg.getBoundingClientRect(), read once by the caller
	vbW: number                   // viewBox width in model units ((boxW ?? vpW) / pxPerUnit)
	minX: number; minY: number    // viewBox top-left (CX/CY − vb/2)
	cx: number; cy: number        // scale pivot (PLAN_CX / PLAN_CY)
	view: View                    // per-view pan/zoom
	dscale: number                // drawing scale factor = 1/N
}

/** Build the mapper for one event. `scale` = px per viewBox unit (includes the CSS canvas zoom, since
 *  `rect.width` is the on-screen width). All three conversions are the exact formulas the Viewport used. */
export function makeMapper(a: MapperArgs): Mapper {
	const scale = a.rect.width / a.vbW
	const toVB = (cx: number, cy: number): Pt => [a.minX + (cx - a.rect.left) / scale, a.minY + (cy - a.rect.top) / scale]
	const d = a.dscale || 1
	return {
		toModel(cx, cy) {
			const v = toVB(cx, cy)
			return [a.cx + ((v[0] - a.view.x) / a.view.zoom - a.cx) / d, a.cy + ((v[1] - a.view.y) / a.view.zoom - a.cy) / d]
		},
		toClient(x, y) {
			const vx = a.view.x + a.view.zoom * (a.cx + a.dscale * (x - a.cx))
			const vy = a.view.y + a.view.zoom * (a.cy + a.dscale * (y - a.cy))
			return { x: a.rect.left + (vx - a.minX) * scale, y: a.rect.top + (vy - a.minY) * scale }
		},
		tolMm(px) { return px / (a.view.zoom * scale) / d },
	}
}
