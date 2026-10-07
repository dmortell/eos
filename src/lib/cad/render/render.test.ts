// Exports are made from the same display list / reports as the screen.
import { describe, it, expect } from 'vitest'
import { displayListToDxf, layerOf } from './dxf'
import { scheduleTable } from './outletSchedule'
import { planDisplayList } from '../views/plan'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import { BUILTIN_BLOCKS } from '../domain/blocks'
import type { Prim } from '../views/display'

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
	it('floorplan images are reported, not exported', () => {
		const r = displayListToDxf([{ k: 'image', url: 'blob:x', x: 0, y: 0, w: 10, h: 10 }])
		expect([r.entities, r.skippedImages]).toEqual([0, 1])
	})
	it('layers by class', () => {
		expect(layerOf('run run-high').name).toBe('E-CONTAINMENT-HIGH')
		expect(layerOf('outlet outlet-low').name).toBe('E-OUTLETS')
		expect(layerOf('mystery').name).toBe('0')
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
