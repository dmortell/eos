/**
 * Shared port-cell geometry (unscaled canvas px; 1 px = 2 mm at SCALE 0.5).
 * Used by PortsLayer (rendering/hit) and CordsLayer (anchors) so cords always
 * attach exactly where cells draw.
 *
 * Cells are CAPPED so low-port-count devices (a 4-port 6U server) don't
 * stretch ports across the whole box; `portAlign` places the capped grid
 * inside the device (default bottom-left). Panels are unaffected — their
 * uncapped cells are already smaller than the caps.
 */
import { SCALE, RU_HEIGHT_MM, DEVICE_W_MM } from '../../racks/parts/constants'

export const MAX_CELL_W = 30 // 60 mm
export const MAX_CELL_H = 20 // 40 mm ≈ 1U row
const PAD_X = 2, PAD_Y = 1.5

export type PortAlign = 'tl' | 'tc' | 'tr' | 'bl' | 'bc' | 'br'

export interface PortLayout {
	cols: number
	rows: number
	cw: number
	ch: number
	/** Grid origin inside the device box. */
	ox: number
	oy: number
	devW: number
	devH: number
}

export function portCellLayout(device: {
	widthMm?: number; heightU: number; portCount?: number; portAlign?: string
}): PortLayout {
	const devW = (device.widthMm ?? DEVICE_W_MM) * SCALE
	const devH = device.heightU * RU_HEIGHT_MM * SCALE
	const count = device.portCount ?? 0
	const rows = count > 24 ? 2 : 1
	const cols = Math.min(Math.max(count, 1), 24)
	const cw = Math.min((devW - PAD_X * 2) / cols, MAX_CELL_W)
	const ch = Math.min((devH - PAD_Y * 2) / rows, MAX_CELL_H)
	const align = (device.portAlign ?? 'bl') as PortAlign
	const freeX = devW - PAD_X * 2 - cols * cw
	const freeY = devH - PAD_Y * 2 - rows * ch
	const ox = PAD_X + (align[1] === 'r' ? freeX : align[1] === 'c' ? freeX / 2 : 0)
	const oy = PAD_Y + (align[0] === 'b' ? freeY : 0)
	return { cols, rows, cw, ch, ox, oy, devW, devH }
}

/** Rect of a 1-based port index within the device box. */
export function portCellRect(l: PortLayout, portIndex: number) {
	const i = portIndex - 1
	const row = i < 24 ? 0 : 1
	const col = i % 24
	return { x: l.ox + col * l.cw, y: l.oy + row * l.ch, w: l.cw - 0.5, h: l.ch - 0.5, row, col }
}
