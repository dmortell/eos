// Layers (docs/plan/layers.md), as behaviour: what each item is on, and what hiding / locking / colouring a layer does.
import { describe, it, expect } from 'vitest'
import { applyLayers, layerCounts, layerMap } from './layers'
import { planDisplayList } from './plan'
import { rackRowDisplayList } from './rackRow'
import { viewportContent } from './sheet'
import { displayListToDxf } from '../render/dxf'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import { layersOf, layerOf, defaultLayer, layerBlock, toolBlock, nextLayerColour, LAYER_PALETTE, SYSTEM_LAYERS } from '../domain/layers'
import type { Entity, Layer, Viewport } from '../domain/drawing'
import type { Outlet } from '../domain/types'

const ix = (extra: Entity[] = []) => new ProjectIndex([...demoProject(), ...extra])
const plan = (i: ProjectIndex) => planDisplayList(i, 'L33', { scale: 100 })
const layer = (id: string, order: number, color?: string): Layer => ({ type: 'layer', id, name: id, order, ...(color ? { color } : {}) })

describe('what layer an item is on', () => {
	it('by kind when it names none: outlets by tier, trunks by tier, racks, notes', () => {
		const i = ix()
		expect(defaultLayer(i.get('O1')!)).toBe('sys:outlets-low')
		expect(defaultLayer({ ...(i.get('O1') as Outlet), tier: 'high' })).toBe('sys:outlets-high')
		expect(defaultLayer(i.get('T1')!)).toBe('sys:cont-high')
		expect(defaultLayer(i.get('R1')!)).toBe('sys:racks')
		expect(defaultLayer(i.get('PEN1')!)).toBe('sys:drawing')
	})
	it('its own layer while that layer exists; back to the default when it is gone', () => {
		const o = { ...(ix().get('O1') as Outlet), layerId: 'IDF1' }
		expect(layerOf(o, new Set(['IDF1']))).toBe('IDF1')
		expect(layerOf(o, new Set())).toBe('sys:outlets-low')
	})
	it('a record with a system id restyles that layer; the project’s own come after, by order', () => {
		const ls = layersOf([layer('sys:walls', 999, '#f00'), layer('IDF1', 500)])
		expect(ls.length).toBe(SYSTEM_LAYERS.length + 1)
		expect(ls.at(-1)).toMatchObject({ id: 'sys:walls', color: '#f00', name: 'Walls', system: true })
		expect(ls.at(-2)).toMatchObject({ id: 'IDF1', system: false })
	})
	it('a hidden or locked current layer refuses new items, saying why', () => {
		expect(layerBlock('IDF1', 'IDF1', new Set(['IDF1']), new Set())).toMatch(/hidden/)
		expect(layerBlock('IDF1', 'IDF1', new Set(), new Set(['IDF1']))).toMatch(/locked/)
		expect(layerBlock('IDF1', 'IDF1', new Set(), new Set())).toBeNull()
	})
})

