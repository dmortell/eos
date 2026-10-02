// Racks-tool libraries → global device templates (Phase 7).
import { describe, it, expect } from 'vitest'
import { templateFromLibrary, templatesFromLibraries } from './legacyTemplates'

describe('racks library → device templates', () => {
	it('maps kind, face, ports and size; "other" named shelf becomes a shelf', () => {
		expect(templateFromLibrary({ id: 'a', label: 'Network switch 2u 96p', type: 'switch', heightU: 2, portCount: 96, portType: null, widthMm: 445, depthMm: 200 }))
			.toEqual({ id: 'lib-a', name: 'Network switch 2u 96p', kind: 'switch', heightU: 2, portCount: 96, portType: 'RJ45', portNumbering: 'column', face: 'front', widthMm: 445, depthMm: 200 })
		expect(templateFromLibrary({ id: 'b', label: 'Patch Frame', type: 'panel', heightU: 2, portCount: 48 })).toMatchObject({ kind: 'panel', face: 'both', portType: 'RJ45' })
		expect(templateFromLibrary({ id: 'c', label: 'APC AR8841 PDU', type: 'pdu', heightU: 30, portCount: 1 })).toMatchObject({ kind: 'pdu', face: 'rear', heightU: 30 })
		expect(templateFromLibrary({ id: 'd', label: 'Shelf', type: 'other', heightU: 1, portCount: 0 })).toMatchObject({ kind: 'shelf' })
		expect(templateFromLibrary({ id: 'e', label: 'Blanking panel 1u', type: 'other', heightU: 1, portCount: 0 })).toMatchObject({ kind: 'other' })
		expect(templateFromLibrary({ id: 'e', label: 'Blanking panel 1u', type: 'other', heightU: 1, portCount: 0 })?.portType).toBeUndefined()
		expect(templateFromLibrary({ id: 'f', label: '', heightU: 1 })).toBeNull()
	})
	it('one template per distinct device across projects; ids already global are skipped', () => {
		const shelf = { label: 'Shelf', type: 'other', heightU: 1, portCount: 0 }
		const out = templatesFromLibraries([[{ id: 's1', ...shelf }], [{ id: 's2', ...shelf }, { id: 'x', label: 'Switch 10U', type: 'switch', heightU: 10 }]], ['lib-x'])
		expect(out.map((t) => t.id)).toEqual(['lib-s1'])
	})
})
