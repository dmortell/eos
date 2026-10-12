// Shape style: a shape's own line color, lineweight and line type reach its prims (Dave, 2026-10-05).
import { describe, it, expect } from 'vitest'
import { shapePrims } from './plan'
import { displayListToDxf } from '../render/dxf'
import { logoHandles, logoBoxes, logoAt } from '../editor/logoHandles'
import { ProjectIndex } from '../domain/project'
import type { Shape } from '../domain/shapes'

const rect = { type: 'shape', id: 'R', levelId: 'L', style: { stroke: '#dc2626', weightMm: 0.5, dash: 'dashed', fill: '#fde047' }, geom: { kind: 'rect', centre: { x: 0, y: 0 }, size: { x: 100, y: 50 } } } as Shape

describe('shape style', () => {
	it('the outline takes color, weight and line type; the fill keeps its own color and none of them', () => {
		const [fill, outline] = shapePrims(rect, 100)
		expect(fill).toMatchObject({ cls: 'shape-fill', color: '#fde047' })
		expect(fill).not.toHaveProperty('weight')
		expect(outline).toMatchObject({ color: '#dc2626', weight: 0.5, dash: 'dashed' })
	})
	it('a text takes only the color', () => {
		const t = { type: 'shape', id: 'T', levelId: 'L', style: { stroke: '#2563eb', weightMm: 0.7, dash: 'dotted' }, geom: { kind: 'text', at: { x: 0, y: 0 }, text: 'A', sizeMm: 2 } } as Shape
		const [p] = shapePrims(t, 100)
		expect(p).toMatchObject({ color: '#2563eb' })
		expect(p).not.toHaveProperty('dash')
	})
	it('DXF gets the line type', () => {
		const dxf = displayListToDxf(shapePrims(rect, 100)).text
		expect(dxf).toMatch(/DASHED/)
	})
})

describe('doors on boxes', () => {
	it('a rectangle with doors draws them open, like a rack\'s', () => {
		const box = { type: 'shape', id: 'B', levelId: 'L', extent: 750, doors: { front: 'split' }, geom: { kind: 'rect', centre: { x: 0, y: 0 }, size: { x: 600, y: 600 } } } as Shape
		expect(shapePrims(box, 100).filter((p) => p.k === 'line' && p.cls === 'rack-door')).toHaveLength(4)   // 2 leaves × (leaf + arc)
	})
})

describe('logo grips on the paper', () => {
	it('a picked logo has a grip (the resize-grip style) on its bottom edge; dragging it sets the logo\'s height', async () => {
		const sheet = { type: 'sheet', id: 'S', number: 'S1', title: 'T', order: 1, paper: { size: 'A3', orientation: 'landscape', marginMm: 5 }, viewports: [], status: 'active' }
		const settings = { type: 'settings', id: 'settings', portSuffix: 'alpha', usages: [], cableTypes: [], defaults: {}, titleBlock: { fields: [{ key: 'logo', logo: 'company', label: 'Our logo', wide: true }], logos: { company: { src: 'https://x/logo.png', h: 10 } } } }
		const ix = new ProjectIndex([sheet as never]), [b] = logoBoxes(ix, sheet as never, settings as never)
		expect(logoAt([b], { x: b.x + 1, y: b.y + 1 })).toBe('company')
		expect(logoAt([b], { x: b.x - 1, y: b.y })).toBeNull()
		const { handles: hs, outline } = logoHandles(ix, sheet as never, settings as never, 'company')
		expect(hs).toHaveLength(1)
		expect(hs[0].shape).toBe('grip')
		expect(outline).toHaveLength(4)
		expect(logoHandles(ix, sheet as never, settings as never, 'client').handles).toHaveLength(0)
		const next = hs[0].drag!({ x: hs[0].at.x, y: hs[0].at.y + 6 }, false) as unknown as { titleBlock: { logos: { company: { h: number } } } }
		expect(next.titleBlock.logos.company.h).toBe(16)
	})
})
