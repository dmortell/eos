import { describe, it, expect, beforeEach } from 'vitest'
import type { Layer } from './3dview/types'
import { layerGroup, layerGroups, isLayerHidden, isLayerLocked, layerOrder, activeLayerIn, layerUI,
	presets, presetUI, applyPreset, presetMatches, savePreset, moveLayer, addLayer, removeLayer } from './layers.svelte'
import { layerStack, DEFAULT_PRESETS } from './mock/layers'

const L = (id: string, extra: Partial<Layer> = {}): Layer => ({ id, name: id, color: '#888', visible: true, locked: false, ...extra })
// A small model list in the R5 shape: background first, object layers (no group), then annotation layers.
const stack = (): Layer[] => [L('bg', { group: 'Background', visible: false }), L('walls'), L('desks'), L('anno', { group: 'General' }), L('data', { group: 'Outlets' })]

beforeEach(() => { layerUI.active = 'anno'; presetUI.active = 'p-hi' })

describe('R5 layer list helpers', () => {
	it('groups object layers under Model, in list order', () => {
		const ls = stack()
		expect(layerGroup(ls[1])).toBe('Model')
		expect(layerGroups(ls)).toEqual(['Background', 'Model', 'General', 'Outlets'])
	})
	it('unknown / missing layers are neither hidden nor locked', () => {
		const ls = stack()
		expect(isLayerHidden(ls, 'nope')).toBe(false)
		expect(isLayerHidden(ls, undefined)).toBe(false)
		expect(isLayerHidden(ls, 'bg')).toBe(true)
		ls[1].locked = true
		expect(isLayerLocked(ls, 'walls')).toBe(true)
		expect(layerOrder(ls, 'anno')).toBe(3)
		expect(layerOrder(ls, 'nope')).toBe(-1)
	})
	it('activeLayerIn falls back to Annotations, then the first non-background layer', () => {
		const ls = stack()
		layerUI.active = 'data'
		expect(activeLayerIn(ls)?.id).toBe('data')
		layerUI.active = 'elsewhere'   // active layer from another model
		expect(activeLayerIn(ls)?.id).toBe('anno')
		expect(activeLayerIn(ls.filter((l) => l.id !== 'anno'))?.id).toBe('walls')
	})
	it('a preset governs every non-background layer and ignores ids the model lacks', () => {
		const ls = stack()
		const p = savePreset(ls, 'walls only')
		p.visible = ['walls', 'not-in-this-model']
		applyPreset(ls, p.id)
		expect(ls.map((l) => l.visible)).toEqual([false, true, false, false, false])   // bg untouched (was off)
		expect(presetMatches(ls, p.id)).toBe(true)
		ls[2].visible = true
		expect(presetMatches(ls, p.id)).toBe(false)
		presets.splice(presets.indexOf(p), 1)
	})
	it('moveLayer reorders within the list (draw order)', () => {
		const ls = stack()
		moveLayer(ls, 'data', 'walls')
		expect(ls.map((l) => l.id)).toEqual(['bg', 'data', 'walls', 'desks', 'anno'])
		moveLayer(ls, 'bg', null)
		expect(ls.at(-1)!.id).toBe('bg')
	})
	it('addLayer files a Model layer without a group and makes it active; removeLayer re-resolves the active layer', () => {
		const ls = stack()
		const m = addLayer(ls, 'Model')
		expect(m.group).toBeUndefined()
		expect(layerUI.active).toBe(m.id)
		removeLayer(ls, m.id)
		expect(ls.some((l) => l.id === m.id)).toBe(false)
		expect(layerUI.active).toBe('anno')
	})
})

describe('mock layerStack', () => {
	it('puts Background first, the model object layers next, and starts un-modified under the first preset', () => {
		const ls = layerStack([L('walls'), L('trunks')])
		expect(ls[0].group).toBe('Background')
		const walls = ls.findIndex((l) => l.id === 'walls')
		expect(ls.slice(0, walls).every((l) => l.group === 'Background')).toBe(true)
		expect(ls.findIndex((l) => l.id === 'anno')).toBeGreaterThan(walls)
		expect(presetMatches(ls, DEFAULT_PRESETS[0].id)).toBe(true)
		expect(ls.find((l) => l.id === 'walls')!.visible).toBe(true)
	})
})
