// Shared constants for the Pages tool — kept in one place so the viewport scale, the
// on-screen handle size, and the fixed A3 sheet size can't drift between components.

/** Screen px per model unit at viewport zoom 1 (the viewport's fixed scale). */
export const BASE = 1.84

/** On-screen size of an editing handle (entity grips AND viewport-frame grips). */
export const HANDLE_PX = 9

/** Fixed on-screen size of the A3-landscape sheet (px). Print overrides to true A3 mm. */
export const PAPER_W = 960
export const PAPER_H = 679

/** On-screen px per mm of paper (so A3 landscape = 960×679 px, matching PAPER_W/H). */
export const PAPER_PX_PER_MM = PAPER_W / 420

// ── True drawing scale on paper (B2) ────────────────────────────────────────
// A paper viewport frame renders at TRUE scale: at 1:1 one model unit (mm) = one paper mm; at 1:N it
// is 1/N paper mm. (The frame's viewBox therefore spans `frameWidthPx / PAPER_PX_PER_MM` model units,
// NOT `frameWidthPx / BASE` — BASE is only the arbitrary on-screen scale for full-size/standalone
// views.) These pure helpers make the contract testable and are the single source for the mapping.
/** Paper mm that one model unit occupies at drawing scale 1:N (N = the number after the colon). */
export const modelUnitToPaperMm = (scaleN: number) => 1 / (scaleN || 1)
/** Paper px that one model unit occupies in a frame at scale 1:N. */
export const modelUnitToPaperPx = (scaleN: number) => modelUnitToPaperMm(scaleN) * PAPER_PX_PER_MM
/** The N of a '1:N' scale string (the scale DENOMINATOR); malformed / zero → 1 (1:1). */
export const scaleDenom = (scale: string | undefined) => parseInt((scale || '1:1').split(':')[1] || '1') || 1
/** mm per typographic point → fontPt · PT_MM = paper mm; × scaleDenom(scale) = model mm (annotative text). */
export const PT_MM = 0.352778
// ── Zoom limits (one place — the wheel, the nav toolbar and zoom-to-extents all clamp here) ──
/** Max zoom everywhere: 2000 %. */
export const ZOOM_MAX = 20
/** Min zoom of a viewport's content view (model space / a frame's content) and of the paper canvas. */
export const VIEW_ZOOM_MIN = 0.05
export const CANVAS_ZOOM_MIN = 0.1
export const clampViewZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(VIEW_ZOOM_MIN, z))
export const clampCanvasZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(CANVAS_ZOOM_MIN, z))
export type PaperSize = 'A4' | 'A3' | 'A2'
/** XP7: the paper margin (mm) a sheet starts with — drawn as a guide, frames snap to it. */
export const DEFAULT_MARGIN_MM = 10
/** ISO A-series paper, landscape [width, height] in mm. */
export const PAPER_SIZES: Record<PaperSize, [number, number]> = { A4: [297, 210], A3: [420, 297], A2: [594, 420] }
/** On-screen paper dimensions (px) for a size + orientation. */
export function paperDims(size: PaperSize, landscape: boolean): { w: number; h: number } {
	const [lw, lh] = PAPER_SIZES[size] ?? PAPER_SIZES.A3
	const [mmW, mmH] = landscape ? [lw, lh] : [lh, lw]
	return { w: Math.round(mmW * PAPER_PX_PER_MM), h: Math.round(mmH * PAPER_PX_PER_MM) }
}
