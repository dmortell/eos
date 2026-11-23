// N identical runs side by side (User 2026-11-23: "4 PF36 conduits", drawn at their outside Ø): fill against all of
// them (their inside), the BOM counts each, the plan draws them side by side with "4 × Ø45.5"; routing is one run.
import { describe, it, expect } from 'vitest'
import { ProjectIndex } from './project'
import { runCount, type Shape } from './shapes'
import { fillBySegment, shareCables } from './fill'
import { fillSectionDisplayList } from '../views/fillSection'
import { runLengths } from './reports'
import { planDisplayList } from '../views/plan'
import type { Entity } from './drawing'

const H = { slabMm: 200, raisedFloorMm: 300, clearHeightMm: 2600, plenumMm: 700 }
const conduit = (count?: number): Shape => ({
	type: 'shape', id: 'C', levelId: 'L',
	geom: { kind: 'path', nodes: [{ id: 'a', x: 0, y: 0, z: 2950 }, { id: 'b', x: 10000, y: 0, z: 2950 }], segs: [{ id: 's', a: 'a', b: 'b' }] },
	section: { w: 45.5, h: 45.5, round: true, inner: { w: 36, h: 36 } },
	role: { kind: 'containment', form: 'conduit', tier: 'high', extra: [{ type: 'cat6a', n: 28, d: 7.5 }], ...(count ? { count } : {}) },
} as Shape)
const ix = (count?: number) => new ProjectIndex([{ type: 'level', id: 'L', buildingId: 'B', number: 33, name: '33F', order: 33, elevationMm: 0, heights: H }, conduit(count)] as Entity[])

describe('runs side by side (count)', () => {
	it('absent or below 1 is one run', () => {
		expect(runCount(conduit())).toBe(1)
		expect(runCount(conduit(0))).toBe(1)
		expect(runCount(conduit(4))).toBe(4)
	})
	it('fill is against all of them (their inside Ø): 4 × PF36 holds four times one', () => {
		const one = [...fillBySegment(ix(), new Map()).values()][0], four = [...fillBySegment(ix(4), new Map()).values()][0]
		expect(four.areaMm2).toBeCloseTo(4 * Math.PI * 18 ** 2)
		expect(four.pct).toBeCloseTo(one.pct / 4)
		expect(four.pct).toBeCloseTo((28 * 7.5 ** 2) / (4 * Math.PI * 18 ** 2) * 100)
	})
	it('the fill pictures: the cables shared out evenly, each conduit drawn with its share', () => {
		const od = (t: string) => (t === 'fibre' ? 12 : 7.5)
		expect(shareCables({ cat6a: 28 }, 4, od)).toEqual([{ cat6a: 7 }, { cat6a: 7 }, { cat6a: 7 }, { cat6a: 7 }])
		const mixed = shareCables({ cat6a: 6, fibre: 2 }, 4, od)
		expect(mixed.map((r) => r.fibre ?? 0)).toEqual([1, 1, 0, 0])   // largest first, dealt round
		const fills = fillBySegment(ix(4), new Map())
		const ps = fillSectionDisplayList(ix(4), 'C', 's', fills)
		expect(ps.filter((p) => p.k === 'circle' && p.cls === 'legend')).toHaveLength(4)
		expect(ps.filter((p) => p.k === 'circle' && p.cls === 'fill-cable').length).toBeGreaterThanOrEqual(28)
		expect(ps.some((p) => p.k === 'text' && p.text.startsWith('4 × Ø36 inside'))).toBe(true)
	})
	it('the BOM counts each one: 10 m × 4', () => {
		expect(runLengths(ix(4))[0]).toMatchObject({ horizontalM: 40, count: 4, size: 'Ø45.5' })
	})
	it('the plan draws them side by side at their outside Ø, a line between each two, and labels "4 × Ø45.5"', () => {
		const ps = planDisplayList(ix(4), 'L', { scale: 100 })
		expect(ps.find((p) => p.role === 'run-pick' && p.k === 'line')).toMatchObject({ w: 4 * 45.5 })
		expect(ps.filter((p) => p.role === 'run' && p.k === 'line' && !p.closed)).toHaveLength(3)
		expect(ps.find((p) => p.role === 'run-label')).toMatchObject({ text: '4 × Ø45.5' })
		expect(planDisplayList(ix(), 'L', { scale: 100 }).some((p) => p.role === 'run-label')).toBe(false)
	})
})
