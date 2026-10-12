// A dialog's BACKDROP closes it on a click that starts AND ends on the backdrop itself (Dave 2026-10-05): a drag that
// starts inside the dialog — selecting text in a field — and ends outside it no longer closes the dialog.
export function backdropClose(node: HTMLElement, close: () => void) {
	let fromBack = false
	const down = (e: PointerEvent) => { fromBack = e.target === node }
	const click = (e: MouseEvent) => { if (fromBack && e.target === node) close(); fromBack = false }
	node.addEventListener('pointerdown', down)
	node.addEventListener('click', click)
	return {
		update(next: () => void) { close = next },
		destroy() { node.removeEventListener('pointerdown', down); node.removeEventListener('click', click) },
	}
}

/** A modal dialog takes the focus when it opens, so its own keys work at once (Esc closes it) and the drawing behind
 *  it doesn't get them (Delete, Ctrl+Z, arrows). */
export function dialogFocus(node: HTMLElement) {
	if (!node.contains(document.activeElement)) node.focus({ preventScroll: true })
}
