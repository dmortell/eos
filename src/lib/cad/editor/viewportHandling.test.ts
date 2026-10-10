// Viewport handling (backlog parts 4–6, Dave 2026-10-10): edges snap when dragged, arrow keys nudge, Fit picks the scale.
import { describe, it, expect } from 'vitest'
import { EntityStore } from '../store/store'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import type { Sheet, Viewport } from '../domain/drawing'
import { sheetDisplayList, fitViewport } from '../views/sheet'
import { snapViewportDrag, viewportSnapLines } from './dragParts'
import { Nudge } from './nudge'

const vp = (id: string, x: number, y: number, w: number, h: number, extra: Partial<Viewport> = {}): Viewport =>
	({ id, view: { levelId: 'L33', spec: { kind: 'plan' } }, rect: { x, y, w, h }, scale: 100, centre: { x: 0, y: 0 }, ...extra })
const sheet = (vps: Viewport[]): Sheet => ({ type: 'sheet', id: 'SH', number: 'S001', title: 'T', order: 1, paper: { size: 'A3', orientation: 'landscape', marginMm: 5 }, viewports: vps, status: 'active' })

describe('viewport handling', () => {
	const A = vp('A', 20, 20, 100, 80), B = vp('B', 150, 20, 100, 80)
	const ix = new ProjectIndex([...demoProject(), sheet([A, B])])
	const lines = viewportSnapLines(sheetDisplayList(ix, sheet([A, B])), 'A')
	it('snap lines: the paper, its margin and the OTHER viewports’ frames (not its own)', () => {
		expect(lines.xs).toEqual(expect.arrayContaining([0, 420, 5, 415, 150, 250]))
		expect(lines.xs).not.toContain(20)
	})
	it('a move lands an edge on a line within reach, else on the 5 mm grid', () => {
		expect(snapViewportDrag(A, 'move', { x: 28, y: 0 }, lines, 3)).toEqual({ x: 30, y: 0 })     // its right edge onto B's left (150)
		expect(snapViewportDrag(A, 'move', { x: -14, y: -13 }, lines, 2)).toEqual({ x: -15, y: -15 })   // onto the margin (5, 5)
		expect(snapViewportDrag(A, 'move', { x: 7, y: 11 }, lines, 1)).toEqual({ x: 5, y: 10 })        // nothing near: the grid
	})
	it('a corner resize snaps that corner’s edges only', () => {
		// the bottom-right corner dragged near B's left edge
		expect(snapViewportDrag(A, 'resize', { x: 28, y: 0 }, lines, 3, 2).x).toBe(30)
	})
	it('arrow keys move a picked viewport’s window — a burst is one undo step; a locked one stays', () => {
		const store = new EntityStore()
		store.load([...demoProject(), sheet([A, vp('L', 200, 150, 50, 50, { locked: true })])])
		const n = new Nudge()
		n.pressViewport(store, 'SH', 'A', { x: 1, y: 0 }); n.pressViewport(store, 'SH', 'A', { x: 1, y: 0 }); n.pressViewport(store, 'SH', 'A', { x: 0, y: 10 })
		n.end()
		expect((store.get('SH') as Sheet).viewports[0].rect).toMatchObject({ x: 22, y: 30 })
		expect(store.undoLabels).toEqual(['Nudge viewport'])
		expect(n.pressViewport(store, 'SH', 'L', { x: 1, y: 0 })).toMatch(/locked/)
	})
	it('Fit centres the view and picks the largest standard scale at which it fits the window', () => {
		const small = vp('S', 20, 20, 60, 40, { scale: 1, centre: { x: 99999, y: 0 } })
		const f = fitViewport(ix, small)
		expect(f.scale).toBeGreaterThan(1)
		expect(f.centre.x).not.toBe(99999)
		const roomy = fitViewport(ix, vp('R', 20, 20, 380, 260, { scale: 1 }))
		expect(roomy.scale).toBeLessThanOrEqual(f.scale)   // a bigger window: the same or a larger drawing (a smaller N)
		// an empty view keeps what it had
		expect(fitViewport(ix, vp('E', 0, 0, 50, 50, { view: { levelId: 'none', spec: { kind: 'plan' } }, scale: 50, centre: { x: 7, y: 8 } }))).toEqual({ scale: 50, centre: { x: 7, y: 8 } })
	})
})
