// The GRID (status bar GRID): an OpenCad / CAD-style LINE grid — minor lines at the snap step (or a power-of-ten
// multiple of it, so they're never denser than MIN_PX on screen) and a MAJOR line every RATIO minors. The minor lines
// FADE IN as they open up (alpha 0 at MIN_PX apart → 1 at MIN_PX × RATIO), and at the switch-over the old majors
// become the new minors at the same strength, so zooming never pops. Pure: the Viewport (model grid, drawing coords)
// and PaperPage (paper grid, paper px) turn the levels into one <path> per level — never an element per line.

/** Minor lines never closer than this on screen (px); they are invisible (alpha 0) at exactly this spacing. */
export const GRID_MIN_PX = 6
/** A major line every RATIO minors (and the next level's step is RATIO × this one's). */
export const GRID_RATIO = 10
/** A level is drawn at full strength once its lines are this far apart (px) — where it takes over as the major. */
const FULL_PX = GRID_MIN_PX * GRID_RATIO
/** More lines than this per level (per axis pair) → the level is skipped (a guard; the levels above keep it rare). */
export const GRID_MAX_LINES = 1200

export type GridLevel = { step: number; alpha: number }

/** How strong a level whose lines are `px` apart on screen draws: 0 at GRID_MIN_PX, 1 from FULL_PX (log-linear). */
export function gridAlpha(px: number): number {
	if (!(px > GRID_MIN_PX)) return 0
	return Math.min(1, Math.log(px / GRID_MIN_PX) / Math.log(FULL_PX / GRID_MIN_PX))
}

/** The grid for a view: `base` = the snap step (drawing units), `pxPerUnit` = screen px per drawing unit. Minor =
 *  base × RATIO^k for the smallest k ≥ 0 at least GRID_MIN_PX apart; major = RATIO × minor. null = nothing sensible
 *  (a bad step / scale). */
export function gridLevels(base: number, pxPerUnit: number): { minor: GridLevel; major: GridLevel } | null {
	if (!(base > 0) || !(pxPerUnit > 0) || !Number.isFinite(base * pxPerUnit)) return null
	let step = base
	for (let i = 0; i < 40 && step * pxPerUnit < GRID_MIN_PX; i++) step *= GRID_RATIO
	const major = step * GRID_RATIO
	return { minor: { step, alpha: gridAlpha(step * pxPerUnit) }, major: { step: major, alpha: gridAlpha(major * pxPerUnit) } }
}

/** An SVG path of the grid lines at multiples of `step` (from the origin) across the box, as `M x y0 V y1` / `M x0 y
 *  H x1` runs. `skip` = leave out the lines on multiples of this (the majors, drawn by their own path). '' when the
 *  box is empty or would need more than GRID_MAX_LINES lines. */
export function gridPath(step: number, x0: number, y0: number, x1: number, y1: number, skip?: number): string {
	if (!(step > 0) || !(x1 > x0) || !(y1 > y0)) return ''
	const i0 = Math.ceil(x0 / step), i1 = Math.floor(x1 / step), j0 = Math.ceil(y0 / step), j1 = Math.floor(y1 / step)
	if (i1 - i0 + 1 + (j1 - j0 + 1) > GRID_MAX_LINES) return ''
	const r = skip && skip > step ? Math.round(skip / step) : 0
	const f = (v: number) => +v.toFixed(6)
	const out: string[] = []
	for (let i = i0; i <= i1; i++) if (!r || i % r !== 0) out.push(`M${f(i * step)} ${f(y0)}V${f(y1)}`)
	for (let j = j0; j <= j1; j++) if (!r || j % r !== 0) out.push(`M${f(x0)} ${f(j * step)}H${f(x1)}`)
	return out.join('')
}

/** The grid's two paths + minor strength for a box (drawing units) at a zoom — what a renderer needs. */
export function gridPaths(base: number, pxPerUnit: number, box: [number, number, number, number]): { minor: string; major: string; minorAlpha: number } | null {
	const lv = gridLevels(base, pxPerUnit); if (!lv) return null
	const [x0, y0, x1, y1] = box
	return { minor: lv.minor.alpha > 0.01 ? gridPath(lv.minor.step, x0, y0, x1, y1, lv.major.step) : '', major: gridPath(lv.major.step, x0, y0, x1, y1), minorAlpha: lv.minor.alpha }
}
