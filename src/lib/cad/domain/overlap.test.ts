// Allow U overlaps with a warning (Dave, 2026-10-05): a shelf, or a device with "May overlap", can share Us on the
// same side; the rack view marks those Us.
import { describe, it, expect } from 'vitest'
import { placementProblem, clashUs } from './devices'
import { startDeviceDrag, dragDevices } from '../editor/deviceDrag'
import type { Device, Rack } from './types'

const rack = { type: 'rack', id: 'R', name: 'A01', heightU: 42, depthMm: 1000, widthMm: 600 } as Rack
const dev = (id: string, u: number, heightU: number, extra: Partial<Device> = {}) =>
	({ type: 'device', id, rackId: 'R', name: id, kind: 'server', u, heightU, face: 'front', portCount: 0, ...extra }) as Device

describe('U overlaps', () => {
	it('refused as before; allowed for a shelf or "May overlap"', () => {
		const a = dev('A', 10, 2)
		expect(placementProblem(dev('B', 11, 1), rack, [a])).toMatch(/would overlap A at U11/)
		expect(placementProblem(dev('B', 11, 1, { kind: 'shelf' }), rack, [a])).toBeNull()
		expect(placementProblem(dev('B', 11, 1, { overlapOk: true }), rack, [a])).toBeNull()
		expect(placementProblem(dev('B', 11, 1), rack, [{ ...a, overlapOk: true }])).toBeNull()   // either one allows it
	})
	it('the clashing Us (same side only; the other face shares freely)', () => {
		expect([...clashUs([dev('A', 10, 3), dev('B', 11, 4, { kind: 'shelf' })])].sort((x, y) => x - y)).toEqual([11, 12])
		expect(clashUs([dev('A', 10, 3), dev('B', 11, 1, { face: 'rear' })]).size).toBe(0)
	})
})

describe('0U PDUs (Dave, 2026-10-05)', () => {
	it('dragged across the rack it goes to the other side; a small drag keeps its side', async () => {
		const pdu = dev('P', 1, 30, { kind: 'pdu', face: 'none' })
		const g = startDeviceDrag([pdu]), rackOf = () => rack
		const across = dragDevices(g, 0, undefined, false, [pdu], rackOf, { dx: 400, face: 'front' })
		expect('put' in across && across.put[0].pduSide).toBe('right')
		const nudge = dragDevices(g, 2, undefined, false, [pdu], rackOf, { dx: 50, face: 'front' })
		expect('put' in nudge && [nudge.put[0].pduSide, nudge.put[0].u]).toEqual([undefined, 3])
		const fromRear = dragDevices(g, 0, undefined, false, [pdu], rackOf, { dx: -400, face: 'rear' })   // mirrored from the rear
		expect('put' in fromRear && fromRear.put[0].pduSide).toBe('right')
	})
})
