import { describe, it, expect } from 'vitest'
import { BUILTIN_DEVICE_TEMPLATES, deviceFromTemplate, templateFromDevice, placementProblem, firstFreeU, deviceCounts, moveRacksToLevel, racksToRoom } from './devices'
import { ProjectIndex } from './project'
import type { Device, Rack } from './types'
import type { Entity } from './drawing'

const rack: Rack = { type: 'rack', id: 'R', levelId: 'L', spaceId: 'S', order: 0, name: 'A01', kind: 'cabinet', heightU: 42, widthMm: 600, depthMm: 1000 }
const tpl = (id: string) => BUILTIN_DEVICE_TEMPLATES.find((t) => t.id === id)!
const at = (id: string, u: number, face?: Device['face']) => ({ ...deviceFromTemplate(tpl(id), 'R', u, id, face), id })

describe('device templates', () => {
	it('a panel from a template is a 24-port panel on both faces with panel info', () => {
		const d = deviceFromTemplate(tpl('builtin:panel-24'), 'R', 40, 'PP1')
		expect(d).toMatchObject({ kind: 'panel', portCount: 24, face: 'both', heightU: 1, panel: { tier: 'low' } })
	})
	it('a switch numbers its ports column-major', () => {
		expect(deviceFromTemplate(tpl('builtin:switch-48'), 'R', 1, 'SW').portNumbering).toBe('column')
	})
	it('placing while looking at the rear mounts it at the rear', () => {
		expect(deviceFromTemplate(tpl('builtin:manager-1u'), 'R', 1, 'M', 'rear').face).toBe('rear')
	})
	it('save as template keeps the shape of the device, not its place', () => {
		const t = templateFromDevice(at('builtin:panel-48', 10), 'My 48')
		expect(t).toMatchObject({ name: 'My 48', kind: 'panel', portCount: 48, heightU: 1 })
		expect(t).not.toHaveProperty('u')
	})
})

describe('rack placement rules', () => {
	it('refuses a device that runs off the top of the rack', () => {
		expect(placementProblem(at('builtin:panel-48-2u', 42), rack, [])).toMatch(/does not fit/)
	})
	it('refuses an overlap on the same face, allows front-only + rear-only at one U', () => {
		const sw = at('builtin:switch-48', 20)
		expect(placementProblem(at('builtin:panel-24', 20), rack, [sw])).toMatch(/overlap/)
		expect(placementProblem(at('builtin:manager-1u', 20, 'rear'), rack, [sw])).toBeNull()
	})
	it('a panel MOUNTED at the front shares a U with a rear device, if their depths fit (Dave: P3C U42)', () => {
		const rear = { ...at('builtin:panel-24', 42, 'rear'), id: 'REAR', depthMm: 100 }
		const front = at('builtin:panel-24', 42)   // both faces, full depth
		expect(placementProblem(front, rack, [rear])).toMatch(/set this one's Mount to front/)
		expect(placementProblem({ ...front, mount: 'front' }, rack, [rear])).toBeNull()
		expect(placementProblem({ ...front, mount: 'rear' }, rack, [rear])).toMatch(/overlap/)
		expect(placementProblem({ ...front, mount: 'front', depthMm: 950 }, rack, [rear])).toMatch(/deeper together/)
	})
	it('a vertical PDU never collides', () => {
		expect(placementProblem(at('builtin:pdu-v', 1), rack, [at('builtin:switch-48', 5)])).toBeNull()
	})
	it('the first free U is found from the top down', () => {
		const top = at('builtin:panel-24', 42)
		expect(firstFreeU(rack, [top], 1, 'front')).toBe(41)
		expect(firstFreeU(rack, [], 2, 'front')).toBe(41)
	})
	it('racks moved to another level leave the plan; a room whose racks all move goes too, else they join one by name', () => {
		const L = (id: string) => ({ type: 'level', id, buildingId: 'B', number: 1, name: id, order: 1, elevationMm: 0, heights: { slabMm: 200, raisedFloorMm: 300, clearHeightMm: 2600, plenumMm: 700 } }) as const
		const room = (id: string, levelId: string, name: string) => ({ type: 'space', id, levelId, kind: 'server room', name, order: 1 }) as const
		const r = (id: string, spaceId: string) => ({ ...rack, id, levelId: 'L1', spaceId, at: { x: 1, y: 1 }, rowId: 'ROW' })
		const ix = new ProjectIndex([L('L1'), L('L2'), room('S1', 'L1', 'IDF 3307'), room('S2', 'L1', 'IDF 1'), room('S2B', 'L2', 'IDF 1'), r('A', 'S1'), r('B', 'S1'), r('C', 'S2'), r('D', 'S2')] as Entity[])
		// both racks of IDF 3307 move: the room goes with them, and they keep their row
		const all = moveRacksToLevel(ix, [ix.get('A') as Rack, ix.get('B') as Rack], 'L2')
		expect(all.find((e) => e.id === 'S1')).toMatchObject({ levelId: 'L2' })
		expect(all.filter((e) => e.type === 'rack')).toMatchObject([{ levelId: 'L2', spaceId: 'S1', at: undefined, rowId: 'ROW' }, { levelId: 'L2', spaceId: 'S1' }])
		// one of IDF 1's two racks moves: it joins L2's "IDF 1", off its row
		const one = moveRacksToLevel(ix, [ix.get('C') as Rack], 'L2')
		expect(one).toMatchObject([{ id: 'C', levelId: 'L2', spaceId: 'S2B', rowId: undefined }])
	})
	it('racks to another room: off their row, and their panels serving the old room serve the new one (Review 2 Q2)', () => {
		const pp = { ...at('builtin:panel-24', 40), panel: { tier: 'low' as const, serverRoomId: 'S' } }
		const other = { ...at('builtin:panel-24', 38), id: 'PP2', panel: { tier: 'low' as const, serverRoomId: 'ELSE' } }
		const ix = new ProjectIndex([{ ...rack, rowId: 'ROW' }, pp, other] as Entity[])
		const out = racksToRoom(ix, [ix.get('R') as Rack], 'S2')
		expect(out.find((e) => e.id === 'R')).toMatchObject({ spaceId: 'S2', rowId: undefined })
		expect((out.find((e) => e.id === pp.id) as Device).panel?.serverRoomId).toBe('S2')
		expect(out.some((e) => e.id === 'PP2')).toBe(false)   // it served another room on purpose: left alone
		expect(racksToRoom(ix, [ix.get('R') as Rack], 'S')).toEqual([])
	})
	it('device counts read by kind, most first, singular for one', () => {
		const ds = [at('builtin:panel-24', 42), at('builtin:panel-24', 41), at('builtin:switch-48', 39)]
		expect(deviceCounts(ds)).toBe('2 panels · 1 switch')
		expect(deviceCounts([])).toBe('no devices')
	})
})
