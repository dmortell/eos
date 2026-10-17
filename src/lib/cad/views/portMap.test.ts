// The port map view (port-map-plan.md): each device like its faceplate, ports where they are, the far item in each.
import { describe, it, expect } from 'vitest'
import { portMapDisplayList, portGrid } from './portMap'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import type { Device } from '../domain/types'
import type { Prim } from './display'

const ix = () => new ProjectIndex(demoProject())
const cell = (ps: Prim[], dev: string, port: number) => ps.find((p) => p.k === 'line' && p.src === dev && p.sub === String(port)) as Extract<Prim, { k: 'line' }>
/** The texts drawn inside a port's cell. */
const textsIn = (ps: Prim[], c: Extract<Prim, { k: 'line' }>) => {
	const xs = c.pts.map((p) => p.x), ys = c.pts.map((p) => p.y)
	return ps.filter((p): p is Extract<Prim, { k: 'text' }> => p.k === 'text' && p.at.x >= Math.min(...xs) && p.at.x <= Math.max(...xs) && p.at.y >= Math.min(...ys) && p.at.y <= Math.max(...ys)).map((p) => p.text)
}

describe('port map view', () => {
	it('a switch port: its number in the corner, the outlet it reaches across the cord', () => {
		const ps = portMapDisplayList(ix(), ['SW1'])
		expect(textsIn(ps, cell(ps, 'SW1', 1))).toEqual(['SW1-01', '33', '001', 'A'])   // own label; "33-001.A" stacked
		expect(textsIn(ps, cell(ps, 'SW1', 5))).toEqual(['5'])                        // free
	})
	it('a panel port: the switch port it is patched to; unpatched, the outlet its cable goes to', () => {
		const ps = portMapDisplayList(ix(), ['P1'])
		expect(textsIn(ps, cell(ps, 'P1', 1))).toEqual(['1', 'Switch 1', 'SW1-01'])
		expect(textsIn(ps, cell(ps, 'P1', 3))).toEqual(['3', '33', '002', 'A'])
	})
	it('ports where they are on the device: 48 ports in 1U = 2 rows of 24', () => {
		const i = ix(), ps = portMapDisplayList(i, ['SW1'])
		expect(portGrid(i.getOf('device', 'SW1')!)).toEqual({ rows: 2, cols: 24 })
		const c1 = cell(ps, 'SW1', 1), c25 = cell(ps, 'SW1', 25), c24 = cell(ps, 'SW1', 24)
		expect(c25.pts[0].x).toBe(c1.pts[0].x)          // port 25 under port 1
		expect(c25.pts[0].y).toBeGreaterThan(c1.pts[0].y)
		expect(c24.pts[0].y).toBe(c1.pts[0].y)          // port 24 at the end of the top row
	})
	it('devices stacked, top U first', () => {
		const ps = portMapDisplayList(ix(), ['SW1', 'P1'])
		expect(cell(ps, 'P1', 1).pts[0].y).toBeLessThan(cell(ps, 'SW1', 1).pts[0].y)
	})
})
