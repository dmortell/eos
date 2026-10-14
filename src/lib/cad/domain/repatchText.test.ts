// Re-patch in bulk (W17): a typed To cell, and selected cords onto the next free ports.
import { describe, it, expect } from 'vitest'
import { portFromText, repatchRun, endFor } from './repatchText'
import { ProjectIndex } from './project'
import { demoProject } from './fixtures'
import type { Entity } from './drawing'
import type { Cord, Device, Rack } from './types'

const ix = (extra: Entity[] = []) => new ProjectIndex([...demoProject(), ...extra])
const C = (i: ProjectIndex, id: string) => i.get<Cord>(id)!
const sw1 = { on: 'SW1', port: 1 }

describe('portFromText', () => {
	it('device : port, rack · device : port, or a bare port on the same device; names match in any case', () => {
		const i = ix()
		expect(portFromText(i, 'Switch 1:41', sw1)).toEqual({ to: { on: 'SW1', port: 41 } })
		expect(portFromText(i, ' 41 ', sw1)).toEqual({ to: { on: 'SW1', port: 41 } })
		expect(portFromText(i, 'a01 · switch 1 : 7', sw1)).toEqual({ to: { on: 'SW1', port: 7 } })
		expect(portFromText(i, 'Panel 1:3 (rear)', sw1)).toEqual({ to: { on: 'P1', port: 3, face: 'rear' } })
	})
	it('says why not: no such device, not a port, a name in two rooms', () => {
		const other: Rack = { type: 'rack', id: 'RB', levelId: 'L33', spaceId: 'SR-B', order: 0, name: 'B01', kind: 'cabinet', heightU: 42, widthMm: 600, depthMm: 1000 }
		const room = { type: 'space', id: 'SR-B', levelId: 'L33', kind: 'server room', name: 'IDF-B', code: 'B', order: 2 } as Entity
		const twin: Device = { type: 'device', id: 'SW9', rackId: 'RB', name: 'Switch 1', kind: 'switch', u: 38, heightU: 1, face: 'front', portCount: 48 }
		const i = ix([room, other, twin])
		expect(portFromText(i, 'Nope:3', sw1)).toHaveProperty('problem')
		expect(portFromText(i, 'hello', sw1)).toHaveProperty('problem')
		expect(portFromText(i, 'Switch 1:5', sw1)).toEqual({ to: { on: 'SW1', port: 5 } })   // the one in this end's rack
		expect(portFromText(i, 'Switch 1:5', { on: 'P1', port: 1 })).toEqual({ to: { on: 'SW1', port: 5 } })
		expect(portFromText(i, 'B01 · Switch 1:5', sw1)).toEqual({ to: { on: 'SW9', port: 5 } })
		expect(portFromText(i, 'Switch 1:5', { on: 'Pz', port: 1 })).toHaveProperty('problem')   // no rack / room to go by
	})
})

describe('repatchRun', () => {
	it('the first cord to the port typed, the next ones to the next free ports — a port the batch leaves is free', () => {
		const i = ix()
		const r = repatchRun(i, [C(i, 'C1'), C(i, 'C2')], 'b', { on: 'SW1', port: 2 })
		if ('problem' in r) throw new Error(r.problem)
		expect(r.cords.map((c) => c.b.port)).toEqual([2, 3])
	})
	it('skips ports another cord holds; an installed cord becomes a change', () => {
		const c3: Cord = { ...demoProject().find((e) => e.id === 'C1') as Cord, id: 'C3', a: { on: 'P1', port: 3, face: 'front' }, b: { on: 'SW1', port: 4 } }
		const i = ix([c3])
		const inst = { ...C(i, 'C1'), status: 'installed' as const }
		const r = repatchRun(i, [inst, C(i, 'C2')], 'b', { on: 'SW1', port: 3 })
		if ('problem' in r) throw new Error(r.problem)
		expect(r.cords.map((c) => c.b.port)).toEqual([3, 5])
		expect(r.cords[0]).toMatchObject({ status: 'change', previous: { b: { on: 'SW1', port: 1 } } })
	})
	it('by kind: each cord’s end on the same kind of device moves — the switch end, in whichever column it is', () => {
		const i = ix()
		const flipped = { ...C(i, 'C2'), a: C(i, 'C2').b, b: C(i, 'C2').a }   // switch in From, panel in To
		expect(endFor(i, flipped, { on: 'SW1', port: 9 })).toBe('a')
		expect(endFor(i, C(i, 'C1'), { on: 'SW1', port: 9 })).toBe('b')
		const r = repatchRun(i, [C(i, 'C1'), flipped], 'kind', { on: 'SW1', port: 9 })
		if ('problem' in r) throw new Error(r.problem)
		expect(r.cords.map((c) => [c.a.on, c.a.port, c.b.on, c.b.port])).toEqual([['P1', 1, 'SW1', 9], ['SW1', 10, 'P1', 2]])
	})
	it('all or nothing: no free port left, or the first port taken', () => {
		const i = ix()
		expect(repatchRun(i, [C(i, 'C1'), C(i, 'C2')], 'b', { on: 'SW1', port: 48 })).toHaveProperty('problem')
		expect(repatchRun(i, [C(i, 'C1')], 'b', { on: 'SW1', port: 2 })).toHaveProperty('problem')   // C2 is there
	})
})
