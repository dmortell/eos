import { describe, it, expect } from 'vitest'
import { Workspace, type ShellActions } from './workspace.svelte'
import type { Level } from '../domain/types'
import type { Sheet } from '../domain/drawing'
import { enterViewport, leaveViewport } from '../ui/viewportEdit'

describe('each pane has its own level', () => {
	it('the open level is the active pane’s; setting it changes only that pane', () => {
		const ws = new Workspace()
		ws.paneLevels = ['2F', '3F']
		expect(ws.levelId).toBe('2F')
		ws.pane = 1
		expect(ws.levelId).toBe('3F')
		ws.levelId = '4F'   // the Navigator, Floors, Find … pick a level: the pane you're in
		expect(ws.paneLevels).toEqual(['2F', '4F'])
	})
	it('split: the new pane starts on the same level; unsplit keeps the active pane’s', () => {
		const ws = new Workspace()
		ws.paneLevels = ['2F', null]
		ws.setPaneCount(2)
		expect(ws.paneLevels).toEqual(['2F', '2F'])
		ws.pane = 1
		ws.levelId = '3F'
		ws.setPaneCount(1)
		expect(ws.pane).toBe(0)
		expect(ws.levelId).toBe('3F')
	})
})

describe('Pan / zoom content ends with its viewport (User 2026-10-20)', () => {
	const sheet = { type: 'sheet', id: 'SH', viewports: [{ id: 'V', view: { levelId: 'L', spec: { kind: 'plan' } } }, { id: 'W', view: { levelId: 'L', spec: { kind: 'plan' } } }] } as unknown as Sheet
	it('kept while the same viewport stays picked; off when it is unpicked, another is picked or the sheet is left', () => {
		const ws = new Workspace()
		ws.select(['SH']); ws.selectViewport('V'); ws.vpContentNav = true
		ws.selectViewport('V')
		expect(ws.vpContentNav).toBe(true)
		ws.selectViewport('W')
		expect(ws.vpContentNav).toBe(false)
		ws.vpContentNav = true; ws.selectViewport(null)
		expect(ws.vpContentNav).toBe(false)
		ws.selectViewport('V'); ws.vpContentNav = true; ws.select([])
		expect(ws.vpContentNav).toBe(false)
	})
	it('kept on entering the viewport; off on leaving it (a double-click outside, Esc)', () => {
		const ws = new Workspace()
		ws.select(['SH']); ws.selectViewport('V'); ws.vpContentNav = true
		enterViewport(ws, sheet, 'V')
		expect(ws.vpContentNav).toBe(true)
		leaveViewport(ws, sheet)
		expect(ws.vpContentNav).toBe(false)
		expect(ws.viewportId).toBe('V')   // leaving still picks the viewport
	})
})

describe('cord defaults (Review 2 Q35)', () => {
	it('come from the project on load — before the Cord tool is ever picked — and again when the project changes them; a choice in between stays', () => {
		const ws = new Workspace()
		ws.seedCordDefaults(undefined)   // settings not loaded yet
		expect(ws.cordDefaults).toEqual({ cableType: 'cat6a', colour: '#3b82f6' })
		ws.seedCordDefaults({ cordCableType: 'om4', cordColour: '#ff0000' })
		expect(ws.cordDefaults).toEqual({ cableType: 'om4', colour: '#ff0000' })
		ws.cordDefaults.colour = '#00ff00'   // picked in the cord bar: sticky
		ws.seedCordDefaults({ cordCableType: 'om4', cordColour: '#ff0000' })   // the same settings again (another edit)
		expect(ws.cordDefaults.colour).toBe('#00ff00')
		ws.seedCordDefaults({ cordCableType: 'cat6', cordColour: '#ff0000' })   // changed in Settings
		expect(ws.cordDefaults).toEqual({ cableType: 'cat6', colour: '#ff0000' })
	})
})

describe('tool sizes', () => {
	it('the Z / W / H typed for a tool come back when it is picked again (Z per level); untyped, the defaults', () => {
		const ws = new Workspace()
		const L2 = { id: '2F' } as Level, L3 = { id: '3F', heights: { clearHeightMm: 3000, plenumMm: 600 } } as Level
		ws.setTool('trunk', L2)
		const d = { ...ws.opts }
		expect(d).toMatchObject({ w: 100, h: 50 })
		ws.opts = { z: 2950, w: 200, h: 100 }   // typed in the tool bar
		ws.setTool('wall', L2)
		expect(ws.opts).toMatchObject({ z: 0, w: 100 })   // the wall's own defaults
		ws.opts = { ...ws.opts, w: 150 }
		ws.toolId = 'select'   // ended some other way (Esc in the canvas)
		ws.setTool('trunk', L2)
		expect(ws.opts).toEqual({ z: 2950, w: 200, h: 100 })
		ws.setTool('trunk', L3)   // another level: its own Z, the sizes kept
		expect(ws.opts).toEqual({ z: 3300, w: 200, h: 100 })
		ws.setTool('wall', L2)
		expect(ws.opts.w).toBe(150)
		ws.setTool('conduit', L2)
		expect(ws.opts).toMatchObject({ w: 25, h: 25 })   // not the trunk's
	})
})

describe('tool bars from the project defaults (Use as default)', () => {
	it('the Outlet, Dimension and Box tool bars take them once a session; a later Use as default applies at once', () => {
		const ws = new Workspace()
		let td: import('../domain/toolDefaults').ToolDefaults = { outlet: { usage: 'ap', mount: 'ceiling', ports: 1 }, dimension: { mode: 'vertical' }, box: { height: 720, kind: 'ellipse' } }
		ws.toolDefaults = () => td
		ws.setTool('outlet'); ws.setTool('dimension'); ws.setTool('box')
		expect(ws.outletNext).toMatchObject({ usage: 'ap', mount: 'ceiling', ports: 1 })
		expect(ws.dimMode).toBe('vertical')
		expect(ws.boxOpts).toMatchObject({ height: 720, kind: 'ellipse' })
		ws.dimMode = 'aligned'; ws.setTool('select'); ws.setTool('dimension')
		expect(ws.dimMode).toBe('aligned')   // what you changed this session stays
		td = { ...td, dimension: { mode: 'horizontal' } }
		ws.adoptDefaults(td, 'dimension')
		expect(ws.dimMode).toBe('horizontal')
	})
})

describe('the page’s actions (attachShell, hacky-code review #8)', () => {
	it('an action with no page attached says so; a page’s detach takes back only its own', () => {
		const ws = new Workspace(), noop = () => {}
		const page = (log: string[]): ShellActions => ({ remove: () => log.push('remove'), align: noop, viewportView: () => null, openTitleBlock: noop, releaseSheets: noop, openLog: () => log.push('log'),
			openSettings: noop, openWindow: noop, startRenumber: noop, restoreBackup: noop, selectSimilar: noop, openInTab: noop, openView: noop, openLevel: noop, applyLinks: noop })
		expect(() => ws.remove()).toThrow(/no page is attached/)
		expect(ws.viewportView()).toBeNull()   // a query: nothing, not an error
		const a: string[] = [], b: string[] = []
		const offA = ws.attachShell(page(a)), offB = ws.attachShell(page(b))
		offA()   // the old page goes after the new one came (a hot reload)
		ws.openLog()
		expect([a, b]).toEqual([[], ['log']])
		offB()
		expect(() => ws.openLog()).toThrow()
	})
})
