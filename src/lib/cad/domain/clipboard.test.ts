// Copy / paste, as behaviour: what a paste writes, where it lands, what its labels and references become.
import { describe, it, expect } from 'vitest'
import { makeClip, parseClip, pasteClip, clipCentre, type PasteTarget } from './clipboard'
import { ProjectIndex } from './project'
import { demoProject } from './fixtures'
import type { Entity, Layer, Sheet } from './drawing'
import type { Outlet, Rack, Device, Space } from './types'
import type { Shape } from './shapes'

const L34 = { type: 'level', id: 'L34', buildingId: 'B', number: 34, name: '34F', order: 34, elevationMm: 136000 } as Entity
const ix = (extra: Entity[] = []) => new ProjectIndex([...demoProject(), L34, ...extra])
const target = (i: ProjectIndex, to: PasteTarget['to'], o: Partial<PasteTarget> = {}): PasteTarget => ({ pid: 'P', ix: i, to, ...o })
const copy = (i: ProjectIndex, ids: string[], pid = 'P') => parseClip(JSON.stringify(makeClip(i, ids, pid)))!

describe('copy', () => {
	it('round-trips through the clipboard text; anything else is not a clip', () => {
		expect(copy(ix(), ['O1']).items.map((e) => e.id)).toEqual(['O1'])
		expect(parseClip('hello')).toBeNull()
		expect(parseClip('{"a":1}')).toBeNull()
	})
	it('a rack comes with its devices; links and cords stay behind', () => {
		const types = copy(ix(), ['R1']).items.map((e) => e.type)
		expect(types).toEqual(['rack', 'device', 'device'])
	})
	it('a note tied to a viewport is copied as plain paper points', () => {
		const sheet: Sheet = { type: 'sheet', id: 'S', number: 'S1', title: 'S', order: 0, status: 'active', paper: { size: 'A3', orientation: 'landscape', marginMm: 10 },
			viewports: [{ id: 'V', view: { levelId: 'L33', spec: { kind: 'plan' } }, rect: { x: 0, y: 0, w: 100, h: 100 }, scale: 100, centre: { x: 0, y: 0 } }] }
		const note = { type: 'shape', id: 'N', sheetId: 'S', vpId: 'V', geom: { kind: 'text', at: { x: 1000, y: 0 }, text: 'Hi', sizeMm: 2.5 } } as Shape
		const n = copy(ix([sheet, note]), ['N']).items[0] as Shape
		expect(n.vpId).toBeUndefined()
		expect(n.geom.kind === 'text' && n.geom.at).toEqual({ x: 60, y: 50 })   // centre 50,50 + 1000 / 100
		// a box and a circle keep the size they showed at (2000 × 1000 at 1:100 = 20 × 10 paper mm)
		const box = { ...note, id: 'B', geom: { kind: 'rect', centre: { x: 0, y: 0 }, size: { x: 2000, y: 1000 } } } as Shape
		const ring = { ...note, id: 'C', geom: { kind: 'circle', centre: { x: 0, y: 0 }, r: 500 } } as Shape
		const [b, c] = copy(ix([sheet, box, ring]), ['B', 'C']).items as Shape[]
		expect(b.geom).toMatchObject({ centre: { x: 50, y: 50 }, size: { x: 20, y: 10 } })
		expect(c.geom).toMatchObject({ centre: { x: 50, y: 50 }, r: 5 })
	})
})

