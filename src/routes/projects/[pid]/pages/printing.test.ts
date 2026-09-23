import { describe, it, expect } from 'vitest'
import { printCss } from './printing'
import { PAPER_PX_PER_MM } from './constants'

describe('printCss', () => {
	it('XP7: hides the margin guide on paper', () => {
		expect(printCss({ size: 'A3', landscape: true })).toContain('.print-target .margin-guide')
	})
	it('sizes the @page rule from the paper in landscape (width × height, unswapped)', () => {
		const css = printCss({ size: 'A3', landscape: true })
		expect(css).toContain('@page { size: 420mm 297mm; margin: 0; }')
	})
	it('swaps width/height for portrait', () => {
		const css = printCss({ size: 'A3', landscape: false })
		expect(css).toContain('@page { size: 297mm 420mm; margin: 0; }')
	})
	it('sizes A4 and A2 correctly too', () => {
		expect(printCss({ size: 'A4', landscape: true })).toContain('@page { size: 297mm 210mm; margin: 0; }')
		expect(printCss({ size: 'A2', landscape: true })).toContain('@page { size: 594mm 420mm; margin: 0; }')
	})
	it('the print-target zoom matches (96/25.4)/PAPER_PX_PER_MM, same for any paper size', () => {
		const zoom = (96 / 25.4) / PAPER_PX_PER_MM
		const css = printCss({ size: 'A3', landscape: true })
		expect(css).toContain(`zoom:${zoom};`)
		expect(printCss({ size: 'A4', landscape: false })).toContain(`zoom:${zoom};`)   // independent of size/orientation
	})
	it('hides everything except .print-target, and strips the viewport chrome', () => {
		const css = printCss({ size: 'A3', landscape: true })
		expect(css).toContain('body * { visibility: hidden !important; }')
		expect(css).toContain('.print-target, .print-target * { visibility: visible !important; }')
		expect(css).toContain('.print-target .vp { border: none !important; box-shadow: none !important; }')
	})
})
