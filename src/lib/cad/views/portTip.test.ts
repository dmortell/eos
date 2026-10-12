// The port tip: place and label, the cable to its outlet, its cords; the port under the pointer in a rack view.
import { describe, it, expect } from 'vitest'
import { portTip, portTipUse, portUnder, outletUnder, outletTip } from './portTip'
import { planDisplayList } from './plan'
import type { Entity } from '../domain/drawing'
import type { Outlet } from '../domain/types'
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
		expect(portTipUse(ix, { on: 'P1', port: 20, face: 'front' })).toBe('Panel 1: 4 of 24 used · 20 free')
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

describe('outlet tips and usage colours (plan)', () => {
	const settings = { type: 'settings', id: 'settings', portSuffix: 'alpha', usages: [{ id: 'desk', label: 'Desk', color: '#2563eb' }], cableTypes: [], defaults: {} } as unknown as Entity
	const ix = new ProjectIndex([...demoProject(), settings])
	it('the outlet under the pointer; its label, usage · tier · mount, and each port → its panel port', () => {
		const prims = planDisplayList(ix, 'L33', { scale: 100 })
		const o = ix.get('O1') as Outlet
		expect(outletUnder(ix, prims, o.at!, 10)?.id).toBe('O1')
		expect(outletUnder(ix, prims, { x: -50000, y: -50000 }, 10)).toBeNull()
		const t = outletTip(ix, o)
		expect(t.slice(0, 2)).toEqual(['33-001', 'Desk · low · floor'])
		expect(t[2]).toMatch(/^33-001\.A → /)
		expect(t[2]).not.toMatch(/not allocated/)
	})
	it('outlets drawn in their usage colour (not their label); their panel ports tinted with it', () => {
		const prims = planDisplayList(ix, 'L33', { scale: 100 }).filter((p) => p.src === 'O1')
		expect(prims.filter((p) => p.k !== 'text').every((p) => p.color === '#2563eb')).toBe(true)
		expect(prims.filter((p) => p.k === 'text').some((p) => p.color === '#2563eb')).toBe(false)
		const row = rackRowDisplayList(ix, { spaceId: 'SR-A', face: 'front' })
		expect(row.filter((p) => p.k === 'line' && p.cls === 'port-usage' && p.color === '#2563eb').length).toBe(4)   // K1–K4 to the two desk outlets
	})
	it('the project can draw outlets by layer instead (Usage colours off)', () => {
		const byLayer = new ProjectIndex([...demoProject(), { ...settings, outletColour: 'layer' } as Entity])
		expect(planDisplayList(byLayer, 'L33', { scale: 100 }).filter((p) => p.src === 'O1').some((p) => p.color === '#2563eb')).toBe(false)
	})
})
