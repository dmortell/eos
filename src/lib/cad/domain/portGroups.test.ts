// Labelled port ranges on a panel (portGroups.ts), as Dave described them: P3A's U41 48-port panel, the top half tied
// to R301, the bottom half to R302.
import { describe, it, expect } from 'vitest'
import { ProjectIndex } from './project'
import { groupPortLabel, groupsProblem, splitPanel } from './portGroups'
import { rackRowDisplayList } from '../views/rackRow'
import type { Entity } from './drawing'
import type { Device, Link, PortGroup, Rack } from './types'

const rack = (id: string, name: string): Rack => ({ type: 'rack', id, levelId: 'L1', spaceId: 'IDF1', order: 0, name, kind: 'cabinet', heightU: 42, widthMm: 600, depthMm: 1000 })
const panel = (id: string, rackId: string, name: string, portCount: number, groups?: PortGroup[]): Device =>
	({ type: 'device', id, rackId, name, kind: 'panel', u: 41, heightU: 1, face: 'both', portCount, panel: { tier: 'low', ...(groups ? { groups } : {}) } })
const tie = (a: [string, number], b: [string, number]): Link => ({ type: 'link', id: `${a.join(':')}~${b.join(':')}`, kind: 'tie', a: { on: a[0], port: a[1] }, b: { on: b[0], port: b[1] }, status: 'design' })
const room = { type: 'space', id: 'IDF1', levelId: 'L1', kind: 'server room', name: 'IDF1', order: 1 }
// 24 ties each way: the top half (1–24) to R301's panel, the bottom half (25–48) to R302's
const ties = Array.from({ length: 24 }, (_, i) => [tie(['P41', i + 1], ['A41', i + 1]), tie(['P41', i + 25], ['B41', i + 1])]).flat()
const world = (groups?: PortGroup[], linked = true) => new ProjectIndex([
	room, rack('P3A', 'P3A'), rack('R301', 'R301'), rack('R302', 'R302'),
	panel('P41', 'P3A', 'P3A-41', 48, groups), panel('A41', 'R301', 'R301-41', 24), panel('B41', 'R302', 'R302-41', 24), ...(linked ? ties : []),
] as Entity[])

describe('labelled port ranges', () => {
	const split = [{ from: 1, to: 24, label: 'P3A-R301' }, { from: 25, to: 48, label: 'P3A-R302' }]
	it('a port in a range is "<label>:NN" counted from the range’s first port — the 25th is P3A-R302:01', () => {
		const ix = world(split), d = ix.get<Device>('P41')!
		expect([groupPortLabel(ix, d, 1), groupPortLabel(ix, d, 24), groupPortLabel(ix, d, 25), groupPortLabel(ix, d, 48)]).toEqual(['P3A-R301:01', 'P3A-R301:24', 'P3A-R302:01', 'P3A-R302:24'])
		expect(ix.portLabel({ on: 'P41', port: 25 })).toBe('P3A-R302:01')
	})
	it('the far end of its tie shows the same label; without ranges the ties keep their rack-pair labels', () => {
		expect(world(split).portLabel({ on: 'B41', port: 1 })).toBe('P3A-R302:01')
		expect(world(split).portLabel({ on: 'A41', port: 7 })).toBe('P3A-R301:07')
		expect(world().portLabel({ on: 'B41', port: 1 })).toBe('P3A~R302:01')
	})
	it('"In two" leaves the labels to the cables — split BEFORE linking still reads P3A-R301 / P3A-R302 once linked (Dave)', () => {
		const halves = splitPanel(world().get<Device>('P41')!, 2)
		expect(halves).toEqual([{ from: 1, to: 24 }, { from: 25, to: 48 }])
		expect(world(halves, false).portLabel({ on: 'P41', port: 25 })).toBe('P3A-41-B:01')   // not linked yet: the panel's name
		const linked = world(halves)
		expect([linked.portLabel({ on: 'P41', port: 1 }), linked.portLabel({ on: 'P41', port: 25 }), linked.portLabel({ on: 'B41', port: 24 })]).toEqual(['P3A-R301:01', 'P3A-R302:01', 'P3A-R302:24'])
	})
	it('a label typed for a range wins over the cables', () => {
		expect(world([{ from: 1, to: 24, label: 'TIE-A' }, { from: 25, to: 48 }]).portLabel({ on: 'P41', port: 3 })).toBe('TIE-A:03')
	})
	it('ranges off the panel, back to front or overlapping are refused', () => {
		expect(groupsProblem(split, 48)).toBeNull()
		expect(groupsProblem([{ from: 1, to: 50, label: 'X' }], 48)).toMatch(/aren't on/)
		expect(groupsProblem([{ from: 9, to: 3, label: 'X' }], 48)).toMatch(/comes after/)
		expect(groupsProblem([{ from: 1, to: 24, label: 'X' }, { from: 20, to: 48, label: 'Y' }], 48)).toMatch(/two ranges/)
	})
	it('the rack view shows each range’s label over its first port instead of the panel’s name', () => {
		const texts = (ix: ProjectIndex) => rackRowDisplayList(ix, { spaceId: 'IDF1', face: 'front' }).filter((p) => p.k === 'text' && p.cls.startsWith('device-label')).map((p) => (p.k === 'text' ? p.text : ''))
		expect(texts(world(split))).toEqual(expect.arrayContaining(['P3A-R301', 'P3A-R302']))
		expect(texts(world(split))).not.toContain('P3A-41')
		expect(texts(world())).toContain('P3A-41')
	})
})
