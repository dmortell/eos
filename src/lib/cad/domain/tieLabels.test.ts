// Tie labels (backlog "Tie labels"): a tie port with no label of its own reads "RackA~RackB:NN" at both ends.
import { describe, it, expect } from 'vitest'
import { ProjectIndex } from './project'
import { demoProject } from './fixtures'
import type { Entity } from './drawing'
import type { Device, Link, Rack } from './types'

const rack = (id: string, name: string): Rack => ({ type: 'rack', id, levelId: 'L33', spaceId: 'SR-A', order: 0, name, kind: 'cabinet', heightU: 42, widthMm: 600, depthMm: 1000 })
const panel = (id: string, rackId: string): Device => ({ type: 'device', id, rackId, name: id, kind: 'panel', u: 30, heightU: 1, face: 'both', portCount: 24 })
const tie = (id: string, a: string, pa: number, b: string, pb: number): Link => ({ type: 'link', id, kind: 'tie', a: { on: a, port: pa }, b: { on: b, port: pb }, cableType: 'cat6a', status: 'design' })

describe('tie labels', () => {
	it('both ends read "RackA~RackB:NN", the racks in name order, numbered per pair', () => {
		const ix = new ProjectIndex([...demoProject(), rack('RB', 'B02'), rack('RA', 'A05'), panel('PB', 'RB'), panel('PA', 'RA'),
			tie('T2', 'PB', 7, 'PA', 2), tie('T1', 'PA', 1, 'PB', 6)] as Entity[])
		expect(ix.portLabel({ on: 'PA', port: 1 })).toBe('A05~B02:01')
		expect(ix.portLabel({ on: 'PB', port: 6 })).toBe('A05~B02:01')
		expect(ix.portLabel({ on: 'PB', port: 7 })).toBe('A05~B02:02')
	})
	it('a port’s own label wins', () => {
		const pa = { ...panel('PA', 'RA'), portLabels: { '1': 'UPLINK' } }
		const ix = new ProjectIndex([...demoProject(), rack('RB', 'B02'), rack('RA', 'A05'), panel('PB', 'RB'), pa, tie('T1', 'PA', 1, 'PB', 6)] as Entity[])
		expect(ix.portLabel({ on: 'PA', port: 1 })).toBe('UPLINK')
		expect(ix.portLabel({ on: 'PB', port: 6 })).toBe('A05~B02:01')
	})
})
