// What the rack-row view shows (Phase 3.1), as behaviour.
import { describe, it, expect } from 'vitest'
import { rackRowDisplayList, rackLayout, labelLines, portCell, rackCaption, RU_MM } from './rackRow'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import { layersOf, primLayer } from '../domain/layers'
import type { Entity } from '../domain/drawing'
import type { Device, Rack } from '../domain/types'

const ix = (extra: Entity[] = []) => new ProjectIndex([...demoProject(), ...extra])
const view = (face: 'front' | 'rear', extra: Entity[] = []) => rackRowDisplayList(ix(extra), { spaceId: 'SR-A', face })
const has = (prims: ReturnType<typeof view>, src: string) => prims.some((p) => p.src === src)

describe('the rack row', () => {
	it('each rack has a caption under its name, and the elevation a title: level — room · face', () => {
		const texts = view('rear').filter((p) => p.k === 'text').map((p) => (p as { text: string }).text)
		expect(texts).toContain('42U cabinet · REAR')
		expect(texts).toContain('33F — IDF-A · rear')
		expect(rackCaption({ kind: 'desk', widthMm: 1600, heightU: 0 } as Rack, 'front')).toBe('1600 mm desk')
	})
	it('the storey around the racks: the floor slab’s top, the ceiling and the slab above, as lines (the level’s heights)', () => {
		const ps = view('front')
		const texts = ps.filter((p) => p.k === 'text').map((p) => (p as { text: string }).text)
		expect(texts).toEqual(expect.arrayContaining(['CEILING FFL+2700', 'SLAB FFL+3500', 'SLAB FFL-300']))
		const slabs = ps.filter((p) => p.k === 'line' && p.cls.includes('datum-slab')).map((p) => (p as { pts: { y: number }[] }).pts[0].y)
		expect(slabs.sort((a, b) => a - b)).toEqual([-3500, 300])   // under the 300 floor void; above 2700 + 800 plenum
	})
	it('the room’s own floor and ceiling: racks stand on its floor, its ceiling replaces the level’s; all on the Room lines layer', () => {
		const base = new ProjectIndex(demoProject())
		const room = base.get('SR-A') as Entity
		const lifted = new ProjectIndex([...demoProject().filter((e) => e.id !== 'SR-A'), { ...room, floorMm: 150, ceilingMm: 2400 } as Entity])
		const before = rackRowDisplayList(base, { spaceId: 'SR-A', face: 'front' }), after = rackRowDisplayList(lifted, { spaceId: 'SR-A', face: 'front' })
		const rackY = (ps: typeof before) => (ps.find((p) => p.k === 'line' && p.cls === 'rack') as { pts: { y: number }[] }).pts[0].y
		expect(rackY(after)).toBe(rackY(before) - 150)
		const texts = after.filter((p) => p.k === 'text').map((p) => (p as { text: string }).text)
		expect(texts).toEqual(expect.arrayContaining(['IDF-A CEILING FL+2400', 'IDF-A FLOOR FL+150', 'SLAB FFL+3500']))
		expect(texts).not.toContain('CEILING FFL+2700')
		const lines = after.filter((p) => 'cls' in p && p.cls.includes('room-line'))
		const known = new Set(layersOf([]).map((l) => l.id))
		expect(new Set(lines.map((p) => primLayer('cls' in p ? p.cls : '', undefined, known)))).toEqual(new Set(['sys:room-lines']))
		expect(primLayer('device-other', undefined, known)).toBe('sys:other-face')
	})
	it('a room with no racks says so', () => {
		const ps = rackRowDisplayList(ix([{ type: 'space', id: 'EMPTY', levelId: 'L33', kind: 'server room', name: 'IDF 9', order: 9 } as Entity]), { spaceId: 'EMPTY', face: 'front' })
		expect(ps).toMatchObject([{ k: 'text', text: expect.stringMatching(/No racks in this room yet/) }])
	})
	it('front shows front and both-face devices; rear shows rear and both-face ones', () => {
		expect(has(view('front'), 'SW1')).toBe(true)
		expect(has(view('front'), 'P1')).toBe(true)
		expect(has(view('rear'), 'SW1')).toBe(false)
		expect(has(view('rear'), 'P1')).toBe(true)
	})
	it('a device sits at its U: the panel at U40 starts 39 U above the rail base', () => {
		const rack = demoProject().find((e) => e.id === 'R1') as Rack
		const base = ((rack.heightMm ?? rack.heightU * RU_MM + 150) - rack.heightU * RU_MM) / 2
		const p1 = view('front').find((p) => p.src === 'P1' && p.k === 'line' && p.cls.startsWith('device')) as { pts: { y: number }[] }
		expect(Math.min(...p1.pts.map((q) => -q.y))).toBeCloseTo(base + 39 * RU_MM)
	})
	it("a panel port shows the label of the outlet port it is linked to (stacked); an unlinked port is blank", () => {
		const prims = view('front').filter((p) => p.k !== 'image') as Exclude<ReturnType<typeof view>[number], { k: 'image' }>[]
		const textOf = (port: number) => prims.filter((p) => p.k === 'text' && p.src === 'P1' && p.sub === String(port)).map((p) => (p as { text: string }).text)
		expect(textOf(1)).toEqual(['001', 'A', '33', '001', 'A'])   // short form (001 / A), then the full stack (33 / 001 / A)
		expect(textOf(5)).toEqual([])
		expect(prims.find((p) => p.src === 'P1' && p.sub === '1' && p.k === 'line')?.cls).toContain('port-linked')
	})
	it('patch cords are drawn between their ports, in their own colour, on their face only', () => {
		const cords = (face: 'front' | 'rear') => view(face).filter((p) => p.k === 'line' && p.cls.startsWith('cord'))
		expect(cords('front')).toHaveLength(2)
		expect(cords('front')[0]).toMatchObject({ color: '#3b82f6' })
		expect(cords('rear')).toHaveLength(0)
	})
	it('racks sit side by side in order; seen from the rear the order flips', () => {
		const r2: Rack = { type: 'rack', id: 'R2', levelId: 'L33', spaceId: 'SR-A', order: 1, name: 'A02', kind: 'cabinet', heightU: 42, widthMm: 800, depthMm: 1000 }
		const front = rackLayout(ix([r2]), { spaceId: 'SR-A', face: 'front' }).map((l) => [l.rack.name, l.x0])
		const rear = rackLayout(ix([r2]), { spaceId: 'SR-A', face: 'rear' }).map((l) => [l.rack.name, l.x0])
		expect(front).toEqual([['A01', 0], ['A02', 600]])
		expect(rear).toEqual([['A01', 800], ['A02', 0]])
	})
})