describe('paste', () => {
	it('as-is (User): new ids, but the same place and the same labels, even back where it came from', () => {
		const i = ix(), r = pasteClip(copy(i, ['O1']), target(i, { kind: 'level', id: 'L33' }))
		const o = r.put[0] as Outlet, was = i.get<Outlet>('O1')!
		expect(o.id).not.toBe('O1')
		expect(o).toMatchObject({ label: was.label, at: was.at, zoneId: was.zoneId })
		expect(o.ports.map((p) => p.label)).toEqual(was.ports.map((p) => p.label))
		expect(r.select).toEqual([o.id])
	})
	it('onto another level: same place and labels; its rooms / zones are dropped', () => {
		const i = ix(), o = pasteClip(copy(i, ['O1']), target(i, { kind: 'level', id: 'L34' })).put[0] as Outlet
		expect(o).toMatchObject({ levelId: 'L34', label: '33-001', at: { x: 1000, y: 4000 } })
		expect(o.zoneId).toBeUndefined()
		expect(o.ports.every((p) => !p.serverRoomId)).toBe(true)
	})
	it('moved by d (Ctrl-drag copy), up too', () => {
		const i = ix(), o = pasteClip(copy(i, ['O1']), target(i, { kind: 'level', id: 'L33' }, { d: { x: 100, y: -50, z: 300 } })).put[0] as Outlet
		expect(o).toMatchObject({ at: { x: 1100, y: 3950 }, z: 300 })
	})
	it('a rack: its devices follow it; on another level it gets a room of the same name', () => {
		const i = ix(), same = pasteClip(copy(i, ['R1']), target(i, { kind: 'level', id: 'L33' })).put
		const rack = same.find((e) => e.type === 'rack') as Rack
		expect(rack).toMatchObject({ name: 'A01', spaceId: 'SR-A' })
		expect(same.filter((e) => e.type === 'device').every((d) => (d as Device).rackId === rack.id)).toBe(true)
		const other = pasteClip(copy(i, ['R1']), target(i, { kind: 'level', id: 'L34' })).put
		const room = other.find((e) => e.type === 'space') as Space, r2 = other.find((e) => e.type === 'rack') as Rack
		expect(room).toMatchObject({ levelId: 'L34', kind: 'server room', name: 'IDF-A' })
		expect(r2).toMatchObject({ spaceId: room.id, name: 'A01' })
		expect((other.find((e) => e.id !== r2.id && e.type === 'device' && (e as Device).panel) as Device).panel?.serverRoomId).toBe(room.id)
	})
	it('a pasted panel is not "printed": no printed-labels record, new reservation ids (Q25)', () => {
		const i = ix(), clip = copy(i, ['R1'])
		for (const e of clip.items) if (e.type === 'device' && e.panel) e.panel = { ...e.panel, labelsPrintedAt: 1, printedLabels: { '1': 'X' }, reservations: [{ id: 'RV', usage: 'desk', ports: [1] }] }
		const panels = pasteClip(clip, target(i, { kind: 'level', id: 'L33' })).put.filter((e): e is Device => e.type === 'device' && !!e.panel)
		expect(panels.length).toBeGreaterThan(0)
		for (const d of panels) {
			expect(d.panel).not.toHaveProperty('labelsPrintedAt')
			expect(d.panel).not.toHaveProperty('printedLabels')
			expect(d.panel!.reservations![0]).toMatchObject({ usage: 'desk', ports: [1] })
			expect(d.panel!.reservations![0].id).not.toBe('RV')
		}
	})
	it('references inside the copy follow; references the target lacks are dropped', () => {
		const run = { type: 'shape', id: 'RUN', levelId: 'L33', geom: { kind: 'path', nodes: [{ id: 'a', x: 1000, y: 4000, z: 0, attach: 'O1' }, { id: 'b', x: 0, y: 0, z: 0, attach: 'O2' }], segs: [] } } as unknown as Shape
		const i = ix([run]), put = pasteClip(copy(i, ['O1', 'RUN']), target(i, { kind: 'level', id: 'L34' })).put
		const o = put.find((e) => e.type === 'outlet')!, s = put.find((e) => e.type === 'shape') as Shape
		const nodes = s.geom.kind === 'path' ? s.geom.nodes : []
		expect(nodes[0].attach).toBe(o.id)
		expect(nodes[1].attach).toBeUndefined()
	})
	it('items keep their layer: into another project the layer comes along, or joins one of the same name', () => {
		const idf: Layer = { type: 'layer', id: 'LY', name: 'IDF1', order: 500, color: '#f00' }
		const src = ix([idf, { ...(demoProject().find((e) => e.id === 'O1') as Outlet), id: 'OX', label: '33-050', layerId: 'LY' }])
		const clip = copy(src, ['OX'], 'OTHER')
		const fresh = pasteClip(clip, target(ix(), { kind: 'level', id: 'L33' })).put
		expect(fresh.find((e) => e.type === 'layer')).toMatchObject({ id: 'LY', name: 'IDF1' })
		expect((fresh.find((e) => e.type === 'outlet') as Outlet).layerId).toBe('LY')
		const named = ix([{ ...idf, id: 'MINE' }])
		const put = pasteClip(clip, target(named, { kind: 'level', id: 'L33' })).put
		expect(put.some((e) => e.type === 'layer')).toBe(false)
		expect((put.find((e) => e.type === 'outlet') as Outlet).layerId).toBe('MINE')
	})
	it('a layer that comes along starts hidden in the existing viewports (as + Layer does)', () => {
		const idf: Layer = { type: 'layer', id: 'LY', name: 'IDF1', order: 500 }
		const src = ix([idf, { ...(demoProject().find((e) => e.id === 'O1') as Outlet), id: 'OX', label: '33-050', layerId: 'LY' }])
		const sh = { type: 'sheet', id: 'SHX', name: 'A', paper: { size: 'A3', orientation: 'landscape', marginMm: 10 }, viewports: [{ id: 'V', view: { levelId: 'L33', spec: { kind: 'plan' } }, rect: { x: 20, y: 20, w: 100, h: 80 }, scale: 100, centre: { x: 0, y: 0 } }] } as unknown as Sheet
		const put = pasteClip(copy(src, ['OX'], 'OTHER'), target(ix([sh]), { kind: 'level', id: 'L33' })).put
		expect((put.find((e) => e.id === 'SHX') as Sheet).viewports[0].frozen).toEqual(['LY'])
		// a layer of the same name here is not new: no sheet changes
		expect(pasteClip(copy(src, ['OX'], 'OTHER'), target(ix([sh, { ...idf, id: 'MINE' }]), { kind: 'level', id: 'L33' })).put.some((e) => e.type === 'sheet')).toBe(false)
	})
	it('only what the pane takes: plan items into a plan, notes onto a sheet', () => {
		const i = ix(), r = pasteClip(copy(i, ['O1']), target(i, { kind: 'sheet', id: 'S' }))
		expect(r).toMatchObject({ put: [], skipped: 1 })
	})
})

