// The port tip: place and label, the cable to its outlet, its cords; the port under the pointer in a rack view.
import { describe, it, expect } from 'vitest'
import { portTip, portUnder } from './portTip'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import { rackRowDisplayList } from './rackRow'

describe('port tips', () => {
	const ix = new ProjectIndex(demoProject())
	it('a panel port: its place, the outlet label it shows, the cable to the outlet, its cord', () => {
		const t = portTip(ix, { on: 'P1', port: 1, face: 'front' })
		expect(t[0]).toMatch(/Panel 1 : 1/)
		expect(t.some((l) => /^cable → outlet .* port 1/.test(l))).toBe(true)
		expect(t.some((l) => /^cord → .*Switch 1 : 1/.test(l))).toBe(true)
	})
	it('an unused port says so', () => {
		expect(portTip(ix, { on: 'P1', port: 20, face: 'front' }).at(-1)).toBe('not connected')
	})
	it('finds the port cell under a point in the rack view', () => {
		const prims = rackRowDisplayList(ix, { spaceId: 'SR-A', face: 'front' })
		const cell = prims.find((p) => p.k === 'line' && p.src === 'P1' && p.sub === '3')
		if (cell?.k !== 'line') throw new Error('no port cell')
		const mid = { x: (cell.pts[0].x + cell.pts[2].x) / 2, y: (cell.pts[0].y + cell.pts[2].y) / 2 }
		expect(portUnder(prims, mid, 'front')).toEqual({ on: 'P1', port: 3, face: 'front' })
		expect(portUnder(prims, { x: -9999, y: 0 }, 'front')).toBeNull()
	})
})
