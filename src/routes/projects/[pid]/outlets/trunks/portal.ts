/**
 * Svelte action that relocates an element to `document.body` so `position: fixed`
 * is relative to the viewport rather than a transformed ancestor (the canvas
 * pan/zoom transforms would otherwise offset a fixed-positioned context menu).
 */
export function portal(node: HTMLElement) {
	document.body.appendChild(node)
	return { destroy: () => node.remove() }
}
