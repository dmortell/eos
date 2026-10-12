import { describe, it, expect } from 'vitest'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import type { Device } from '../domain/types'
import { panelPages, portGridDisplayList } from './panelSheets'
import { pagesToPdf } from '../render/pdf'

const o = { title: 'Demo · IDF-A', date: '2026-10-06' }

describe('printed panel sheets', () => {
	it("draws each panel's ports with their labels, 24 across, under a page title", () => {
		const { pages, panels } = panelPages(new ProjectIndex(demoProject()), 'SR-A', o)
		expect(panels.map((d) => d.id)).toEqual(['P1'])
		expect(pages).toHaveLength(1)
		const p = pages[0].prims
		expect(p.filter((x) => x.k === 'line' && x.cls.startsWith('port') && x.src === 'P1')).toHaveLength(24)
		const texts = p.filter((x) => x.k === 'text').map((x) => (x.k === 'text' ? x.text : ''))
		expect(texts).toContain('A01 · Panel 1 · U40 · 24 ports')
		expect(texts.some((t) => t.endsWith('1 / 1'))).toBe(true)
		// port 3 carries outlet 33-002.A: stacked "33" / "002" / "A"
		expect(texts).toEqual(expect.arrayContaining(['33', '002', 'A']))
	})
	it('a big room flows onto more pages, every page numbered', () => {
		const base = demoProject(), p1 = base.find((e) => e.id === 'P1') as Device
		const many = [...base, ...Array.from({ length: 12 }, (_, i): Device => ({ ...p1, id: `PX${i}`, name: `Panel X${i}`, u: 30 - i, portCount: 48 }))]
		const { pages, panels } = panelPages(new ProjectIndex(many), 'SR-A', o)
		expect(panels).toHaveLength(13)
		expect(pages.length).toBeGreaterThan(1)
		for (const pg of pages) for (const q of pg.prims) if (q.k === 'line') for (const pt of q.pts) expect(pt.y).toBeLessThanOrEqual(pg.h)
		expect(pages.at(-1)!.prims.some((q) => q.k === 'text' && q.text.endsWith(`${pages.length} / ${pages.length}`))).toBe(true)
	})
	it('prints as a PDF (every text in the PDF fonts)', async () => {
		const { pages } = panelPages(new ProjectIndex(demoProject()), 'SR-A', o)
		const { pdf, unsupported } = await pagesToPdf(pages, async () => null)
		expect(unsupported).toEqual([])
		expect(pdf.getNumberOfPages()).toBe(1)
	})
	it('a port grid (a sheet viewport): a rack’s panels from (0, 0), or one device', () => {
		const ix = new ProjectIndex(demoProject())
		const rack = portGridDisplayList(ix, 'R1')
		expect(rack.filter((x) => x.k === 'line' && x.src === 'P1')).toHaveLength(24)   // panels only: the switch is left out
		expect(rack.some((x) => x.src === 'SW1')).toBe(false)
		expect(Math.min(...rack.flatMap((x) => (x.k === 'line' ? x.pts.map((q) => q.x) : [])))).toBe(0)
		const sw = portGridDisplayList(ix, 'R1', 'SW1')
		expect(sw.filter((x) => x.k === 'line' && x.src === 'SW1')).toHaveLength(48)
		expect(sw.filter((x) => x.k === 'text' && x.cls === 'port-label').slice(0, 2).map((x) => x.k === 'text' && x.text)).toEqual(['SW1', '01'])   // its own label, stacked
	})
})
