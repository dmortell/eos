// A building elevation showing only SOME floors (a riser drawing — like the Risers tool's "Visible" floors):
// each hidden storey's band collapses to a small BREAK gap, and everything above moves down by what was
// removed. Pure; tested in storeyMap.test.ts. Model3d applies `map` to the projected height of every point.
import type { Storey } from './types'

/** The height a hidden run of floors collapses to (a break mark is drawn in it). */
export const BREAK_GAP = 800

export type StoreyMap = {
	/** Model z → drawn z. */
	map: (z: number) => number
	/** True when [z0, z1] lies entirely inside hidden floors (the object isn't drawn). */
	hidden: (z0: number, z1: number) => boolean
	/** The drawn gaps (for break marks), as drawn [z0, z1]. */
	gaps: { z0: number; z1: number }[]
	/** The storeys still shown. */
	shown: Storey[]
}

/** Bands bottom-up: a storey runs from its datum to the next one's (the top storey to its own soffit). */
function bands(storeys: Storey[]) {
	const s = [...storeys].sort((a, b) => a.z - b.z)
	return s.map((st, i) => ({ st, z0: st.z, z1: s[i + 1]?.z ?? st.z + (st.ceilingSlab ?? 3600) }))
}

/** `visible` = the storey ids to show (undefined / all = no collapsing). Consecutive hidden floors share ONE gap. */
export function storeyMap(storeys: Storey[], visible?: string[]): StoreyMap {
	const all = bands(storeys)
	if (!visible || all.every((b) => visible.includes(b.st.id))) {
		return { map: (z) => z, hidden: () => false, gaps: [], shown: all.map((b) => b.st) }
	}
	// runs: merge consecutive bands with the same visibility
	type Run = { z0: number; z1: number; show: boolean }
	const runs: Run[] = []
	for (const b of all) {
		const show = visible.includes(b.st.id), last = runs[runs.length - 1]
		if (last && last.show === show) last.z1 = b.z1; else runs.push({ z0: b.z0, z1: b.z1, show })
	}
	// each run's drawn start: shown runs keep their height, hidden ones become BREAK_GAP
	let at = runs[0]?.z0 ?? 0
	const drawn = runs.map((r) => { const d = { ...r, d0: at }; at += r.show ? r.z1 - r.z0 : BREAK_GAP; return d })
	const map = (z: number) => {
		if (!drawn.length) return z
		if (z <= drawn[0].z0) return z - drawn[0].z0 + drawn[0].d0
		for (const r of drawn) {
			if (z <= r.z1) {
				const h = r.z1 - r.z0 || 1
				return r.d0 + (r.show ? z - r.z0 : ((z - r.z0) / h) * BREAK_GAP)
			}
		}
		const l = drawn[drawn.length - 1]
		return z - l.z1 + l.d0 + (l.show ? l.z1 - l.z0 : BREAK_GAP)   // above the top: shifted like the top
	}
	const hidden = (z0: number, z1: number) => drawn.some((r) => !r.show && z0 >= r.z0 - 1 && z1 <= r.z1 + 1)
	const gaps = drawn.filter((r) => !r.show).map((r) => ({ z0: r.d0, z1: r.d0 + BREAK_GAP }))
	return { map, hidden, gaps, shown: all.filter((b) => visible.includes(b.st.id)).map((b) => b.st) }
}
