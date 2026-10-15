// SELECT SIMILAR (backlog, User 2026-10-06): what counts as "the same kind" as a selected thing. A shape: the same
// block (an insert), else the same role (wall / trunk / conduit …) or drawn kind (line / rect / text …) on the same
// layer; a rack or device: the same kind; anything else: the same type. The canvas applies it to what its view shows.
// Pure; tested in similar.test.ts.
import type { Entity } from './drawing'

export function similarKey(e: Entity): string {
	if (e.type === 'shape') {
		if (e.geom.kind === 'insert') return `insert:${e.geom.blockId}`
		return `shape:${e.role ? `role:${e.role.kind}` : e.geom.kind}:${e.layerId ?? ''}`
	}
	if (e.type === 'rack' || e.type === 'device') return `${e.type}:${e.kind}`
	return e.type
}

/** The ids among `candidates` like any of `selected` (the selected ones included when they're candidates). */
export function similarTo(selected: Entity[], candidates: Entity[]): string[] {
	const keys = new Set(selected.map(similarKey))
	return candidates.filter((e) => keys.has(similarKey(e))).map((e) => e.id)
}
