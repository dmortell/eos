/**
 * Property-window keyboard nav: Enter focuses the next field, Shift+Enter the previous one.
 * Textareas are skipped entirely (so Enter / Shift+Enter keep inserting newlines there).
 * Apply with `use:formNav` on a window's content container — it walks the visible, enabled
 * input/select descendants in DOM order.
 */
export function formNav(node: HTMLElement) {
	function onKey(e: KeyboardEvent) {
		if (e.key !== 'Enter' || e.isComposing) return
		const t = e.target as HTMLElement | null
		if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'SELECT')) return  // skip textareas / non-fields
		const items = [...node.querySelectorAll<HTMLElement>('input, select, textarea')]
			.filter(el => !(el as HTMLInputElement).disabled && el.offsetParent !== null)
		const i = items.indexOf(t)
		if (i < 0) return
		e.preventDefault()
		const next = items[i + (e.shiftKey ? -1 : 1)]
		if (!next) return
		next.focus()
		;(next as HTMLInputElement).select?.()
	}
	node.addEventListener('keydown', onKey)
	return { destroy() { node.removeEventListener('keydown', onKey) } }
}