describe('0U devices', () => {
	it("a PDU's network ports are drawn (on its strip) and can carry a cord to a switch", () => {
		const pdu: Device = { type: 'device', id: 'PDU1', rackId: 'R1', name: 'PDU A', kind: 'pdu', u: 1, heightU: 24, face: 'rear', portCount: 1 }
		const cord = { type: 'cord' as const, id: 'CP', kind: 'patch' as const, a: { on: 'PDU1', port: 1 }, b: { on: 'SW1', port: 40 }, cableType: 'cat6a', colour: '#000', lengthM: 2, lengthLocked: false, status: 'add' as const }
		const prims = view('front', [pdu, cord])
		expect(prims.some((p) => p.src === 'PDU1' && p.k === 'line' && p.sub === '1')).toBe(true)
		expect(prims.some((p) => p.src === 'CP')).toBe(true)
	})
})

describe('the U scale stays readable (Dave: a PDU covered R311’s numbers)', () => {
	it('U numbers draw after the rack’s devices, and a PDU hugs the outside of the rails', () => {
		const wide: Rack = { type: 'rack', id: 'RW', levelId: 'L33', spaceId: 'SR-A', order: 2, name: 'W', kind: 'cabinet', heightU: 42, widthMm: 750, depthMm: 1000 }
		const pdu: Device = { type: 'device', id: 'PDU9', rackId: 'RW', name: 'PDU', kind: 'pdu', u: 1, heightU: 30, face: 'front', portCount: 0 }
		const prims = view('front', [wide, pdu])
		const strip = prims.findIndex((p) => p.src === 'PDU9'), lastNumber = prims.map((p) => p.k === 'text' && p.cls === 'u-label').lastIndexOf(true)
		expect(lastNumber).toBeGreaterThan(strip)
		const s = prims[strip]
		const x0 = rackLayout(ix([wide]), { spaceId: 'SR-A', face: 'front' }).find((l) => l.rack.id === 'RW')!.x0
		expect(s.k === 'line' && Math.min(...s.pts.map((q) => q.x)) - x0).toBeGreaterThan(60)   // clear of the numbers (≈ x0+18…48)
	})
})

