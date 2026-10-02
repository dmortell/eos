// Sheets (Phase 4.1): paper at true size, viewports drawing their view at 1:N into a clipped window.
import { describe, it, expect } from 'vitest'
import { sheetDisplayList, paperSize, toPaper, defaultViewport } from './sheet'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import type { Sheet } from '../domain/drawing'

const sheet = (extra: Partial<Sheet> = {}): Sheet => ({ type: 'sheet', id: 'SH', number: 'S-001', title: 'Plan', order: 1, paper: { size: 'A3', orientation: 'landscape', marginMm: 10 }, viewports: [], status: 'active', ...extra })
const ix = () => new ProjectIndex(demoProject())

describe('sheets', () => {
	it('A3 landscape is 420 × 297 mm; the paper and its margin are drawn', () => {
		expect(paperSize(sheet())).toEqual({ w: 420, h: 297 })
		expect(paperSize(sheet({ paper: { size: 'A1', orientation: 'portrait', marginMm: 10 } }))).toEqual({ w: 594, h: 841 })
		expect(sheetDisplayList(ix(), sheet()).map((p) => p.k === 'line' && p.cls)).toEqual(['paper', 'paper-margin'])
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
