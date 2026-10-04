// The rack BOM (Phase 3.6): the Racks tool's Panduit rules on cad records.
import { describe, it, expect } from 'vitest'
import { rackBom, containmentKitSku } from './rackBom'
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
	it('white racks get the white kit', () => {
		expect(containmentKitSku(ar4p, 'White')).toBe('AR4P-AC-KITWH')
	})
	it('the project BOM carries the rack lines', () => {
		const lines = bom(ix([row('none'), rack('A', 0, { catalogId: ar4p.id })]), PANDUIT_SEED)
		expect(lines.find((l) => l.category === 'Racks')?.item).toContain(ar4p.sku)
	})
})
