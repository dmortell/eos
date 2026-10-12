// EOS / ACAD input modes: what the wheel does, and how a press-drag becomes the clicks the tools take.
import { describe, it, expect } from 'vitest'
import { EntityStore } from '../store/store'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import { snapAt } from './snap'
import { PathTool } from './pathTool'
import { parseInputMode, wheelAction, type WheelLike } from './inputMode'
import { PressDrag, PressDragInput, PRESS_DRAG_TOOLS } from './pressDrag'
import type { ToolCtx, DrawOpts, PointerIn } from './tools'
import { spaceOf, PLAN } from '../views/space'
import type { Pt } from '../domain/types'

const wheel = (o: Partial<WheelLike> = {}): WheelLike => ({ deltaX: 0, deltaY: 100, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, ...o })

describe('the input mode', () => {
	it('is ACAD unless EOS was stored', () => {
		expect([parseInputMode(null), parseInputMode('acad'), parseInputMode('eos'), parseInputMode('x')]).toEqual(['acad', 'acad', 'eos', 'acad'])
	})
})

describe('the wheel', () => {
	it('ACAD: always zooms (wheel down zooms out)', () => {
		for (const o of [{}, { shiftKey: true }, { ctrlKey: true }]) {
			const a = wheelAction('acad', wheel(o))
			expect(a.kind).toBe('zoom')
			if (a.kind === 'zoom') expect(a.factor).toBeLessThan(1)
		}
	})
	it('EOS: the wheel pans — down shows what is below, so the drawing moves up', () => {
		expect(wheelAction('eos', wheel())).toEqual({ kind: 'pan', dx: -0, dy: -100 })
	})
	it('EOS: Shift+wheel pans sideways, whether or not the system swapped the axes', () => {
		expect(wheelAction('eos', wheel({ shiftKey: true }))).toEqual({ kind: 'pan', dx: -100, dy: -0 })
		expect(wheelAction('eos', wheel({ shiftKey: true, deltaX: 80, deltaY: 0 }))).toEqual({ kind: 'pan', dx: -80, dy: -0 })
	})
	it('EOS: Ctrl, Alt or Meta + wheel zooms; so does the wheel while the right button is held', () => {
		for (const o of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }]) expect(wheelAction('eos', wheel(o)).kind).toBe('zoom')
		expect(wheelAction('eos', wheel(), true).kind).toBe('zoom')
	})
	it('EOS: a mouse that reports lines pans by lines of about 16 px', () => {
		expect(wheelAction('eos', wheel({ deltaMode: 1, deltaY: 3 }))).toEqual({ kind: 'pan', dx: -0, dy: -48 })
	})
})

const s = (x: number, y: number): Pt => ({ x, y })
describe('press-drag → clicks', () => {
	it('not drawing yet: the press is the first click, the release after a drag is the second', () => {
		const pd = new PressDrag()
		expect(pd.down(s(10, 10), false)).toBe(true)
		pd.move(s(60, 10))
		expect(pd.up(s(100, 10))).toBe('release')
		expect(pd.pressing).toBe(false)
	})
	it('a plain click not drawing yet: only the press (the next click is the second point, as in ACAD)', () => {
		const pd = new PressDrag()
		expect(pd.down(s(10, 10), false)).toBe(true)
		expect(pd.up(s(11, 10))).toBe(null)
	})
	it('drawing already: a press-drag adds the segment at the release, a plain click clicks the press point', () => {
		const pd = new PressDrag()
		expect(pd.down(s(10, 10), true)).toBe(false)
		expect(pd.up(s(90, 40))).toBe('release')
		expect(pd.down(s(10, 10), true)).toBe(false)
		expect(pd.up(s(12, 11))).toBe('press')
	})
	it('a shaky hand is a click, not a drag (within the slop)', () => {
		const pd = new PressDrag(4)
		pd.down(s(0, 0), true); pd.move(s(2, 2))
		expect(pd.moved).toBe(false)
		pd.move(s(0, 9))
		expect(pd.moved).toBe(true)
	})
	it('a cancelled press delivers nothing', () => {
		const pd = new PressDrag()
		pd.down(s(0, 0), true); pd.cancel()
		expect(pd.up(s(90, 90))).toBe(null)
	})
	it('covers the click tools, not the shape tools (which draw on a press-drag themselves)', () => {
		for (const id of ['line', 'trunk', 'conduit', 'wall', 'dimension']) expect(PRESS_DRAG_TOOLS.has(id)).toBe(true)
		for (const id of ['shape', 'box', 'image', 'select']) expect(PRESS_DRAG_TOOLS.has(id)).toBe(false)
	})
	it('the release is never a double-click', () => {
		const got: PointerIn[] = []
		const d = new PressDragInput((e) => got.push(e))
		d.down({ p: s(0, 0), shift: false, ctrl: false, alt: false, count: 2 }, s(0, 0), false)
		d.up({ p: s(500, 0), shift: false, ctrl: false, alt: false, count: 2 }, s(50, 0))
		expect(got.map((e) => [e.p.x, e.count])).toEqual([[0, 2], [500, 1]])
	})
})

