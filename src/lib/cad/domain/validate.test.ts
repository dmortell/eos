import { describe, it, expect } from 'vitest'
import { makePath, makeWall, makeRun, makeBox, makeText, toLine, toWall } from './make'
import { validateShape, validateProject } from './validate'
import type { Outlet, Rack, Device, Link } from './types'
import type { Shape } from './shapes'

const codes = (xs: { code: string }[]) => xs.map((x) => x.code)

describe('shapes made by the constructors are valid', () => {
	it('lines, walls, runs, boxes and text', () => {
		const line = makePath({ levelId: 'L' }, [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 800 }])
		const wall = makeWall('L', [{ x: 0, y: 0 }, { x: 5000, y: 0 }])
		const run = makeRun('L', [{ x: 0, y: 0 }, { x: 0, y: 0, z: 2900 }], { w: 100, h: 50 }, { tier: 'high' }, 300)
		const box = makeBox('L', { x: 500, y: 500 }, { w: 1200, d: 600, h: 720 })
		const note = makeText({ sheetId: 'S' }, { x: 10, y: 10 }, 'Hello')
		for (const s of [line, wall, run, box, note]) expect(validateShape(s)).toEqual([])
	})
	it('an ellipse box (the Box tool makes them) is a region that can have an extent; a text can’t (hacky-code #4)', () => {
		const disc: Shape = { type: 'shape', id: 'E', levelId: 'L', geom: { kind: 'ellipse', centre: { x: 0, y: 0 }, rx: 300, ry: 200 }, extent: 750 }
		expect(codes(validateShape(disc))).not.toContain('extent-kind')
		expect(codes(validateShape({ ...makeText({ levelId: 'L' }, { x: 0, y: 0 }, 'x'), extent: 10 }))).toContain('extent-kind')
	})
	it('a closed path joins its last node to its first', () => {
		const sq = makePath({ levelId: 'L' }, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], { closed: true })
		expect(sq.geom.kind === 'path' && sq.geom.segs.length).toBe(3)
	})
})

describe('conversion keeps geometry', () => {
	it('line → wall → line returns the same points', () => {
		const line = makePath({ levelId: 'L' }, [{ x: 0, y: 0 }, { x: 3000, y: 0 }])
		const wall = toWall(line, 150, 2700)
		expect(wall.geom).toBe(line.geom)
		expect(wall.role?.kind).toBe('wall')
		expect(toLine(wall)).toEqual(line)
	})
	it('a rectangle cannot become a wall', () => {
		expect(() => toWall(makeBox('L', { x: 0, y: 0 }, { w: 1, d: 1, h: 1 }), 100, 100)).toThrow()
	})
})

describe('validateShape catches broken records', () => {
	it('owner, plane on a path, section on a region, wall on paper', () => {
		const line = makePath({ levelId: 'L' }, [{ x: 0, y: 0 }, { x: 1, y: 0 }])
		expect(codes(validateShape({ ...line, viewId: 'V' } as unknown as Shape))).toContain('owner')
		expect(codes(validateShape({ ...line, plane: { kind: 'plan', z: 0 } }))).toContain('plane-on-path')
		const box = makeBox('L', { x: 0, y: 0 }, { w: 1, d: 1, h: 1 })
		expect(codes(validateShape({ ...box, section: { w: 1, h: 1 } }))).toContain('section-on-region')
		const paperWall = toWall(makePath({ sheetId: 'S' }, [{ x: 0, y: 0 }, { x: 1, y: 0 }]), 100, 100)
		expect(codes(validateShape(paperWall))).toContain('role-owner')
	})
})

describe('validateProject', () => {
	const rack: Rack = { type: 'rack', id: 'R', levelId: 'L', spaceId: 'SR', order: 0, name: 'R1', kind: 'cabinet', heightU: 42, widthMm: 600, depthMm: 1000 }
	const dev = (id: string, u: number, heightU: number, face: Device['face'] = 'front'): Device =>
		({ type: 'device', id, rackId: 'R', name: id, kind: 'panel', u, heightU, face, portCount: 24 })
	const outlet = (id: string, n: number): Outlet => {
		const label = `33-${String(n).padStart(3, '0')}`
		return { type: 'outlet', id, levelId: 'L', zoneId: 'Z', label, tier: 'low', usage: 'desk', mount: 'floor', ports: [{ port: 1, label: `${label}.A`, cableType: 'cat6a' }, { port: 2, label: `${label}.B`, cableType: 'cat6a' }] }
	}

	it('flags devices that overlap on the same face, but not front vs rear', () => {
		expect(codes(validateProject([rack, dev('a', 10, 2), dev('b', 11, 1)]))).toContain('device-overlap')
		expect(codes(validateProject([rack, dev('a', 10, 2, 'front'), dev('b', 11, 1, 'rear')]))).not.toContain('device-overlap')
	})
	it('a vertical PDU takes no rack units, so it overlaps nothing', () => {
		const pdu: Device = { ...dev('pdu', 3, 24, 'rear'), kind: 'pdu' }
		expect(codes(validateProject([rack, pdu, dev('pc', 1, 9, 'both')]))).not.toContain('device-overlap')
	})
	it('flags a device that does not fit the rack', () => {
		expect(codes(validateProject([rack, dev('a', 42, 2)]))).toContain('device-fit')
	})
	it('flags duplicate outlet labels (an error) and duplicate port labels (a warning)', () => {
		const issues = validateProject([outlet('o1', 7), outlet('o2', 7)])
		expect(codes(issues)).toContain('outlet-dup')
		expect(issues.find((i) => i.code === 'port-label-dup')?.severity).toBe('warning')
		expect(codes(validateProject([outlet('o1', 7), outlet('o2', 8)]))).toEqual([])
	})
	it('the same outlet label on two different levels is fine ("A.001" on every floor)', () => {
		const other = { ...outlet('o2', 7), levelId: 'L2', ports: [] }
		expect(codes(validateProject([outlet('o1', 7), other]))).toEqual([])
	})
	it('flags links to ports that do not exist, and a port linked twice', () => {
		const l = (id: string, port: number): Link => ({ type: 'link', id, kind: 'horizontal', a: { on: 'p', port: 1 }, b: { on: 'o1', port }, status: 'design' })
		const panel = dev('p', 1, 1)
		expect(codes(validateProject([rack, panel, outlet('o1', 1), l('l1', 3)]))).toContain('link-end')
		expect(codes(validateProject([rack, panel, outlet('o1', 1), l('l1', 1), l('l2', 2)]))).toContain('port-twice')
	})
})
