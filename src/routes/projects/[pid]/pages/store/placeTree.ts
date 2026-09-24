// The navigator tree built from the PAGES places (drawings-plan §4): places (any nesting, generic nodes) with
// the old tools' registry drawings hung on them through the places' `legacy` links (the same rules the
// project-data tree uses: room drawings under their room, tenant-area drawings under their zone, a floor's
// unsuffixed outlets docs under its legacy area, everything else on the floor). Riser diagrams go on the
// nearest place that contains every floor in their range. Pure; tested in placeTree.test.ts.
import { drawingLeaf, drawingPlace, floorName, normFloors, type DrawingDoc, type FloorConfig, type RiserDoc } from '../projectTree'
import type { NavKind, NavNode } from '../mock/data'
import { ancestorsOf, childrenOf } from './places'
import type { Place } from './schema'

export type PlaceTreeInput = { pid: string; places: Place[]; drawings: DrawingDoc[]; risers: RiserDoc[]; floors?: FloorConfig[] | number[] }

export function buildPlaceTree({ pid, places, drawings, risers, floors }: PlaceTreeInput): NavNode[] {
	const hung = new Map<string, NavNode[]>()   // place id → drawing leaves on it
	const hang = (placeId: string, n: NavNode) => hung.set(placeId, [...(hung.get(placeId) ?? []), n])
	const projectLevel: NavNode[] = [], orphan: NavNode[] = []

	const isFloorPlace = (p: Place) => p.legacy?.floor != null && p.legacy.area == null && p.legacy.room == null && p.legacy.row == null
	const floorPlace = (n: number) => places.find((p) => isFloorPlace(p) && p.legacy!.floor === n)
	const legacyArea = (n: number) => { const f = normFloors(floors).find((x) => x.number === n); return (f?.areas?.find((a) => a.legacy) ?? f?.areas?.[0])?.id }
	const find = (pred: (l: NonNullable<Place['legacy']>) => boolean) => places.find((p) => p.legacy && pred(p.legacy))

	for (const d of drawings) {
		if (d.status === 'archived' || d.toolType === 'pages') continue   // Pages sheets are filed by placeId (phase 4)
		const at = drawingPlace(pid, d.sourceDocId), leaf = drawingLeaf(d)
		if (at.floor === null) { projectLevel.push(leaf); continue }
		const fp = floorPlace(at.floor)
		if (!fp) { orphan.push(leaf); continue }
		const n = at.floor
		const target = (at.room ? find((l) => l.floor === n && l.room === at.room && l.row == null) : undefined)
			?? (at.area ? find((l) => l.floor === n && l.area === at.area) : undefined)
			?? (!at.area && !at.room && d.toolType === 'outlets' && legacyArea(n) ? find((l) => l.floor === n && l.area === legacyArea(n)) : undefined)
			?? fp
		hang(target.id, leaf)
	}
	for (const r of risers) {
		const leaf: NavNode = { id: `riser:${r.id}`, label: r.name || 'Risers', drawing: 'elevation' as NavKind, docId: `riser:${r.id}` }
		const lo = Math.min(r.fromFloor ?? NaN, r.toFloor ?? NaN), hi = Math.max(r.fromFloor ?? NaN, r.toFloor ?? NaN)
		const fps = places.filter((p) => isFloorPlace(p) && p.legacy!.floor! >= lo && p.legacy!.floor! <= hi)
		const home = commonAncestor(places, fps)
		if (home) hang(home.id, leaf); else projectLevel.push(leaf)
	}

	const node = (p: Place): NavNode => {
		const kids = childrenOf(places, p.id)
		const n: NavNode = { id: p.id, label: p.name, folder: p.kind || 'place', place: true, children: [...(hung.get(p.id) ?? []), ...kids.map(node)],
			modelFloor: isFloorPlace(p) ? floorName(p.legacy!.floor!) : null }
		if (p.legacy?.floor != null) n.floor = floorName(p.legacy.floor)   // drawings under it view that floor's model
		if (isFloorPlace(p)) n.floorNumber = p.legacy!.floor
		return n
	}
	const tree = childrenOf(places, null).map(node)
	if (projectLevel.length) tree.push({ id: 'g:project', label: 'Project drawings', folder: 'group', children: projectLevel })
	if (orphan.length) tree.push({ id: 'g:orphan', label: 'Other floors (not in the places)', folder: 'group', children: orphan })
	return tree
}

/** The deepest place that contains every given place (their common ancestor, never one of them); null if
 *  they share none (or the list is empty). */
function commonAncestor(places: Place[], of: Place[]): Place | null {
	if (!of.length) return null
	const chains = of.map((p) => ancestorsOf(places, p.id))
	let common: Place | null = null
	for (let i = 0; ; i++) {
		const c = chains[0][i]
		if (!c || chains.some((ch) => ch[i]?.id !== c.id)) break
		common = c
	}
	return common
}
