// Exports are made from the same display list / reports as the screen.
import { describe, it, expect } from 'vitest'
import { displayListToDxf, layerOf } from './dxf'
import { scheduleTable } from './outletSchedule'
import { planDisplayList } from '../views/plan'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import { BUILTIN_BLOCKS } from '../domain/blocks'
import type { Prim } from '../views/display'
import { rackRowDisplayList } from '../views/rackRow'
import { elevationDisplayList } from '../views/elevation'
import { sheetDisplayList } from '../views/sheet'
import { spaceOf } from '../views/space'
import { makeWall } from '../domain/make'
import type { Rack } from '../domain/types'
import type { Shape } from '../domain/shapes'
import type { Sheet } from '../domain/drawing'

const ix = () => new ProjectIndex(demoProject())

describe('DXF', () => {
	it('exports what the plan draws: outlets, labels, runs (at their width), risers — y flipped to DXF y-up', () => {
		const r = displayListToDxf(planDisplayList(ix(), 'L33', { scale: 100 }))
		expect(r.text).toContain('E-OUTLETS')
		expect(r.text).toContain('E-CONTAINMENT-HIGH')
		expect(r.text).toContain('E-RISERS')
		expect(r.text).toContain('33-001')
		expect(r.entities).toBeGreaterThan(5)
		// the outlet at plan (1000, 4000) is a circle at DXF (1000, -4000)
		expect(r.text).toMatch(/CIRCLE[\s\S]*?\n10\n1000\n20\n-4000\n/)
	})
	it('a banded run keeps its real width (LWPOLYLINE constant width 43)', () => {
		const run: Prim = { k: 'line', pts: [{ x: 0, y: 0 }, { x: 1000, y: 0 }], w: 100, cls: 'run' }
		expect(displayListToDxf([run]).text).toMatch(/\n43\n100\n/)
	})
	it('floorplan images are reported, and kept as a frame and a note on A-IMAGE (Q71)', () => {
		const r = displayListToDxf([{ k: 'image', url: 'blob:x', x: 0, y: 0, w: 1000, h: 500 }])
		expect([r.entities, r.skippedImages]).toEqual([2, 1])
		expect(r.text).toContain('A-IMAGE')
		expect(r.text).toContain('not included in the DXF')
	})
	it('layers by role, else by class', () => {
		expect(layerOf({ cls: 'run run-high', role: 'run-high' }).name).toBe('E-CONTAINMENT-HIGH')
		expect(layerOf({ cls: 'outlet outlet-low' }).name).toBe('E-OUTLETS')
		expect(layerOf({ cls: 'mystery' }).name).toBe('0')
		// the role decides, not the CSS class (hacky-code #6): a renamed class keeps its layer
		expect(layerOf({ cls: 'renamed', role: 'rack' }).name).toBe('E-RACKS')
		expect(layerOf({ cls: 'rack' }).name).toBe('0')
	})
	it('every prim the plan, a rack row, an elevation and a sheet draw keeps the DXF layer its class gave it before roles (hacky-code #6)', () => {
		// the class → layer table as it was (first word; run-high anywhere → the high layer)
		const OLD: Record<string, string> = { outlet: 'E-OUTLETS', run: 'E-CONTAINMENT', 'run-body': 'E-CONTAINMENT', riser: 'E-RISERS', 'riser-label': 'E-RISERS', rack: 'E-RACKS', 'rack-x': 'E-RACKS',
			'port-mid': 'E-RACKS', 'rack-back': 'E-RACKS', wall: 'A-WALL', shape: 'A-DETAIL', 'tile-line': 'A-FLOR-TILE', label: 'ANNO-LABELS', note: 'ANNO-TEXT' }
		const old = (cls: string) => (/\brun-high\b/.test(cls) ? 'E-CONTAINMENT-HIGH' : OLD[cls.split(/\s+/)[0]] ?? '0')
		const ents = demoProject().map((e) => (e.id === 'R1' ? { ...(e as Rack), at: { x: 5000, y: 1000 } } : e))
		ents.push(makeWall('L33', [{ x: 0, y: 0 }, { x: 4000, y: 0 }], 100, 2600),
			{ type: 'shape', id: 'RF', levelId: 'L33', style: { fill: '#fde047' }, geom: { kind: 'rect', centre: { x: 2000, y: 2000 }, size: { x: 100, y: 50 } } } as Shape)
		const sheet = { type: 'sheet', id: 'SH', number: 'S-001', title: 'Plan', order: 1, paper: { size: 'A3', orientation: 'landscape', marginMm: 10 }, status: 'active',
			viewports: [{ id: 'V1', view: { levelId: 'L33', spec: { kind: 'plan' } }, rect: { x: 20, y: 20, w: 200, h: 150 }, scale: 100, centre: { x: 3000, y: 3000 } },
				{ id: 'V2', view: { levelId: 'L33', spec: { kind: 'row', spaceId: 'SR-A', face: 'front' } }, rect: { x: 230, y: 20, w: 150, h: 150 }, scale: 50, centre: { x: 0, y: -1000 } }] } as unknown as Sheet
		const i = new ProjectIndex([...ents, sheet])
		const lists = [planDisplayList(i, 'L33', { scale: 100 }), rackRowDisplayList(i, { spaceId: 'SR-A', face: 'front' }), rackRowDisplayList(i, { spaceId: 'SR-A', face: 'rear' }),
			elevationDisplayList(i, 'L33', spaceOf({ kind: 'elevation', dir: 'front' }), { scale: 100 }), sheetDisplayList(i, sheet)]
		// what the DXF writes (a region's fill is its hatch, a plan run's pick bands are left out)
		const written = lists.flat().filter((p): p is Exclude<Prim, { k: 'image' }> => p.k !== 'image' && p.role !== 'fill' && p.role !== 'run-pick')
		expect(written.map((p) => layerOf(p).name)).toEqual(written.map((p) => old(p.cls)))
		const names = new Set(written.map((p) => layerOf(p).name))
		for (const n of ['E-RACKS', 'E-RISERS', 'E-CONTAINMENT-HIGH', 'E-OUTLETS', 'A-WALL']) expect(names).toContain(n)
		// the left-out ones were the same before: the fill by its class, the pick bands by `run-hit`
		const skipped = lists.flat().filter((p) => p.k !== 'image' && (p.role === 'fill' || p.role === 'run-pick'))
		expect(skipped.length).toBeGreaterThan(0)
		const wasSkipped = lists.flat().filter((p) => p.k !== 'image' && (p.cls === 'shape-fill' || p.cls.split(' ').includes('run-hit')))
		expect(wasSkipped).toEqual(skipped)
	})
})

