// Sheets → PDF (Phase 4.3): one page per sheet at its paper size, vector text, images embedded, unsupported text
// reported. Runs jspdf headless (no images: the loader is a stub).
import { freeze } from '../domain/issue'
import { describe, it, expect, vi } from 'vitest'
import { jsPDF } from 'jspdf'
import { pagesToPdf, sheetPages, pdfText, styleOf } from './pdf'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import type { Sheet } from '../domain/drawing'

const sheet = (id: string, size: Sheet['paper']['size'], orientation: Sheet['paper']['orientation']): Sheet => ({
	type: 'sheet', id, number: id, title: `Title ${id}`, order: 1, paper: { size, orientation, marginMm: 5 }, status: 'active',
	viewports: [{ id: 'V', view: { levelId: 'L33', spec: { kind: 'plan' } }, rect: { x: 10, y: 10, w: 200, h: 150 }, scale: 100, centre: { x: 3000, y: 4000 } }],
})
const noImages = async () => null

describe('sheets to PDF', () => {
	it('one page per sheet, each at its own paper size; the text is real text', async () => {
		const ix = new ProjectIndex(demoProject())
		const pages = sheetPages(ix, [sheet('S001', 'A3', 'landscape'), sheet('S002', 'A4', 'portrait')], { projectName: 'Tower' })
		const { pdf, unsupported } = await pagesToPdf(pages, noImages, { compress: false })   // readable streams for the test
		expect(pdf.getNumberOfPages()).toBe(2)
		pdf.setPage(1)
		expect(Math.round(pdf.internal.pageSize.getWidth())).toBe(420)
		pdf.setPage(2)
		expect(Math.round(pdf.internal.pageSize.getWidth())).toBe(210)
		const raw = pdf.output()
		expect(raw).toContain('(S001)')
		expect(raw).toContain('(Tower)')
		expect(raw).toContain('(33-001)')   // an outlet's label from the plan viewport
		expect(unsupported).toEqual([])
	})
	it('symbols the standard fonts lack become plain text; anything else is reported', async () => {
		expect(pdfText('Dwg №')).toEqual({ text: 'Dwg No.', ok: true })
		expect(pdfText('↕ +2105 → +2600')).toEqual({ text: ' +2105 -> +2600', ok: true })
		expect(pdfText('サーバー室').ok).toBe(false)
		const { unsupported } = await pagesToPdf([{ w: 100, h: 100, prims: [{ k: 'text', at: { x: 10, y: 10 }, text: 'サーバー室', size: 3, cls: 'label' }] }], noImages)
		expect(unsupported).toEqual(['サーバー室'])
	})
	it('with a rasteriser, Japanese text goes in as a picture where the text was (nothing left out)', async () => {
		const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
		const asked: string[] = []
		const raster = async (t: string) => { asked.push(t); return { data: PNG, w: 20, h: 3, ascent: 2.4 } }
		const page = { w: 100, h: 100, prims: [{ k: 'text' as const, at: { x: 10, y: 10 }, text: '東京都港区', size: 2, cls: 'tb-company' }, { k: 'text' as const, at: { x: 10, y: 20 }, text: 'Plain', size: 2, cls: 'label' }] }
		const r = await pagesToPdf([page], noImages, { rasterText: raster })
		expect(asked).toEqual(['東京都港区'])                  // only the text the fonts can't show
		expect(r.rasterised).toEqual(['東京都港区'])
		expect(r.unsupported).toEqual([])
	})
	it('turned Japanese text: the picture turns about the text’s anchor, as real text does', async () => {
		const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
		const raster = async () => ({ data: PNG, w: 20, h: 3, ascent: 2.4 })
		const spy = vi.spyOn((jsPDF as unknown as { API: { addImage: (...a: unknown[]) => unknown } }).API, 'addImage')   // a plugin method
		await pagesToPdf([{ w: 100, h: 100, prims: [{ k: 'text', at: { x: 10, y: 10 }, text: '東京', size: 2, cls: 'label', rot: 90 }] }], noImages, { rasterText: raster })
		const [, , x, y, w, h, , , rot] = spy.mock.calls.at(-1) as unknown as [unknown, string, number, number, number, number, unknown, unknown, number]
		spy.mockRestore()
		// its bottom-left corner (0.6 below the anchor's baseline) turned 90° clockwise about the anchor: (9.4, 10)
		expect([x, y + h, w, rot]).toEqual([expect.closeTo(9.4, 6), expect.closeTo(10, 6), 20, -90])
	})
	it('screen-only things stay off the paper', () => {
		expect(styleOf('paper').skip).toBe(true)
		expect(styleOf('paper-margin').skip).toBe(true)
		expect(styleOf('viewport viewport-hidden').skip).toBe(true)
		expect(styleOf('viewport').skip).toBeUndefined()
	})
})

describe('B/W floorplans in the PDF', () => {
	it('a gray image is asked for gray, apart from the same image in colour; issues keep the flag', async () => {
		const calls: [string, boolean | undefined][] = []
		const img = { k: 'image' as const, url: 'u', x: 0, y: 0, w: 10, h: 10 }
		await pagesToPdf([{ w: 100, h: 100, prims: [img, { ...img, gray: true }] }], async (url, _k, gray) => { calls.push([url, gray]); return null })
		expect(calls).toEqual([['u', undefined], ['u', true]])
		expect(freeze([{ ...img, gray: true }])[0]).toMatchObject({ gray: true })
	})
})
