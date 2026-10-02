// What the rack-row view shows (Phase 3.1), as behaviour.
import { describe, it, expect } from 'vitest'
import { rackRowDisplayList, rackLayout, labelLines, portCell, RU_MM } from './rackRow'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import type { Entity } from '../domain/drawing'
import type { Device, Rack } from '../domain/types'

const ix = (extra: Entity[] = []) => new ProjectIndex([...demoProject(), ...extra])
const view = (face: 'front' | 'rear', extra: Entity[] = []) => rackRowDisplayList(ix(extra), { spaceId: 'SR-A', face })
const has = (prims: ReturnType<typeof view>, src: string) => prims.some((p) => p.src === src)

describe('the rack row', () => {
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
	it('a device with few ports keeps port-sized cells (Dave: a server / tower PC drew huge ports)', () => {
		const server: Device = { type: 'device', id: 'SV', rackId: 'R1', name: 'SV', kind: 'server', u: 10, heightU: 2, face: 'front', portCount: 2 }
		const c = portCell(server, 1, 0, 0)!
		expect(c.w).toBeLessThanOrEqual(18)
		expect(c.h).toBeLessThanOrEqual(30)
		const panel: Device = { ...server, kind: 'panel', heightU: 1, portCount: 24 }
		expect(portCell(panel, 1, 0, 0)!.w).toBeCloseTo(430 / 24)          // panels are unchanged
	})
	it('labels stack: full form in up to three lines, short form = the last two parts', () => {
		expect(labelLines('L01.A.001-A01')).toEqual({ full: ['L01.A', '001', 'A01'], short: ['001', 'A01'] })
		expect(labelLines('33-001.A')).toEqual({ full: ['33', '001', 'A'], short: ['001', 'A'] })
		expect(labelLines('SW1-01')).toEqual({ full: ['SW1-01'], short: ['SW1-01'] })
	})
})
