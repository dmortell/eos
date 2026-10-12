// A copy, a cut and a paste of cad items through the real store, and the Ctrl+Shift+V window (Review 2 Q62).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { clipboardEvents } from './clipboardEvents'
import { EntityStore } from '../store/store'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import type { Entity } from '../domain/drawing'
import type { CadProject } from './project.svelte'
import type { Workspace } from './workspace.svelte'

const L34 = { type: 'level', id: 'L34', buildingId: 'B', number: 34, name: '34F', order: 34, elevationMm: 136000 } as Entity
type Pos = { x: number; y: number }

function app(opts: { target?: { kind: 'level' | 'sheet' | 'rack'; id: string } | null; cursor?: Pos | null } = {}) {
	const store = new EntityStore()
	store.transact('seed', (tx) => { for (const e of [...demoProject(), L34]) tx.put(e) })
	store.clearHistory()
	const said: string[] = []
	const ws = { selection: [] as string[], say: (t: string) => said.push(t), select(ids: string[]) { this.selection = ids } } as unknown as Workspace & { selection: string[]; select(ids: string[]): void }
	const project = { pid: 'P', store, get index() { return new ProjectIndex(store.all()) } } as unknown as CadProject
	const target = opts.target === undefined ? { kind: 'level' as const, id: 'L34' } : opts.target
	const cb = clipboardEvents({ project, ws, target: () => target, inRow: () => false, cursor: () => opts.cursor ?? null, dialogOpen: () => false })
	return { store, ws, said, cb }
}
const copyEvent = () => {
	let text = '', prevented = false
	const e = { target: null, clipboardData: { setData: (_t: string, v: string) => { text = v } }, preventDefault: () => { prevented = true } } as unknown as ClipboardEvent
	return { e, text: () => text, prevented: () => prevented }
}
const pasteEvent = (text: string) => ({ target: null, clipboardData: { getData: () => text, files: [] }, preventDefault: () => {} }) as unknown as ClipboardEvent
const outletsOn = (store: EntityStore, levelId: string) => store.ofType('outlet').filter((o) => o.levelId === levelId)
const keyV = (shiftKey: boolean) => ({ ctrlKey: true, metaKey: false, shiftKey, key: shiftKey ? 'V' : 'v' }) as KeyboardEvent
const posOf = (store: EntityStore, id: string): Pos | undefined => (store.get(id) as unknown as { at?: Pos; pos?: Pos }).at ?? (store.get(id) as unknown as { pos?: Pos }).pos