describe('paste at the cursor (Ctrl+Shift+V)', () => {
	it('the middle of the copied things’ box; pasted moved so it lands on the cursor', () => {
		const a = { type: 'shape', id: 'A', levelId: 'L33', geom: { kind: 'rect', centre: { x: 100, y: 100 }, size: { x: 200, y: 200 } } } as Shape   // 0,0 … 200,200
		const b = { type: 'shape', id: 'B', levelId: 'L33', geom: { kind: 'text', at: { x: 1000, y: 400 }, text: 'T', sizeMm: 2.5 } } as Shape
		const i = ix([a, b]), clip = copy(i, ['A', 'B'])
		expect(clipCentre(clip)).toEqual({ x: 500, y: 200 })
		const r = pasteClip(clip, target(i, { kind: 'level', id: 'L33' }, { d: { x: 4500, y: 800 } }))   // the cursor at 5000, 1000
		expect(r.put.flatMap((e) => (e.type === 'shape' && e.geom.kind === 'text' ? [e.geom.at] : []))).toEqual([{ x: 5500, y: 1200 }])
		expect(clipCentre(copy(i, ['P1']))).toBeNull()   // devices on their own: no points
	})
	it('a note drawn on an elevation counts at its plan place, and moves along its plane and up', () => {
		const frame = { o: { x: 2000, y: 0 }, t: { x: 1, y: 0 }, n: { x: 0, y: -1 } }
		const e = { type: 'shape', id: 'E', levelId: 'L33', plane: { kind: 'vertical', frame, depth: -500 }, geom: { kind: 'text', at: { x: 1000, y: 1200 }, text: 'E', sizeMm: 2.5 } } as Shape   // u 1000, z 1200
		const i = ix([e]), clip = copy(i, ['E'])
		expect(clipCentre(clip)).toEqual({ x: 3000, y: 500 })              // not (1000, 1200): u along the frame, depth across it
		const r = pasteClip(clip, target(i, { kind: 'level', id: 'L33' }, { d: { x: 400, y: 900, z: 100 } }))
		expect(r.put.flatMap((x) => (x.type === 'shape' && x.geom.kind === 'text' ? [x.geom.at] : []))).toEqual([{ x: 1400, y: 1300 }])
	})
})
