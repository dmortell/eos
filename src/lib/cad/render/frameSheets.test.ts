// Frame label sheets: which racks, RU blocks top down, port cells (24 a row) with label and usage, reserved ports,
// other devices as blocks; the workbook's sheets.
import { describe, it, expect } from 'vitest'
import { ProjectIndex } from '../domain/project'
import { frameRacks, frameWorkbook } from './frameSheets'
import type { Entity } from '../domain/drawing'

const rack = (id: string, o: object = {}) => ({ type: 'rack', id, levelId: 'L1', spaceId: 'S1', order: 1, name: id, kind: '4-post', heightU: 10, widthMm: 600, depthMm: 1000, ...o })
const dev = (id: string, rackId: string, u: number, o: object = {}) => ({ type: 'device', id, rackId, name: id, kind: 'panel', u, heightU: 1, face: 'front', portCount: 48, ...o })
const base = [
	{ type: 'level', id: 'L1', name: '1F', number: 1, elevationMm: 0, order: 1, heights: {} },
	{ type: 'space', id: 'S1', levelId: 'L1', name: 'IDF1', kind: 'server room' },
	{ type: 'settings', id: 'settings', portSuffix: 'alpha', usages: [{ id: 'desk', label: 'Desk', color: '#2563eb' }], defaults: {}, cableTypes: [] },
	rack('A'), rack('B'), rack('C', { heightU: 8 }),
	dev('P1', 'A', 9, { panel: { tier: 'low', reservations: [{ id: 'r', usage: 'desk', ports: [5] }] } }),
	dev('SW', 'A', 6, { kind: 'switch', heightU: 2, portCount: 48 }),
	dev('P2', 'C', 8, { portCount: 24 }),
	{ type: 'outlet', id: 'O1', levelId: 'L1', label: 'A.001', usage: 'desk', mount: 'box', tier: 'low', ports: [{ port: 1, label: '01A.001A' }] },
	{ type: 'link', id: 'K1', kind: 'horizontal', a: { on: 'P1', port: 26 }, b: { on: 'O1', port: 1 }, status: 'design' },
] as Entity[]

describe('frame label sheets (G097 / G131 / T050)', () => {
	it('racks with panels, blocks top down, 48 ports as two rows of 24, usage and reserved ports, devices as blocks', () => {
		const room = frameRacks(new ProjectIndex(base), 'S1')
		expect([room.name, room.level, room.racks.map((r) => r.name)]).toEqual(['IDF1', '1F', ['A', 'C']])   // B holds no panel
		const [p1, sw] = room.racks[0].blocks
		expect(sw).toEqual({ kind: 'device', u: 7, heightU: 2, text: 'SWITCH: SW' })
		if (p1.kind !== 'panel') throw new Error('panel')
		expect([p1.u, p1.rows.length, p1.rows[0].length]).toEqual([9, 2, 24])
		expect(p1.rows[1][1]).toMatchObject({ label: '01A.001A', usage: 'desk' })   // port 26: second row, second column
		expect(p1.rows[0][4]).toMatchObject({ usage: 'desk', reserved: true })       // port 5 reserved for desks
		// marked patch frames win
		const marked = frameRacks(new ProjectIndex(base.map((e) => (e.id === 'C' ? { ...e, patchFrame: true } as Entity : e))), 'S1')
		expect(marked.racks.map((r) => r.name)).toEqual(['C'])
	})
	it('the workbook: a sheet per frame, or one per room', async () => {
		const room = frameRacks(new ProjectIndex(base), 'S1')
		const per = await frameWorkbook([room], undefined, { perRoom: false, fileName: 'f.xlsx' })
		expect(per.worksheets.map((w) => w.name)).toEqual(['1F A', '1F C'])
		const one = await frameWorkbook([room], undefined, { perRoom: true, fileName: 'f.xlsx' })
		expect(one.worksheets.map((w) => w.name)).toEqual(['1F IDF1'])
		// the shorter rack C (8U) starts 2U lower, so U1 rows line up: its title is 4 rows down
		const ws = one.worksheets[0]
		expect(String(ws.getCell(1, 1).value)).toMatch(/A \(10U\)/)
		expect(String(ws.getCell(5, 27).value)).toMatch(/C \(8U\)/)
		expect(ws.getCell(3, 2).value).toBe(1)   // A's header row (title, blank, header): port 1
	}, 20000)   // ExcelJS loads slowly the first time in a full run (it went over the 5 s default once)
})
