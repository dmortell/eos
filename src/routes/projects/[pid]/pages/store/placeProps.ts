// Properties for a PAGES PLACE (drawings-plan §4): name + icon kind (editable), where it sits, what it holds,
// and which old-tools data it was seeded from. Pure; the page saves edits through store/places.ts.
import type { NodeInfo } from '../projectProps'
import type { NavNode } from '../mock/data'
import { ancestorsOf, childrenOf } from './places'
import type { Place } from './schema'

/** Suggested icon kinds (any text is allowed; an unknown kind shows a folder). */
export const PLACE_KINDS = ['building', 'floor', 'zone', 'room', 'row']

/** "B2F" / "-2" / "12F" / "12" → a floor number (null = not one). */
export function parseFloor(s: string): number | null {
	const t = s.trim().toUpperCase().replace(/F$/, '')
	const m = /^(B)?\s*(-?\d+)$/.exec(t); if (!m) return null
	const n = parseInt(m[2], 10)
	return m[1] ? -Math.abs(n) : n
}
const fl = (n: number) => (n < 0 ? `B${-n}F` : `${n}F`)

export function describePlace(places: Place[], id: string, node?: NavNode, projectStack?: { bottom: number; top: number; skipped?: number[] } | null): NodeInfo | null {
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
			// a BUILDING's floor stack (drives its building model's storeys); unset = the project's
			...(p.kind === 'building' ? [(() => {
				const s = p.floors ?? projectStack, from = p.floors ? '' : ' (from the project)'
				return { label: 'FLOORS', fields: [
					{ key: 'floorsBottom', label: 'Bottom', value: s ? fl(s.bottom) : '', edit: 'text' as const, hint: `Lowest floor, e.g. B3F${from}` },
					{ key: 'floorsTop', label: 'Top', value: s ? fl(s.top) : '', edit: 'text' as const, hint: `Highest floor, e.g. 33F${from}` },
					{ key: 'floorsSkipped', label: 'Skipped', value: (s?.skipped ?? []).map(fl).join(', '), edit: 'text' as const, hint: 'Floors that don\'t exist (e.g. 4F, 13F), comma-separated' },
				] }
			})()] : []),
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
