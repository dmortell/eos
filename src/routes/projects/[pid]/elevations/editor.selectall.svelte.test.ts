import { describe, it, expect } from 'vitest'
import { ElevationsEditor } from './editor.svelte'

describe('selectAllPanelPorts', () => {
	it('selects every panel port of the given racks — skipping non-panel devices', () => {
		const editor = new ElevationsEditor({})
		editor.racks = [
			{ id: 'r1', label: '4AR01' } as any,
			{ id: 'r2', label: '4AR02' } as any,
		]
		editor.devices = [
			{ id: 'p1', rackId: 'r1', type: 'panel', positionU: 38, portCount: 24 } as any,
			{ id: 'p2', rackId: 'r1', type: 'panel', positionU: 37, portCount: 48 } as any,
			{ id: 'sw', rackId: 'r1', type: 'switch', positionU: 41, portCount: 96 } as any,
			{ id: 'p3', rackId: 'r2', type: 'panel', positionU: 30, portCount: 24 } as any,
		]

		editor.selectAllPanelPorts(['r1'])
		// 24 + 48 panel ports; the 96p switch is skipped
		expect(editor.selectedPorts.size).toBe(72)
		expect(editor.isPortBlockSelected('r1', 38, 1)).toBe(true)
		expect(editor.isPortBlockSelected('r1', 37, 48)).toBe(true)
		expect(editor.isPortBlockSelected('r1', 41, 1)).toBe(false)
		expect(editor.isPortBlockSelected('r2', 30, 1)).toBe(false)

		// accumulates across racks (matches Select-all-per-panel semantics)
		editor.selectAllPanelPorts(['r2'])
		expect(editor.selectedPorts.size).toBe(96)
	})
})
