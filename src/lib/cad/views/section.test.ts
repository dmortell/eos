// Sections: the frame looks to the cut line's left; only what's within the depth and the line's length shows; walls
// the line crosses are drawn cut (with a gap at an opening; slab to slab when set); the plan shows the marks.
import { describe, it, expect } from 'vitest'
import { ProjectIndex } from '../domain/project'
import { sectionFrame, sectionDisplayList, sectionMarks } from './section'
import { planDisplayList } from './plan'
import { makeWall } from '../domain/make'
import { makeOpening } from '../domain/openings'
import { nextSectionName } from '../editor/sectionTool'
import type { Entity, SectionCut } from '../domain/drawing'

const level = { type: 'level', id: 'L1', name: '1F', number: 1, order: 1, elevationMm: 0, heights: { slabMm: 200, raisedFloorMm: 300, clearHeightMm: 2600, plenumMm: 700 } }
const rack = (id: string, x: number, y: number) => ({ type: 'rack', id, levelId: 'L1', spaceId: 'S', order: 1, name: id, kind: '4-post', heightU: 42, widthMm: 600, depthMm: 1000, at: { x, y } })
// a section drawn left → right at y = 0: it looks UP the sheet (−y), 3 m deep
const sec: SectionCut = { type: 'section', id: 'X', levelId: 'L1', name: 'A', a: { x: 0, y: 0 }, b: { x: 5000, y: 0 }, depth: 3000 }

describe('sections', () => {
	it('looks to the left of a → b as drawn; flip looks the other way', () => {
		expect(sectionFrame(sec).f.n).toEqual({ x: -0, y: 1 })   // the viewer's side is +y: it looks towards −y
		expect(sectionFrame({ ...sec, flip: true }).f.o).toEqual({ x: 5000, y: 0 })
	})
	it('shows only what lies within its depth and between the line\'s ends', () => {
		const ix = new ProjectIndex([level, rack('IN', 2000, -1500), rack('BEHIND', 2000, 1500), rack('TOO_FAR', 2000, -5000), rack('ASIDE', 9000, -1500)] as Entity[])
		const srcs = new Set(sectionDisplayList(ix, sec, { scale: 100 }).map((p) => p.src))
		expect([...srcs].filter((s) => s && s !== undefined)).toEqual(['IN'])
	})
	it('a wall the line crosses is drawn cut: full height, with a gap at a door; slab to slab when set', () => {
		const w = makeWall('L1', [{ x: 2500, y: 1000 }, { x: 2500, y: -2000 }], 100, 2600)
		const seg = w.geom.kind === 'path' ? w.geom.segs[0].id : ''
		const wall = { ...w, id: 'W', role: { kind: 'wall', openings: [makeOpening(seg, 1000, { width: 900, z: 0, h: 2100 })] } }   // door centred on the cut (1000 mm from a)
		const cuts = (e: Entity) => sectionDisplayList(new ProjectIndex([level, e] as Entity[]), sec, { scale: 100 }).filter((p) => p.k === 'line' && p.cls === 'cut')
		const ys = (p: ReturnType<typeof cuts>[number]) => (p.k === 'line' ? [Math.min(...p.pts.map((q) => q.y)), Math.max(...p.pts.map((q) => q.y))].map((v) => v || 0) : [])
		expect(cuts(wall as Entity).map(ys)).toEqual([[-2600, -2100]])                    // only above the door
		expect(cuts({ ...wall, role: { kind: 'wall', openings: [] } } as Entity).map(ys)).toEqual([[-2600, 0]])
		expect(cuts({ ...wall, role: { kind: 'wall', openings: [], slabToSlab: true } } as Entity).map(ys)).toEqual([[-3300, 300]])   // slab (−300) to slab above (3300)
		const c = cuts({ ...wall, role: { kind: 'wall', openings: [] } } as Entity)[0]
		expect(c.k === 'line' && [Math.min(...c.pts.map((q) => q.x)), Math.max(...c.pts.map((q) => q.x))]).toEqual([2450, 2550])   // 100 thick at u 2500
	})
	it('the plan shows the cut line, an arrow at each end looking its way, and the name twice', () => {
		const m = sectionMarks(sec, 100)
		expect(m.map((p) => p.k === 'image' ? '' : p.cls)).toEqual(['section-line', 'section-arrow', 'section-arrow', 'section-label', 'section-label'])
		const arrow = m[1]
		expect(arrow.k === 'line' && Math.min(...arrow.pts.map((q) => q.y))).toBe(-400)   // the tip points up the sheet (−y)
		const ix = new ProjectIndex([level, sec] as Entity[])
		expect(planDisplayList(ix, 'L1', { scale: 100 }).filter((p) => p.src === 'X')).toHaveLength(5)
	})
	it('names go A, B … Z, AA, skipping ones in use', () => {
		expect(nextSectionName([])).toBe('A')
		expect(nextSectionName(['A', 'B'])).toBe('C')
		expect(nextSectionName(Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)))).toBe('AA')
	})
})
