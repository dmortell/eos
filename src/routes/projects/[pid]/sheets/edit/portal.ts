/** Move a node to <body> so floating panels escape clipped/transformed ancestors. */
export function portal(node: HTMLElement) {
	document.body.appendChild(node)
	return { destroy() { node.remove() } }
}
