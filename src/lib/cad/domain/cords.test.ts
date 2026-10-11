// Patching (Phase 3.5): the gate, lengths, the install workflow, bulk patch and the circuit trace.
import { describe, it, expect } from 'vitest'
import { ProjectIndex } from './project'
import { demoProject } from './fixtures'
import { patchProblem, cordLength, makeCord, removeCord, repatch, revertCord, installCord, setStatus, cordAction, withCableType, bulkPatch, traceCircuit, snapToStandard, cordAt } from './cords'
import type { Entity } from './drawing'
import type { Cord, Device, Rack } from './types'

const D = { cableType: 'cat6a', colour: '#22c55e' }
const ix = (extra: Entity[] = []) => new ProjectIndex([...demoProject(), ...extra])
const sw2: Device = { type: 'device', id: 'SW2', rackId: 'R1', name: 'Switch 2', kind: 'switch', u: 20, heightU: 1, face: 'front', portCount: 24 }

describe('one room per cord', () => {
	it('a cord, a re-route or a bulk patch into another room is refused: that takes an interconnect', () => {
		const other: Entity[] = [
			{ type: 'space', id: 'SR-B', levelId: 'L33', kind: 'server room', name: 'IDF-B', code: 'B', order: 2 },
			{ type: 'rack', id: 'RB', levelId: 'L33', spaceId: 'SR-B', order: 0, name: 'B01', kind: 'cabinet', heightU: 42, widthMm: 600, depthMm: 1000 } as Rack,
			{ ...sw2, id: 'SWB', rackId: 'RB' },
		]
		const i = ix(other)
		expect(makeCord(i, { on: 'SW1', port: 30 }, { on: 'SWB', port: 1 }, D).problem).toMatch(/one room/)
		expect(makeCord(i, { on: 'SW1', port: 30 }, { on: 'SW1', port: 31 }, D).cord).toBeDefined()   // same room: fine
		const c = i.cords[0]
		expect(repatch(i, c, 'b', { on: 'SWB', port: 2 }).problem).toMatch(/one room/)
		expect(bulkPatch(i, { on: 'SW1', ports: [30, 31] }, { on: 'SWB', start: 1 }, D)).toMatchObject({ cords: [], skipped: [expect.stringMatching(/one room/)] })
	})
})

describe('the gate', () => {
	it('a panel port with no label (unallocated) refuses a cord, and says why', () => {
		expect(patchProblem(ix(), { on: 'P1', port: 10 })).toMatch(/no label yet/)
		expect(patchProblem(ix(), { on: 'P1', port: 3 })).toBeNull()           // allocated (K3) and not patched
	})
	it('a port takes one cord; switch ports need no label', () => {
		expect(patchProblem(ix(), { on: 'P1', port: 1 })).toMatch(/already patched/)
		expect(patchProblem(ix(), { on: 'SW1', port: 30 })).toBeNull()
		expect(patchProblem(ix(), { on: 'SW1', port: 99 })).toMatch(/no port 99/)
	})
	it('makeCord checks both ends and starts as `add` with an estimated length', () => {
		const r = makeCord(ix(), { on: 'P1', port: 3, face: 'front' }, { on: 'SW1', port: 3 }, D)
		expect(r.cord).toMatchObject({ status: 'add', colour: '#22c55e', lengthLocked: false })
		expect(r.cord!.lengthM).toBeGreaterThan(0)
		expect(makeCord(ix(), { on: 'P1', port: 10 }, { on: 'SW1', port: 3 }, D).problem).toMatch(/no label/)
	})
})

describe('length', () => {
	it('snaps up to stock lengths', () => {
		expect([0.2, 0.31, 1.01, 31].map(snapToStandard)).toEqual([0.3, 0.5, 1.5, 30])
	})
	it('farther apart in U is longer; front ↔ rear adds the rack depth', () => {
		const near = cordLength(ix([sw2]), { on: 'P1', port: 1 }, { on: 'SW1', port: 1 })
		const far = cordLength(ix([sw2]), { on: 'P1', port: 1 }, { on: 'SW2', port: 1 })
		expect(far).toBeGreaterThan(near)
		const rear = cordLength(ix([sw2]), { on: 'P1', port: 1, face: 'front' }, { on: 'SW2', port: 1, face: 'rear' })
		expect(rear).toBeGreaterThan(far)
	})
	it('rack to rack uses the plan distance when both racks are placed', () => {
		const r2 = (x: number): Rack => ({ type: 'rack', id: 'R2', levelId: 'L33', spaceId: 'SR-A', order: 1, name: 'A02', kind: 'cabinet', heightU: 42, widthMm: 600, depthMm: 1000, at: { x, y: 0 } })
		const sw = { ...sw2, rackId: 'R2', u: 38 }
		const r1 = (e: Entity) => (e.id === 'R1' ? { ...(e as Rack), at: { x: 0, y: 0 } } : e)
		const close = new ProjectIndex([...demoProject().map(r1), r2(700), sw])
		const apart = new ProjectIndex([...demoProject().map(r1), r2(6000), sw])
		expect(cordLength(apart, { on: 'P1', port: 1 }, { on: 'SW2', port: 1 })).toBeGreaterThan(cordLength(close, { on: 'P1', port: 1 }, { on: 'SW2', port: 1 }))
	})
})

