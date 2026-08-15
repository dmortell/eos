import { describe, it, expect } from 'vitest'
import { buildSyncPlan, unbakedLocationPorts, effectiveTemplate } from './reconcile'

const rack = { id: 'rack-1', label: 'R01' }
const panel = { id: 'dev-1', rackId: 'rack-1', label: 'PP01', type: 'panel' }
const printedPanel = { ...panel, id: 'dev-2', label: 'PP02', labelsPrinted: true }

const loc = (id: string, num: number, portCount = 2, extra: any = {}) => ({
	id, locationNumber: num, portCount,
	serverRoomAssignment: Array.from({ length: portCount }, () => 'A'),
	locationType: 'desk', ...extra,
})

describe('buildSyncPlan', () => {
	it('flags stale labels after renumbering and leaves matching ones ok', () => {
		const frameData = {
			zoneLocations: { A: [loc('LA1', 7)] }, // renumbered 1 → 7
			bakedLabels: {
				'dev-1:1': { label: 'L01.A.001-A01', locationId: 'LA1', port: 1 }, // stale (baked as 001)
				'dev-1:2': { label: 'L01.A.007-A02', locationId: 'LA1', port: 2 }, // already correct
			},
			labelFormat: { separator: 'legacy', includeZone: true, includeRoom: false },
		}
		const plan = buildSyncPlan(frameData, [panel], [rack], 1)
		expect(plan.staleCount).toBe(1)
		const stale = plan.rows.find(r => r.reason === 'stale')!
		expect(stale.oldLabel).toBe('L01.A.001-A01')
		expect(stale.newLabel).toBe('L01.A.007-A01')
		expect(plan.rows.find(r => r.key === 'dev-1:2')?.reason).toBe('ok')
	})

	it('flags orphaned (deleted location) and out-of-range (shrunk portCount)', () => {
		const frameData = {
			zoneLocations: { A: [loc('LA1', 1, 1)] }, // portCount shrunk to 1
			bakedLabels: {
				'dev-1:1': { label: 'X', locationId: 'GONE', port: 1 },
				'dev-1:2': { label: 'L01.A.001-A02', locationId: 'LA1', port: 2 },
			},
		}
		const plan = buildSyncPlan(frameData, [panel], [rack], 1)
		expect(plan.orphanCount).toBe(2)
		expect(plan.rows.find(r => r.key === 'dev-1:1')?.reason).toBe('orphaned')
		expect(plan.rows.find(r => r.key === 'dev-1:2')?.reason).toBe('out-of-range')
	})

	it('counts stale rows on printed panels separately', () => {
		const frameData = {
			zoneLocations: { A: [loc('LA1', 9)] },
			bakedLabels: { 'dev-2:1': { label: 'L01.A.001-A01', locationId: 'LA1', port: 1 } },
		}
		const plan = buildSyncPlan(frameData, [printedPanel], [rack], 1)
		expect(plan.printedStaleCount).toBe(1)
	})

	it('re-bakes with the current template', () => {
		const frameData = {
			zoneLocations: { A: [loc('LA1', 1)] },
			bakedLabels: { 'dev-1:1': { label: 'L01.A.001-A01', locationId: 'LA1', port: 1 } },
			labelFormat: { separator: 'legacy', includeZone: true, includeRoom: false, template: 'Z/NNN":"A' },
		}
		const plan = buildSyncPlan(frameData, [panel], [rack], 1)
		expect(plan.rows[0].newLabel).toBe('A/001:A')
		expect(plan.rows[0].reason).toBe('stale')
	})
})

describe('unbakedLocationPorts', () => {
	it('lists un-baked ports only for locations that have some baked', () => {
		const frameData = {
			zoneLocations: { A: [loc('LA1', 1, 4), loc('LA2', 2, 2)] }, // LA1 grew to 4 ports
			bakedLabels: {
				'dev-1:1': { label: 'x', locationId: 'LA1', port: 1 },
				'dev-1:2': { label: 'y', locationId: 'LA1', port: 2 },
			},
		}
		const out = unbakedLocationPorts(frameData)
		expect(out).toHaveLength(1)
		expect(out[0].locationId).toBe('LA1')
		expect(out[0].ports).toEqual([3, 4])
	})
})

describe('effectiveTemplate', () => {
	it('prefers the explicit template, else maps legacy options', () => {
		expect(effectiveTemplate({ template: 'NNN' } as any, 'L01')).toBe('NNN')
		expect(effectiveTemplate({ separator: 'legacy', includeZone: true, includeRoom: false } as any, 'L01'))
			.toBe('"L"FF.Z.NNN-SPP[-H]')
	})
})