describe('copy, cut and paste of cad items', () => {
	beforeEach(() => { vi.stubGlobal('window', { getSelection: () => null }) })   // no page text selected
	afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
	it('copy puts the selection on the clipboard as text and changes nothing', () => {
		const a = app(); a.ws.select(['O1'])
		const ev = copyEvent()
		a.cb.copy(ev.e)
		expect(ev.prevented()).toBe(true)
		expect(JSON.parse(ev.text()).items.map((x: { id: string }) => x.id)).toEqual(['O1'])
		expect(a.store.has('O1')).toBe(true)
		expect(a.said.at(-1)).toMatch(/Copied 1 item/)
	})
	it('copy with nothing selected is left to the browser', () => {
		const a = app(); const ev = copyEvent()
		a.cb.copy(ev.e)
		expect(ev.prevented()).toBe(false)
	})
	it('paste onto another level: new ids, same labels, selected, ONE undo step that removes them', () => {
		const a = app(); a.ws.select(['O1'])
		const c = copyEvent(); a.cb.copy(c.e)
		const before = a.store.all().length
		a.cb.paste(pasteEvent(c.text()))
		expect(a.store.all().length).toBe(before + 1)
		const pasted = outletsOn(a.store, 'L34')
		expect(pasted).toHaveLength(1)
		expect(pasted[0].id).not.toBe('O1')
		expect(pasted[0].label).toBe((a.store.get('O1') as { label: string }).label)
		expect(a.ws.selection).toEqual([pasted[0].id])
		a.store.undo()
		expect(a.store.all().length).toBe(before)
	})
	it('cut removes the items without asking; Ctrl+V brings them back with new ids; two undos restore the original', () => {
		const a = app(); a.ws.select(['O1'])
		const c = copyEvent(); a.cb.cut(c.e)
		expect(a.store.has('O1')).toBe(false)
		expect(a.ws.selection).toEqual([])
		expect(a.said.at(-1)).toMatch(/^Cut 1 item/)
		a.cb.paste(pasteEvent(c.text()))
		expect(outletsOn(a.store, 'L34')).toHaveLength(1)
		a.store.undo()                     // the paste
		a.store.undo()                     // the cut: O1 is back
		expect(a.store.has('O1')).toBe(true)
	})
	it('a paste with no pane to paste into says so and writes nothing', () => {
		const a = app({ target: null }); a.ws.select(['O1'])
		const c = copyEvent(); a.cb.copy(c.e)
		const n = a.store.all().length
		expect(a.cb.pasteText(c.text())).toBe(true)
		expect(a.store.all().length).toBe(n)
		expect(a.said.at(-1)).toMatch(/Paste into a plan/)
	})
	it('pasteText answers false for text that is not a clip', () => {
		expect(app().cb.pasteText('just words')).toBe(false)
	})
	it('Ctrl+Shift+V lands the middle of the copy on the cursor; plain paste keeps the place', () => {
		const a = app({ cursor: { x: 50_000, y: 50_000 } }); a.ws.select(['O1'])
		const c = copyEvent(); a.cb.copy(c.e)
		a.cb.key(keyV(true))
		a.cb.pasteText(c.text())
		const moved = outletsOn(a.store, 'L34')[0]
		expect(posOf(a.store, moved.id)).toEqual({ x: 50_000, y: 50_000 })
		expect(posOf(a.store, 'O1')).not.toEqual({ x: 50_000, y: 50_000 })
	})
	it('the Ctrl+Shift+V window lasts one second and one paste, and a plain Ctrl+V key cancels it', () => {
		vi.useFakeTimers(); vi.setSystemTime(1_000_000)
		const a = app({ cursor: { x: 50_000, y: 50_000 } }); a.ws.select(['O1'])
		const c = copyEvent(); a.cb.copy(c.e)
		const known = new Set<string>()
		const newest = () => { const o = outletsOn(a.store, 'L34').find((x) => !known.has(x.id))!; known.add(o.id); return o }
		// too late: pasted in place, not at the cursor
		a.cb.key(keyV(true)); vi.setSystemTime(1_002_000)
		a.cb.pasteText(c.text())
		expect(posOf(a.store, newest().id)).toEqual(posOf(a.store, 'O1'))
		// Shift then a plain Ctrl+V: in place
		a.cb.key(keyV(true)); a.cb.key(keyV(false))
		a.cb.pasteText(c.text())
		expect(posOf(a.store, newest().id)).toEqual(posOf(a.store, 'O1'))
		// used up by one paste: the second is in place again
		a.cb.key(keyV(true))
		a.cb.pasteText(c.text())
		expect(posOf(a.store, newest().id)).toEqual({ x: 50_000, y: 50_000 })
		a.cb.pasteText(c.text())
		expect(posOf(a.store, newest().id)).toEqual(posOf(a.store, 'O1'))
	})
	it('without a cursor Ctrl+Shift+V pastes in place and says to point first', () => {
		const a = app({ cursor: null }); a.ws.select(['O1'])
		const c = copyEvent(); a.cb.copy(c.e)
		a.cb.key(keyV(true))
		a.cb.pasteText(c.text())
		expect(a.said.some((m) => /Point at where it goes/.test(m))).toBe(true)
		expect(outletsOn(a.store, 'L34')).toHaveLength(1)
	})
})
