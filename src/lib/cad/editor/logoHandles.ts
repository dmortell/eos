// LOGO GRIPS on the paper (backlog "Resize logos and drag images on the paper", Dave 2026-10-05): click a title-block
// logo on a sheet to pick it (an outline shows), then drag the grip on its bottom edge down / up to make the logo
// taller / shorter (its printed height, 3–60 mm, for every sheet: the template is the project's). One undo step per
// drag. The grip only shows for the picked logo, drawn like any resize grip (Dave 2026-10-06: it was always on, and
// in the handle style). Pure; tested in views/style.test.ts.
import type { Entity, Sheet } from '../domain/drawing'
import type { ProjectSettings, Pt } from '../domain/types'
import type { ProjectIndex } from '../domain/project'
import type { Handle } from './handles'
import { paperSize, sheetTitleBlock } from '../views/sheet'
import { titleBlockPrims } from '../views/titleBlock'

export type LogoKey = 'company' | 'client'
export interface LogoBox { key: LogoKey; x: number; y: number; w: number; h: number }

/** Where each logo image is drawn on the sheet's paper (mm). */
export function logoBoxes(ix: ProjectIndex, sheet: Sheet, settings: ProjectSettings | undefined): LogoBox[] {
	const t = settings?.titleBlock, logos = t?.logos
	if (!t || !logos) return []
	const { w, h } = paperSize(sheet)
	const prims = titleBlockPrims(sheetTitleBlock(ix, sheet, { template: t }), w, h, sheet.paper.marginMm).prims
	const out: LogoBox[] = []
	for (const key of ['company', 'client'] as const) {
		const src = logos[key]?.src, img = src ? prims.find((p) => p.k === 'image' && p.url === src) : undefined
		if (img?.k === 'image') out.push({ key, x: img.x, y: img.y, w: img.w, h: img.h })
	}
	return out
}

/** The logo under a paper point, if any. */
export const logoAt = (boxes: LogoBox[], p: Pt): LogoKey | null =>
	boxes.find((b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h)?.key ?? null

/** The picked logo's grip (on its bottom edge's middle) and its outline. */
export function logoHandles(ix: ProjectIndex, sheet: Sheet, settings: ProjectSettings | undefined, key: LogoKey): { handles: Handle[]; outline: Pt[] } {
	const t = settings?.titleBlock, logos = t?.logos, lg = logos?.[key], b = logoBoxes(ix, sheet, settings).find((x) => x.key === key)
	if (!settings || !t || !logos || !lg || !b) return { handles: [], outline: [] }
	const bottom = b.y + b.h, old = lg.h ?? 10
	return {
		outline: [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: bottom }, { x: b.x, y: bottom }],
		handles: [{
			at: { x: b.x + b.w / 2, y: bottom }, shape: 'grip', label: 'Logo height',
			drag: (p, free): Entity => {
				const nh = Math.max(3, Math.min(60, old + (p.y - bottom)))
				return { ...settings, titleBlock: { ...t, logos: { ...logos, [key]: { ...lg, h: free ? Math.round(nh * 10) / 10 : Math.round(nh) } } } }
			},
		}],
	}
}
