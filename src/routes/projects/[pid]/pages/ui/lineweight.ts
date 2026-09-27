// OBJECT STYLE (todo "Object style follow-up", review §3 / §4.2): ByLayer COLOUR resolution and real LINEWEIGHTS in
// paper millimetres, AutoCAD-style. Pure — EntRender, Properties, the drawing defaults and the DXF export all resolve
// a shape's colour / lineweight through here.
//
// Field names (Firestore-durable): `Ent.lw` / `Layer.lw` = a lineweight in MILLIMETRES (one of LINEWEIGHTS); absent
// (or LW_BYLAYER, −1 — DXF's BYLAYER code) = ByLayer. The older `weight` field (a Ent's / a Layer's stroke in SCREEN
// PX, 1.2 px being the default look) is still read: a shape / layer with a `weight` and no `lw` draws at
// `legacyWeightMm(weight)` — px × (0.25 / 1.2), snapped to the nearest standard weight (1.2 px → 0.25 mm, the
// AutoCAD default; 0.5 → 0.09; 1 → 0.2; 1.5 → 0.3; 2 → 0.4; 2.5 → 0.53; 3 → 0.6). Setting a lineweight in
// Properties writes `lw` and drops `weight`, so nothing is migrated in bulk. (`Layer.weight` still drives the 3D
// objects' own stroke in Model3d, in px — unchanged.)
import { STYLE_DEFAULTS } from './geometry'

/** AutoCAD's standard lineweights (mm). */
export const LINEWEIGHTS = [0, 0.05, 0.09, 0.13, 0.15, 0.18, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.53, 0.6, 0.7, 0.8, 0.9, 1, 1.06, 1.2, 1.4, 1.58, 2, 2.11] as const
/** `lw` = ByLayer (also what an absent `lw` means) — DXF group 370's BYLAYER code. */
export const LW_BYLAYER = -1
/** The lineweight of a shape that is ByLayer on a layer without one (AutoCAD's LWDEFAULT). */
export const LW_DEFAULT = 0.25
/** Legacy `weight` (screen px) → mm: the old default look (STYLE_DEFAULTS.weight, 1.2 px) is LW_DEFAULT. */
export const LEGACY_PX_TO_MM = LW_DEFAULT / STYLE_DEFAULTS.weight
/** Screen px per mm in MODEL SPACE (no paper there): a CSS mm, so 0.25 mm ≈ 1 px, 1 mm ≈ 3.8 px. */
export const SCREEN_PX_PER_MM = 96 / 25.4
/** The thinnest stroke (screen px): every line with LWT off, 0.00 mm / anything thinner with LWT on. */
export const HAIRLINE_PX = 0.5

/** The standard lineweight nearest `mm` (negative → 0). */
export function nearestLw(mm: number): number {
	let best: number = LINEWEIGHTS[0]
	for (const w of LINEWEIGHTS) if (Math.abs(w - mm) < Math.abs(best - mm)) best = w
	return best
}
/** A legacy screen-px `weight` as a standard lineweight (mm). */
export const legacyWeightMm = (px: number) => nearestLw(px * LEGACY_PX_TO_MM)

type Weighted = { lw?: number; weight?: number } | undefined | null
/** A shape's / a layer's OWN lineweight in mm — its `lw`, else its legacy `weight` mapped — or undefined = ByLayer
 *  (a layer: none set, the default). An explicit `lw: -1` is ByLayer even with a stale `weight` beside it. */
export function ownLw(x: Weighted): number | undefined {
	if (!x) return undefined
	if (x.lw !== undefined && x.lw !== null) return x.lw >= 0 ? x.lw : undefined
	return x.weight !== undefined && x.weight > 0 ? legacyWeightMm(x.weight) : undefined
}
/** The lineweight (mm) a shape draws at: its own → its layer's → LW_DEFAULT. */
export const resolveLw = (e: Weighted, layer?: Weighted): number => ownLw(e) ?? ownLw(layer) ?? LW_DEFAULT

/** The stroke width to draw a lineweight with, in the viewport SVG's CSS px (the unit of a non-scaling stroke).
 *  LWT on: `mm × pxPerMm` (a sheet frame: paper px per mm, so it zooms WITH the paper and prints true), never thinner
 *  than a hairline; LWT off: a hairline. `canvasZoom` = the CSS zoom above the SVG (a hairline stays one on screen). */
export function strokePx(mm: number, o: { lwt: boolean; pxPerMm: number; canvasZoom?: number }): number {
	const hair = HAIRLINE_PX / (o.canvasZoom || 1)
	return o.lwt ? Math.max(hair, mm * o.pxPerMm) : hair
}

/** A lineweight's label: "0.25 mm". */
export const lwLabel = (mm: number) => `${mm.toFixed(2)} mm`

/** No colour of its own: unset / '' / 'bylayer' (any case). */
export const isByLayer = (c?: string | null) => !c || c.toLowerCase() === 'bylayer'
/** ByLayer COLOUR resolution: the object's own colour → its layer's colour → the tool ink. A stray 'byblock' outside
 *  a block (blocks.ts byBlock resolves it inside one) is ByLayer too. */
export function resolveColor(own: string | undefined | null, layerColor: string | undefined, ink: string): string {
	return own && !isByLayer(own) && own.toLowerCase() !== 'byblock' ? own : layerColor || ink
}
