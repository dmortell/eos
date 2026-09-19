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
export type PaperSize = 'A4' | 'A3' | 'A2'
/** ISO A-series paper, landscape [width, height] in mm. */
export const PAPER_SIZES: Record<PaperSize, [number, number]> = { A4: [297, 210], A3: [420, 297], A2: [594, 420] }
/** On-screen paper dimensions (px) for a size + orientation. */
export function paperDims(size: PaperSize, landscape: boolean): { w: number; h: number } {
	const [lw, lh] = PAPER_SIZES[size] ?? PAPER_SIZES.A3
	const [mmW, mmH] = landscape ? [lw, lh] : [lh, lw]
	return { w: Math.round(mmW * PAPER_PX_PER_MM), h: Math.round(mmH * PAPER_PX_PER_MM) }
}
