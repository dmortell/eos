import { describe, it, expect } from 'vitest'
import { describeNode, fieldPatch, type ProjectFull } from './projectProps'
import type { TreeInput } from './projectTree'

const P = 'pid'
const project: ProjectFull = {
	id: P, name: 'Hibiya', address: 'Hibiya', client: 'Midtown', clientCode: 'MT', members: ['u1', 'u2'],
	floors: [
		{ number: 10, label: 'L10 WeWork', serverRoomCount: 1 },
		{ number: 30, serverRoomCount: 2, roomNames: { A: 'IDF1', B: 'IDF2' } },
		{ number: 33, serverRoomCount: 1, areas: [{ id: '3303', label: '3303', legacy: true, primary: true }] },
	],
}
const input: TreeInput & { project: ProjectFull } = {
	project,
	racks: { [`${P}_F30_RA`]: { rows: [{ id: 'r1', label: 'Row A' }], racks: [{ rowId: 'r1', label: 'A101' } as never, { rowId: 'r1', label: 'A102' } as never] } },
	risers: [{ id: P, name: '12F-33F Risers', fromFloor: 12, toFloor: 33, floorHeights: { 30: { slabMm: 200, clearHeightMm: 2700 } }, rooms: [{ floor: 30, kind: 'eps', label: 'EPS30-A' }] } as never],
	drawings: [{ id: 'd', sourceDocId: `${P}_F30_RA`, title: 'x' }],
}
const field = (info: ReturnType<typeof describeNode>, key: string) => info?.sections.flatMap((s) => s.fields).find((f) => f.key === key)

describe('describeNode', () => {
	it('project: editable name / codes / client / address, a read-only summary', () => {
		const i = describeNode(input, P)!
		expect(field(i, 'name')).toMatchObject({ value: 'Hibiya', edit: 'text' })
		expect(field(i, 'floors')!.value).toBe('10F, 30F, 33F')
		expect(field(i, 'members')!.value).toBe('2')
		expect(field(i, 'id')!.edit).toBeUndefined()
	})
	it('building: its floors and risers; derived ones say so', () => {
		const i = describeNode(input, 'b:Hibiya')!
		expect(field(i, 'floors')!.value).toBe('30F, 33F')
		expect(field(i, 'risers')!.value).toBe('12F-33F Risers (12–33F)')
		expect(i.note).toMatch(/Derived/)
		expect(describeNode(input, 'b:Other building')!.note).toMatch(/outside every riser/)
	})
	it('floor: label + building editable, contents and riser heights read-only', () => {
		const i = describeNode(input, 'f:30')!
		expect(field(i, 'label')!.edit).toBe('text')
		expect(field(i, 'rooms')!.value).toBe('IDF1, IDF2')
		expect(field(i, 'racks')!.value).toBe('2')
		expect(field(i, 'drawings')!.value).toBe('1')
		expect(field(i, 'riserRooms')!.value).toBe('EPS30-A (eps)')
		expect(field(i, 'slab')!.value).toBe('200'); expect(field(i, 'plenum')!.value).toBe('—')
	})
	it('zone, room and row', () => {
		expect(field(describeNode(input, 'a:33:3303'), 'flags')!.value).toMatch(/primary, legacy/)
		expect(field(describeNode(input, 'r:30:A'), 'name')).toMatchObject({ value: 'IDF1', edit: 'text' })
		expect(field(describeNode(input, 'row:30:A:r1'), 'racks')!.value).toBe('A101, A102')
		expect(describeNode(input, 'f:99')).toBeNull()
	})
})

describe('fieldPatch', () => {
	it('project fields; an empty name is refused', () => {
		expect(fieldPatch(input, P, 'name', ' Project Journey ')).toEqual({ name: 'Project Journey' })
		expect(fieldPatch(input, P, 'name', '  ')).toBeNull()
		expect(fieldPatch(input, P, 'id', 'x')).toBeNull()
	})
	it('renaming a DERIVED building names it and pins its floors to the new name', () => {
		const patch = fieldPatch(input, 'b:Hibiya', 'name', 'Hibiya Midtown')!
		expect(patch.buildings).toEqual(['Hibiya Midtown'])
		const fl = patch.floors as { number: number; building?: string }[]
		expect(fl.map((f) => [f.number, f.building])).toEqual([[10, undefined], [30, 'Hibiya Midtown'], [33, 'Hibiya Midtown']])
	})
	it('renaming "Other building" works the same; a taken name is refused', () => {
		const patch = fieldPatch(input, 'b:Other building', 'name', 'Hibiya Fort Tower')!
		expect(patch.buildings).toEqual(['Hibiya', 'Hibiya Fort Tower'])
		expect((patch.floors as { number: number; building?: string }[]).find((f) => f.number === 10)!.building).toBe('Hibiya Fort Tower')
		expect(fieldPatch(input, 'b:Other building', 'name', 'Hibiya')).toBeNull()
	})
	it('floor label / building (empty clears), zone label, room name (empty clears)', () => {
		const fl = (patch: Record<string, unknown> | null, n: number) => (patch!.floors as Record<string, unknown>[]).find((f) => f.number === n)!
		expect(fl(fieldPatch(input, 'f:10', 'label', ''), 10)).not.toHaveProperty('label')
		expect(fl(fieldPatch(input, 'f:10', 'building', 'Hibiya Fort Tower'), 10).building).toBe('Hibiya Fort Tower')
		expect((fl(fieldPatch(input, 'a:33:3303', 'label', 'Zone A'), 33).areas as { label: string }[])[0].label).toBe('Zone A')
		expect(fl(fieldPatch(input, 'r:30:B', 'name', 'Comms'), 30).roomNames).toEqual({ A: 'IDF1', B: 'Comms' })
		expect(fl(fieldPatch(input, 'r:30:A', 'name', ''), 30).roomNames).toEqual({ B: 'IDF2' })
	})
})
