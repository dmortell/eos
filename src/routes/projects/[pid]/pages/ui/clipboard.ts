// Shape CLIPBOARD + arrange helpers (moved out of +page.svelte). Pure; tested in clipboard.test.ts.
//   Clipboard   holds plain snapshots of copied shapes (persists across tabs); each paste of the same copy
//               lands a further offset away (stacking), with fresh ids and each copied GROUP given a new id.
//   arrange     draw order = array position (later = painted on top): front/back jump to the ends,
//               forward/backward step the selection past one non-selected neighbour.
//   setGroup    put shapes in one new group, or ungroup them.
import { translate, type Ent } from './geometry'

export class Clipboard {
	#items: Ent[] = []
	#pastes = 0
	get empty() { return !this.#items.length }
	/** Copy (pass PLAIN snapshots — `$state.snapshot` them first). */
	copy(ents: Ent[]) { this.#items = ents; this.#pastes = 0 }
	/** The shapes for the next paste, `stepMm` further along each time (the caller sizes it: 5 paper mm × the
	 *  viewport's scale N). */
	paste(stepMm: number, newId: () => string): Ent[] {
		if (!this.#items.length) return []
		this.#pastes++
		return pasteCopies(this.#items, stepMm * this.#pastes, newId)
	}
}

/** Copies moved by `off` (x and y) with fresh ids; members of one copied group share one NEW group id. */
export function pasteCopies(items: Ent[], off: number, newId: () => string): Ent[] {
	const gids = new Map<string, string>()
	return items.map((e) => {
		let gid = e.groupId
		if (gid) { if (!gids.has(gid)) gids.set(gid, newId()); gid = gids.get(gid) }
		return { ...translate(e, off, off), id: newId(), groupId: gid }
	})
}

export type ArrangeOp = 'front' | 'back' | 'forward' | 'backward'
/** The shapes reordered for `op` on the selection `ids`; null when nothing selected is in the list. */
export function arrange(arr: Ent[], ids: string[], op: ArrangeOp): Ent[] | null {
	const s = new Set(ids)
	if (!ids.length || !arr.some((e) => s.has(e.id))) return null
	if (op === 'front' || op === 'back') {
		const moved = arr.filter((e) => s.has(e.id)), rest = arr.filter((e) => !s.has(e.id))
		return op === 'front' ? [...rest, ...moved] : [...moved, ...rest]
	}
	const next = [...arr]
	if (op === 'forward') { for (let i = next.length - 2; i >= 0; i--) if (s.has(next[i].id) && !s.has(next[i + 1].id)) [next[i], next[i + 1]] = [next[i + 1], next[i]] }
	else { for (let i = 1; i < next.length; i++) if (s.has(next[i].id) && !s.has(next[i - 1].id)) [next[i], next[i - 1]] = [next[i - 1], next[i]] }
	return next
}

/** The shapes with `ids` put in group `gid` (undefined = ungrouped). */
export const setGroup = (arr: Ent[], ids: string[], gid: string | undefined): Ent[] => {
	const s = new Set(ids)
	return arr.map((e) => (s.has(e.id) ? { ...e, groupId: gid } : e))
}
