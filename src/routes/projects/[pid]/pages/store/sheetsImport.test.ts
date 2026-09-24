import { describe, it, expect, beforeAll } from 'vitest'
import { importSheetDoc, outletsView, viewCentredOn, annotationToEnt, planBounds } from './sheetsImport'
import { DEFAULT_BLOCKS, setBlockResolver } from '../ui/blocks'
import { PLAN_CX, PLAN_CY } from '../ui/geometry'
import type { SheetDoc, SheetViewport, Annotation } from '../../sheets/types'
import type { Model } from '../3dview/types'

const lib = Object.fromEntries(DEFAULT_BLOCKS.map((b) => [b.id, b]))
beforeAll(() => setBlockResolver((id) => (id ? lib[id] : undefined)))
const counter = () => { let n = 0; return (p: string) => `${p}${++n}` }
const vp = (over: Partial<SheetViewport>): SheetViewport => ({ id: 'v', x: 10, y: 20, w: 200, h: 100, source: { kind: 'empty' }, ...over })
const model: Model = { id: 'm33', name: '33F', objects: [], shapes: [{ id: 'fp', type: 'image', a: [0, 0], b: [20000, 10000], src: 'pdf:x#1' }] }
const sheet = (viewports: SheetViewport[]): SheetDoc => ({ id: 's', projectId: 'P', title: '3303 Outlets', drawingNumber: '001', sortOrder: 0,
	paper: { paperSize: 'A3', orientation: 'landscape', drawingOffset: { x: 0, y: 0 }, scale: 100, showPaper: false, margins: 8 }, viewports })

describe('Sheets import', () => {
	it('an explicit-scale outlets viewport keeps its scale and the model point at its centre', () => {
		const v = vp({ scale: 100, contentOffsetMm: { x: 1000, y: 2000 } })
		expect(outletsView(v, null)).toEqual({ n: 100, centre: [1000 + 100 * 100, 2000 + 50 * 100] })
		const view = viewCentredOn([PLAN_CX + 500, PLAN_CY - 200], 100)
		expect([view.x, view.y]).toEqual([-5, 2])
	})
	it('a Fit viewport centres the model bounds at a tidy scale', () => {
		const b = planBounds(model)!
		const r = outletsView(vp({}), b)
		expect(r.centre).toEqual([b.x + b.w / 2, b.y + b.h / 2])
		expect(r.n).toBeGreaterThanOrEqual(Math.max(b.w / 200, b.h / 100))
	})
	it('maps viewports to frames: outlets → the place model + its annotations in that frame; the rest unmapped with a note', () => {
		const ann: Annotation[] = [
			{ id: 'a1', kind: 'text', x: 100, y: 200, text: 'Hi', fontPt: 10 },
			{ id: 'a2', kind: 'line', x: 0, y: 0, x2: 50, y2: 0, end: 'arrow' },
			{ id: 'a3', kind: 'legend', x: 0, y: 0 },
		]
		const r = importSheetDoc(sheet([
			vp({ number: 2, label: 'Plan', scale: 50, contentOffsetMm: { x: 0, y: 0 }, source: { kind: 'outlets', outletsDocId: 'P_F33' }, annotations: ann }),
			vp({ source: { kind: 'racks', racksDocId: 'P_F33_RA', face: 'front' }, annotations: [ann[0]] }),
		]), { newId: counter(), modelForOutlets: (id) => (id === 'P_F33' ? model : null), layerFor: () => 'annotations' })
		expect(r.paper).toEqual({ size: 'A3', landscape: true, marginMm: 8 })
		expect(r.frames.map((f) => [f.seq, f.label, f.modelId, f.scale, f.source])).toEqual([[2, 'Plan', 'm33', '1:50', undefined], [1, undefined, undefined, '1:100', 'racks front · P_F33_RA']])
		const shapes = r.shapes.m33
		expect(shapes.map((e) => [e.type, e.space, e.layer])).toEqual([['text', `view:${r.frames[0].id}`, 'annotations'], ['polyline', `view:${r.frames[0].id}`, 'annotations']])
		expect(shapes[1].headEnd).toBe('arrow')
		expect(r.notes.length).toBe(2)   // the legend + the unmapped racks viewport
		expect(r.notes[1]).toMatch(/racks.*not mapped.*1 annotation/)
	})
	it('an outlet symbol becomes an outlet block insert with its attributes, centred and scaled to match', () => {
		const e = annotationToEnt({ id: 'o', kind: 'symbol', symbol: 'outlet', x: 0, y: 0, w: 1000, h: 1000, text: '33.3.001', outlet: { ports: 2, mount: 'wall', usage: 'network', level: 'high', room: 'Mtg' } }, 'f', 100, 'e1')!
		expect(e).toMatchObject({ type: 'insert', block: 'outlet-wall', a: [500, 500], attrs: { LABEL: '33.3.001', PORTS: '2', TYPE: 'network', NOTE: 'Mtg' }, scale: 2.2 })
		expect(e.fill).toBeUndefined()   // high level = outline
	})
})
