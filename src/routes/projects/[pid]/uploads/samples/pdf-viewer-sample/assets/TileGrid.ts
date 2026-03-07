/** Compute visible tiles for a PDF image shape given the current viewport */

export const TILE_SIZE = 256

/** Discrete scale levels for tile rendering */
export const TILE_SCALE_LEVELS = [0.25, 0.5, 1, 2, 4, 8]

export interface TileCoord {
	col: number
	row: number
	scale: number
	key: string
}

/** Quantize a scale value to the nearest discrete level */
export function quantizeTileScale(s: number): number {
	for (let i = 0; i < TILE_SCALE_LEVELS.length; i++) {
		if (s <= TILE_SCALE_LEVELS[i]) return TILE_SCALE_LEVELS[i]
	}
	return TILE_SCALE_LEVELS[TILE_SCALE_LEVELS.length - 1]
}

/** Compute the required render scale for a PDF shape at the current zoom */
export function computeTileScale(
	shapeWorldWidth: number,
	pdfPageWidth: number,
	zoom: number,
	paperScale: number
): number {
	if (!pdfPageWidth || shapeWorldWidth === 0) return 1
	const shapeScreenWidth = shapeWorldWidth * (zoom / paperScale)
	const raw = shapeScreenWidth / pdfPageWidth
	return quantizeTileScale(Math.max(0.25, Math.min(raw, 8)))
}

/** Compute total tile grid dimensions for a page at a given scale */
export function getTileGridSize(
	pdfPageWidth: number,
	pdfPageHeight: number,
	scale: number
): { cols: number; rows: number } {
	return {
		cols: Math.ceil(pdfPageWidth * scale / TILE_SIZE),
		rows: Math.ceil(pdfPageHeight * scale / TILE_SIZE)
	}
}

/**
 * Compute which tiles are visible in the current viewport.
 *
 * @param shapeX1 - Shape left in world coords
 * @param shapeY1 - Shape top in world coords
 * @param shapeX2 - Shape right in world coords
 * @param shapeY2 - Shape bottom in world coords
 * @param pdfPageWidth - PDF page width in PDF points (72 DPI)
 * @param pdfPageHeight - PDF page height in PDF points
 * @param scale - Current tile scale
 * @param viewX - ViewStore.x (screen offset)
 * @param viewY - ViewStore.y (screen offset)
 * @param viewZoom - ViewStore.zoom
 * @param paperScale - ViewStore.paperScale
 * @param canvasWidth - Canvas element width in pixels
 * @param canvasHeight - Canvas element height in pixels
 * @param src - Source URL for cache key generation
 * @param pageNum - PDF page number
 */
export function getVisibleTiles(
	shapeX1: number, shapeY1: number, shapeX2: number, shapeY2: number,
	pdfPageWidth: number, pdfPageHeight: number,
	scale: number,
	viewX: number, viewY: number, viewZoom: number, paperScale: number,
	canvasWidth: number, canvasHeight: number,
	src: string, pageNum: number,
	clipMinX?: number, clipMinY?: number, clipMaxX?: number, clipMaxY?: number
): TileCoord[] {
	const zps = viewZoom / paperScale

	// Shape bounds in screen pixels
	const sx1 = shapeX1 * zps + viewX
	const sy1 = shapeY1 * zps + viewY
	const sx2 = shapeX2 * zps + viewX
	const sy2 = shapeY2 * zps + viewY

	// Intersect with canvas viewport (with 1-tile buffer for smooth scrolling)
	const bufferPx = TILE_SIZE * 0.5
	let vx1 = Math.max(sx1, -bufferPx)
	let vy1 = Math.max(sy1, -bufferPx)
	let vx2 = Math.min(sx2, canvasWidth + bufferPx)
	let vy2 = Math.min(sy2, canvasHeight + bufferPx)

	// Additional clip rect (e.g., viewport frame bounds in screen pixels)
	if (clipMinX != null) {
		vx1 = Math.max(vx1, clipMinX)
		vy1 = Math.max(vy1, clipMinY!)
		vx2 = Math.min(vx2, clipMaxX!)
		vy2 = Math.min(vy2, clipMaxY!)
	}

	if (vx1 >= vx2 || vy1 >= vy2) return [] // Not visible

	const shapeScreenW = sx2 - sx1
	const shapeScreenH = sy2 - sy1
	if (shapeScreenW <= 0 || shapeScreenH <= 0) return []

	// Map visible screen rect to fraction of shape
	const fx1 = (vx1 - sx1) / shapeScreenW
	const fy1 = (vy1 - sy1) / shapeScreenH
	const fx2 = (vx2 - sx1) / shapeScreenW
	const fy2 = (vy2 - sy1) / shapeScreenH

	// Convert to PDF pixel coordinates at current scale
	const pxX1 = Math.max(0, fx1) * pdfPageWidth * scale
	const pxY1 = Math.max(0, fy1) * pdfPageHeight * scale
	const pxX2 = Math.min(1, fx2) * pdfPageWidth * scale
	const pxY2 = Math.min(1, fy2) * pdfPageHeight * scale

	// Tile indices
	const col1 = Math.max(0, Math.floor(pxX1 / TILE_SIZE))
	const row1 = Math.max(0, Math.floor(pxY1 / TILE_SIZE))
	const col2 = Math.floor(pxX2 / TILE_SIZE)
	const row2 = Math.floor(pxY2 / TILE_SIZE)

	const { cols: maxCols, rows: maxRows } = getTileGridSize(pdfPageWidth, pdfPageHeight, scale)

	const tiles: TileCoord[] = []
	for (let r = row1; r <= Math.min(row2, maxRows - 1); r++) {
		for (let c = col1; c <= Math.min(col2, maxCols - 1); c++) {
			tiles.push({
				col: c,
				row: r,
				scale,
				key: `${src}|${pageNum}|${scale}|${c}|${r}`
			})
		}
	}
	return tiles
}

/**
 * Compute SVG world-space position and size for a tile.
 * Maps tile pixel coordinates back to the shape's world coordinate space.
 */
export function tileWorldRect(
	col: number, row: number,
	tileSize: number, scale: number,
	pdfPageWidth: number, pdfPageHeight: number,
	shapeX1: number, shapeY1: number,
	shapeWidth: number, shapeHeight: number
): { x: number; y: number; width: number; height: number } {
	const totalPxW = pdfPageWidth * scale
	const totalPxH = pdfPageHeight * scale
	const tileX = col * tileSize
	const tileY = row * tileSize
	const tileW = Math.min(tileSize, totalPxW - tileX)
	const tileH = Math.min(tileSize, totalPxH - tileY)

	return {
		x: shapeX1 + (tileX / totalPxW) * shapeWidth,
		y: shapeY1 + (tileY / totalPxH) * shapeHeight,
		width: (tileW / totalPxW) * shapeWidth,
		height: (tileH / totalPxH) * shapeHeight
	}
}

/** Compute priority for a tile (lower = render first, center of viewport preferred) */
export function tilePriority(
	col: number, row: number,
	centerCol: number, centerRow: number
): number {
	return Math.abs(col - centerCol) + Math.abs(row - centerRow)
}
