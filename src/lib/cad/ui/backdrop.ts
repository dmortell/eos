// A dialog's BACKDROP closes it on a click that starts AND ends on the backdrop itself (User 2026-10-05): a drag that
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
	const grab = () => { if (node.isConnected && !node.contains(document.activeElement)) node.focus({ preventScroll: true }) }
	grab()
	// opened by a press in the drawing (the Cord tool's patch / link list, a tool's question): that same press's
	// mousedown then puts the focus back on the page, so Enter / Esc did nothing (User 2026-10-26) — take it again once
	// the press is over, unless the focus went somewhere real meanwhile
	const fell = () => { const a = document.activeElement; if (!a || a === document.body || a === document.documentElement) grab() }
	const t = setTimeout(fell, 0)
	window.addEventListener('pointerup', fell, { capture: true, once: true })
	return { destroy() { clearTimeout(t); window.removeEventListener('pointerup', fell, { capture: true }) } }
}
