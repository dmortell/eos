import { describe, it, expect } from 'vitest'
import { ProjectIndex } from './project'
import { demoProject } from './fixtures'
import { navTree, filterTree, pathTo, findItems, searchHits, type NavNode } from './navTree'
import type { Entity, Sheet } from './drawing'

const sheet: Sheet = { type: 'sheet', id: 'SH', number: 'S001', title: 'Plan', order: 1, paper: { size: 'A3', orientation: 'landscape', marginMm: 5 }, status: 'active',
	viewports: [{ id: 'V1', view: { levelId: 'L33', spec: { kind: 'plan' } }, rect: { x: 10, y: 10, w: 100, h: 80 }, scale: 100, centre: { x: 0, y: 0 } }] }
const ix = () => new ProjectIndex([...demoProject(), sheet as Entity])
const labels = (ns: NavNode[]): string[] => ns.flatMap((n) => [n.label, ...labels(n.children ?? [])])

describe('navigator tree', () => {
	it('levels with their views and server rooms (rack view, racks); the riser view; sheets with their viewports', () => {
		const t = navTree(ix())
		const all = labels(t)
		expect(all).toEqual(expect.arrayContaining(['Plan', 'Front elevation', 'IDF-A', 'A01', 'Riser view (building)', 'S001 Plan']))
		const sh = t.find((n) => n.kind === 'sheets')!
		expect(sh.children?.[0].children?.[0]).toMatchObject({ kind: 'viewport', detail: '1:100', open: { levelId: 'L33', spec: { kind: 'plan' } } })
		const room = pathTo(t, (n) => n.key === 'room:SR-A')
		expect(room?.length).toBeGreaterThan(2)   // building › level › room
	})
	it('a server room counts its racks, not its cable managers (they are still listed)', () => {
		const find = (ns: NavNode[]): NavNode | undefined => ns.find((n) => n.key === 'room:SR-A') ?? ns.map((n) => find(n.children ?? [])).find(Boolean)
		const room = (extra: Entity[]) => find(navTree(new ProjectIndex([...demoProject(), ...extra])))!
		const before = Number(room([]).detail!.split(' ')[0])
		const vcm = { type: 'rack', id: 'VCM1', levelId: 'L33', spaceId: 'SR-A', order: 9, name: 'V01', kind: 'vcm', heightU: 42, widthMm: 152, depthMm: 600 } as Entity
		const r = room([vcm])
		expect(Number(r.detail!.split(' ')[0])).toBe(before)
		expect(labels(r.children ?? [])).toContain('V01')
	})
	it('a click on a server room or one of its rows selects it (their own Properties), as well as opening its rack view', () => {
		const find = (ns: NavNode[], key: string): NavNode | undefined => ns.find((n) => n.key === key) ?? ns.map((n) => find(n.children ?? [], key)).find(Boolean)
		const row = { type: 'rackRow', id: 'RW1', spaceId: 'SR-A', name: '1', order: 0 } as Entity
		const t = navTree(new ProjectIndex([...demoProject(), row]))
		expect(find(t, 'room:SR-A')).toMatchObject({ select: 'SR-A', open: { spec: { kind: 'row', spaceId: 'SR-A' } } })
		expect(find(t, 'row:RW1')).toMatchObject({ select: 'RW1', open: { spec: { kind: 'row', rowId: 'RW1' } } })
	})
	it('a search keeps the matches and their parents', () => {
		const f = filterTree(navTree(ix()), 'a01')
		expect(labels(f)).toContain('A01')
		expect(labels(f)).not.toContain('Front elevation')
		expect(f[0].kind).toBe('building')
		expect(filterTree(navTree(ix()), 'zzz')).toEqual([])
	})
	it('Ctrl+K finds devices and outlets — unplaced outlets too (no fit), and says how many more past the cap', () => {
		const loose = { type: 'outlet', id: 'OX', levelId: 'L33', zoneId: 'Z3', label: 'ZZ.9.001', tier: 'low', usage: 'desk', mount: 'floor', ports: [] } as unknown as Entity
		const many = Array.from({ length: 4 }, (_, i) => ({ ...loose, id: `OX${i}`, label: `ZZ.9.10${i}`, at: { x: i, y: 0 } }) as Entity)
		const p = new ProjectIndex([...demoProject(), loose, ...many])
		const one = findItems(p, 'zz.9.001')
		expect(one.items).toHaveLength(1)
		expect(one.items[0]).toMatchObject({ select: 'OX', open: { levelId: 'L33', spec: { kind: 'plan' } } })
		expect(one.items[0].focus).toBeUndefined()   // nothing drawn to fit to
		expect(one.items[0].detail).toContain('not placed')
		const capped = findItems(p, 'zz.9', 2)
		expect(capped.items).toHaveLength(2)
		expect(capped.more).toBe(3)
		expect(findItems(p, 'switch').items[0]).toMatchObject({ select: 'SW1', focus: 'R1' })
	})
	it('Enter / ↑ / ↓ walk the search’s rows that open something, then the finds — a device-only match still opens', () => {
		const p = ix()
		const shown = filterTree(navTree(p), 'switch'), finds = findItems(p, 'switch').items
		const hits = searchHits(shown, finds)
		expect(hits.at(-1)?.select).toBe('SW1')
		expect(hits.every((n) => !!n.open)).toBe(true)
		const t = filterTree(navTree(p), 'a01')
		expect(searchHits(t, []).map((n) => n.label)).toContain('A01')
	})
})

describe('the Sheets node grouped (sheets-organising slice 4)', () => {
	const rack: Sheet = { ...sheet, id: 'RK', number: 'RE1', title: 'Racks', order: 2, viewports: [{ ...sheet.viewports[0], id: 'V2', view: { levelId: 'L33', spec: { kind: 'row', spaceId: 'SR-A', face: 'front' } } }] }
	const pkg = { type: 'package', id: 'K', name: 'Rack set', rule: { kinds: ['rack-elevations'] }, order: 10 }
	const t = (by: 'place' | 'category' | 'level' | 'package') => navTree(new ProjectIndex([...demoProject(), sheet, rack, pkg] as Entity[]), { sheetsBy: by }).find((n) => n.kind === 'sheets')!
	it('by category in the list order, by level, by package (then the rest)', () => {
		expect(t('category').children!.map((g) => g.label)).toEqual(['Plans', 'Rack elevations'])
		expect(t('level').children!.map((g) => [g.label, g.children!.length])).toEqual([['33F', 2]])
		expect(t('package').children!.map((g) => [g.label, g.children!.map((c) => c.id)])).toEqual([['Rack set', ['RK']], ['Not in a package', ['SH']]])
	})
})
