// Port labels (Phase 3.3): stored once, edited where they live, guarded once printed.
import { describe, it, expect } from 'vitest'
import { ProjectIndex } from './project'
import { demoProject } from './fixtures'
import { setPortLabel, renameOutlet, markPrinted, changedSincePrinted, printedPanelsAffected, portRanges, setPortCount, nextPortLabel } from './ports'
import type { Entity } from './drawing'
import type { Device, Outlet } from './types'

const base = () => demoProject()
const ix = (ents: Entity[]) => new ProjectIndex(ents)
const replace = (ents: Entity[], e: Entity) => ents.map((x) => (x.id === e.id ? e : x))
/** The outlet linked to Panel 1 port 1, from the fixture. */
const linkedOutlet = (ents: Entity[]) => { const i = ix(ents), far = i.farEnd({ on: 'P1', port: 1 })!; return { outlet: i.get(far.on) as Outlet, port: far.port } }

describe('editing a port label', () => {
	it('on a panel port linked to an outlet, the edit lands on the outlet port (stored once)', () => {
		const ents = base(), { outlet, port } = linkedOutlet(ents)
		const e = setPortLabel(ix(ents), { on: 'P1', port: 1 }, 'X.999') as Outlet
		expect(e.id).toBe(outlet.id)
		expect(e.ports.find((p) => p.port === port)?.label).toBe('X.999')
		expect(ix(replace(ents, e)).portLabel({ on: 'P1', port: 1 })).toBe('X.999')
	})
	it('on an unlinked port, the device keeps its own text; clearing removes it', () => {
		const ents = base()
		const d = setPortLabel(ix(ents), { on: 'SW1', port: 7 }, 'UPLINK') as Device
		expect(d.portLabels?.['7']).toBe('UPLINK')
		const cleared = setPortLabel(ix(replace(ents, d)), { on: 'SW1', port: 7 }, '') as Device
		expect(cleared.portLabels?.['7']).toBeUndefined()
	})
	it('renaming an outlet renames its ports too, and the panel shows the new label', () => {
		const ents = base(), { outlet } = linkedOutlet(ents)
		expect(ix(ents).portLabel({ on: 'P1', port: 1 }).startsWith(outlet.label)).toBe(true)   // the fixture's premise
		const renamed = renameOutlet(outlet, 'B.123')
		expect(renamed.label).toBe('B.123')
		expect(ix(replace(ents, renamed)).portLabel({ on: 'P1', port: 1 })).toMatch(/^B\.123/)
	})
})

describe('port count', () => {
	it('new ports continue the label pattern, room and cable of the last port', () => {
		expect(['01A.201B', 'X-09', 'Z', 'A.1Z', 'odd.'].map(nextPortLabel)).toEqual(['01A.201C', 'X-10', 'AA', 'A.1AA', 'odd..2'])
		const ents = base(), { outlet } = linkedOutlet(ents)
		const r = setPortCount(ix(ents), outlet, 6)
		expect(r.outlet.ports).toHaveLength(6)
		expect(r.outlet.ports[5]).toMatchObject({ port: 6, serverRoomId: outlet.ports[1].serverRoomId, cableType: outlet.ports[1].cableType })
		expect(r.outlet.ports[2].label).toBe(nextPortLabel(outlet.ports[1].label))
		expect(r.dropLinks).toEqual([])
	})
	it('fewer ports: the removed ones take their links with them', () => {
		const ents = base(), o1 = ix(ents).get('O1') as Outlet   // O1 ports 1 and 2 are linked (K1, K2)
		const r = setPortCount(ix(ents), o1, 1)
		expect(r.outlet.ports.map((p) => p.port)).toEqual([1])
		expect(r.dropLinks).toEqual(['K2'])
	})
})

describe('printed panels', () => {
	it('a printed panel flags the ports that changed since', () => {
		const ents0 = base()
		const printed = markPrinted(ix(ents0), ix(ents0).get('P1') as Device, 1000)
		let ents = replace(ents0, printed)
		expect(changedSincePrinted(ix(ents), printed)).toEqual([])
		ents = replace(ents, setPortLabel(ix(ents), { on: 'P1', port: 1 }, 'CHANGED')!)
		expect(changedSincePrinted(ix(ents), printed)).toEqual([1])
	})
	it('an edit that would change a printed label is caught BEFORE it is written; others pass', () => {
		const ents0 = base(), printed = markPrinted(ix(ents0), ix(ents0).get('P1') as Device, 1000)
		const ents = replace(ents0, printed), i = ix(ents)
		const hit = printedPanelsAffected(i, [setPortLabel(i, { on: 'P1', port: 1 }, 'CHANGED')!])
		expect(hit.map((h) => [h.device.id, h.ports])).toEqual([['P1', [1]]])
		expect(printedPanelsAffected(i, [setPortLabel(i, { on: 'SW1', port: 7 }, 'UPLINK')!])).toEqual([])
	})
	it('port lists read as ranges', () => {
		expect(portRanges([5, 3, 4, 12, 1])).toBe('1, 3–5, 12')
	})
})
