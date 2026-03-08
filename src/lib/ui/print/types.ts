export interface Point { x: number; y: number }

export type PaperSize = 'A3' | 'A4'
export type PaperOrientation = 'landscape' | 'portrait'

export interface PrintSettings {
	paperSize: PaperSize
	orientation: PaperOrientation
	drawingOffset: Point        // mm — drawing shift relative to paper origin
	scale: number               // ratio denominator (100 = 1:100)
	showPaper: boolean
	margins: number             // mm, uniform
}

export const PAPER_DIMENSIONS: Record<PaperSize, { w: number; h: number }> = {
	A3: { w: 420, h: 297 },
	A4: { w: 297, h: 210 },
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
	paperSize: 'A3',
	orientation: 'landscape',
	drawingOffset: { x: 0, y: 0 },
	scale: 100,
	showPaper: false,
	margins: 10,
}

export const SCALE_OPTIONS = [
	{ label: '1:50', value: 50 },
	{ label: '1:100', value: 100 },
	{ label: '1:200', value: 200 },
	{ label: 'Fit', value: 0 },
]

/** Get paper dimensions in mm, accounting for orientation */
export function paperDimsMm(settings: PrintSettings): { w: number; h: number } {
	const base = PAPER_DIMENSIONS[settings.paperSize]
	return settings.orientation === 'landscape'
		? { w: base.w, h: base.h }
		: { w: base.h, h: base.w }
}
