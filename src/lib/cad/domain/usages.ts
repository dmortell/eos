// The project's outlet USAGES (backlog "Editable usage list", Dave 2026-10-05): desk, AP, printer … — what uses one
// (so it can't be deleted from under them), a new one's id, and the codes an import meets that the list doesn't have
// yet (the legacy import wrote a fixed 5, so RS / FR / WC / LK showed as raw codes). Pure.
import type { ProjectSettings, Outlet, Device } from './types'
import type { Entity } from './drawing'
import { naturalCompare } from './labels'

export type Usage = ProjectSettings['usages'][number]

/** The legacy tools' colours for their location types (frames/parts/exportExcel.ts), for codes met on import. */
const LEGACY_COLOURS: Record<string, string> = {
	desk: '#2563eb', AP: '#16a34a', PR: '#ea580c', RS: '#9333ea', FR: '#dc2626', WC: '#0891b2', TV: '#db2777', LK: '#d97706', 'N/A': '#999999',
}
const MORE = ['#0ea5e9', '#84cc16', '#a855f7', '#f43f5e', '#14b8a6', '#f59e0b', '#6366f1', '#78716c']

/** Every usage code outlets and panels use (outlets' `usage`, panels' `usages`, reserved ports). */
export function usageCodes(all: Iterable<Entity>): Set<string> {
	const out = new Set<string>()
	for (const e of all) {
		if (e.type === 'outlet' && (e as Outlet).usage) out.add((e as Outlet).usage!)
		if (e.type === 'device') {
			const p = (e as Device).panel
			for (const u of p?.usages ?? []) out.add(u)
			for (const r of p?.reservations ?? []) out.add(r.usage)
		}
	}
	return out
}

/** The list with every code in `codes` it doesn't have added (label = the code, the legacy colour when known). */
export function withUsagesMet(list: Usage[], codes: Iterable<string>): Usage[] {
	const have = new Set(list.map((u) => u.id)), out = [...list]
	for (const id of codes) {
		if (!id || have.has(id)) continue
		have.add(id)
		out.push({ id, label: id, color: LEGACY_COLOURS[id] ?? MORE[(out.length - list.length) % MORE.length] })
	}
	return out
}

/** How many outlets have the usage, and panels that take it or reserve ports for it. */
export function usageUses(all: Iterable<Entity>, id: string): { outlets: number; panels: number } {
	let outlets = 0, panels = 0
	for (const e of all) {
		if (e.type === 'outlet' && (e as Outlet).usage === id) outlets++
		if (e.type === 'device') { const p = (e as Device).panel; if (p?.usages?.includes(id) || p?.reservations?.some((r) => r.usage === id)) panels++ }
	}
	return { outlets, panels }
}

/** The project's usages by label, A → Z (Dave 2026-10-05: in the Settings dialog and every dropdown). */
export const sortedUsages = (st: Pick<ProjectSettings, 'usages'> | undefined): Usage[] =>
	[...(st?.usages ?? [])].sort((a, b) => naturalCompare(a.label, b.label))

/** A usage's colour from the project's list (the settings entity in `all`), for tinting outlets and their panel ports
 *  (backlog "Usage colours and outlet tips"); undefined = no such usage / no colour. */
export function usageColour(get: (id: string) => Entity | undefined, usage: string | undefined): string | undefined {
	if (!usage) return undefined
	const st = get('settings') as ProjectSettings | undefined
	return st?.usages?.find((u) => u.id === usage)?.color
}
