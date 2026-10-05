// Drawing tabs (UX review D1): one list for both panes, a preview tab, history per tab.
import { describe, it, expect } from 'vitest'
import { Tabs, viewKey, type TabView } from './tabs.svelte'

const plan = (levelId: string): TabView => ({ levelId, spec: { kind: 'plan' } })
const sheet = (sheetId: string): TabView => ({ levelId: 'L1', spec: { kind: 'sheet', sheetId } })
const yes = () => true

describe('drawing tabs', () => {
	it('a single-click open reuses the preview tab; a double-click keeps a tab; an open view is reused', () => {
		const t = new Tabs('p')
		t.ensure(0, plan('L1'))
		const a = t.open(0, sheet('S1'), false, 0)
		const b = t.open(0, sheet('S2'), false, 0)
		expect(b.id).toBe(a.id)                 // the preview tab, reused
		expect(t.list).toHaveLength(2)
		const c = t.open(0, sheet('S3'), true, 0)
		expect(c.preview).toBeFalsy()
		expect(t.list).toHaveLength(3)
		expect(t.open(0, plan('L1'), false, 0).id).toBe(t.list[0].id)   // already open: that tab
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
		const s1 = t.open(0, sheet('S1'), true, 0), s2 = t.open(0, sheet('S2'), true, 0)
		t.close(s2.id)
		expect(t.paneTab[0]).toBe(s1.id)
		t.closeOthers(s1.id)
		expect(t.list.map((x) => viewKey(x.view))).toEqual([viewKey(sheet('S1'))])
	})
	it('the preview tab shown in the other pane is not taken over', () => {
		const t = new Tabs('p')
		t.ensure(0, plan('L1')); t.ensure(1, plan('L2'))
		const a = t.open(1, sheet('S1'), false, 0)
		const b = t.open(0, sheet('S2'), false, 0)
		expect(b.id).not.toBe(a.id)
	})
})
