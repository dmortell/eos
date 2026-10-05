// The project's CABLE TYPES (backlog "Cable types editor", Dave 2026-10-05): what uses one (so it can't be deleted
// from under them) and a new type's id. The list lives in `settings.cableTypes`; outlet ports and cords refer to a
// type by id, and the project's defaults name one for new outlets / cords. Links carry their own free-text type.
import type { ProjectSettings } from './types'
import type { ProjectIndex } from './project'
import { naturalCompare } from './labels'

export type CableType = ProjectSettings['cableTypes'][number]

/** How many outlet ports and cords use the type, and whether it's a default for new ones. */
export function cableTypeUses(ix: ProjectIndex, settings: ProjectSettings, id: string): { ports: number; cords: number; isDefault: boolean } {
	let ports = 0
	for (const o of ix.outlets) for (const p of o.ports) if (p.cableType === id) ports++
	return {
		ports, cords: ix.cords.filter((c) => c.cableType === id).length,
		isDefault: settings.defaults.outletCableType === id || settings.defaults.cordCableType === id,
	}
}

/** Why a type can't be deleted ("used by 120 outlet ports and 4 cords"), or null when it can. */
export function cantDelete(u: ReturnType<typeof cableTypeUses>): string | null {
	const parts = [u.ports && `${u.ports} outlet port${u.ports === 1 ? '' : 's'}`, u.cords && `${u.cords} cord${u.cords === 1 ? '' : 's'}`].filter(Boolean)
	if (parts.length) return `used by ${parts.join(' and ')}`
	return u.isDefault ? 'the default for new outlets or cords' : null
}

/** An id for a new type from its label ("Cat6A STP" → "cat6a-stp"), unique among `taken`. */
export function newCableTypeId(label: string, taken: string[]): string {
	const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cable'
	let id = base, n = 2
	while (taken.includes(id)) id = `${base}-${n++}`
	return id
}

/** The project's cable types by label, A → Z (Dave 2026-10-05: in the Settings dialog and every dropdown). */
export const sortedCableTypes = (st: Pick<ProjectSettings, 'cableTypes'> | undefined): CableType[] =>
	[...(st?.cableTypes ?? [])].sort((a, b) => naturalCompare(a.label, b.label))