function harness() {
	const store = new EntityStore()
	store.load(demoProject())
	let sel: string[] = []
	const opts: DrawOpts = { z: 2900, w: 100, h: 50 }
	const ctx = (): ToolCtx => {
		const index = new ProjectIndex(store.all())
		return {
			store, index, levelId: 'L33', opts, prims: () => [], tol: () => 10,
			space: spaceOf(PLAN), work: { get z() { return opts.z }, depth: 0 },
			snap: (p, alt, skip) => snapAt(index, 'L33', p, 15, { skip, noGrid: alt }),
			selection: sel, select: (ids) => { sel = ids }, setMarquee: () => {}, ask: () => {},
		}
	}
	return { store, ctx }
}
const at = (x: number, y: number, count = 1): PointerIn => ({ p: { x, y }, shift: false, ctrl: false, alt: false, count })

describe('press-drag drawing a run, through the real path tool', () => {
	// the same wiring as ViewCanvas: the sink gives the tool a click (down, then up)
	function rig() {
		const h = harness(), tool = new PathTool('line')
		const d = new PressDragInput((e) => { tool.down(e, h.ctx()); tool.up() })
		/** one press-drag from a to b (view mm == screen px / 10 here: screen points are the mm / 10) */
		const drag = (a: Pt, b: Pt) => {
			const carry = tool.pts.length > 0
			d.down(at(a.x, a.y), s(a.x / 10, a.y / 10), carry)
			d.move(s(b.x / 10, b.y / 10))
			d.up(at(b.x, b.y), s(b.x / 10, b.y / 10))
		}
		return { h, tool, d, drag }
	}
	it('press at the first point, drag, release at the second: a segment', () => {
		const { tool, drag } = rig()
		drag(s(0, 0), s(1000, 0))
		expect(tool.pts.map((p) => [p.x, p.y])).toEqual([[0, 0], [1000, 0]])
	})
	it('each further press-drag from the last point adds one segment; Enter finishes', () => {
		const { h, tool, drag } = rig()
		drag(s(0, 0), s(1000, 0))
		drag(s(1000, 0), s(1000, 2000))
		drag(s(1000, 2000), s(3000, 2000))
		expect(tool.pts.map((p) => [p.x, p.y])).toEqual([[0, 0], [1000, 0], [1000, 2000], [3000, 2000]])
		const before = h.store.all().length
		expect(tool.key({ key: 'Enter' } as KeyboardEvent, h.ctx())).toBe(true)
		expect(h.store.all().length).toBe(before + 1)
	})
	it('a plain click still works: click, click', () => {
		const { tool, drag } = rig()
		drag(s(0, 0), s(0, 0))
		drag(s(2000, 0), s(2000, 0))
		expect(tool.pts.map((p) => [p.x, p.y])).toEqual([[0, 0], [2000, 0]])
	})
})
