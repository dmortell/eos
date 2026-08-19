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

/** L04 field-test fixture: 3×24p panels, 12 six-port locations (4/panel),
 *  2×96p switches. Locations 1-4 on p38 (ports 1-6 / 7-12 / 13-18 / 19-24),
 *  5-8 on p37, 9-12 on p36. */
function makeFloorEditor() {
	const db = { saveFields: vi.fn(), save: vi.fn() } as any
	const editor = new BenchEditor(db)
	editor.pid = 'p1'
	editor.floor = 4
	editor.syncRoom('A', {
		racks: [{ id: 'r1', label: '4AR01', heightU: 42, serverRoom: 'A' }],
		devices: [
			{ id: 'sw41', rackId: 'r1', label: 'Arista U41', positionU: 41, portCount: 96, type: 'switch' },
			{ id: 'sw39', rackId: 'r1', label: 'Arista U39', positionU: 39, portCount: 96, type: 'switch' },
			{ id: 'p38', rackId: 'r1', label: 'Panel U38', positionU: 38, portCount: 24, type: 'panel' },
			{ id: 'p37', rackId: 'r1', label: 'Panel U37', positionU: 37, portCount: 24, type: 'panel' },
			{ id: 'p36', rackId: 'r1', label: 'Panel U36', positionU: 36, portCount: 24, type: 'panel' },
		],
	})
	const bakedLabels: Record<string, any> = {}
	const panels = ['p38', 'p37', 'p36']
	for (let loc = 1; loc <= 12; loc++) {
		const panel = panels[Math.floor((loc - 1) / 4)]
		const base = ((loc - 1) % 4) * 6
		for (let lp = 1; lp <= 6; lp++) {
			bakedLabels[`${panel}:${base + lp}`] = {
				label: `4A${String(loc).padStart(3, '0')}-${String(lp).padStart(2, '0')}`,
				locationId: `LA${loc}`,
				port: lp,
			}
		}
	}
	editor.syncFrames({ id: 'p1_F04', bakedLabels })
	return { editor, db }
}

const RULE = { panelIds: ['p38', 'p37', 'p36'], switchIds: ['sw41', 'sw39'], portsPerLocation: 2, leftStart: 2, rightStart: 14, offsetRightSide: true }

describe('buildRulePairs (patch by rule)', () => {
	it('reproduces the true-checkerboard mapping of the L04 field test', () => {
		const { editor } = makeFloorEditor()
		const { srcs, dsts, issues } = editor.buildRulePairs(RULE)
		expect(issues).toEqual([])
		expect(srcs).toHaveLength(24)
		const pairs = srcs.map((s, i) => `${s}->${dsts[i]}`)
		expect(pairs).toEqual(expect.arrayContaining([
			// U41 ← locations 1,5,9 (left) + 4,8,12 (right)
			'p38:1->sw41:2', 'p38:2->sw41:3', 'p37:1->sw41:4', 'p37:2->sw41:5', 'p36:1->sw41:6', 'p36:2->sw41:7',
			'p38:19->sw41:14', 'p38:20->sw41:15', 'p37:19->sw41:16', 'p37:20->sw41:17', 'p36:19->sw41:18', 'p36:20->sw41:19',
			// U39 ← locations 2,6,10 (left) + 3,7,11 (right)
			'p38:7->sw39:2', 'p38:8->sw39:3', 'p37:7->sw39:4', 'p37:8->sw39:5', 'p36:7->sw39:6', 'p36:8->sw39:7',
			'p38:13->sw39:14', 'p38:14->sw39:15', 'p37:13->sw39:16', 'p37:14->sw39:17', 'p36:13->sw39:18', 'p36:14->sw39:19',
		]))
	})

	it('skips held destination ports (VLAN holds shift the cursor)', () => {
		const { editor } = makeFloorEditor()
		editor.stickyHoldLabel = 'VLAN'
		editor.toggleHold('sw41', 2)
		const { srcs, dsts, issues } = editor.buildRulePairs(RULE)
		expect(issues).toEqual([])
		const i = srcs.indexOf('p38:1')
		expect(dsts[i]).toBe('sw41:3') // 2 is held → next free
	})

	it('skips locations whose source ports are already patched, with an issue', () => {
		const { editor } = makeFloorEditor()
		editor.portClick('r1', 'p38', 1)
		editor.portClick('r1', 'sw41', 30) // cord on loc 1's first port
		const { srcs, issues } = editor.buildRulePairs(RULE)
		expect(srcs).toHaveLength(22)
		expect(issues.some(s => s.includes('already patched'))).toBe(true)
	})

	it('applyRule feeds the existing bulk preview', () => {
		const { editor } = makeFloorEditor()
		const pairs = editor.buildRulePairs(RULE)
		editor.applyRule(pairs)
		expect(editor.bulkPreviewOpen).toBe(true)
		expect(editor.bulkPairs).toHaveLength(24)
		expect(editor.bulkPairs.every(p => !p.crossRoom)).toBe(true)
		editor.createBulk()
		expect(editor.connections).toHaveLength(24)
	})
})

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
