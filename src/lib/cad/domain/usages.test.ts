// Usages and block attributes (Dave, 2026-10-05).
import { describe, it, expect } from 'vitest'
import { usageCodes, withUsagesMet, usageUses } from './usages'
import { insertAttrs, blockAttrDefs, type Block } from './blocks'
import type { Entity } from './drawing'

describe('usages', () => {
	const ents = [
		{ type: 'outlet', id: 'O1', usage: 'desk' }, { type: 'outlet', id: 'O2', usage: 'RS' }, { type: 'outlet', id: 'O3', usage: 'CAM' },
		{ type: 'device', id: 'D1', panel: { usages: ['FR'], reservations: [{ id: 'r', usage: 'WC', ports: [1] }] } },
	] as unknown as Entity[]
	it('the codes outlets and panels use; the ones the list lacks are added with the old tools\' colours', () => {
		expect([...usageCodes(ents)].sort()).toEqual(['CAM', 'FR', 'RS', 'WC', 'desk'])
		const list = withUsagesMet([{ id: 'desk', label: 'Desk', color: '#3b82f6' }], usageCodes(ents))
		expect(list.map((u) => u.id)).toEqual(['desk', 'RS', 'CAM', 'FR', 'WC'])
		expect(list.find((u) => u.id === 'RS')).toEqual({ id: 'RS', label: 'RS', color: '#9333ea' })
	})
	it('what uses a usage', () => {
		expect(usageUses(ents, 'RS')).toEqual({ outlets: 1, panels: 0 })
		expect(usageUses(ents, 'WC')).toEqual({ outlets: 0, panels: 1 })
	})
})

describe('block attributes', () => {
	const b = { type: 'block', id: 'X', name: 'Tag', scope: 'global', attrs: [{ tag: 'ROOM', label: 'Room', default: '101' }],
		shapes: [{ id: 's', geom: { kind: 'text', at: { x: 0, y: 0 }, text: '{ROOM} {ASSET_NO}', sizeMm: 2 } }] } as unknown as Block
	it('declared first, then any other {TAG} its texts use', () => {
		expect(blockAttrDefs(b).map((d) => [d.tag, d.label])).toEqual([['ROOM', 'Room'], ['ASSET_NO', 'Asset_no']])
	})
	it('defaults fill in; a hidden one keeps its value but draws blank', () => {
		expect(insertAttrs(b)).toEqual({ ROOM: '101', ASSET_NO: '' })
		expect(insertAttrs(b, { ASSET_NO: 'A-7' }, ['ROOM'])).toEqual({ ROOM: '', ASSET_NO: 'A-7' })
	})
})
