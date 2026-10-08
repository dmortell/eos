import { describe, it, expect } from 'vitest'
import { restorePlan, restoreSummary, canRestore } from './restorePlan'
import { demoProject } from './fixtures'
import type { Entity } from './drawing'
import type { Level, Outlet, Link, Rack } from './types'

const heights = { slabMm: 200, raisedFloorMm: 300, clearHeightMm: 2700, plenumMm: 800 }
/** demoProject (L33: rack R1, panel P1, outlets O1 / O2) plus a second area plan L3307 with outlet O9 on P1 port 9. */
function project(): Entity[] {
	const l3307: Level = { type: 'level', id: 'L3307', buildingId: 'B', number: 33, name: '33F 3307', order: 33.5, elevationMm: 132000, heights, area: '3307' }
	const o9: Outlet = { type: 'outlet', id: 'O9', levelId: 'L3307', label: '33-901', tier: 'low', usage: 'desk', mount: 'floor', ports: [{ port: 1, label: '33-901.A', cableType: 'cat6a' }] }
	const k9: Link = { type: 'link', id: 'K9', kind: 'horizontal', a: { on: 'P1', port: 9, face: 'rear' }, b: { on: 'O9', port: 1 }, status: 'design' }
	return [...demoProject(), l3307, o9, k9]
}
const edit = (all: Entity[], id: string, f: (e: Entity) => Entity | null): Entity[] =>
	all.flatMap((e) => (e.id !== id ? [e] : f(e) ?? []))

describe('restore plan', () => {
	it('an unchanged project changes nothing', () => {
		const p = project()
		const plan = restorePlan(p, p, ['L33'])
		expect(plan.put).toEqual([])
		expect(plan.del).toEqual([])
		expect(restoreSummary(plan, p, ['L33']).line).toBe('33F: nothing to change')
	})
	it('a moved outlet goes back, a new rack goes, a deleted cord comes back', () => {
		const backup = project()
		let live = edit(backup, 'O1', (e) => ({ ...(e as Outlet), at: { x: 9999, y: 1 } }))
		live = edit(live, 'C1', () => null)
		const r2: Rack = { type: 'rack', id: 'R2', levelId: 'L33', spaceId: 'SR-A', order: 1, name: 'A02', kind: 'cabinet', heightU: 42, widthMm: 600, depthMm: 1000 }
		live = [...live, r2]
		const plan = restorePlan(live, backup, ['L33'])
		expect(plan.put.map((e) => e.id).sort()).toEqual(['C1', 'O1'])
		expect(plan.del).toEqual(['R2'])
		expect(plan.counts).toEqual({ changed: 1, added: 1, removed: 1, skipped: 0 })
	})
	it("doesn't touch another model", () => {
		const backup = project()
		const live = edit(backup, 'O9', (e) => ({ ...(e as Outlet), label: '33-999' }))
		expect(restorePlan(live, backup, ['L33']).put).toEqual([])
	})
	it('a crossing link comes back only into a free port', () => {
		const backup = project()
		// since the backup: K9 was deleted and P1 port 9 now serves O1 port 1 instead
		let live = edit(backup, 'K9', () => null)
		live = edit(live, 'K1', (e) => ({ ...(e as Link), a: { on: 'P1', port: 9, face: 'rear' } }))
		const plan = restorePlan(live, backup, ['L3307'])
		expect(plan.put).toEqual([])
		expect(plan.skipped).toEqual([{ id: 'K9', why: 'the port at its other end is in use' }])
		expect(restoreSummary(plan, backup, ['L3307']).skipped).toEqual(['Link Panel 1:9 – 33-901:1: the port at its other end is in use'])
		// restoring both models puts K1 back on port 1, so K9 has its port again
		expect(restorePlan(live, backup, ['L33', 'L3307']).put.map((e) => e.id).sort()).toEqual(['K1', 'K9'])
	})
	it('a crossing link to a gone panel is skipped; a live one made since is removed', () => {
		const backup = project()
		const live = edit(backup, 'K9', (e) => ({ ...(e as Link), id: 'K9b' }))
		const plan = restorePlan(edit(live, 'P1', () => null), backup, ['L3307'])
		expect(plan.skipped).toEqual([{ id: 'K9', why: 'the device at its other end is gone' }])
		expect(plan.del).toEqual(['K9b'])
	})
	it('the whole project keeps issues and sheet revisions as they are', () => {
		const sheet = { type: 'sheet' as const, id: 'S1', number: '001', title: 'Plan', order: 0, paper: { size: 'A1' as const, orientation: 'landscape' as const, marginMm: 10 }, viewports: [], status: 'active' as const }
		const backup = [...project(), sheet]
		const issue = { type: 'issue' as const, id: 'I1', name: 'Tender', purpose: 'For tender', date: '2026-10-08', sheets: [] }
		const live = [...edit(backup, 'S1', () => ({ ...sheet, title: 'Changed', revisions: [{ code: 'A', date: '2026-10-08' }] })), issue]
		const plan = restorePlan(live, backup, 'all')
		expect(plan.del).toEqual([])
		expect(plan.put).toEqual([{ ...sheet, revisions: [{ code: 'A', date: '2026-10-08' }] }])
	})
	it('only the owner restores, or anyone when there is no owner', () => {
		expect(canRestore('u1', 'u1')).toBe(true)
		expect(canRestore('u1', 'u2')).toBe(false)
		expect(canRestore(undefined, 'u2')).toBe(true)
		expect(canRestore('u1', undefined)).toBe(false)
	})
})
