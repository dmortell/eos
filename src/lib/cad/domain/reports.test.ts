import { describe, it, expect } from 'vitest'
import { ProjectIndex } from './project'
import { outletSchedule, patchList, runLengths, bom, cordBom } from './reports'
import type { Cord } from './types'
import { validateProject } from './validate'
import { demoProject } from './fixtures'
import { defaultSettings } from './settings'
import type { Estimate } from './estimates'

const p = () => new ProjectIndex(demoProject())

describe('the demo project', () => {
	it('is valid', () => {
		expect(validateProject(demoProject())).toEqual([])
	})
})

describe('labels exist once', () => {
	it("a panel port shows the label of the outlet port it is linked to; an unlinked port shows its own text", () => {
		const ix = p()
		expect(ix.portLabel({ on: 'P1', port: 3, face: 'front' })).toBe('33-002.A')
		expect(ix.portLabel({ on: 'SW1', port: 2 })).toBe('SW1-02')
		expect(ix.portLabel({ on: 'P1', port: 20 })).toBe('')
	})
	it('renaming an outlet port renames it on the panel too (no copy to go stale)', () => {
		const ents = demoProject().map((e) => (e.id === 'O2' && e.type === 'outlet' ? { ...e, ports: e.ports.map((pt) => ({ ...pt, label: pt.label.replace('33-002', '33-099') })) } : e))
		expect(new ProjectIndex(ents).portLabel({ on: 'P1', port: 3 })).toBe('33-099.A')
	})
})

describe('outlet schedule', () => {
	it('lists each outlet with where every port is patched to', () => {
		const { rows, totals } = outletSchedule(p())
		expect(rows.map((r) => r.label)).toEqual(['33-001', '33-002'])
		expect(rows[0].ports[1]).toEqual({ label: '33-001.B', cableType: 'cat6a', serverRoom: 'IDF-A', patchedTo: 'A01 · Panel 1 : 2 (rear)' })
		expect(totals).toEqual({ outlets: 2, ports: 4, byUsage: { desk: 2 } })
	})
})

describe('patch list', () => {
	it('shows both ends of each cord with the labels people read on the ports', () => {
		const rows = patchList(p())
		expect(rows.map((r) => [r.fromLabel, r.toLabel])).toEqual([['33-001.A', 'SW1-01'], ['33-001.B', 'SW1-02']])
		expect(rows[0].from).toBe('A01 · Panel 1 : 1 (front)')
	})
	it('a moved end of a change says where it was (↶)', () => {
		const ents = demoProject().map((e) => (e.id === 'C1' && e.type === 'cord' ? { ...e, status: 'change' as const, b: { on: 'SW1', port: 9 }, previous: { a: e.a, b: e.b, status: 'installed' as const } } : e))
		const r = patchList(new ProjectIndex(ents)).find((x) => x.id === 'C1')!
		expect([r.wasFrom, r.wasTo]).toEqual([undefined, new ProjectIndex(ents).portPlace({ on: 'SW1', port: 1 })])
	})
})

describe('cord BOM', () => {
	it('counts cords by type × length, a column per status, types A → Z then shortest first', () => {
		const c = (cableType: string, lengthM: number, status: Cord['status']) => ({ cableType, lengthM, status }) as Cord
		const lines = cordBom([c('cat6a', 2, 'add'), c('cat6a', 1, 'installed'), c('cat6a', 2, 'remove'), c('om4', 3, 'add'), c('cat6a', 2, 'add'), c('cat6a', 0, 'add')], (id) => id.toUpperCase())
		expect(lines.map((l) => [l.type, l.lengthM, l.total])).toEqual([['CAT6A', 0, 1], ['CAT6A', 1, 1], ['CAT6A', 2, 3], ['OM4', 3, 1]])
		expect(lines[2].n).toEqual({ add: 2, change: 0, replace: 0, remove: 1, installed: 0 })
	})
})

describe('containment', () => {
	it('measures runs in 3D and counts the drop separately', () => {
		const [t] = runLengths(p())
		expect(t.horizontalM).toBeCloseTo(6)
		expect(t.verticalM).toBeCloseTo(2.6)
		expect(t.size).toBe('100×50')
	})
})

