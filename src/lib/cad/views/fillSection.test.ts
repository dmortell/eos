// A fill section on paper: the segment's cables packed into its inside at a true scale, its % (as fillBySegment
// works it out) and its cables by type.
import { describe, it, expect } from 'vitest'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import type { Shape } from '../domain/shapes'
import { fillBySegment, segKey, riserLevels } from '../domain/fill'
import { fillSectionDisplayList, fillTitle, pctText } from './fillSection'
import type { Entity } from '../domain/drawing'

const withCables = () => demoProject().map((e) => (e.id === 'T1' && e.type === 'shape' && e.role?.kind === 'containment' ? { ...e, role: { ...e.role, extra: [{ type: 'cat6a', n: 12 }, { type: 'power', n: 2, d: 10 }] } } : e))

describe('fill section on paper', () => {
	const ix = new ProjectIndex(withCables())
	const run = ix.getOf('shape', 'T1')!, seg = run.geom.kind === 'path' ? run.geom.segs[0] : undefined
	const fills = fillBySegment(ix, new Map())
	it('its % is the segment’s fill, with its cables by type and every cable drawn inside the section', () => {
		const f = fills.get(segKey('T1', seg!.id))!
		const ps = fillSectionDisplayList(ix, 'T1', seg!.id, fills)
		const t = ps.flatMap((p) => (p.k === 'text' ? [p.text] : []))
		expect(t[0]).toBe('Fill · T1 · seg 1')
		expect(t).toContain(`${pctText(f.pct)} full (limit 40%)`)
		expect(t.some((x) => x.startsWith('12 × cat6a'))).toBe(true)
		expect(t).toContain('2 × power  Ø10 (by hand)')
		expect(t).toContain('94×44 inside · section 1:2')   // 100 × 50 less 3 mm walls fits 80 × 60 mm at 1:2
		expect(t).toContain('14 cables')                    // none estimated: no "· N estimated"
		// 14 cables in the picture (then a color key per type), inside the 47 × 22 mm the inside is drawn at
		const cables = ps.filter((p) => p.k === 'circle' && p.cls === 'fill-cable')
		expect(cables).toHaveLength(14 + 2)
		for (const c of cables.slice(0, 14)) if (c.k === 'circle') { expect(c.c.x - c.r).toBeGreaterThanOrEqual(-0.01); expect(c.c.x + c.r).toBeLessThanOrEqual(47.01) }
	})
	it('a segment with nothing through it says so', () => {
		expect(fillSectionDisplayList(ix, 'T1', seg!.id, new Map()).some((p) => p.k === 'text' && p.text === 'No cables through this segment')).toBe(true)
	})
	it('a riser segment is titled by the floors it joins; a rise on one level is not (W22)', () => {
		expect(fillTitle(ix, 'T1', run.geom.kind === 'path' ? run.geom.segs[1].id : '')).toBe('T1 · seg 2')   // a drop on 33F
		// the run's far end on 32F: its vertical segment is a riser
		const ents = withCables().map((e) => (e.id === 'T1' && e.type === 'shape' && e.geom.kind === 'path' ? { ...e, label: '', geom: { ...e.geom, nodes: e.geom.nodes.map((n, i) => (i === 2 ? { ...n, levelId: 'L32' } : n)) } } : e))
		const ix2 = new ProjectIndex([...ents, { type: 'level', id: 'L32', buildingId: 'B', number: 32, name: '32F', order: 32, elevationMm: 128000 } as Entity])
		const r = ix2.getOf('shape', 'T1')!
		if (r.geom.kind !== 'path') throw new Error('a path')
		expect(riserLevels(ix2, r, r.geom.segs[1])).toBe('33F ↕ 32F')
		expect(riserLevels(ix2, r, r.geom.segs[0])).toBeNull()
		expect(fillTitle(ix2, 'T1', r.geom.segs[1].id)).toBe('Riser 33F ↕ 32F')
	})
})
