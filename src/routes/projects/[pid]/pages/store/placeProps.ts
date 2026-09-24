// Properties for a PAGES PLACE (drawings-plan §4): name + icon kind (editable), where it sits, what it holds,
// and which old-tools data it was seeded from. Pure; the page saves edits through store/places.ts.
import type { NodeInfo } from '../projectProps'
import type { NavNode } from '../mock/data'
import { ancestorsOf, childrenOf } from './places'
import type { Place } from './schema'

/** Suggested icon kinds (any text is allowed; an unknown kind shows a folder). */
export const PLACE_KINDS = ['building', 'floor', 'zone', 'room', 'row']

export function describePlace(places: Place[], id: string, node?: NavNode): NodeInfo | null {
	const p = places.find((x) => x.id === id); if (!p) return null
	const path = ancestorsOf(places, id).map((a) => a.name).join(' › ')
	const drawings = (node?.children ?? []).filter((c) => c.drawing).length
	const l = p.legacy
	const seeded = !l ? '' : [l.floor != null ? `floor ${l.floor}` : '', l.area ? `area ${l.area}` : '', l.room ? `room ${l.room}` : '', l.row ? `row ${l.row}` : ''].filter(Boolean).join(', ')
	return {
		kind: 'place', title: (p.kind ?? 'place').toUpperCase(),
		sections: [
			{ label: 'PLACE', fields: [
				{ key: 'name', label: 'Name', value: p.name, edit: 'text' },
				{ key: 'kind', label: 'Icon', value: p.kind ?? '', edit: 'text', hint: `${PLACE_KINDS.join(', ')} — or anything` },
			] },
			{ label: 'CONTENTS', fields: [
				{ key: 'path', label: 'Inside', value: path || '— (top level)' },
				{ key: 'places', label: 'Places', value: String(childrenOf(places, id).length) },
				{ key: 'drawings', label: 'Drawings', value: String(drawings) },
				...(seeded ? [{ key: 'legacy', label: 'Seeded from', value: seeded }] : []),
			] },
		],
		note: "Edits save to the project's Pages places. Drag a place in the tree to move it.",
	}
}
