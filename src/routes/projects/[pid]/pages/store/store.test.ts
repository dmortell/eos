import { describe, it, expect } from 'vitest'
import { seedPlaces, childrenOf, ancestorsOf } from './places'
import { frameToDoc, docToFrame, nextFrameSeq, newSheetDoc, normSheet, modelToDoc, docToModel } from './mappers'
import { PAPER_PX_PER_MM } from '../constants'
import type { TreeInput } from '../projectTree'
import type { SheetFrame } from '../types'

const P = 'pid'
const input: TreeInput = {
	project: { id: P, name: 'Hibiya', address: 'Hibiya', floors: [
		{ number: 10, label: 'L10 WeWork', serverRoomCount: 1 },
		{ number: 30, serverRoomCount: 2, roomNames: { A: 'IDF1', B: 'IDF2' } },
		{ number: 33, serverRoomCount: 1, areas: [{ id: '3303', label: '3303', legacy: true }, { id: '3307', label: '3307' }] },
	] },
	racks: { [`${P}_F30_RB`]: { rows: [{ id: 'ra', label: 'Row A' }], racks: [] } },
	risers: [{ id: P, name: 'Risers', fromFloor: 12, toFloor: 33 }],
	drawings: [{ id: 'd1', toolType: 'outlets', title: 'Low Level 33F', sourceDocId: `${P}_F33` }],
}
const counter = () => { let n = 0; return () => `p${++n}` }

describe('seedPlaces (drawings-plan §2.1)', () => {
	const places = seedPlaces(input, counter())
	const byName = (n: string) => places.find((p) => p.name === n)!
	it('mirrors the navigator: buildings › floors › zones / rooms › rows, with no drawing leaves', () => {
		expect(childrenOf(places, null).map((p) => p.name)).toEqual(['Hibiya', 'Other building'])
		expect(childrenOf(places, byName('Hibiya').id).map((p) => p.name)).toEqual(['33F', '30F'])
		expect(childrenOf(places, byName('33F').id).map((p) => p.name)).toEqual(['Zone 3303', 'Zone 3307', 'Room A'])
		expect(ancestorsOf(places, byName('Row A').id).map((p) => p.name)).toEqual(['Hibiya', '30F', 'IDF2'])
		expect(places.some((p) => /Low Level|Risers/.test(p.name))).toBe(false)
	})
	it('records the old-data link on each seeded node, and orders siblings from 0', () => {
		expect(byName('30F').legacy).toEqual({ floor: 30 })
		expect(byName('Zone 3307').legacy).toEqual({ floor: 33, area: '3307' })
		expect(byName('IDF2').legacy).toEqual({ floor: 30, room: 'B' })
		expect(byName('Row A').legacy).toEqual({ floor: 30, room: 'B', row: 'ra' })
		expect(byName('Hibiya').legacy).toBeUndefined()
		expect(childrenOf(places, byName('30F').id).map((p) => p.order)).toEqual([0, 1])
	})
	it('ancestorsOf stops on a cycle', () => {
		const loop = [{ id: 'a', name: 'a', parentId: 'b', order: 0 }, { id: 'b', name: 'b', parentId: 'a', order: 0 }]
		expect(ancestorsOf(loop, 'a').map((p) => p.id)).toEqual(['b'])
	})
})

describe('frame mappers', () => {
	const f: SheetFrame = { id: 'f1', x: 100 * PAPER_PX_PER_MM, y: 20 * PAPER_PX_PER_MM, w: 150.04 * PAPER_PX_PER_MM, h: 90 * PAPER_PX_PER_MM, border: 'dashed',
		proj: 'front', scale: '1:50', clip: null, label: '2', modelId: 'm1', frozen: ['walls'] }
	it('stores paper mm (0.1 mm), drops a label equal to its sequence, keeps view state', () => {
		const d = frameToDoc(f, 2, { view: { zoom: 2, x: 5, y: 6 }, yaw: 1 })
		expect(d).toEqual({ id: 'f1', seq: 2, x: 100, y: 20, w: 150, h: 90, direction: 'front', scale: '1:50', clip: null, border: 'dashed',
			modelId: 'm1', frozen: ['walls'], view: { zoom: 2, x: 5, y: 6 }, yaw: 1 })
	})
	it('round-trips back to paper px, the label falling back to the sequence', () => {
		const { frame, view } = docToFrame(frameToDoc({ ...f, label: 'Detail A', locked: true }, 3))
		expect(frame.label).toBe('Detail A'); expect(frame.locked).toBe(true)
		expect(frame.x).toBeCloseTo(100 * PAPER_PX_PER_MM, 6)
		expect(docToFrame(frameToDoc(f, 2)).frame.label).toBe('2')
		expect(view).toEqual({ view: undefined, yaw: undefined, pitch: undefined })
	})
	it('nextFrameSeq continues after the highest', () => {
		expect(nextFrameSeq([])).toBe(1); expect(nextFrameSeq([{ seq: 1 }, { seq: 4 }])).toBe(5)
	})
})

describe('sheet + model docs', () => {
	it('a new sheet is a registry entry with an EMPTY number, filed under its place', () => {
		const d = newSheetDoc({ pid: P, id: 's1', title: 'Plan', placeId: 'p3', sortOrder: 2, user: 'u', now: 't' })
		expect(d).toMatchObject({ toolType: 'pages', drawingNumber: '', status: 'active', placeId: 'p3', sortOrder: 2, tags: [], sourceDocId: `${P}_s1`, frames: [] })
		expect(d.paper).toEqual({ size: 'A3', landscape: true, marginMm: 10 })
	})
	it('normSheet fills fields an older doc lacks', () => {
		const d = normSheet({ id: 's9', title: 'X' })
		expect(d.frames).toEqual([]); expect(d.tags).toEqual([]); expect(d.placeId).toBeNull(); expect(d.paper.size).toBe('A3')
	})
	it('docToModel takes the doc id, fills defaults and migrates the legacy `ents` field', () => {
		const m = docToModel({ id: 'm7', ents: [{ id: 'l', type: 'line', a: [0, 0], b: [1, 1] }], updatedAt: 't' } as never)
		expect(m.id).toBe('m7'); expect(m.name).toBe('m7'); expect(m.objects).toEqual([])
		expect('updatedAt' in m).toBe(false); expect('ents' in m).toBe(false)
		expect(m.shapes?.[0]).toMatchObject({ type: 'polyline' })
		expect(modelToDoc(m, 'now').updatedAt).toBe('now')
	})
})
