// Use as default (Dave 2026-10-15): what each kind of item saves for its tool, kept in the project's settings.
import { describe, it, expect } from 'vitest'
import { useAsDefault } from './toolDefaults'
import { defaultSettings } from './settings'
import type { Entity } from './drawing'

const shape = (x: object) => ({ type: 'shape', id: 'S', levelId: 'L', ...x }) as unknown as Entity
const path = { kind: 'path', nodes: [], segs: [] }

describe('Use as default', () => {
	it('a ladder: new trunks start that size and kind; a conduit its diameter; a wall its thickness', () => {
		const t = useAsDefault(shape({ geom: path, section: { w: 300, h: 100 }, role: { kind: 'containment', form: 'ladder', tier: 'high' } }))!
		expect(t.what).toBe('new trunks')
		expect(t.apply(defaultSettings()).toolDefaults).toEqual({ trunk: { w: 300, h: 100, form: 'ladder' } })
		const c = useAsDefault(shape({ geom: path, section: { w: 32, h: 32 }, role: { kind: 'containment', form: 'conduit', tier: 'low' } }))!
		expect(c.apply(t.apply(defaultSettings())).toolDefaults).toEqual({ trunk: { w: 300, h: 100, form: 'ladder' }, conduit: { w: 32 } })   // the others kept
		expect(useAsDefault(shape({ geom: path, section: { w: 150, h: 2700 }, role: { kind: 'wall', openings: [] } }))!.apply(defaultSettings()).toolDefaults).toEqual({ wall: { w: 150 } })
	})
	it('a box: its height and Z; a text: its size; a line: the project drawing style', () => {
		const box = useAsDefault(shape({ geom: { kind: 'rect', at: { x: 0, y: 0 }, size: { x: 1, y: 1 } }, extent: 720, plane: { kind: 'plan', z: 30 } }))!
		expect(box.apply(defaultSettings()).toolDefaults).toEqual({ box: { height: 720, z: 30 } })
		expect(useAsDefault(shape({ geom: { kind: 'text', at: { x: 0, y: 0 }, text: 'x', sizeMm: 3.5 } }))!.apply(defaultSettings()).toolDefaults).toEqual({ text: { sizeMm: 3.5 } })
		const line = useAsDefault(shape({ geom: path, style: { stroke: '#ff0000', dash: 'dashed' } }))!
		expect(line.apply(defaultSettings()).shapeStyle).toEqual({ color: '#ff0000', dash: 'dashed', weightMm: 0 })
	})
	it('nothing for an outlet (its tool bar carries on already) or a block', () => {
		expect(useAsDefault({ type: 'outlet', id: 'O' } as Entity)).toBeNull()
		expect(useAsDefault(shape({ geom: { kind: 'insert', blockId: 'b', at: { x: 0, y: 0 } } }))).toBeNull()
	})
})