describe('BOM', () => {
	it('quantities by item, metres rounded up per line, unknown lengths still counted', () => {
		const lines = bom(p())
		const q = (item: string) => lines.find((l) => l.item === item)?.qty
		expect(q('2-port outlet (floor)')).toBe(2)
		expect(q('Jack / module cat6a')).toBe(4)
		expect(q('Patch panel 24-port RJ45 1U')).toBe(1)
		expect(q('cat6a (incl. 10% waste)')).toBe(94)                   // 2 × 42.5 m hand-set, + 10 % → 93.5 → 94
		expect(lines.find((l) => l.item === 'cat6a (incl. 10% waste)')?.note).toBe('≈ 1 box(es) of 305 m')
		// W25: the 2 cables with no route priced at the routed average of their type (94 m / 2 = 47 m each, waste in)
		const est = 'cat6a — no route, estimated at 47 m each (the routed average, incl. waste)'
		expect(q(est)).toBe(94)
		expect(lines.find((l) => l.item === est)?.note).toBe('2 cables × 47 m')
		expect(q('cat6a — no route, length unknown')).toBeUndefined()
		expect(q('trunk 100×50')).toBe(9)                             // 6 + 2.6 → 9
		expect(q('Core drill Ø100 through slab')).toBe(1)
		expect(q('cat6a 1 m')).toBe(2)
	})
	it('cable types by their label; one server room only (W25)', () => {
		const withLabels = [...demoProject().filter((e) => e.type !== 'settings'), defaultSettings()]   // cat6a = "CAT6A"
		const lines = bom(new ProjectIndex(withLabels))
		expect(lines.some((l) => l.item === 'Jack / module CAT6A')).toBe(true)
		expect(lines.some((l) => /cat6a/.test(l.item))).toBe(false)
		// a room with nothing in it: no outlets, no panels, no cable
		const none = bom(p(), [], undefined, [], { rooms: ['NO-ROOM'] })
		expect(none.filter((l) => ['Outlets', 'Panels', 'Cable', 'Patch cords'].includes(l.category))).toEqual([])
		// the fixture's server room: the same outlets and panel as the whole project
		const room = p().spaces.find((s) => s.kind === 'server room')!.id
		const q = (ls: typeof lines, item: string) => ls.find((l) => l.item === item)?.qty
		expect(q(bom(p(), [], undefined, [], { rooms: [room] }), '2-port outlet (floor)')).toBe(q(bom(p()), '2-port outlet (floor)'))
	})
	it('counts only material to buy: installed cables leave out, cords only when added or replaced', () => {
		const ents = demoProject()
		const links = ents.filter((e) => e.type === 'link'), cords = ents.filter((e) => e.type === 'cord')
		const statuses: Cord['status'][] = ['installed', 'replace']
		const edited = ents.map((e) =>
			e.type === 'link' && e.id === links[0].id ? { ...e, status: 'installed' as const }
			: e.type === 'cord' ? { ...e, status: statuses[cords.indexOf(e)] ?? 'remove' } : e)
		const base = bom(p()), lines = bom(new ProjectIndex(edited))
		const q = (ls: typeof lines, item: string) => ls.find((l) => l.item === item)?.qty ?? 0
		expect(q(lines, 'cat6a 1 m')).toBe(1)                          // the replaced one; the installed one isn't bought
		const cable = (ls: typeof lines) => q(ls, 'cat6a (incl. 10% waste)') + q(ls, 'cat6a — no route, length unknown')
		expect(cable(lines)).toBeLessThan(cable(base))
	})
})

describe('BOM: W26 lines (User 2026-10-15)', () => {
	const q = (ls: ReturnType<typeof bom>, item: string) => ls.find((l) => l.item === item)?.qty
	it('a box per outlet by mount; tubing to desk outlets; tests and labels per cable to buy', () => {
		const lines = bom(p())
		expect(q(lines, 'Floor box')).toBe(2)                                // the demo's two floor outlets
		const links = p().links.filter((l) => l.status !== 'installed').length
		expect(q(lines, 'Copper permanent-link test')).toBe(links)
		expect(q(lines, 'Cable labels (both ends)')).toBe(links * 2)
		expect(q(lines, 'Port labels (both ends)')).toBe(links * 2)
		// one outlet on a desk: no floor box for it, 2 m of tubing
		const ents = demoProject(), first = ents.find((e) => e.type === 'outlet')!
		const desk = bom(new ProjectIndex(ents.map((e) => (e.id === first.id ? { ...e, mount: 'desk' } : e)) as typeof ents))
		expect(q(desk, 'Floor box')).toBe(1)
		const tube = desk.find((l) => l.item.startsWith('Spiral / mesh tubing'))
		expect(tube).toMatchObject({ unit: 'm', qty: 2, note: '1 desk outlet × 2 m' })
	})
	it('fibre: a connector at each end of each core, a test per core; estimated cables tested and labelled too', () => {
		const ents = demoProject(), link = ents.find((e) => e.type === 'link')!
		const st = { ...defaultSettings(), cableTypes: [...defaultSettings().cableTypes, { id: 'om4', label: 'OM4', media: 'fibre' as const, color: '#f59e0b' }] }
		const fibre = [...ents.filter((e) => e.type !== 'settings'), st, { ...link, id: 'F1', cableType: 'om4' }, { ...link, id: 'F2', cableType: 'om4' }] as typeof ents
		const lines = bom(new ProjectIndex(fibre))
		expect(q(lines, 'Connector / pigtail OM4')).toBe(4)
		expect(q(lines, 'Fibre test (per core)')).toBe(2)
		const est = [{ outletId: 'O', port: 1, cableType: 'cat6a', segs: [] }, { outletId: 'O', port: 2, cableType: 'cat6a', segs: [] }] as unknown as Estimate[]
		const before = q(bom(p()), 'Copper permanent-link test')!
		expect(q(bom(p(), [], undefined, est), 'Copper permanent-link test')).toBe(before + 2)
	})
})
