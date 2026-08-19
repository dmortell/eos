import { describe, it, expect, vi } from 'vitest'
import { BenchEditor } from './bench.svelte'

function makeEditor() {
	const saveFields = vi.fn()
	const db = { saveFields, save: vi.fn() } as any
	const editor = new BenchEditor(db)
	editor.pid = 'p1'
	editor.floor = 4
	editor.syncRoom('A', {
		racks: [{ id: 'r1', label: '4AR01', heightU: 42, serverRoom: 'A' }],
		devices: [
			{ id: 'sw1', rackId: 'r1', label: 'Switch', positionU: 41, portCount: 96, type: 'switch' },
			{ id: 'pnl', rackId: 'r1', label: 'Panel', positionU: 38, portCount: 24, type: 'panel' },
		],
	})
	editor.syncFrames({ id: 'p1_F04' })
	return { editor, saveFields }
}

describe('BenchEditor port holds', () => {
	it('toggleHold sets a hold, persists only portHolds, and is undoable', async () => {
		const { editor, saveFields } = makeEditor()
		editor.stickyHoldLabel = 'VLAN'
		editor.toggleHold('sw1', 1)

		expect(editor.holdOf('sw1', 1)).toBe('VLAN')
		expect(saveFields).toHaveBeenCalledWith('frames', { id: 'p1_F04', portHolds: { 'sw1:1': 'VLAN' } })

		await editor.history.undo()
		expect(editor.holdOf('sw1', 1)).toBeUndefined()
		expect(saveFields).toHaveBeenLastCalledWith('frames', { id: 'p1_F04', portHolds: {} })

		await editor.history.redo()
		expect(editor.holdOf('sw1', 1)).toBe('VLAN')
	})

	it('toggleHold on a held port releases it (keeps its original label semantics)', () => {
		const { editor } = makeEditor()
		editor.toggleHold('sw1', 12)
		expect(editor.holdOf('sw1', 12)).toBeTruthy()
		editor.toggleHold('sw1', 12)
		expect(editor.holdOf('sw1', 12)).toBeUndefined()
	})

	it('portClick refuses to arm or complete on a held port', () => {
		const { editor } = makeEditor()
		editor.toggleHold('sw1', 24)
		editor.statusHint = null

		editor.portClick('r1', 'sw1', 24)
		expect(editor.patchArm).toBeNull()
		expect(editor.statusHint).toContain('held')

		// armed elsewhere → completing onto the held port is refused too
		editor.portClick('r1', 'pnl', 1)
		expect(editor.patchArm?.deviceId).toBe('pnl')
		editor.portClick('r1', 'sw1', 24)
		expect(editor.patchArm?.deviceId).toBe('pnl') // still armed, nothing created
		expect(editor.connections).toHaveLength(0)
	})

	it('bulkToggle skips held ports', () => {
		const { editor } = makeEditor()
		editor.toggleHold('sw1', 13)
		editor.bulkToggle('sw1', 13)
		expect(editor.bulkSel).toHaveLength(0)
		expect(editor.statusHint).toContain('skipped')
	})

	it('free-only filter excludes held ports', () => {
		const { editor } = makeEditor()
		editor.filter = { q: '', types: [], freeOnly: true }
		expect(editor.portMatches('sw1', 2)).toBe(true)
		editor.toggleHold('sw1', 2)
		expect(editor.portMatches('sw1', 2)).toBe(false)
	})

	it('patched ports cannot be held', () => {
		const { editor } = makeEditor()
		editor.portClick('r1', 'pnl', 1)
		editor.portClick('r1', 'sw1', 5) // completes a cord pnl:1 ↔ sw1:5
		expect(editor.connections).toHaveLength(1)
		editor.toggleHold('sw1', 5)
		expect(editor.holdOf('sw1', 5)).toBeUndefined()
		expect(editor.statusHint).toContain('patched')
	})
})
