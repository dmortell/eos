// P5 (review.md §P5) — paper-scale invariants for B2 + B3, end to end through the sizing helpers the
// Viewport renders with. B2: model geometry prints at TRUE 1:N (constants.test.ts pins the constant).
// B3: ANNOTATION sizes (text, arrowheads) are defined in paper units, so they print the same size at every
// drawing scale — in model mm they grow with N, and N × (1/N) cancels on paper.
import { describe, it, expect } from 'vitest'
import { modelUnitToPaperMm, scaleDenom, PT_MM } from './constants'
import { textBox } from './ui/geometry'
import { arrowPts } from './ui/annotations'
import type { Ent } from './ui/geometry'

const SCALES = ['1:1', '1:10', '1:25', '1:50', '1:100', '1:200']
const onPaper = (modelMm: number, scale: string) => modelMm * modelUnitToPaperMm(scaleDenom(scale))

describe('geometry prints at true scale (B2)', () => {
	it('1000 mm of model is 1000 / N paper mm', () => {
		for (const s of SCALES) expect(onPaper(1000, s)).toBeCloseTo(1000 / scaleDenom(s), 9)
		expect(onPaper(1000, '1:100')).toBeCloseTo(10, 9)
	})
})

describe('annotations keep their paper size at any scale (B3)', () => {
	const text: Ent = { id: 't', type: 'text', a: [0, 0], text: 'HELLO', fontPt: 8 }
	it('8 pt text is 8 × 0.3528 = 2.82 paper mm tall at every scale', () => {
		for (const s of SCALES) {
			const mmPerPt = PT_MM * scaleDenom(s)   // what the Viewport passes textBox: paper pt → model mm at 1:N
			const [, y0, , y1] = textBox(text, mmPerPt)
			const fsModel = 8 * mmPerPt
			expect(onPaper(fsModel, s)).toBeCloseTo(2.822, 3)
			// the box's height scales with the font — the same on paper at every scale (bar the fixed 3 mm pad)
			expect(onPaper(y1 - y0 - 3, s)).toBeCloseTo(onPaper(fsModel * 0.9, s), 6)
		}
	})
	it('a 3.5 paper-mm arrowhead is 3.5 mm on paper at every scale', () => {
		for (const s of SCALES) {
			const paperMm = scaleDenom(s)   // model mm per paper mm in a 1:N viewport (ViewCtx.paperMm)
			const pts = arrowPts([0, 0], [10000, 0], 3.5 * paperMm).split(' ').map((q) => q.split(',').map(Number))
			const len = pts[0][0] - pts[1][0]   // tip → base along the shaft, model mm
			expect(onPaper(len, s)).toBeCloseTo(3.5, 9)
		}
	})
})
