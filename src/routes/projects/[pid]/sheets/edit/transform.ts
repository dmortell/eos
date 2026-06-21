// Pure box transform maths shared by the reusable TransformBox handles (annotations, racks, …).
// Handle bitmask matches the sample CAD tool: R=1, B=2, T=4, L=8 (corners OR them: BR=3, TR=5,
// BL=10, TL=12). Deltas are in world units.
export type Box = { x: number; y: number; w: number; h: number }

/** Force a (corner-resized) box square, keeping the anchored (opposite) corner fixed — for
 *  Shift-resize → squares/circles. Edge handles (only one axis) are returned unchanged. */
export function squareBox(b: Box, handle: number): Box {
	const horiz = !!(handle & 9), vert = !!(handle & 6) // 9 = left|right, 6 = top|bottom
	if (!horiz || !vert) return b
	const s = Math.max(b.w, b.h)
	let { x, y } = b
	if (handle & 8) x = b.x + b.w - s // left edge moved → keep the right edge
	if (handle & 4) y = b.y + b.h - s // top edge moved → keep the bottom edge
	return { x, y, w: s, h: s }
}

export function resizeBox(b: Box, handle: number, dx: number, dy: number, min = 50): Box {
	let { x, y, w, h } = b
	if (handle & 8) { x += dx; w -= dx } // left edge
	if (handle & 1) { w += dx }          // right edge
	if (handle & 4) { y += dy; h -= dy } // top edge
	if (handle & 2) { h += dy }          // bottom edge
	if (w < min) { if (handle & 8) x -= min - w; w = min }
	if (h < min) { if (handle & 4) y -= min - h; h = min }
	return { x, y, w, h }
}

/** Eight resize-handle positions for a box (matching resizeBox's bitmask + a cursor). */
export function boxHandles(b: Box): { x: number; y: number; handle: number; cursor: string }[] {
	const { x, y, w, h } = b, cx = x + w / 2, cy = y + h / 2, r = x + w, bm = y + h
	return [
		{ x: r, y: cy, handle: 1, cursor: 'ew-resize' },
		{ x: cx, y: bm, handle: 2, cursor: 'ns-resize' },
		{ x: cx, y, handle: 4, cursor: 'ns-resize' },
		{ x, y: cy, handle: 8, cursor: 'ew-resize' },
		{ x: r, y: bm, handle: 3, cursor: 'nwse-resize' },
		{ x: r, y, handle: 5, cursor: 'nesw-resize' },
		{ x, y: bm, handle: 10, cursor: 'nesw-resize' },
		{ x, y, handle: 12, cursor: 'nwse-resize' },
	]
}

export const angleDeg = (cx: number, cy: number, x: number, y: number) => (Math.atan2(y - cy, x - cx) * 180) / Math.PI
