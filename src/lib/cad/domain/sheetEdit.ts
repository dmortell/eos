// Sheet edits for the register (sheets-organising slice 3): DUPLICATE a sheet (with its viewports and the notes on its
// paper, no number, no revisions, right after the original in print order) and NUMBER a group of sheets from a
// pattern ("RE-01" → RE-01, RE-02 …; "P101" → P101, P102 …); UNTIE a note from a viewport. Pure; tested in
// sheetEdit.test.ts.
import type { Id, Pt } from './types'
import type { Sheet, Viewport } from './drawing'
import type { Shape, Geometry } from './shapes'
import { annotativeIn } from './blocks'

/** A copy of the sheet and its paper notes, with new ids (`id()` makes one). "(copy)" title, no number. */
export function duplicateSheet(s: Sheet, notes: Shape[], id: () => Id): { sheet: Sheet; notes: Shape[] } {
	const vpIds = new Map(s.viewports.map((v) => [v.id, id()]))
	const sheet: Sheet = { ...structuredClone(s), id: id(), number: '', title: `${s.title} (copy)`, order: (s.order ?? 0) + 0.5, status: 'active', revisions: undefined, changes: undefined, importedFrom: undefined,
		viewports: s.viewports.map((v) => ({ ...structuredClone(v), id: vpIds.get(v.id)! })) }
	const copies = notes.filter((n) => n.sheetId === s.id).map((n) => {
		const c = { ...structuredClone(n), id: id(), sheetId: sheet.id } as Shape
		if (n.vpId) (c as { vpId?: Id }).vpId = vpIds.get(n.vpId)
		if ((c as { groupId?: Id }).groupId) delete (c as { groupId?: Id }).groupId   // not in the original's group
		return c
	})
	return { sheet, notes: copies }
}

/** The numbers for these sheets (in the order given) from a pattern: its last run of digits counts up, keeping its
 *  width ("RE-01" → RE-01, RE-02 …, "S9" → S9, S10). A pattern without digits gets "-01" added. */
export function numberFrom(pattern: string, n: number): string[] {
	const p = pattern.trim(), m = /^(.*?)(\d+)(\D*)$/.exec(p)
	const [pre, digits, post] = m ? [m[1], m[2], m[3]] : [`${p}${p ? '-' : ''}`, '01', '']
	return Array.from({ length: n }, (_, i) => `${pre}${String(Number(digits) + i).padStart(digits.length, '0')}${post}`)
}

/** A note tied to a viewport (one being deleted or retargeted, or copied) put back on the paper where it showed: its
 *  points from the viewport's view mm to paper mm, its sizes in view mm (a box, a circle, a line's nodes, a picture, a
 *  wrapping text's width, a dimension's offset) ÷ the scale; sizes already in paper mm (text height, arrows, a legend)
 *  stay. A block insert keeps its printed size (an annotative symbol is paper mm already; a model block shrinks by the
 *  scale) — drawn on paper with its plan symbol. */
export function untie(s: Shape, vp: Viewport): Shape {
	const k = 1 / vp.scale, mx = vp.rect.x + vp.rect.w / 2, my = vp.rect.y + vp.rect.h / 2
	const t = (p: Pt): Pt => ({ x: mx + (p.x - vp.centre.x) * k, y: my + (p.y - vp.centre.y) * k })
	const g = s.geom
	const geom: Geometry = (() => {
		switch (g.kind) {
			case 'path': return { ...g, nodes: g.nodes.map((n) => ({ ...n, ...t(n) })) }
			case 'text': return { ...g, at: t(g.at), ...(g.width ? { width: g.width * k } : {}) }
			case 'leader': case 'cloud': case 'polygon': return { ...g, pts: g.pts.map(t) }
			case 'rect': case 'image': return { ...g, centre: t(g.centre), size: { x: g.size.x * k, y: g.size.y * k } }
			case 'ellipse': return { ...g, centre: t(g.centre), rx: g.rx * k, ry: g.ry * k }
			case 'circle': case 'arc': return { ...g, centre: t(g.centre), r: g.r * k }
			// a dimension keeps the real length it measured in the view (on paper it would measure paper mm)
			case 'dimension': return { ...g, a: t(g.a), b: t(g.b), offset: g.offset * k, text: g.text ?? `${Math.round(dimLen(g))}`, ...(g.textAt ? { textAt: t(g.textAt) } : {}), ...(g.gapA != null ? { gapA: g.gapA * k } : {}), ...(g.gapB != null ? { gapB: g.gapB * k } : {}) }
			case 'insert': { const sc = (g.scale ?? 1) * (annotativeIn(g.blockId) ? 1 : k); return { ...g, at: t(g.at), scale: sc === 1 ? undefined : sc } }
			case 'legend': return { ...g, at: t(g.at) }
		}
	})()
	const { vpId: _drop, ...rest } = s as Shape & { vpId?: string }
	return { ...rest, geom } as Shape
}

/** The length a dimension measures (as views/plan.ts dimLine). */
function dimLen(g: Extract<Geometry, { kind: 'dimension' }>): number {
	if (g.mode === 'horizontal') return Math.abs(g.b.x - g.a.x)
	if (g.mode === 'vertical') return Math.abs(g.b.y - g.a.y)
	return Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y)
}
