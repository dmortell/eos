// Drawing tabs (UX review D1): one list for both panes, a preview tab, history per tab.
import { describe, it, expect, vi } from 'vitest'
import { Tabs, viewKey, type TabView } from './tabs.svelte'

const plan = (levelId: string): TabView => ({ levelId, spec: { kind: 'plan' } })
const sheet = (sheetId: string): TabView => ({ levelId: 'L1', spec: { kind: 'sheet', sheetId } })
const yes = () => true

describe('drawing tabs', () => {
	it('a single-click open reuses the preview tab; a double-click keeps a tab; an open view is reused', () => {
		const t = new Tabs('p')
		t.ensure(0, plan('L1'))
		const a = t.open(0, sheet('S1'), 'preview', 0)
		const b = t.open(0, sheet('S2'), 'preview', 0)
		expect(b.id).toBe(a.id)                 // the preview tab, reused
		expect(t.list).toHaveLength(2)
		const c = t.open(0, sheet('S3'), 'keep', 0)
		expect(c.preview).toBeFalsy()
		expect(t.list).toHaveLength(3)
		expect(t.open(0, plan('L1'), 'preview', 0).id).toBe(t.list[0].id)   // already open: that tab
	})
	it('each tab has its own back / forward', () => {
		const t = new Tabs('p')
		t.ensure(0, plan('L1'))
		t.go(0, { levelId: 'L1', spec: { kind: 'elevation', dir: 'front' } })
		expect(t.nav(0, -1, yes)).toEqual(plan('L1'))
		expect(t.nav(0, 1, yes)?.spec).toEqual({ kind: 'elevation', dir: 'front' })
		expect(t.nav(0, 1, yes)).toBeNull()
	})
	it('closing a tab shows the one beside it; close others / to the right', () => {
		const t = new Tabs('p')
		t.ensure(0, plan('L1'))
		const s1 = t.open(0, sheet('S1'), 'keep', 0), s2 = t.open(0, sheet('S2'), 'keep', 0)
		t.close(s2.id)
		expect(t.paneTab[0]).toBe(s1.id)
		t.closeOthers(s1.id)
		expect(t.list.map((x) => viewKey(x.view))).toEqual([viewKey(sheet('S1'))])
	})
	it('two panes on two levels keep their own tabs and histories (2F plan beside 3F plan)', () => {
		const t = new Tabs('p')
		const a = t.ensure(0, plan('2F'))!, b = t.ensure(1, plan('3F'))!
		expect(b.id).not.toBe(a.id)
		// each pane synced with ITS level: neither tab moves (one shared level turned pane 2's 3F tab into 2F)
		t.sync(0, plan('2F')); t.sync(1, plan('3F'))
		expect(t.of(0)?.id).toBe(a.id)
		expect(t.of(1)?.view).toEqual(plan('3F'))
		t.go(1, { levelId: '3F', spec: { kind: 'elevation', dir: 'front' } })
		expect(t.nav(1, -1, yes)).toEqual(plan('3F'))
		expect(t.of(0)?.view).toEqual(plan('2F'))
	})
	it('the preview tab shown in the other pane is not taken over', () => {
		const t = new Tabs('p')
		t.ensure(0, plan('L1')); t.ensure(1, plan('L2'))
		const a = t.open(1, sheet('S1'), 'preview', 0)
		const b = t.open(0, sheet('S2'), 'preview', 0)
		expect(b.id).not.toBe(a.id)
	})
	it('switching a tab to a view another tab has open shows that tab — no duplicate (User); old duplicates merge on load', () => {
		const t = new Tabs('dup')
		t.ensure(0, plan('L1'))
		const s1 = t.open(0, sheet('S1'), 'keep', 0)
		const front: TabView = { levelId: 'L1', spec: { kind: 'elevation', dir: 'front' } }
		const fr = t.open(0, front, 'keep', 0)
		t.go(0, plan('L1'))                       // the Plan button in the front elevation's tab
		expect(t.list).toHaveLength(3)
		expect(t.of(0)?.view).toEqual(plan('L1'))
		expect(t.get(fr.id)?.view).toEqual(front)  // that tab is left as it was
		t.paneTab[0] = s1.id
		t.sync(0, front)                           // the pane shows the front elevation some other way
		expect([t.list.length, t.paneTab[0]]).toEqual([3, fr.id])
		// saved with a duplicate: loaded as one tab, the pane on the first
		const a = t.list[0], saved = JSON.stringify({ list: [...t.list, { ...a, id: 'DUP' }], paneTab: ['DUP', null] })
		vi.stubGlobal('localStorage', { getItem: () => saved, setItem: () => {} })
		const again = new Tabs('dup')
		vi.unstubAllGlobals()
		expect([again.list.length, again.paneTab[0]]).toEqual([3, a.id])
	})
	it('a plan whose level isn’t known yet never becomes a tab (it read "Plan (current level)" and wouldn’t open)', () => {
		const t = new Tabs('p')
		const noLevel: TabView = { spec: { kind: 'plan' } }
		t.ensure(0, noLevel)                       // cad opened before the levels loaded
		t.sync(0, noLevel)
		expect(t.list).toHaveLength(0)
		t.sync(0, plan('L1'))                      // the level arrives
		expect(t.list.map((x) => x.view)).toEqual([plan('L1')])
		t.go(0, noLevel)
		expect(t.list.map((x) => x.view)).toEqual([plan('L1')])
		// one saved before this fix is dropped on load, and a pane that showed it shows nothing (its level's tab follows)
		const saved = JSON.stringify({ list: [{ id: 'A', view: plan('L1') }, { id: 'B', view: noLevel }], paneTab: ['B', 'A'] })
		vi.stubGlobal('localStorage', { getItem: () => saved, setItem: () => {} })
		const again = new Tabs('orphan')
		vi.unstubAllGlobals()
		expect([again.list.map((x) => x.id), again.paneTab]).toEqual([['A'], [null, 'A']])
	})
	it('a dragged tab goes before / after another; the pane keeps showing its tab', () => {
		const t = new Tabs('p')
		t.ensure(0, plan('L1'))
		for (const s of ['S1', 'S2', 'S3']) t.open(0, sheet(s), 'keep', 0)
		const names = () => t.list.map((x) => (x.view.spec.kind === 'sheet' ? x.view.spec.sheetId : 'plan'))
		expect(names()).toEqual(['plan', 'S1', 'S2', 'S3'])
		const shown = t.paneTab[0], [p, s1, , s3] = t.list.map((x) => x.id)
		t.move(s3, p, false)
		expect(names()).toEqual(['S3', 'plan', 'S1', 'S2'])
		t.move(s3, s1, true)
		expect(names()).toEqual(['plan', 'S1', 'S3', 'S2'])
		expect(t.paneTab[0]).toBe(shown)
	})
})
