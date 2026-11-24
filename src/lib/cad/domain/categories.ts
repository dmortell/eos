// CABLING CATEGORIES (backlog 57, User 2026-11-23 decision 26): power, AV, security and EMS use the same outlets, runs,
// routes, fill and drawing code as structured cabling, but each is kept apart — its own contractor — through a CATEGORY
// on its usages and cable types. What follows from it: an outlet of a category sits on that category's layer (hide /
// freeze it in a drawing), and the BOM files its outlets, jacks and cable under the category. Absent = Data (structured
// cabling, as before). Pure.
import type { Entity } from './drawing'
import type { ProjectSettings } from './types'

export type CablingCategory = 'data' | 'power' | 'av' | 'security' | 'ems'

/** In the order the BOM lists them (Data first: the lines as they were). */
export const CATEGORIES: { id: CablingCategory; label: string; color: string }[] = [
	{ id: 'data', label: 'Data', color: '#1d4ed8' },
	{ id: 'power', label: 'Power', color: '#dc2626' },
	{ id: 'av', label: 'AV', color: '#db2777' },
	{ id: 'security', label: 'Security', color: '#9333ea' },
	{ id: 'ems', label: 'EMS', color: '#0891b2' },
]

const LABEL = new Map(CATEGORIES.map((c) => [c.id, c.label]))
export const categoryLabel = (c: CablingCategory | undefined): string => LABEL.get(c ?? 'data') ?? 'Data'

/** The layer a category's outlets go on (none for Data: Outlets / Outlets high, as before). */
export const categoryLayerId = (c: CablingCategory): string => `sys:cat-${c}`
export const isCategoryLayer = (id: string): boolean => id.startsWith('sys:cat-')

/** What an item belongs to: an outlet by its usage's category, else by its ports' cable types (the first one not Data);
 *  a link or cord by its cable type. Undefined = Data. */
export type CategoryOf = (e: Entity) => CablingCategory | undefined

export function categoryResolver(st: ProjectSettings | undefined): CategoryOf {
	const byType = new Map((st?.cableTypes ?? []).filter((t) => t.category && t.category !== 'data').map((t) => [t.id, t.category!]))
	const byUsage = new Map((st?.usages ?? []).filter((u) => u.category && u.category !== 'data').map((u) => [u.id, u.category!]))
	if (!byType.size && !byUsage.size) return () => undefined
	return (e) => {
		if (e.type === 'outlet') return byUsage.get(e.usage) ?? e.ports.map((p) => byType.get(p.cableType)).find(Boolean)
		if (e.type === 'link' || e.type === 'cord') return e.cableType ? byType.get(e.cableType) : undefined
		return undefined
	}
}

/** A BOM heading under a category: "Cable" for Data (as before), "Power · Cable" for the others. */
export const categoryHeading = (c: CablingCategory | undefined, base: string): string => (!c || c === 'data' ? base : `${categoryLabel(c)} · ${base}`)

/** Where a BOM heading sorts: Data's first, then each category in turn. */
export function headingRank(heading: string): number {
	const i = CATEGORIES.findIndex((c) => c.id !== 'data' && heading.startsWith(`${c.label} · `))
	return i < 0 ? 0 : i
}
