// Multi-select for any list (Explorer / Finder rules): a plain click selects ONE item; Ctrl/⌘-click toggles an item;
// Shift-click selects the RANGE from the anchor (the last plainly- or Ctrl-clicked item) to it, in the list's shown
// order; Ctrl+Shift-click adds that range to what's selected. Pure — each list keeps its own `sel` + `anchor`.
//
//   const r = listClick(order, sel, anchor, id, e)
//   sel = r.sel; anchor = r.anchor
//   if (!r.multi) …the list's normal single-click action (open / make active)…

export type ListClick = {
	/** The new selection (in list order for a range, else click order). */
	sel: string[]
	anchor: string | null
	/** The click was a Ctrl / Shift selection gesture (skip the row's normal click action). */
	multi: boolean
}

export function listClick(order: readonly string[], sel: readonly string[], anchor: string | null, id: string,
	mods: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }): ListClick {
	const ctrl = !!(mods.ctrlKey || mods.metaKey)
	if (mods.shiftKey) {
		const a = anchor ? order.indexOf(anchor) : -1, b = order.indexOf(id)
		if (a >= 0 && b >= 0) {
			const range = order.slice(Math.min(a, b), Math.max(a, b) + 1)
			return { sel: ctrl ? [...new Set([...sel, ...range])] : range, anchor, multi: true }
		}
		return { sel: [...new Set([...sel, id])], anchor: id, multi: true }   // no anchor yet: just add it
	}
	if (ctrl) return { sel: sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id], anchor: id, multi: true }
	return { sel: [id], anchor: id, multi: false }
}

/** The ids of a drag / bulk action on `id`: the whole selection (in list order) when `id` is part of it, else just `id`. */
export const selBlock = (order: readonly string[], sel: readonly string[], id: string): string[] =>
	sel.includes(id) && sel.length > 1 ? order.filter((x) => sel.includes(x)) : [id]
