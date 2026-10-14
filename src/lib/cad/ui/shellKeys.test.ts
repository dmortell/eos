import { describe, it, expect } from 'vitest'
import { KEY_COMMANDS, shellKey } from './shellKeys'
import { SHORTCUTS, FKEYS, HOWTO } from './helpContent'

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

describe('AutoCAD zoom: Z, then E / W / P (Dave 2026-10-14)', () => {
	function shell() {
		const calls: string[] = [], said: string[] = []
		const canvas = { key: () => false, takesTyping: () => false, endNudge: () => {}, cancelZoomWindow: () => false,
			zoomExtents: () => calls.push('extents'), zoomWindow: () => calls.push('window'), zoomPrevious: () => (calls.push('previous'), false) }
		const c = { ...(ctx as object), ws: { selection: [], portSel: null, say: (m: string) => said.push(m) }, project: { store: { busy: false }, index: { get: () => undefined } }, canvas: () => canvas } as never
		;(globalThis as { document?: unknown }).document ??= { querySelector: () => null }
		return { press: (k: string, o: Partial<KeyboardEvent> = {}) => shellKey({ ...key(k, o), target: null, preventDefault: () => {} } as unknown as KeyboardEvent, c), calls, said }
	}
	it('Z asks which; the next key picks it; P with nothing to go back to says so', () => {
		const s = shell()
		s.press('z'); expect(s.said.at(-1)).toMatch(/^Zoom: E extents/)
		s.press('Shift')   // a modifier alone doesn't end the wait
		s.press('w'); s.press('z'); s.press('e'); s.press('z'); s.press('p')
		expect(s.calls).toEqual(['window', 'extents', 'previous'])
		expect(s.said.at(-1)).toMatch(/nothing to go back to/)
	})
	it('E / W / P without Z first do nothing; another key after Z ends the wait', () => {
		const s = shell()
		s.press('e'); s.press('z'); s.press('x'); s.press('w')
		expect(s.calls).toEqual([])
	})
})

describe('Help lists each key once', () => {
	it('no two rows of the keys list share a label (a duplicate throws in the Help dialog’s keyed list)', () => {
		const dup = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) !== i)
		expect(dup(SHORTCUTS.map(([a]) => a))).toEqual([])
		expect(dup(FKEYS.map(([k]) => k))).toEqual([])
		expect(dup(HOWTO.map((h) => h.q))).toEqual([])
	})
})
