import { describe, it, expect } from 'vitest'
import { conduitFill, fillLabel, fillTone, portsNearest, conduitSection } from './fill'
import type { Conduit, Obj } from './types'
import type { Ent } from '../ui/geometry'

const trunk = (id: string, x: number, cables?: Conduit['cables']): Conduit & Obj => ({
	type: 'conduit', id, w: 100, h: 50, edges: 4, cables,
	nodes: [{ id: 'a', x, y: 0, z: 2600 }, { id: 'b', x, y: 10000, z: 2600 }], segments: [{ id: 's', a: 'a', b: 'b' }],
})

describe('cable fill (F10)', () => {
	it('fill % = cable area (π r²) over the cross-section; the label counts by type', () => {
		const c = trunk('t', 0, [{ type: 'cat6a', qty: 20 }, { type: 'fiber-sm', qty: 4 }])
		const expected = ((20 * Math.PI * 4.5 ** 2 + 4 * Math.PI * 1.5 ** 2) / (100 * 50)) * 100
		expect(conduitFill(c)).toBeCloseTo(expected, 5)
		expect(fillLabel(c)).toBe(`20 C6A · 4 SM · ${Math.round(expected)}%`)
		expect(fillLabel(trunk('t', 0))).toBe('')
		expect(conduitSection({ ...c, edges: 16 }).containmentType).toBe('round')
	})
	it('the tightest segment governs; tones switch at 40 / 60 %', () => {
		const c = trunk('t', 0, [{ type: 'cat6', qty: 10 }])
		c.segments.push({ id: 's2', a: 'b', b: 'a', w: 50, h: 50 })
		expect(conduitFill(c)).toBeCloseTo(((10 * Math.PI * 3.5 ** 2) / 2500) * 100, 5)
		expect([fillTone(10), fillTone(50), fillTone(70)]).toEqual(['#16a34a', '#f59e0b', '#ef4444'])
	})
	it('counts the ports of outlets whose NEAREST conduit is this one', () => {
		const objs = [trunk('t1', 0), trunk('t2', 5000)]
		const o = (x: number, ports: string): Ent => ({ id: `o${x}`, type: 'insert', block: 'outlet-box', a: [x, 500], attrs: { LABEL: 'x', PORTS: ports } })
		const ents = [o(1000, '2'), o(2000, '4'), o(4000, '6'), { id: 'r', type: 'rect', a: [0, 0], b: [1, 1] } as Ent]
		expect(portsNearest('t1', objs, ents)).toEqual({ outlets: 2, ports: 6 })
		expect(portsNearest('t2', objs, ents)).toEqual({ outlets: 1, ports: 6 })
	})
})
