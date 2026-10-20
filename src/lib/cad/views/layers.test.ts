// Layers (docs/plan/layers.md), as behaviour: what each item is on, and what hiding / locking / coloring a layer does.
import { describe, it, expect } from 'vitest'
import { applyLayers, layerCounts, layerMap } from './layers'
import { planDisplayList } from './plan'
import { rackRowDisplayList } from './rackRow'
import { viewportContent } from './sheet'
import { displayListToDxf } from '../render/dxf'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import { layersOf, layerOf, defaultLayer, drawnOn, layerBlock, toolBlock, nextLayerColour, LAYER_PALETTE, SYSTEM_LAYERS, groupOf, groupLayers, withPreset, targetIds, togglePick, rangePick, holdsItems, DERIVED_LAYERS } from '../domain/layers'
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

describe('hiding, locking and coloring', () => {
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
	it('a layer’s color recolors its items; an item’s own color (a patch cord) wins', () => {
		const i = ix([layer('sys:cords', 80, '#f00'), layer('sys:racks', 50, '#0a0')])
		const { draw } = applyLayers(rackRowDisplayList(i, { spaceId: 'SR-A', face: 'front' }), i)
		expect(draw.find((p) => p.src === 'C1')?.color).toBe('#3b82f6')
		expect(draw.find((p) => p.src === 'R1')?.color).toBe('#0a0')
	})
	it('only a layer with a color set recolors; a system layer’s default color is not forced on its items', () => {
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
	it('new project layers take the next unused palette color', () => {
		expect(nextLayerColour([])).toBe(LAYER_PALETTE[0])
		expect(nextLayerColour([layer('IDF1', 500, LAYER_PALETTE[0]), layer('sys:walls', 20, LAYER_PALETTE[1])])).toBe(LAYER_PALETTE[1])
	})
	it('a plan paints in layer order: move Outlets (low) under everything and they draw first', () => {
		const i = ix([layer('sys:outlets-low', -1)]), { draw } = applyLayers(plan(i), i, { sort: true })
		const first = draw.findIndex((p) => p.src === 'O1'), trunk = draw.findIndex((p) => p.src === 'T1')
		expect(first).toBeLessThan(trunk)
	})
	it('a block on a layer of the project’s own (a desk) draws under the outlets, whatever its layer’s order (R7-30)', () => {
		const o1 = demoProject().find((e) => e.id === 'O1') as Entity & { at: { x: number; y: number } }
		const desk = { type: 'shape', id: 'DESK', levelId: 'L33', layerId: 'FURN', geom: { kind: 'insert', blockId: 'X', at: o1.at, w: 1600, h: 800 } } as unknown as Entity
		const i = ix([layer('FURN', 500), desk]), { draw } = applyLayers(plan(i), i, { sort: true })
		const d = draw.findIndex((p) => p.src === 'DESK'), o = draw.findIndex((p) => p.src === 'O1')
		expect(d).toBeGreaterThanOrEqual(0)
		expect(d).toBeLessThan(o)
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

describe('port labels layer (User 2026-10-07)', () => {
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
	it('a cord to another room / row is a stub on Cord stubs: hiding it keeps the cords in the row (User 2026-10-20)', () => {
		const index = ix([
			{ type: 'rack', id: 'R9', levelId: 'L33', spaceId: 'SR-X', order: 0, name: 'X01', kind: 'cabinet', heightU: 42, widthMm: 600, depthMm: 1000 },
			{ type: 'device', id: 'SW9', rackId: 'R9', name: 'SW9', kind: 'switch', u: 40, heightU: 1, face: 'front', portCount: 24 },
			{ type: 'cord', id: 'CX', kind: 'patch', a: { on: 'SW1', port: 40, face: 'front' }, b: { on: 'SW9', port: 1, face: 'front' }, cableType: 'cat6a', colour: '#3b82f6', lengthM: 5, lengthLocked: false, status: 'add' },
		] as Entity[])
		const prims = rackRowDisplayList(index, { spaceId: 'SR-A', face: 'front' })
		const stubs = (ps: typeof prims) => ps.filter((p) => p.role === 'cord-stub' && p.src === 'CX').length
		const cords = (ps: typeof prims) => ps.filter((p) => p.role === 'cord').length
		expect(stubs(prims)).toBe(2)   // the stub and its "→ X01 · SW9 : 1"
		const shown = applyLayers(prims, index, { hidden: new Set(['sys:cord-stubs']) }).draw
		expect(stubs(shown)).toBe(0)
		expect(cords(shown)).toBe(cords(prims))
		expect(stubs(applyLayers(prims, index, { hidden: new Set(['sys:cords']) }).draw)).toBe(2)
	})
	it('a drawing tool says which layer its new shapes went on; paper shapes and other items say nothing', () => {
		const ls = layersOf([{ type: 'layer', id: 'L-A', name: 'Comms', order: 500 } as Layer])
		const geom = { kind: 'rect', x: 0, y: 0, w: 10, h: 10 }
		const sh = (o: object) => ({ type: 'shape', id: 'S', geom, ...o }) as unknown as Entity
		expect(drawnOn([sh({ levelId: 'L1', layerId: 'L-A' })], ls)).toBe('Drawn on the Comms layer')
		expect(drawnOn([sh({ levelId: 'L1' }), sh({ levelId: 'L1', role: { kind: 'wall' } })], ls)).toBe('Drawn on the Drawing, Walls layers')
		expect(drawnOn([sh({ sheetId: 'SH' })], ls)).toBeNull()
		expect(drawnOn([], ls)).toBeNull()
	})
})

describe('layer groups, presets and multi-select', () => {
	const ls = layersOf([{ ...layer('A', 500), name: 'IDF1/Outlets' }, { ...layer('B', 510), name: 'IDF1/Trunks' }, { ...layer('C', 520), name: 'Comms', group: 'Other' }])
	it('a layer is under its own group, else its name’s prefix before a slash, else none', () => {
		expect(ls.filter((l) => !l.system).map(groupOf)).toEqual(['IDF1', 'IDF1', 'Other'])
		expect(groupOf({ name: 'Walls' })).toBeUndefined()
		expect(groupOf({ name: '/odd' })).toBeUndefined()
	})
	it('the panel lists the ungrouped layers first, then each group, all in drawing order', () => {
		const g = groupLayers(ls)
		expect(g[0].name).toBeNull()
		expect(g[0].layers.length).toBe(SYSTEM_LAYERS.length)
		expect(g.slice(1).map((x) => [x.name, x.layers.map((l) => l.id)])).toEqual([['IDF1', ['A', 'B']], ['Other', ['C']]])
	})
	it('a restyle record of a system layer can file it in a group', () => {
		expect(layersOf([{ ...layer('sys:walls', 15), group: 'Building' }]).find((l) => l.id === 'sys:walls')?.group).toBe('Building')
	})
	it('saving a preset under an existing name replaces it (any case)', () => {
		const a = withPreset([], 'Power', ['x']), b = withPreset(a, 'power', ['y', 'z'])
		expect(b).toEqual([{ name: 'power', hidden: ['y', 'z'] }])
	})
	it('a change to one of several picked layers is made to all of them; to an unpicked one, just it', () => {
		const picked = new Set(['A', 'B'])
		expect(targetIds(picked, 'A')).toEqual(['A', 'B'])
		expect(targetIds(picked, 'C')).toEqual(['C'])
		expect(targetIds(new Set(['A']), 'A')).toEqual(['A'])
	})
	it('Ctrl-click toggles a pick; Shift-click picks the range from the anchor', () => {
		expect([...togglePick(new Set(['A']), 'B')]).toEqual(['A', 'B'])
		expect([...togglePick(new Set(['A', 'B']), 'A')]).toEqual(['B'])
		const order = ['A', 'B', 'C', 'D']
		expect([...rangePick(order, 'D', 'B')].sort()).toEqual(['B', 'C', 'D'])
		expect([...rangePick(order, null, 'C')]).toEqual(['C'])
	})
})

describe('layers drawn from other items (User 2026-10-20)', () => {
	it('Cord stubs, Port labels, Room lines and Other face hold no items; every other system layer does', () => {
		expect([...DERIVED_LAYERS].every((id) => SYSTEM_LAYERS.some((l) => l.id === id))).toBe(true)
		expect(holdsItems('sys:cord-stubs')).toBe(false)
		expect(holdsItems('sys:port-labels')).toBe(false)
		expect(holdsItems('sys:outlets-low')).toBe(true)
		expect(holdsItems('L-own')).toBe(true)
	})
})
