// The project's CABLE TYPES (backlog "Cable types editor", User 2026-10-05): what uses one (so it can't be deleted
// from under them) and a new type's id. The list lives in `settings.cableTypes`; outlet ports and cords refer to a
// type by id, and the project's defaults name one for new outlets / cords. Links (outlet cables, ties, backbone) name
// one too — fill, cores, the riser and the BOM read it.
import type { ProjectSettings } from './types'
import type { ProjectIndex } from './project'
import { naturalCompare } from './labels'

export type CableType = ProjectSettings['cableTypes'][number]

/** How many outlet ports, links and cords use the type, and whether it's a default for new ones. */
export function cableTypeUses(ix: ProjectIndex, settings: ProjectSettings, id: string): { ports: number; links: number; cords: number; isDefault: boolean } {
	let ports = 0
	for (const o of ix.outlets) for (const p of o.ports) if (p.cableType === id) ports++
	return {
		ports, links: ix.links.filter((l) => l.cableType === id).length, cords: ix.cords.filter((c) => c.cableType === id).length,
		isDefault: settings.defaults.outletCableType === id || settings.defaults.cordCableType === id,
	}
}

/** Why a type can't be deleted ("used by 120 outlet ports, 6 links and 4 cords"), or null when it can. */
export function cantDelete(u: ReturnType<typeof cableTypeUses>): string | null {
	const n = (k: number, w: string) => k ? `${k} ${w}${k === 1 ? '' : 's'}` : ''
	const parts = [n(u.ports, 'outlet port'), n(u.links, 'link'), n(u.cords, 'cord')].filter(Boolean)
	if (parts.length) return `used by ${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]}`
	return u.isDefault ? 'the default for new outlets or cords' : null
}

/** An id for a new type from its label ("Cat6A STP" → "cat6a-stp"), unique among `taken`. */
export function newCableTypeId(label: string, taken: string[]): string {
	const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cable'
	let id = base, n = 2
	while (taken.includes(id)) id = `${base}-${n++}`
	return id
}

/** The project's cable types by label, A → Z (User 2026-10-05: in the Settings dialog and every dropdown). */
export const sortedCableTypes = (st: Pick<ProjectSettings, 'cableTypes'> | undefined): CableType[] =>
	[...(st?.cableTypes ?? [])].sort((a, b) => naturalCompare(a.label, b.label))

type Types = Pick<ProjectSettings, 'cableTypes'> | undefined
/** The cable type an id (or, for a type written by name in an import / a link, its label) refers to. THE one lookup:
 *  labels, diameters, colors, core counts and media all go through it. */
export function cableTypeOf(st: Types, idOrLabel: string | undefined): CableType | undefined {
	if (!idOrLabel) return undefined
	const list = st?.cableTypes ?? []
	return list.find((t) => t.id === idOrLabel) ?? list.find((t) => t.label === idOrLabel)
}
/** A type's label, the id itself when it isn't in the list. */
export const cableTypeLabel = (st: Types, id: string): string => cableTypeOf(st, id)?.label ?? id
/** Fibre or copper (or 'other'): the type's own `media`, else guessed from its name (OM4, OS2, SMF, Cat6a …); undefined
 *  when neither says. */
export function cableMedia(st: Types, type: string | undefined): CableType['media'] | undefined {
	if (!type) return undefined
	return cableTypeOf(st, type)?.media
		?? (/om\d|os\d|fib|smf|mmf|core|\b(sm|mm)\b/i.test(type) ? 'fibre' : /cat|utp|stp|copper/i.test(type) ? 'copper' : undefined)
}