describe('install workflow', () => {
	const installed = (): Cord => ({ ...(ix().get('C1') as Cord), status: 'installed' })
	it('deleting a planned cord removes it; deleting an installed one marks it `remove`', () => {
		expect(removeCord(ix().get('C1') as Cord)).toBeNull()                 // C1 is `add`
		expect(removeCord(installed())).toMatchObject({ status: 'remove', previous: { status: 'installed' } })
	})
	it('moving an end of an installed cord is a `change`, and can be reverted', () => {
		const r = repatch(ix(), installed(), 'b', { on: 'SW1', port: 9 })
		expect(r.cord).toMatchObject({ status: 'change', b: { on: 'SW1', port: 9 }, previous: { b: { on: 'SW1', port: 1 }, status: 'installed' } })
		expect(revertCord(r.cord!)).toMatchObject({ status: 'installed', b: { on: 'SW1', port: 1 } })
		expect(revertCord(r.cord!).previous).toBeUndefined()
	})
	it('installing confirms a change (forgets previous); an installed removal is deleted', () => {
		const changed = repatch(ix(), installed(), 'b', { on: 'SW1', port: 9 }).cord!
		expect(installCord(changed)).toMatchObject({ status: 'installed' })
		expect(installCord(changed)!.previous).toBeUndefined()
		expect(installCord(removeCord(installed())!)).toBeNull()
	})
	it('re-patching onto a taken port is refused', () => {
		expect(repatch(ix(), installed(), 'b', { on: 'SW1', port: 2 }).problem).toMatch(/already patched/)
	})
	it('a change moved back onto its old ends is installed again, with no history (plan: patch-list-plan.md)', () => {
		const moved = repatch(ix(), installed(), 'b', { on: 'SW1', port: 9 }).cord!
		const again = repatch(ix(), moved, 'b', { on: 'SW1', port: 12 }).cord!
		expect(again).toMatchObject({ status: 'change', previous: { b: { on: 'SW1', port: 1 } } })   // the FIRST ends kept
		const back = repatch(ix(), again, 'b', { on: 'SW1', port: 1 }).cord!
		expect(back).toMatchObject({ status: 'installed', b: { on: 'SW1', port: 1 } })
		expect(back.previous).toBeUndefined()
	})
	it('a cord marked for removal does not move; removing a planned move takes the cord out from its old ends', () => {
		expect(repatch(ix(), removeCord(installed())!, 'b', { on: 'SW1', port: 9 }).problem).toMatch(/restore it first/)
		const moved = repatch(ix(), installed(), 'b', { on: 'SW1', port: 9 }).cord!
		const out = removeCord(moved)!
		expect(out).toMatchObject({ status: 'remove', b: { on: 'SW1', port: 1 }, previous: { status: 'installed', b: { on: 'SW1', port: 1 } } })
		expect(revertCord(out)).toMatchObject({ status: 'installed', b: { on: 'SW1', port: 1 } })
	})
	it('setting the status by hand never deletes: installed / add forget the history, remove can be restored', () => {
		const moved = repatch(ix(), installed(), 'b', { on: 'SW1', port: 9 }).cord!
		expect(setStatus(moved, 'installed')).toMatchObject({ status: 'installed', b: { on: 'SW1', port: 9 } })
		expect(setStatus(moved, 'installed').previous).toBeUndefined()
		expect(setStatus(moved, 'add').previous).toBeUndefined()
		const planned = ix().get('C1') as Cord   // `add`
		expect(setStatus(planned, 'remove')).toMatchObject({ status: 'remove', previous: { status: 'add' } })
		expect(revertCord(setStatus(planned, 'remove'))).toMatchObject({ status: 'add' })
		expect(setStatus(installed(), 'remove')).toMatchObject({ status: 'remove', previous: { status: 'installed' } })
		expect(setStatus(removeCord(installed())!, 'installed').status).toBe('installed')   // not deleted
		expect(setStatus(moved, 'change')).toBe(moved)
	})
})

