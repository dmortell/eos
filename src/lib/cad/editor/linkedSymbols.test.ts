// Linked symbols: a double-click on an insert opens what it links to; a hover says so in a badge.
import { describe, it, expect } from 'vitest'
import { EntityStore } from '../store/store'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import { BUILTIN_BLOCKS } from '../domain/blocks'
import { SelectTool } from './selectTool'
import { spaceOf, PLAN } from '../views/space'
import { planDisplayList } from '../views/plan'
import type { ToolCtx } from './tools'
import type { Shape } from '../domain/shapes'
import type { Sheet } from '../domain/drawing'
import type { InsertLink } from '../domain/links'

const sheet: Sheet = { type: 'sheet', id: 'SH', number: 'A-101', title: 'Plan', order: 1, paper: { size: 'A3', orientation: 'landscape', marginMm: 5 }, viewports: [], status: 'active' }
const marker = (link?: InsertLink): Shape => ({ type: 'shape', id: 'M', levelId: 'L33', geom: { kind: 'insert', blockId: 'builtin:outlet-box', at: { x: 1000, y: 2000 }, ...(link ? { link } : {}) } }) as Shape

function harness(link?: InsertLink) {
	const store = new EntityStore()
	store.load([...demoProject(), sheet, marker(link)])
	let sel: string[] = []
	const opened: InsertLink[] = []
	const ctx = (): ToolCtx => {
		const index = new ProjectIndex(store.all())
		return {
			store, index, levelId: 'L33', opts: { z: 0, w: 100, h: 50 }, space: spaceOf(PLAN), work: { z: 0, depth: 0 }, tol: () => 10,
			prims: () => planDisplayList(index, 'L33', { scale: 100, blocks: (id) => BUILTIN_BLOCKS.find((b) => b.id === id) }),
			snap: (p) => ({ p, kind: 'none' }) as never, selection: sel, select: (ids) => { sel = ids }, setMarquee: () => {}, ask: () => {},
			openLink: (l) => { opened.push(l) },
		}
	}
	return { ctx, opened }
}
const at = (count: number) => ({ p: { x: 1000, y: 2000 }, shift: false, ctrl: false, alt: false, count })

describe('linked symbols', () => {
	it('a double-click on a marker with a link opens it; a single click or an unlinked marker does not', () => {
		const h = harness({ kind: 'sheet', sheetId: 'SH' }), t = new SelectTool()
		t.down(at(1), h.ctx()); t.up(at(1), h.ctx())
		expect(h.opened).toEqual([])
		t.down(at(2), h.ctx()); t.up(at(2), h.ctx())
		expect(h.opened).toEqual([{ kind: 'sheet', sheetId: 'SH' }])
		const bare = harness(), u = new SelectTool()
		u.down(at(2), bare.ctx()); u.up(at(2), bare.ctx())
		expect(bare.opened).toEqual([])
	})
	it('hovering a linked marker shows a badge naming the target; an unlinked one shows none', () => {
		const h = harness({ kind: 'url', url: 'https://example.com/specs' }), t = new SelectTool()
		t.hover(at(1), h.ctx())
		const badge = t.preview(h.ctx()).find((p) => p.k === 'text' && p.text.startsWith('↗'))
		expect(badge).toMatchObject({ text: expect.stringContaining('example.com/specs') })
		const bare = harness(), u = new SelectTool()
		u.hover(at(1), bare.ctx())
		expect(u.preview(bare.ctx()).some((p) => p.k === 'text' && p.text.startsWith('↗'))).toBe(false)
	})
})