describe('row order comes from the plan', () => {
	it('racks drawn on the plan run left to right as seen from their front', () => {
		const mk = (id: string, x: number, rot = 0): Rack => ({ type: 'rack', id, levelId: 'L33', spaceId: 'SR-B', rowId: 'ROW', order: 0, name: id, kind: 'cabinet', heightU: 42, widthMm: 600, depthMm: 1000, at: { x, y: 0 }, rot })
		const row = { type: 'rackRow' as const, id: 'ROW', spaceId: 'SR-B', name: 'Row 1', order: 0 }
		const names = (ents: Rack[]) => rackLayout(ix([row, ...ents]), { spaceId: 'SR-B', face: 'front' }).map((l) => l.rack.name)
		expect(names([mk('C', 3000), mk('A', 1000), mk('B', 2000)])).toEqual(['A', 'B', 'C'])
		// turned 180° (front faces up the sheet), the viewer's left-to-right runs the other way along x
		expect(names([mk('C', 3000, 180), mk('A', 1000, 180), mk('B', 2000, 180)])).toEqual(['C', 'B', 'A'])
	})
	it('a row that turns a corner: each run by its own direction, the runs along the first (Dave: V06, P3C, V05)', () => {
		const mk = (id: string, x: number, y: number, rot = 0): Rack => ({ type: 'rack', id, levelId: 'L33', spaceId: 'SR-B', rowId: 'ROW', order: 0, name: id, kind: 'cabinet', heightU: 42, widthMm: 600, depthMm: 1000, at: { x, y }, rot })
		const row = { type: 'rackRow' as const, id: 'ROW', spaceId: 'SR-B', name: 'Row A', order: 0 }
		// Test Project IDF 2: three racks along the wall (turned 90°), then the frame flanked by its managers
		const ents = [mk('R313', -2242, -10808, 90), mk('R312', -2242, -10208, 90), mk('R311', -2225, -9308, 90), mk('V05', -3124, -7059), mk('V06', -3824, -7059), mk('P3C', -3450, -7008)]
		expect(rackLayout(ix([row, ...ents]), { spaceId: 'SR-B', face: 'front' }).map((l) => l.rack.name)).toEqual(['R313', 'R312', 'R311', 'V06', 'P3C', 'V05'])
	})
	it('managers turned round stay in their frame’s line; the widest run sets the way (Dave: Journey IDF1 — P3A left of R301)', () => {
		const mk = (id: string, x: number, y: number, rot: number, widthMm: number): Rack => ({ type: 'rack', id, levelId: 'L33', spaceId: 'SR-B', rowId: 'ROW', order: 0, name: id, kind: 'cabinet', heightU: 42, widthMm, depthMm: 1000, at: { x, y }, rot })
		const row = { type: 'rackRow' as const, id: 'ROW', spaceId: 'SR-B', name: 'Row A', order: 0 }
		// the racks face up the sheet (180°); round the corner P3A faces right (270°), its two managers left (90°) — and
		// a manager comes first in the data
		const ents = [mk('V1', 10600, -2390, 90, 152), mk('V2', 10580, -3100, 90, 152), mk('R302', 8425, -3755, 180, 750), mk('R303', 7750, -3755, 180, 600), mk('R301', 9125, -3755, 180, 750), mk('P3A', 10510, -2745, 270, 550)]
		expect(rackLayout(ix([row, ...ents]), { spaceId: 'SR-B', face: 'front' }).map((l) => l.rack.name)).toEqual(['V1', 'P3A', 'V2', 'R301', 'R302', 'R303'])
	})
})

