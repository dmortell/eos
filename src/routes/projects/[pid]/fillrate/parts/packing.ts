import type { Section } from './constants'
import { calcFillRate, DEFAULT_THICKNESS } from './constants'

export interface PackedCable { x: number; y: number; r: number; diameter: number }
export interface PackedSection {
	shape: 'round' | 'rect'
	radius: number            // round containment radius (mm)
	width: number; height: number  // rect outer containment (mm)
	innerWidth: number; innerHeight: number  // rect usable inner area (mm) = outer − 2·thickness
	thickness: number         // rect wall thickness (mm); 0 for round
	cables: PackedCable[]
	fillRate: number          // %
}

/**
 * Lay out a fill-rate section's cables in real millimetres, centred at the origin with gravity
 * pulling toward +Y (down). Same greedy gravity-settle as the fillrate tool's canvas, but in mm
 * (scale-free) so the result can be rendered as crisp SVG at any size / for print.
 */
export function packSection(section: Section): PackedSection {
	const round = section.containmentType === 'round'
	const radius = section.diameter / 2
	const width = section.width, height = section.height
	const thickness = round ? 0 : (section.thickness ?? DEFAULT_THICKNESS)
	const innerWidth = Math.max(0, width - 2 * thickness)
	const innerHeight = Math.max(0, height - 2 * thickness)
	const fillRate = calcFillRate(section)

	const all: { diameter: number; r: number }[] = []
	for (const g of section.cables) for (let i = 0; i < g.quantity; i++) all.push({ diameter: g.diameter, r: g.diameter / 2 })
	all.sort((a, b) => b.diameter - a.diameter)

	const placed: PackedCable[] = []
	const collides = (x: number, y: number, r: number) => placed.some(p => Math.hypot(x - p.x, y - p.y) < r + p.r - 0.05)

	for (const c of all) {
		const r = c.r; let px = 0, py = 0, ok = false
		if (round) {
			const R = radius, groundY = R - r
			for (let ty = groundY; ty >= -R + r && !ok; ty -= 0.5) {
				const maxX = Math.sqrt(Math.max(0, R * R - ty * ty))
				if (maxX < r) continue
				for (let tx = -maxX + r; tx <= maxX - r; tx += 1) {
					if (Math.hypot(tx, ty) + r <= R + 0.05 && !collides(tx, ty, r)) { px = tx; py = ty; ok = true; break }
				}
			}
		} else {
			const left = -innerWidth / 2, right = innerWidth / 2, top = -innerHeight / 2, bottom = innerHeight / 2
			for (let ty = bottom - r; ty >= top + r && !ok; ty -= 0.5) {
				for (let tx = left + r; tx <= right - r; tx += 1) {
					if (!collides(tx, ty, r)) { px = tx; py = ty; ok = true; break }
				}
			}
		}
		if (ok) placed.push({ x: px, y: py, r, diameter: c.diameter })
	}
	return { shape: round ? 'round' : 'rect', radius, width, height, innerWidth, innerHeight, thickness, cables: placed, fillRate }
}

/** Cable fill colour by utilisation (mirrors the fillrate tool's canvas palette). */
export function fillCableColor(rate: number): string {
	return rate > 100 ? '#dc2626' : rate > 60 ? '#e08020' : rate > 40 ? '#16a34a' : '#3b82f6'
}
