// Sections at any angle, phases 5 + 6 (elevation-section-plan.md): the DXF of a section line / elevation marker's view
// is what the viewport draws — through its (oblique) frame, trimmed by its oriented clip — and with Hidden lines = Hide
// only the visible edges (a box behind a wall left out, seen through the wall's door).
import { describe, it, expect } from 'vitest'
import { viewToDxf } from './exportDxf'
import { oclipOf, oclipFrame } from './3dview/projection'
import { frameAt, frameU, rectPts, PLAN_CX, PLAN_CY } from './ui/geometry'
import type { Model, Obj } from './3dview/types'

type Rec = { type: string; section: string; g: [number, string][] }
function records(text: string): Rec[] {
	const ln = text.split(/\r?\n/), out: Rec[] = []
	let section = '', cur: Rec | null = null
	for (let i = 0; i + 1 < ln.length; i += 2) {
		const code = Number(ln[i].trim()), val = ln[i + 1].trim()
		if (code === 0) { cur = { type: val, section, g: [] }; out.push(cur); continue }
		if (cur?.type === 'SECTION' && code === 2) section = val
		cur?.g.push([code, val])
	}
	return out
}
const ents = (text: string) => records(text).filter((r) => r.section === 'ENTITIES' && r.type !== 'SECTION' && r.type !== 'ENDSEC')
const layerOf = (r: Rec) => r.g.find(([c]) => c === 8)?.[1]
const xs = (r: Rec) => r.g.filter(([c]) => c === 10 || c === 11).map(([, v]) => Number(v))

const layers = [
	{ id: 'walls', name: 'Walls', color: '#ff0000', visible: true, locked: false },
	{ id: 'boxes', name: 'Boxes', color: '#00aa00', visible: true, locked: false },
	{ id: 'open', name: 'Openings', color: '#0000ff', visible: true, locked: false, opening: true },
]
const box: Obj = { type: 'prism', id: 'b', layer: 'boxes', x: 1000, y: 1000, z: 0, w: 600, d: 400, h: 1200, edges: 4 }
const wall: Obj = { type: 'wall', id: 'w', layer: 'walls', h: 2700, thickness: 100, nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 4000, y: 0, z: 0 }], segments: [{ id: 'ab', a: 'a', b: 'b' }] }
const door: Obj = { type: 'prism', id: 'd', layer: 'open', x: 900, y: -100, w: 1000, d: 200, z: 0, h: 2100, edges: 4, open: 'door' }
const mk = (objects: Obj[]): Model => ({ id: 'm', name: 'M', layers, objects } as unknown as Model)

describe('DXF of an OBLIQUE section view (phase 5)', () => {
	const f = frameAt([PLAN_CX, PLAN_CY], 30)
	const oc = oclipOf({ x0: -5000, y0: -5000, x1: 8000, y1: 8000, z0: 0, z1: 3000 }, f)   // a 30° view covering everything
	it('draws the box through the oriented clip’s frame, not as the axis-aligned front view', () => {
		const vf = oclipFrame(oc, [PLAN_CX, PLAN_CY])   // the frame the Viewport draws it with
		const b = box as Extract<Obj, { type: 'prism' }>, us = rectPts(b.x, b.y, b.x + b.w, b.y + b.d).map((p) => frameU(vf, p))
		const poly = ents(viewToDxf({ model: mk([box]), ents: [], dir: 'front', oclip: oc, scaleN: 50 }).text).filter((r) => layerOf(r) === 'Boxes')
		expect(poly).toHaveLength(1)
		const X = xs(poly[0])
		expect(Math.min(...X)).toBeCloseTo(Math.min(...us), 3); expect(Math.max(...X)).toBeCloseTo(Math.max(...us), 3)
		const front = ents(viewToDxf({ model: mk([box]), ents: [], dir: 'front', scaleN: 50 }).text).filter((r) => layerOf(r) === 'Boxes')
		expect([Math.min(...xs(front[0])), Math.max(...xs(front[0]))]).toEqual([1000, 1600])   // (the plain front view, unchanged)
	})
	it('trims to the oriented clip: a box outside it is left out', () => {
		const tight = oclipOf({ x0: -500, y0: -500, x1: 500, y1: 500, z0: 0, z1: 3000 }, f)
		expect(viewToDxf({ model: mk([box]), ents: [], dir: 'front', oclip: tight, scaleN: 50 }).objects).toBe(0)
	})
})

describe('DXF with hidden lines (phase 6)', () => {
	const on = (objs: Obj[], extra = {}) => ents(viewToDxf({ model: mk(objs), ents: [], dir: 'front', hideHidden: true, scaleN: 50, ...extra }).text)
	it('a box behind a wall exports nothing; the wall its outline as LINEs', () => {
		const rs = on([wall, box])
		expect(rs.filter((r) => layerOf(r) === 'Boxes')).toHaveLength(0)
		expect(rs.filter((r) => layerOf(r) === 'Walls' && r.type === 'LINE').length).toBeGreaterThanOrEqual(4)
	})
	it('seen through the door it exports; the opening itself draws no outline (the wall’s hole edges do)', () => {
		const rs = on([wall, door, box])
		expect(rs.filter((r) => layerOf(r) === 'Boxes' && r.type === 'LINE')).toHaveLength(4)
		expect(rs.filter((r) => layerOf(r) === 'Openings')).toHaveLength(0)
	})
	it('in an oblique view too', () => {
		const g = frameAt([PLAN_CX, PLAN_CY], 60), oc = oclipOf({ x0: -5000, y0: -5000, x1: 8000, y1: 8000, z0: 0, z1: 3000 }, g)
		const behind: Obj = { ...box, x: 1200, y: 300, w: 300, d: 300, h: 1000 } as Obj
		expect(on([wall, behind], { oclip: oc }).filter((r) => layerOf(r) === 'Boxes')).toHaveLength(0)
		expect(on([wall, door, behind], { oclip: oc }).filter((r) => layerOf(r) === 'Boxes').length).toBeGreaterThan(0)
	})
	it('Hidden lines off: every object as before (the box’s outline behind the wall too)', () => {
		const rs = ents(viewToDxf({ model: mk([wall, box]), ents: [], dir: 'front', scaleN: 50 }).text)
		expect(rs.filter((r) => layerOf(r) === 'Boxes')).toHaveLength(1)
	})
})