describe('port cells and labels', () => {
	const sw = (n: 'row' | 'column'): Device => ({ type: 'device', id: 'S', rackId: 'R1', name: 'S', kind: 'switch', u: 1, heightU: 1, face: 'front', portCount: 48, portNumbering: n })
	it('a 48-port 1U device has two rows; row-major puts 2 beside 1, column-major puts 2 under 1', () => {
		const at = (n: 'row' | 'column', p: number) => portCell(sw(n), p, 0, 0)!
		expect(at('row', 2).y).toBe(at('row', 1).y)
		expect(at('row', 2).x).toBeGreaterThan(at('row', 1).x)
		expect(at('column', 2).x).toBe(at('column', 1).x)
		expect(at('column', 2).y).toBeGreaterThan(at('column', 1).y)
	})
	it('a 96-port 2U switch is 4 rows of 24 (Dave: its 2 rows of 48 tiny cells read as 48 ports)', () => {
		const big: Device = { type: 'device', id: 'S96', rackId: 'R1', name: 'S96', kind: 'switch', u: 1, heightU: 2, face: 'front', portCount: 96 }
		const ys = new Set(Array.from({ length: 96 }, (_, i) => Math.round(portCell(big, i + 1, 0, 0)!.y)))
		expect(ys.size).toBe(4)
		expect(portCell(big, 1, 0, 0)!.w).toBeCloseTo(430 / 24)
	})
	it('numbered down, a 96-port 2U switch goes down each U’s pair of rows: 2 under 1, 49 under 2, 50 under 49 (Dave: Journey’s Arista CCS-720XP-96)', () => {
		const big: Device = { type: 'device', id: 'S96', rackId: 'R1', name: 'S96', kind: 'switch', u: 1, heightU: 2, face: 'front', portCount: 96, portNumbering: 'column' }
		const at = (p: number) => portCell(big, p, 0, 0)!
		expect([2, 49, 50].map((p) => at(p).x)).toEqual([at(1).x, at(1).x, at(1).x])
		expect(at(2).y).toBeGreaterThan(at(1).y); expect(at(49).y).toBeGreaterThan(at(2).y); expect(at(50).y).toBeGreaterThan(at(49).y)
		expect(at(3).y).toBe(at(1).y); expect(at(3).x).toBeGreaterThan(at(1).x)   // 3 beside 1
		expect(at(48).x).toBe(at(96).x)   // the last column: 47 / 48 over 95 / 96
	})
	it('24 ports or more: a tick under the middle of the ports, from the bottom edge (Dave: left outlets to the left switch ports)', () => {
		const dev = (id: string, u: number, portCount: number) => ({ type: 'device', id, rackId: 'R1', name: id, kind: 'panel', u, heightU: 1, face: 'both', portCount }) as Device
		const prims = view('front', [dev('P48', 10, 48), dev('P12', 12, 12)])
		const ticks = prims.filter((p) => p.k === 'line' && p.cls === 'port-mid') as { pts: { x: number; y: number }[] }[]
		const cell = (n: number) => (prims.find((p) => p.k === 'line' && p.src === 'P48' && p.sub === String(n)) as { pts: { x: number; y: number }[] }).pts
		const r1 = demoProject().find((e) => e.id === 'R1') as Rack
		const bottomOf = (u: number) => -(((r1.heightMm ?? r1.heightU * RU_MM + 150) - r1.heightU * RU_MM) / 2 + (u - 1) * RU_MM)
		const at = (u: number) => ticks.filter((t) => Math.abs(t.pts[0].y - bottomOf(u)) < 0.01)
		expect(at(10)).toHaveLength(1)
		const [bottom, up] = at(10)[0].pts
		expect(bottom.x).toBe(up.x)
		expect(bottom.x).toBeGreaterThan(cell(12)[0].x); expect(bottom.x).toBeLessThan(cell(13)[1].x)   // between ports 12 and 13
		expect(up.y).toBeLessThan(bottom.y)                                           // upwards, short of the ports
		expect(up.y).toBeGreaterThanOrEqual(Math.max(...cell(25).map((q) => q.y)))
		expect(at(12)).toHaveLength(0)   // the 12-port panel has none
	})
	it('a device with few ports keeps port-sized cells (Dave: a server / tower PC drew huge ports)', () => {
		const server: Device = { type: 'device', id: 'SV', rackId: 'R1', name: 'SV', kind: 'server', u: 10, heightU: 2, face: 'front', portCount: 2 }
		const c = portCell(server, 1, 0, 0)!
		expect(c.w).toBeLessThanOrEqual(18)
		expect(c.h).toBeLessThanOrEqual(30)
		const panel: Device = { ...server, kind: 'panel', heightU: 1, portCount: 24 }
		expect(portCell(panel, 1, 0, 0)!.w).toBeCloseTo(430 / 24)          // panels are unchanged
		// a 200 mm tower PC's ports sit on the PC (Dave: R311's were drawn off to the left of it)
		const tower: Device = { ...server, widthMm: 200, portCount: 4 }
		for (let n = 1; n <= 4; n++) { const c = portCell(tower, n, 0, 0)!; expect(c.x).toBeGreaterThanOrEqual(-100); expect(c.x + c.w).toBeLessThanOrEqual(100) }
	})
	it('a two-part label in a 48-port panel is stacked, about twice the size of one line (Dave: P3C U37 unreadable)', () => {
		const prims = view('front', [{ type: 'device', id: 'P48', rackId: 'R1', name: 'P48', kind: 'panel', u: 10, heightU: 1, face: 'both', portCount: 48, portLabels: { '1': '01A.014A' } } as Device])
		const texts = prims.filter((p) => p.k === 'text' && p.src === 'P48' && p.sub === '1') as { text: string; size: number }[]
		expect(texts.map((t) => t.text)).toEqual(['01A', '014A'])
		expect(texts[0].size).toBeGreaterThan(6)   // one line of 8 characters was ~3.4 mm
		// its name over the ports: normal size until the port labels show, then no bigger than them (it covered them)
		const names = prims.filter((p) => p.k === 'text' && p.cls.includes('on-ports') && p.text.startsWith('P48')) as { size: number; minPx?: number; maxPx?: number }[]
		expect(names).toHaveLength(2)
		const [big, small] = names, k = 7 / texts[0].size   // px per mm where the labels appear (LABEL_MIN_PX)
		expect(big.maxPx! / big.size).toBeCloseTo(k)
		expect(small.minPx! / small.size).toBeCloseTo(k)
		expect(small.size).toBeLessThanOrEqual(texts[0].size + 0.01)
	})
	it('labels stack: full form in up to three lines, short form = the last two parts', () => {
		expect(labelLines('L01.A.001-A01')).toEqual({ full: ['L01.A', '001', 'A01'], short: ['001', 'A01'] })
		expect(labelLines('33-001.A')).toEqual({ full: ['33', '001', 'A'], short: ['001', 'A'] })
		expect(labelLines('SW1-01')).toEqual({ full: ['SW1', '01'], short: ['SW1', '01'] })
		expect(labelLines('UPLINK')).toEqual({ full: ['UPLINK'], short: ['UPLINK'] })
	})
})
