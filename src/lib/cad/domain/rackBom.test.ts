// The rack BOM (Phase 3.6): the Racks tool's Panduit rules on cad records.
import { describe, it, expect } from 'vitest'
import { rackBom, containmentKitSku, bomRooms } from './rackBom'
import { bom } from './reports'
import { ProjectIndex } from './project'
import { PANDUIT_SEED } from '$lib/catalog/panduitSeed'
import type { Entity } from './drawing'
import type { Rack, RackRow } from './types'

const ar4p = PANDUIT_SEED.find((p) => p.kind === 'rack' && p.family === 'AR4P' && !!p.hacTopCap)!
const vcm = PANDUIT_SEED.find((p) => p.kind === 'vcm' && !!p.hacEndPanel)!
const rack = (id: string, x: number, extra: Partial<Rack> = {}): Rack => ({ type: 'rack', id, levelId: 'L', spaceId: 'S', rowId: 'ROW', order: 0, name: id, kind: 'cabinet', heightU: 42, widthMm: 600, depthMm: 1200, at: { x, y: 0 }, ...extra })
const row = (containment: RackRow['containment']): RackRow => ({ type: 'rackRow', id: 'ROW', spaceId: 'S', name: 'Row 1', order: 0, containment })
const ix = (ents: Entity[]) => new ProjectIndex(ents)