describe('bulk actions on the selected cords (patch-list-plan.md Slice 2)', () => {
	const base = ix().get('C1') as Cord
	const add: Cord = { ...base, id: 'A' }, inst: Cord = { ...base, id: 'I', status: 'installed' }
	const moved: Cord = { ...base, id: 'M', status: 'change', b: { on: 'SW1', port: 9 }, previous: { a: base.a, b: base.b, status: 'installed' } }
	const gone: Cord = removeCord({ ...inst, id: 'R' })!
	const all = [add, inst, moved, gone]
	const ids = (r: { put: Cord[]; del: string[] }) => ({ put: r.put.map((c) => `${c.id}:${c.status}`), del: r.del })
	it('Installed: done on site — a removed cord\'s record goes; installed ones are left', () => {
		expect(ids(cordAction(all, 'installed'))).toEqual({ put: ['A:installed', 'M:installed'], del: ['R'] })
		expect(cordAction([moved], 'installed').put[0].previous).toBeUndefined()
	})
	it('Add, Remove, Restore, Delete', () => {
		expect(ids(cordAction(all, 'add'))).toEqual({ put: ['I:add', 'M:add', 'R:add'], del: [] })
		expect(ids(cordAction(all, 'remove'))).toEqual({ put: ['I:remove', 'M:remove'], del: ['A'] })
		expect(ids(cordAction(all, 'restore'))).toEqual({ put: ['M:installed', 'R:installed'], del: [] })
		expect(ids(cordAction(all, 'delete'))).toEqual({ put: [], del: ['A', 'I', 'M', 'R'] })
	})
	it('a cable type brings its colour', () => {
		expect(withCableType(inst, { id: 'cat6', color: '#f00' })).toMatchObject({ cableType: 'cat6', colour: '#f00', status: 'installed' })
		expect(withCableType(inst, { id: 'x' }).colour).toBe(inst.colour)
	})
})

describe('bulk patch', () => {
	it('panel ports 3–4 to a switch from port 1: taken switch ports are skipped', () => {
		const r = bulkPatch(ix(), { on: 'P1', ports: [3, 4], face: 'front' }, { on: 'SW1', start: 1 }, D)
		expect(r.cords.map((c) => `${c.a.port}→${c.b.port}`)).toEqual(['3→3', '4→4'])   // SW1:1 and :2 are taken by C1, C2
	})
	it('unlabelled panel ports are skipped with the reason', () => {
		const r = bulkPatch(ix(), { on: 'P1', ports: [3, 10] }, { on: 'SW1', start: 5 }, D)
		expect(r.cords).toHaveLength(1)
		expect(r.skipped[0]).toMatch(/no label/)
	})
})

describe('circuit trace', () => {
	it('outlet port → link → panel → cord → switch, end to end, from any point', () => {
		const fromSwitch = traceCircuit(ix(), { on: 'SW1', port: 1 })
		expect(fromSwitch.map((s) => `${s.ref.on}:${s.ref.port}`)).toEqual(['O1:1', 'P1:1', 'SW1:1'])
		expect(fromSwitch.map((s) => s.via?.kind)).toEqual([undefined, 'link', 'cord'])
		expect(traceCircuit(ix(), { on: 'P1', port: 1 })).toEqual(fromSwitch)
	})
	it('through an interconnect: outlet → panel → cord → tie panel → tie cable → panel in another room → cord → switch', () => {
		const tp = (id: string, rackId: string): Device => ({ type: 'device', id, rackId, name: id, kind: 'panel', u: 30, heightU: 1, face: 'both', portCount: 24, portLabels: { '1': `${id}-01` } })
		const ents: Entity[] = [
			{ type: 'space', id: 'SR-B', levelId: 'L33', kind: 'server room', name: 'IDF-B', code: 'B', order: 2 },
			{ type: 'rack', id: 'RB', levelId: 'L33', spaceId: 'SR-B', order: 0, name: 'B01', kind: 'cabinet', heightU: 42, widthMm: 600, depthMm: 1000 } as Rack,
			tp('TPA', 'R1'), tp('TPB', 'RB'), { ...sw2, id: 'SWB', rackId: 'RB' },
			{ type: 'cord', id: 'CA', kind: 'patch', a: { on: 'P1', port: 3, face: 'front' }, b: { on: 'TPA', port: 1, face: 'front' }, cableType: 'cat6a', colour: '#000', lengthM: 1, lengthLocked: false, status: 'add' },
			{ type: 'link', id: 'TIE', kind: 'tie', a: { on: 'TPA', port: 1, face: 'rear' }, b: { on: 'TPB', port: 1, face: 'rear' }, cableType: 'cat6a', status: 'design' },
			{ type: 'cord', id: 'CB', kind: 'patch', a: { on: 'TPB', port: 1, face: 'front' }, b: { on: 'SWB', port: 5 }, cableType: 'cat6a', colour: '#000', lengthM: 1, lengthLocked: false, status: 'add' },
		]
		const t = traceCircuit(ix(ents), { on: 'SWB', port: 5 })
		expect(t.map((s) => `${s.ref.on}:${s.ref.port}`)).toEqual(['O2:1', 'P1:3', 'TPA:1', 'TPB:1', 'SWB:5'])   // reads from the outlet
		expect(t.map((s) => s.via?.kind)).toEqual([undefined, 'link', 'cord', 'link', 'cord'])
	})
	it('a removed cord is not part of the circuit', () => {
		const ents = demoProject().map((e) => (e.id === 'C1' ? { ...(e as Cord), status: 'remove' as const } : e))
		expect(traceCircuit(new ProjectIndex(ents), { on: 'O1', port: 1 }).map((s) => s.ref.on)).toEqual(['O1', 'P1'])
		expect(cordAt(new ProjectIndex(ents), { on: 'P1', port: 1 })).toBeUndefined()
	})
})
