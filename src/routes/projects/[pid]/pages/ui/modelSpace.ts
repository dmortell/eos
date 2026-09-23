// Model space look (B31, review.md): a model-layout pane draws on a dark background like AutoCAD's model
// editor, instead of the white paper a sheet viewport sits on. Colours that were picked for white paper
// can vanish on dark, so the one rule borrowed from AutoCAD's colour 7 (black ↔ white) is: a colour too
// dark to read on the background is lifted towards white; everything else is drawn as-is.

export const MODEL_SPACE_BG = '#212830'    // AutoCAD's default model-space background (33, 40, 48)
export const MODEL_SPACE_INK = '#d7dce2'   // the ByLayer fallback ink on that background

/** WCAG relative luminance of a `#rgb` / `#rrggbb` colour, or null for anything else ('none', names, rgba…). */
function luminance(c: string): number | null {
	const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c)
	if (!m) return null
	const h = m[1].length === 3 ? [...m[1]].map((x) => x + x).join('') : m[1]
	const [r, g, b] = [0, 2, 4].map((i) => {
		const v = parseInt(h.slice(i, i + 2), 16) / 255
		return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
	})
	return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const DARK_L = 0.12   // below this a colour reads poorly on MODEL_SPACE_BG (slate #475569 ≈ 0.09, teal #0e7490 ≈ 0.14)
const LIFT = 0.55     // how far a too-dark colour moves towards white

/** A colour as drawn on the dark model-space background: too-dark colours lifted towards white, others
 *  (and non-hex values) unchanged. */
export function onDark(c: string): string {
	const l = luminance(c)
	if (l === null || l >= DARK_L) return c
	const h = c.length === 4 ? '#' + [...c.slice(1)].map((x) => x + x).join('') : c
	const mix = (i: number) => Math.round(parseInt(h.slice(i, i + 2), 16) * (1 - LIFT) + 255 * LIFT).toString(16).padStart(2, '0')
	return `#${mix(1)}${mix(3)}${mix(5)}`
}
