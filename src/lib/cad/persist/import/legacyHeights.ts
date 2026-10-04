// Floor heights from the old Risers tool (Dave, 2026-10-03: import them, then fix by hand in the Floor manager).
// READ-ONLY. A project may have several riser docs; the first one that sets a floor wins, and a doc's own default
// heights fill the floors none of them set.
import { collection, getDocs, query, where, type Firestore } from 'firebase/firestore'
import type { Heights } from '../../domain/floors'

const isHeights = (h: unknown): h is Heights => !!h && ['slabMm', 'raisedFloorMm', 'clearHeightMm', 'plenumMm'].every((k) => Number.isFinite((h as Record<string, unknown>)[k]))

/** Heights per floor number from riser docs (pure, for tests): explicit floors first, else the first doc default. */
export function riserHeights(docs: Record<string, unknown>[]): { byFloor: Map<number, Heights>; fallback?: Heights } {
	const byFloor = new Map<number, Heights>()
	let fallback: Heights | undefined
	for (const d of docs) {
		for (const [k, h] of Object.entries((d.floorHeights ?? {}) as Record<string, unknown>)) if (isHeights(h) && !byFloor.has(Number(k))) byFloor.set(Number(k), h)
		const def = (d.settings as { defaultFloorHeights?: unknown } | undefined)?.defaultFloorHeights
		if (!fallback && isHeights(def)) fallback = def
	}
	return { byFloor, fallback }
}

export async function loadRiserHeights(db: Firestore, pid: string): Promise<{ byFloor: Map<number, Heights>; fallback?: Heights; docs: number }> {
	const snap = await getDocs(query(collection(db, 'risers'), where('projectId', '==', pid)))
	const docs = snap.docs.map((d) => d.data())
	return { ...riserHeights(docs), docs: docs.length }
}
