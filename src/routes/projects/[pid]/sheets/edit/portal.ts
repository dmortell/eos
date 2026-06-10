/**
 * Move a node into a fixed, viewport-sized overlay so floating panels escape clipped/transformed
 * ancestors (the zoomable canvas) — but WITHOUT letting a panel positioned past an edge grow the
 * document and spawn scrollbars (which then cascade off the 100dvh shell). The overlay is
 * `overflow:hidden` so a stray panel is clipped to the viewport, and `pointer-events:none` so empty
 * areas fall through to the canvas; the panels themselves re-enable pointer events (`.gui` is the
 * default `auto`). Appending straight to <body> (the previous behaviour) skipped the clip.
 */
export function portal(node: HTMLElement) {
	const root = portalRoot()
	root.appendChild(node)
	return { destroy() { node.remove() } }
}

let cached: HTMLDivElement | null = null
function portalRoot(): HTMLDivElement {
	if (cached?.isConnected) return cached
	const existing = document.getElementById('sheet-portal-root') as HTMLDivElement | null
	if (existing) return (cached = existing)
	const root = document.createElement('div')
	root.id = 'sheet-portal-root'
	// z-index:10 matches the panels' original stacking (.gui.open) so they stay above the model
	// view (z-[5]) but below menus — see ModelView's note. The overlay just relocates the clip.
	root.style.cssText = 'position:fixed;inset:0;z-index:10;overflow:hidden;pointer-events:none'
	document.body.appendChild(root)
	return (cached = root)
}
