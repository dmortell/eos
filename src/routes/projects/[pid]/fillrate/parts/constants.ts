export interface Cable {
	id: string
	diameter: number
	quantity: number
}

export interface Section {
	id: string
	label: string
	containmentType: 'rectangular' | 'round'
	diameter: number
	width: number
	height: number
	thickness: number  // wall thickness (mm) — subtracted from width/height to get usable inner area (rectangular only)
	calcMethod: 'rectangular' | 'circular'
	cables: Cable[]
}

// Default wall thickness (mm) for rectangular containment when a section predates the field.
export const DEFAULT_THICKNESS = 3

export interface FillRateData {
	id: string
	sections: Section[]
	nextLabel: number
}

export const DEFAULT_CABLE: Cable = { id: '1', diameter: 10, quantity: 1 }

export function createSection(label: string): Section {
	return {
		id: crypto.randomUUID().slice(0, 8),
		label,
		containmentType: 'rectangular',
		diameter: 50,
		width: 50,
		height: 30,
		thickness: DEFAULT_THICKNESS,
		calcMethod: 'rectangular',
		cables: [
			{ id: '1', diameter: 8, quantity: 10 },
			// { id: '2', diameter: 10, quantity: 5 },
		],
	}
}

export function formatLabel(n: number): string {
	return `FR-${String(n).padStart(3, '0')}`
}

export function calcFillRate(section: Section): number {
	const { containmentType, diameter, width, height, calcMethod, cables } = section
	let containmentArea: number
	if (containmentType === 'round') {
		const r = diameter / 2
		containmentArea = Math.PI * r * r
	} else {
		// Rectangular: subtract the wall thickness from each side to get the usable inner area.
		const t = section.thickness ?? DEFAULT_THICKNESS
		containmentArea = Math.max(0, width - 2 * t) * Math.max(0, height - 2 * t)
	}

	const cablesArea = cables.reduce((sum, cable) => {
		if (calcMethod === 'rectangular') {
			return sum + cable.diameter * cable.diameter * cable.quantity
		}
		const cr = cable.diameter / 2
		return sum + Math.PI * cr * cr * cable.quantity
	}, 0)

	return containmentArea > 0 ? (cablesArea / containmentArea) * 100 : 0
}

export function fillColor(rate: number): string {
	if (rate > 100) return 'text-red-600'
	if (rate > 60) return 'text-orange-500'
	if (rate > 40) return 'text-green-600'
	return 'text-blue-500'
}

export function fillStatus(rate: number): string {
	if (rate > 100) return 'Overfilled - Exceeds capacity!'
	if (rate > 80) return 'High - Near capacity'
	if (rate > 40) return 'Moderate - Good utilization'
	return 'Low - Plenty of space'
}
