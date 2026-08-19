import { describe, it, expect } from 'vitest'
import { ElevationsEditor } from './editor.svelte'

function makeEditor() {
	const editor = new ElevationsEditor({})
	editor.racks = [{ id: 'r1', label: '4AR01' } as any]
	editor.devices = [
		{ id: 'sw', rackId: 'r1', type: 'switch', positionU: 41, portCount: 96 } as any,
		{ id: 'pnl', rackId: 'r1', type: 'panel', positionU: 38, portCount: 24 } as any,
	]
	editor.framesData = { portHolds: { 'sw:1': 'VLAN' } }
	return editor
}

describe('elevation patch mode respects port holds', () => {
	it('patchPortClick refuses to arm on a held port', () => {
		const editor = makeEditor()
		editor.patchPortClick('r1', 'sw', 1)
		expect(editor.patchArm).toBeNull()
		expect(editor.statusHint).toContain('held for VLAN')
	})

	it('patchPortClick refuses to complete onto a held port (stays armed)', () => {
		const editor = makeEditor()
		editor.patchPortClick('r1', 'pnl', 1)
		expect(editor.patchArm?.deviceId).toBe('pnl')
		editor.patchPortClick('r1', 'sw', 1)
		expect(editor.patchArm?.deviceId).toBe('pnl')
		expect(editor.statusHint).toContain('held for VLAN')
	})

	it('free ports still arm normally', () => {
		const editor = makeEditor()
		editor.patchPortClick('r1', 'sw', 2)
		expect(editor.patchArm?.deviceId).toBe('sw')
	})
})