describe('hiding, locking and colouring', () => {
	it('hiding Outlets (low) takes the outlets AND their labels away', () => {
		const i = ix(), all = plan(i)
		expect(all.some((p) => p.src === 'O1' && p.k === 'text')).toBe(true)
		const { draw } = applyLayers(all, i, { hidden: new Set(['sys:outlets-low']) })
		expect(draw.some((p) => p.src === 'O1' || p.src === 'O2')).toBe(false)
		expect(draw.some((p) => p.src === 'T1')).toBe(true)
	})
	it('a trunk’s drop is on Risers: hiding Trunks high leaves it', () => {
		const i = ix(), { draw } = applyLayers(plan(i), i, { hidden: new Set(['sys:cont-high']) })
		expect(draw.filter((p) => p.src === 'T1').every((p) => p.layer === 'sys:risers')).toBe(true)
		expect(draw.some((p) => p.src === 'T1')).toBe(true)
	})
	it('a locked layer is still drawn but can’t be picked', () => {
		const i = ix(), { draw, pick } = applyLayers(plan(i), i, { locked: new Set(['sys:outlets-low']) })
		expect(draw.some((p) => p.src === 'O1')).toBe(true)
		expect(pick.some((p) => p.src === 'O1')).toBe(false)
		expect(pick.some((p) => p.src === 'T1')).toBe(true)
	})
	it('a layer’s colour recolours its items; an item’s own colour (a patch cord) wins', () => {
		const i = ix([layer('sys:cords', 80, '#f00'), layer('sys:racks', 50, '#0a0')])
		const { draw } = applyLayers(rackRowDisplayList(i, { spaceId: 'SR-A', face: 'front' }), i)
		expect(draw.find((p) => p.src === 'C1')?.color).toBe('#3b82f6')
		expect(draw.find((p) => p.src === 'R1')?.color).toBe('#0a0')
	})
	it('only a layer with a colour set recolours; a system layer’s default colour is not forced on its items', () => {
		const i = ix(), { draw } = applyLayers(plan(i), i)
		expect(SYSTEM_LAYERS.every((l) => l.look)).toBe(true)
		expect(draw.find((p) => p.src === 'O1')?.color).toBeUndefined()
	})
	it('a layer’s line type and lineweight go on its lines that set none; a line’s own wins; text and run bands are left alone', () => {
		const sh = (id: string, style?: object): Entity => ({ type: 'shape', id, levelId: 'L33', layerId: 'L-A', ...(style ? { style } : {}),
			geom: { kind: 'path', nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 1000, y: 0, z: 0 }], segs: [{ id: 's', a: 'a', b: 'b' }] } }) as Entity
		const i = ix([{ ...layer('L-A', 500), weightMm: 0.5, dash: 'dashed' }, sh('LN'), sh('OWN', { dash: 'dotted', weightMm: 0.18 }), layer('sys:cont-low', 50)])
		const draw = applyLayers(plan(i), i).draw
		expect(draw.find((p) => p.src === 'LN')).toMatchObject({ weight: 0.5, dash: 'dashed' })
		expect(draw.find((p) => p.src === 'OWN')).toMatchObject({ weight: 0.18, dash: 'dotted' })
		// a restyled system layer: a trunk's band keeps its real width
		const j = ix([{ ...layer('sys:cont-low', 50), weightMm: 1 }]), band = applyLayers(plan(j), j).draw.find((p) => p.src === 'T1' && p.k === 'line' && p.w)
		expect(band && 'weight' in band).toBe(false)
	})
	it('new project layers take the next unused palette colour', () => {
		expect(nextLayerColour([])).toBe(LAYER_PALETTE[0])
		expect(nextLayerColour([layer('IDF1', 500, LAYER_PALETTE[0]), layer('sys:walls', 20, LAYER_PALETTE[1])])).toBe(LAYER_PALETTE[1])
	})
	it('a plan paints in layer order: move Outlets (low) under everything and they draw first', () => {
		const i = ix([layer('sys:outlets-low', -1)]), { draw } = applyLayers(plan(i), i, { sort: true })
		const first = draw.findIndex((p) => p.src === 'O1'), trunk = draw.findIndex((p) => p.src === 'T1')
		expect(first).toBeLessThan(trunk)
	})
	it('a layer frozen in a viewport is left out of that viewport only (it prints that way)', () => {
		const i = ix(), vp = (frozen?: string[]): Viewport => ({ id: 'V', view: { levelId: 'L33', spec: { kind: 'plan' } }, rect: { x: 0, y: 0, w: 100, h: 100 }, scale: 100, centre: { x: 0, y: 0 }, ...(frozen ? { frozen } : {}) })
		expect(viewportContent(i, vp()).some((p) => p.src === 'O1')).toBe(true)
		expect(viewportContent(i, vp(['sys:outlets-low'])).some((p) => p.src === 'O1')).toBe(false)
	})
	it('drawing on a hidden or locked layer is refused; the current layer only takes lines', () => {
		const L = layerMap(ix([layer('IDF1', 500)])), prefs = (h: string[], l: string[] = [], current: string | null = null) => ({ current, hidden: new Set(h), locked: new Set(l) })
		expect(toolBlock('wall', prefs(['sys:walls']), 0, L)).toMatch(/Walls layer is hidden/)
		expect(toolBlock('trunk', prefs(['sys:cont-high']), 2900, L)).toMatch(/Trunks high layer is hidden/)
		expect(toolBlock('trunk', prefs(['sys:cont-high']), 0, L)).toBeNull()
		expect(toolBlock('line', prefs([], ['IDF1'], 'IDF1'), 0, L)).toMatch(/IDF1 layer is locked/)
		expect(toolBlock('wall', prefs([], [], 'IDF1'), 0, L)).toBeNull()
	})
	it('DXF: items on a project layer go on a DXF layer of its name; the rest keep their discipline layer', () => {
		const i = ix([layer('IDF1', 500), { ...(demoProject().find((e) => e.id === 'O1') as Outlet), layerId: 'IDF1' }])
		const dxf = displayListToDxf(applyLayers(plan(i), i).draw, new Map([['IDF1', 'IDF1']])).text
		expect(dxf).toMatch(/\nIDF1\n/)
		expect(dxf).toMatch(/\nE-OUTLETS\n/)
	})
	it('counts items per layer (an outlet moved to IDF1 counts there)', () => {
		const i = ix([layer('IDF1', 500), { ...(demoProject().find((e) => e.id === 'O1') as Outlet), layerId: 'IDF1' }])
		const n = layerCounts(i)
		expect(n.get('IDF1')).toBe(1)
		expect(n.get('sys:outlets-low')).toBe(1)
	})
})

describe('port labels layer (Dave 2026-10-07)', () => {
	it("a device's port labels go on Port labels: hiding it keeps the racks and ports, hiding Racks keeps the labels", () => {
		const index = ix()
		const prims = rackRowDisplayList(index, { spaceId: 'SR-A', face: 'front' })
		const labels = (ps: typeof prims) => ps.filter((p) => p.k === 'text' && p.cls === 'port-label').length
		expect(labels(prims)).toBeGreaterThan(0)
		const noLabels = applyLayers(prims, index, { hidden: new Set(['sys:port-labels']) }).draw
		expect(labels(noLabels)).toBe(0)
		expect(noLabels.some((p) => p.k === 'line' && p.cls.startsWith('port'))).toBe(true)
		expect(labels(applyLayers(prims, index, { hidden: new Set(['sys:racks']) }).draw)).toBe(labels(prims))
	})
})
