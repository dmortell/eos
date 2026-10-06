// SHEET CATEGORIES (plan `docs/plan/sheets-organising.md` §1; Dave D1: one GLOBAL list for every project): what a
// sheet is — plans, rack elevations, risers … — for sorting, grouping, filtering and package rules. A sheet stores a
// category id in its `kind`; unset, its category is DERIVED from what its viewports show, so most sheets sort
// sensibly with nobody typing anything. A `kind` that isn't in the list (old free text) shows as typed. Pure; tested
// in sheetCategories.test.ts.
import type { Sheet } from './drawing'

export interface SheetCategory { id: string; label: string; code?: string; order: number; retired?: boolean }

/** The built-in list (used while the global doc is empty). */
export const DEFAULT_SHEET_CATEGORIES: SheetCategory[] = [
	{ id: 'general', label: 'General', code: 'G', order: 10 },
	{ id: 'plans', label: 'Plans', code: 'P', order: 20 },
	{ id: 'rack-elevations', label: 'Rack elevations', code: 'RE', order: 30 },
	{ id: 'risers', label: 'Risers', code: 'R', order: 40 },
	{ id: 'sections', label: 'Sections and elevations', code: 'S', order: 50 },
	{ id: 'schedules', label: 'Schedules', code: 'SC', order: 60 },
	{ id: 'details', label: 'Details', code: 'D', order: 70 },
]

/** The category its viewports make it: all plans → Plans, all rack rows → Rack elevations, all risers → Risers, all
 *  sections / building elevations → Sections and elevations; none, or a mix → General. */
export function derivedCategory(s: Pick<Sheet, 'viewports'>): string {
	const kinds = new Set(s.viewports.map((v) => {
		const k = v.view.spec.kind
		return k === 'plan' ? 'plans' : k === 'row' ? 'rack-elevations' : k === 'riser' ? 'risers' : k === 'section' || k === 'elevation' ? 'sections' : 'general'
	}))
	return kinds.size === 1 ? [...kinds][0] : 'general'
}

/** A sheet's category: its own (`kind`), else derived — with its label, list order and whether it was derived. */
export function categoryOf(s: Pick<Sheet, 'kind' | 'viewports'>, list: SheetCategory[] = DEFAULT_SHEET_CATEGORIES): { id: string; label: string; order: number; auto: boolean } {
	const id = s.kind?.trim() || derivedCategory(s), auto = !s.kind?.trim()
	const c = list.find((x) => x.id === id) ?? list.find((x) => x.label.toLowerCase() === id.toLowerCase())
	return c ? { id: c.id, label: c.label, order: c.order, auto } : { id, label: id, order: 1e6, auto }   // typed text not in the list: last
}

/** The list in its order; `all` = with retired ones too (they still name sheets that use them). */
export const ordered = (list: SheetCategory[], all = false): SheetCategory[] => [...list].filter((c) => all || !c.retired).sort((a, b) => a.order - b.order)

/** A new category at the end of the list; its id is a slug of the label, made unique ("Plans" taken → "plans-2"). */
export function addCategory(list: SheetCategory[], label: string, code?: string): SheetCategory[] {
	const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'category'
	const taken = new Set(list.map((c) => c.id))
	let id = base
	for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
	const order = Math.max(0, ...list.map((c) => c.order)) + 10
	return [...list, { id, label: label.trim(), ...(code?.trim() ? { code: code.trim() } : {}), order }]
}

/** One place up / down in the list (retired ones keep their place); orders renumbered 10, 20 … */
export function moveCategory(list: SheetCategory[], id: string, dir: -1 | 1): SheetCategory[] {
	const l = ordered(list, true), i = l.findIndex((c) => c.id === id), j = i + dir
	if (i < 0 || j < 0 || j >= l.length) return list
	;[l[i], l[j]] = [l[j], l[i]]
	return l.map((c, k) => ({ ...c, order: (k + 1) * 10 }))
}

/** Typed kinds on these sheets that aren't in the list (old free text): offered "Add to the category list". */
export function strayKinds(sheets: Pick<Sheet, 'kind'>[], list: SheetCategory[]): string[] {
	const known = new Set(list.flatMap((c) => [c.id, c.label.toLowerCase()]))
	return [...new Set(sheets.map((s) => s.kind?.trim()).filter((k): k is string => !!k && !known.has(k) && !known.has(k.toLowerCase())))].sort()
}
