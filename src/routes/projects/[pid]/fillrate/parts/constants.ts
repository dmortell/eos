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
	calcMethod: 'rectangular' | 'circular'
	cables: Cable[]
}

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
		calcMethod: 'rectangular',
		cables: [
			{ id: '1', diameter: 6, quantity: 15 },
			{ id: '2', diameter: 10, quantity: 5 },
		],
	}
}

export function formatLabel(n: number): string {
	return `FR-${String(n).padStart(3, '0')}`
}

export function calcFillRate(section: Section): number {
	const { containmentType, diameter, width, height, calcMethod, cables } = section
	const r = diameter / 2
	const containmentArea = containmentType === 'round'
		? Math.PI * r * r
		: width * height

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
	if (rate > 80) return 'text-orange-500'
	if (rate > 40) return 'text-green-600'
	return 'text-blue-500'
}

export function fillStatus(rate: number): string {
	if (rate > 100) return 'Overfilled - Exceeds capacity!'
	if (rate > 80) return 'High - Near capacity'
	if (rate > 40) return 'Moderate - Good utilization'
	return 'Low - Plenty of space'
}
