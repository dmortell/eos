// Sheets (Phase 4.1): paper at true size, viewports drawing their view at 1:N into a clipped window.
import { describe, it, expect } from 'vitest'
import { sheetDisplayList, paperSize, toPaper, defaultViewport, sheetTitleBlock, drawingArea } from './sheet'
import { DEFAULT_TITLE_BLOCK } from '../domain/titleBlock'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import type { Sheet } from '../domain/drawing'

const sheet = (extra: Partial<Sheet> = {}): Sheet => ({ type: 'sheet', id: 'SH', number: 'S-001', title: 'Plan', order: 1, paper: { size: 'A3', orientation: 'landscape', marginMm: 10 }, viewports: [], status: 'active', ...extra })
const ix = () => new ProjectIndex(demoProject())

describe('sheets', () => {
	it('A3 landscape is 420 × 297 mm; the paper and its margin are drawn', () => {
		expect(paperSize(sheet())).toEqual({ w: 420, h: 297 })
		expect(paperSize(sheet({ paper: { size: 'A1', orientation: 'portrait', marginMm: 10 } }))).toEqual({ w: 594, h: 841 })
		expect(sheetDisplayList(ix(), sheet()).slice(0, 2).map((p) => p.k === 'line' && p.cls)).toEqual(['paper', 'paper-margin'])
	})
	it('a section viewport is titled "SECTION A–A′" by itself; a typed label wins', () => {
		const cut = { type: 'section', id: 'X', levelId: 'L33', name: 'B', a: { x: 0, y: 0 }, b: { x: 5000, y: 0 }, depth: 3000 } as const
		const i = new ProjectIndex([...demoProject(), cut])
		const vp = { id: 'V', view: { levelId: 'L33', spec: { kind: 'section' as const, sectionId: 'X' } }, rect: { x: 20, y: 20, w: 200, h: 150 }, scale: 50, centre: { x: 0, y: 0 } }
		const label = (v: typeof vp & { label?: string }) => sheetDisplayList(i, sheet({ viewports: [v] })).find((p) => p.k === 'text' && p.cls === 'viewport-label')
		expect(label(vp)).toMatchObject({ text: 'SECTION B–B′  1:50' })
		expect(label({ ...vp, label: 'Riser cut' })).toMatchObject({ text: 'Riser cut  1:50' })
	})
})

describe('title block on a sheet (Pages model)', () => {
	const texts = (prims: ReturnType<typeof sheetDisplayList>) => prims.flatMap((p) => (p.k === 'text' ? [p.text] : []))
	it('a strip down the right, filled from the project and the sheet', () => {
		const s = sheet({ viewports: [{ id: 'V', view: { levelId: 'L33', spec: { kind: 'plan' } }, rect: { x: 20, y: 20, w: 200, h: 150 }, scale: 100, centre: { x: 0, y: 0 } }], titleBlock: { fields: { drawn: 'DM' } } })
		const tb = sheetTitleBlock(ix(), s, { projectName: 'Tower' })
		expect(tb.cells.map((c) => [c.label, c.value])).toContainEqual(['Scale', '1:100'])
		expect(tb.cells.map((c) => [c.label, c.value])).toContainEqual(['Drawn', 'DM'])
		const prims = sheetDisplayList(ix(), s, { projectName: 'Tower' })
		expect(texts(prims)).toEqual(expect.arrayContaining(['Tower', 'Plan', 'S-001', 'A3 L', '1:100']))
		const frame = prims.find((p) => p.k === 'line' && p.cls === 'tb-frame')
		expect(frame && frame.k === 'line' && Math.max(...frame.pts.map((q) => q.x))).toBe(410)   // up to the right margin
	})
	it('a band along the bottom, or hidden on this sheet; new viewports stay clear of it', () => {
		const band = { fields: DEFAULT_TITLE_BLOCK.fields, layout: 'horizontal' as const }
		const a = drawingArea(ix(), sheet(), { template: band })
		expect(a.w).toBe(400)                                  // full width …
		expect(a.y + a.h).toBeLessThan(287)                    // … above the band
		const strip = drawingArea(ix(), sheet())
		expect(strip.x + strip.w).toBeLessThan(410)            // left of the strip
		expect(defaultViewport(ix(), sheet(), 'L33', 'V').rect.x + defaultViewport(ix(), sheet(), 'L33', 'V').rect.w).toBeLessThan(strip.x + strip.w)
		expect(texts(sheetDisplayList(ix(), sheet({ titleBlock: { hidden: true } })))).not.toContain('S-001')
	})
	it('the compact box sits in the bottom-right corner', () => {
		const prims = sheetDisplayList(ix(), sheet(), { template: { fields: DEFAULT_TITLE_BLOCK.fields, layout: 'compact' } })
		const f = prims.find((p) => p.k === 'line' && p.cls === 'tb-frame')!
		expect(f.k === 'line' && Math.min(...f.pts.map((q) => q.y))).toBeGreaterThan(150)
	})
	it('a viewport draws its view at 1:N into its window: model mm / N, centred, clipped', () => {
		const vp = { id: 'V', view: { levelId: 'L33', spec: { kind: 'plan' as const } }, rect: { x: 20, y: 20, w: 200, h: 150 }, scale: 100, centre: { x: 1000, y: 4000 } }
		const t = toPaper(vp)
		expect(t({ x: 1000, y: 4000 })).toEqual({ x: 120, y: 95 })          // the centre lands mid-window
		expect(t({ x: 2000, y: 4000 })).toEqual({ x: 130, y: 95 })          // 1000 mm of model = 10 mm of paper at 1:100
		const prims = sheetDisplayList(ix(), sheet({ viewports: [vp] }))
		const content = prims.filter((p) => p.clip)
		expect(content.length).toBeGreaterThan(3)
		expect(prims.findIndex((p) => p.k === 'line' && p.cls === 'viewport-bg')).toBeLessThan(prims.findIndex((p) => p.clip))   // background first
		expect(content.every((p) => !p.src)).toBe(true)                      // content isn't picked on the sheet …
		expect(prims.find((p) => p.k === 'line' && p.cls === 'viewport')).toMatchObject({ src: 'SH', sub: 'V' })   // … its window is
		expect(content[0].clip).toEqual({ x0: 20, y0: 20, x1: 220, y1: 170 })
	})
	it('a new viewport looks at the level’s content', () => {
		const vp = defaultViewport(ix(), sheet(), 'L33', 'V')
		expect(vp.scale).toBe(100)
		expect(Math.abs(vp.centre.x - 0)).toBeGreaterThan(100)              // not the origin: the demo outlets sit around x 1000–6000
	})
})
