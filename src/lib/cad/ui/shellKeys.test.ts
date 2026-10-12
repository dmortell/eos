import { describe, it, expect } from 'vitest'
import { KEY_COMMANDS } from './shellKeys'
import { SHORTCUTS, FKEYS } from './helpContent'

const key = (key: string, o: Partial<KeyboardEvent> = {}) => ({ key, code: '', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...o }) as KeyboardEvent
const ctx = { ws: { selection: [], portSel: null }, project: { index: { get: () => undefined } }, flipFace: () => false } as never
const first = (e: KeyboardEvent) => KEY_COMMANDS.find((c) => c.when(e, ctx, e.key.toLowerCase(), e.ctrlKey || e.metaKey))?.label

describe('the keys (review R85 step 1: one list for the shell and Help)', () => {
	it('picks the command the old chain did', () => {
		expect(first(key('z', { ctrlKey: true }))).toBe('Undo')
		expect(first(key('z', { ctrlKey: true, shiftKey: true }))).toBe('Redo')
		expect(first(key(']', { ctrlKey: true }))).toMatch(/^Draw order/)
		expect(first(key('Home', { shiftKey: true }))).toBe('Zoom to the selection')
		expect(first(key('Home'))).toBe('Zoom to fit')
		expect(first(key('ArrowLeft'))).toBeUndefined()   // no selection: arrows don't nudge
		expect(first(key('Escape'))).toMatch(/^Cancel/)
	})
	it('Help lists every key command, function keys apart', () => {
		for (const c of KEY_COMMANDS) {
			const listed = c.group === 'Function keys' ? FKEYS.some(([k, l]) => k === c.keys && l === c.label) : SHORTCUTS.some(([l, k]) => l === c.label && k === c.keys)
			expect(listed, c.label).toBe(true)
		}
	})
})

describe('Help lists each key once', () => {
	it('no two rows of the keys list share a label (a duplicate throws in the Help dialog’s keyed list)', async () => {
		const { SHORTCUTS, FKEYS, HOWTO } = await import('./helpContent')
		const dup = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) !== i)
		expect(dup(SHORTCUTS.map(([a]) => a))).toEqual([])
		expect(dup(FKEYS.map(([k]) => k))).toEqual([])
		expect(dup(HOWTO.map((h) => h.q))).toEqual([])
	})
})
