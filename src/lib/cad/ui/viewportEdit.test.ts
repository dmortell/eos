// The wheel step of a viewport's scale (Pan / zoom content, Alt+wheel): about the cursor, one undo step per run.
import { describe, it, expect } from 'vitest'
import { EntityStore } from '../store/store'
import { Workspace } from '../app/workspace.svelte'
import { rescaleViewport } from './viewportEdit'
import { fromPaper } from '../views/sheet'
import type { CadProject } from '../app/project.svelte'
import type { Sheet } from '../domain/drawing'

const sheet = { type: 'sheet', id: 'SH', number: 'S1', title: 'T', order: 1, status: 'active', paper: { size: 'A3', orientation: 'landscape', marginMm: 5 },
	viewports: [{ id: 'V', view: { levelId: 'L', spec: { kind: 'riser' } }, rect: { x: 10, y: 10, w: 200, h: 100 }, scale: 100, centre: { x: 5000, y: -3000 } }] } as Sheet

describe('viewport wheel scale', () => {
	it('zooms about the cursor: the view point under it stays there (User 2026-10-21: it zoomed about the middle)', () => {
		const store = new EntityStore()
		store.load([sheet])
		const project = { store } as unknown as CadProject
		const at = { x: 40, y: 30 }                                     // paper mm, up and left of the window's middle
		const before = fromPaper(sheet.viewports[0])(at)
		expect(rescaleViewport(project, new Workspace(), sheet, 'V', 1, at)).toBe(true)
		const vp = (store.get('SH') as Sheet).viewports[0]
		expect(vp.scale).toBeGreaterThan(100)
		const after = fromPaper(vp)(at)
		expect(after.x).toBeCloseTo(before.x)
		expect(after.y).toBeCloseTo(before.y)
	})
})
