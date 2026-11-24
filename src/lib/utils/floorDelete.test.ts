// Backlog 42: deleting a floor deletes every tool doc it owns — patching per room and each tenant area's outlets too.
import { describe, it, expect, vi } from 'vitest'
import { deleteFloor, floorToolDocs } from './floor'

describe('deleteFloor (backlog 42)', () => {
	it('lists frames, outlets per area, racks and patching for every room letter', () => {
		const docs = floorToolDocs('p', 33, [{ number: 33, serverRoomCount: 1, areas: [{ id: 'main', legacy: true }, { id: '3307' }] as never }])
		const ids = docs.map((d) => `${d.path}/${d.id}`)
		expect(ids).toContain('frames/p_F33')
		expect(ids).toContain('outlets/p_F33')
		expect(ids).toContain('outlets/p_F33__3307')
		expect(ids).toContain('patching/p_F33_RA')
		expect(ids).toContain('racks/p_F33_RD')   // a room count lowered later leaves its docs: they go too
		expect(ids.filter((x) => x.startsWith('patching/'))).toHaveLength(4)
		expect(new Set(ids).size).toBe(ids.length)
	})
	it('deletes them all and drops the floor', async () => {
		const db = { save: vi.fn(), delete: vi.fn(async () => {}) }
		const r = await deleteFloor(db, 'p', 2, [{ number: 1, serverRoomCount: 1 }, { number: 2, serverRoomCount: 2 }], 2)
		expect(db.delete).toHaveBeenCalledWith('patching', 'p_F02_RB')
		expect(r).toEqual({ floors: [{ number: 1, serverRoomCount: 1 }], activeFloor: 1 })
	})
})