describe('rack BOM', () => {
	it('one line per rack SKU, summed; a rack with no catalogue product is still listed', () => {
		const lines = rackBom(ix([row('none'), rack('A', 0, { catalogId: ar4p.id }), rack('B', 600, { catalogId: ar4p.id }), rack('C', 1200)]), PANDUIT_SEED)
		expect(lines.find((l) => l.sku === ar4p.sku)).toMatchObject({ group: 'Rack', qty: 2 })
		expect(lines.find((l) => l.note?.includes('no catalogue'))).toBeTruthy()
	})
	it('HAC containment adds top caps and the family containment kit per rack, end panels per row', () => {
		const lines = rackBom(ix([row('hac'), rack('A', 0, { catalogId: ar4p.id }), rack('B', 600, { catalogId: ar4p.id }), rack('V', 1200, { kind: 'vcm', widthMm: 250, catalogId: vcm.id })]), PANDUIT_SEED)
		expect(lines.find((l) => l.note === 'Containment kit')).toMatchObject({ sku: containmentKitSku(ar4p, undefined), qty: 2 })
		expect(lines.find((l) => l.sku === ar4p.hacTopCap && l.group === 'Rack accessory')?.qty).toBe(2)
		expect(lines.find((l) => l.group === 'Row accessory')).toMatchObject({ sku: vcm.hacEndPanel, qty: 1 })
	})
	it('desks and shelves are listed too ("no catalogue SKU"), and a rack’s notes show on its line', () => {
		const lines = rackBom(ix([row('none'), rack('D', 0, { kind: 'desk', widthMm: 1600, depthMm: 800, notes: 'by the window' }), rack('A', 1600, { notes: 'spare' })]), PANDUIT_SEED)
		expect(lines.find((l) => l.group === 'Desk / shelf')).toMatchObject({ sku: 'desk 1600×800', qty: 1, note: 'no catalogue SKU · by the window' })
		expect(lines.find((l) => l.group === 'Rack')?.note).toMatch(/spare/)
	})
	it('row by row (the BOM dialog): only that row\'s racks and its own row accessories; null = racks in no row', () => {
		const ents = [row('hac'), rack('A', 0, { catalogId: ar4p.id }), rack('V', 600, { kind: 'vcm', widthMm: 250, catalogId: vcm.id }), rack('X', 2000, { rowId: undefined, catalogId: ar4p.id })]
		const inRow = rackBom(ix(ents), PANDUIT_SEED, { row: 'ROW' }), loose = rackBom(ix(ents), PANDUIT_SEED, { row: null })
		expect(inRow.find((l) => l.sku === ar4p.sku)?.qty).toBe(1)
		expect(inRow.some((l) => l.group === 'Row accessory')).toBe(true)
		expect(loose.map((l) => [l.sku, l.qty])).toEqual([[ar4p.sku, 1]])
	})
	it('white racks get the white kit', () => {
		expect(containmentKitSku(ar4p, 'White')).toBe('AR4P-AC-KITWH')
		// the Color picker writes hex (Review 2 Q1)
		expect(containmentKitSku(ar4p, '#ffffff')).toBe('AR4P-AC-KITWH')
		expect(containmentKitSku(ar4p, '#F4F4F5')).toBe('AR4P-AC-KITWH')
		expect(containmentKitSku(ar4p, '#18181b')).toBe('AR4P-AC-KIT')
		expect(containmentKitSku(ar4p, '#fde68a')).toBe('AR4P-AC-KIT')
	})
	it('for chosen rooms on any levels: only their racks and their rows’ accessories; the rooms listed by level (Review 2 Q46)', () => {
		const lv = (id: string, order: number) => ({ type: 'level', id, name: `${order}F`, number: order, order, elevationMm: 0, heights: {} }) as Entity
		const room = (id: string, levelId: string, name: string) => ({ type: 'space', id, levelId, name, kind: 'server room' }) as Entity
		const ents = [lv('L3', 3), lv('L4', 4), room('S', 'L3', 'IDF-B'), room('S2', 'L3', 'IDF-A'), room('S4', 'L4', 'IDF-A'),
			row('hac'), rack('A', 0, { catalogId: ar4p.id }), rack('V', 600, { kind: 'vcm', widthMm: 250, catalogId: vcm.id }),
			rack('B', 0, { spaceId: 'S2', rowId: undefined, catalogId: ar4p.id }), rack('C', 0, { levelId: 'L4', spaceId: 'S4', rowId: undefined, catalogId: ar4p.id })]
		const q = (rooms?: string[]) => rackBom(ix(ents), PANDUIT_SEED, { rooms }).find((l) => l.sku === ar4p.sku)?.qty
		expect([q(), q(['S2', 'S4']), q(['S4']), q([])]).toEqual([3, 2, 1, undefined])
		expect(rackBom(ix(ents), PANDUIT_SEED, { rooms: ['S2'] }).some((l) => l.group === 'Row accessory')).toBe(false)   // S's row stays out
		expect(bomRooms(ix(ents)).map((g) => [g.level, g.rooms.map((r) => `${r.name} ${r.racks}`)])).toEqual([['3F', ['IDF-A 1', 'IDF-B 2']], ['4F', ['IDF-A 1']]])
	})
	it('a rack with no catalogue product, a device with no catalogue id: listed by maker / model when they have them', () => {
		const lines = rackBom(ix([row('none'), rack('A', 0, { maker: 'Panduit', model: 'XG84822' }), rack('B', 600, { maker: 'Nitto', model: 'FR-42' }), rack('C', 1200)]), PANDUIT_SEED)
		expect(lines.filter((l) => l.group === 'Rack').map((l) => [l.sku, l.description])).toEqual([
			['cabinet 42U 600×1200', 'cabinet 42U 600×1200'], ['FR-42', 'Nitto FR-42 (cabinet 42U 600×1200)'], ['XG84822', 'Panduit XG84822 (cabinet 42U 600×1200)']])
		const sw = { type: 'device', id: 'D', rackId: 'A', name: 'SW1', kind: 'switch', u: 40, heightU: 1, face: 'front', portCount: 48, maker: 'Cisco', model: 'C9300-48P' } as Entity
		expect(bom(ix([row('none'), rack('A', 0), sw])).find((l) => l.category === 'Devices')?.item).toBe('Cisco C9300-48P (switch 1U)')
	})
	it('the project BOM carries the rack lines', () => {
		const lines = bom(ix([row('none'), rack('A', 0, { catalogId: ar4p.id })]), PANDUIT_SEED)
		expect(lines.find((l) => l.category === 'Racks')?.item).toContain(ar4p.sku)
	})
})
