// The cover page / transmittal: on the first sheet's paper with its title block; the register flows onto more pages.
import { describe, it, expect } from 'vitest'
import { coverPages, type CoverRow } from './transmittalPage'
import { paperSize } from './sheet'
import { pagesToPdf } from '../render/pdf'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import type { Sheet } from '../domain/drawing'
import { floorplansIn, underlayRef } from '../domain/issue'

const first: Sheet = { type: 'sheet', id: 'S', number: 'P1', title: 'Plan', order: 0, paper: { size: 'A3', orientation: 'landscape', marginMm: 5 }, viewports: [], status: 'active' }
const rows = (n: number): CoverRow[] => Array.from({ length: n }, (_, i) => ({ number: `S${i + 1}`, title: `Sheet ${i + 1}`, rev: 'A', size: 'A3', status: i === n - 1 ? 'Withdrawn' : 'New revision' }))
const data = (n: number) => ({ project: 'Test', tag: 'Issue 05', name: 'Tender', purpose: 'For tender', date: '2026-10-07', recipients: [{ name: 'Ann', org: 'ACME' }], rows: rows(n) })
const texts = (p: { prims: { k: string }[] }) => p.prims.filter((x): x is { k: 'text'; text: string } => x.k === 'text').map((x) => x.text)

describe('cover page', () => {
	const ix = new ProjectIndex(demoProject())
	it('is the size of the first sheet, with the project, the issue, who gets it and every row in order', () => {
		const [p] = coverPages(ix, first, data(3), { projectName: 'Test' })
		expect({ w: p.w, h: p.h }).toEqual(paperSize(first))
		const t = texts(p)
		expect(t).toContain('Test')
		expect(t.some((x) => x.includes('Issue 05') && x.includes('Tender'))).toBe(true)
		expect(t).toContain('Ann, ACME')
		expect(t.filter((x) => /^S\d+$/.test(x))).toEqual(['S1', 'S2', 'S3'])
		expect(t).toContain('Withdrawn')
		expect(t.some((x) => x.startsWith('Floorplans'))).toBe(false)
		// W4: the floorplan revisions the sheets went out on
		const [q] = coverPages(ix, first, { ...data(1), floorplans: ['1F_20240516.pdf', '2F_revB.pdf'] }, { projectName: 'Test' })
		expect(texts(q)).toContain('Floorplans: 1F_20240516.pdf, 2F_revB.pdf')
		// W21: the Excel files issued with it
		const [e] = coverPages(ix, first, { ...data(1), attachments: ['Bill of materials', 'Cable schedule'] }, { projectName: 'Test' })
		expect(texts(e)).toContain('Also enclosed: Bill of materials, Cable schedule (Excel)')
		expect(floorplansIn([[{ k: 'image', url: underlayRef('2F_revB.pdf', 2), x: 0, y: 0, w: 1, h: 1 }, { k: 'image', url: underlayRef('1F.pdf'), x: 0, y: 0, w: 1, h: 1 }], [{ k: 'image', url: 'picture:logo.png#1', x: 0, y: 0, w: 1, h: 1 }]])).toEqual(['1F.pdf', '2F_revB.pdf'])
	})
	it('a long register flows onto more pages, every row once', () => {
		const pages = coverPages(ix, first, data(120), { projectName: 'Test' })
		expect(pages.length).toBeGreaterThan(1)
		expect(pages.flatMap((p) => texts(p).filter((x) => /^S\d+$/.test(x)))).toEqual(rows(120).map((r) => r.number))
		expect(texts(pages[1]).some((x) => x.includes(`page 2 of ${pages.length}`))).toBe(true)
	})
})

describe('cover page as PDF', () => {
	it('prints with the PDF fonts (nothing drawn as a picture), one page per register page', async () => {
		const pages = coverPages(new ProjectIndex(demoProject()), first, data(60), { projectName: 'Test' })
		const { pdf, unsupported } = await pagesToPdf(pages, async () => null)
		expect(unsupported).toEqual([])
		expect(pdf.getNumberOfPages()).toBe(pages.length)
	})
})
