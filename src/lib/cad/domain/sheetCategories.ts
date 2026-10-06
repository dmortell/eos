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