describe('outlet schedule sheet', () => {
	it('one row per outlet, port labels and where each is patched to', () => {
		const t = scheduleTable(ix(), 'L33')
		const col = (h: string) => t.head.indexOf(h)
		expect(t.body.map((r) => r[col('Outlet')])).toEqual(['33-001', '33-002'])
		expect(t.body[0][col('Port labels')]).toBe('33-001.A\n33-001.B')
		expect(t.body[0][col('Patched to')]).toBe('A01 · Panel 1 : 1 (rear)\nA01 · Panel 1 : 2 (rear)')
		expect(t.totals).toBe('2 outlets, 4 ports (desk 2)')
		const o = ix().outlets.find((x) => x.label === '33-001')!
		expect([t.body[0][col('X (mm)')], t.body[0][col('Y (mm)')]]).toEqual([Math.round(o.at!.x), Math.round(o.at!.y)])
	})
})

describe('DXF blocks as BLOCK + INSERT (backlog)', () => {
	it('each outlet is one INSERT of a BLOCK written once, its label / ports / usage as ATTRIBs', () => {
		const ix = new ProjectIndex(demoProject())
		const blockOf = (id: string) => BUILTIN_BLOCKS.find((b) => b.id === id)
		const prims = planDisplayList(ix, 'L33', { scale: 100, blocks: blockOf })
		const outlets = ix.outlets.filter((o) => o.levelId === 'L33' && o.at)
		const text = displayListToDxf(prims, undefined, 100, blockOf).text
		const count = (re: RegExp) => (text.match(re) ?? []).length
		expect(count(/\nINSERT\r?\n/g)).toBe(outlets.length)
		expect(count(/\nATTDEF\r?\n/g)).toBeGreaterThan(0)
		expect(count(/\nATTRIB\r?\n/g)).toBe(outlets.length * 3)   // LABEL, USAGE, PORTS
		expect(text).toMatch(/\nLABEL\r?\n/)
		for (const o of outlets) expect(text).toContain(`\n${o.label}\n`)
		// without the library the symbols go out as loose lines as before
		expect(displayListToDxf(prims).text).not.toMatch(/\nINSERT\r?\n/)
	})
})
