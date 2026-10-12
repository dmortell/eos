// Racks and devices through the real tools (Phase 3.2): draw racks on the plan, add devices in the rack row view,
// drag them by U and into the next rack, refused overlaps.
import { describe, it, expect } from 'vitest'
import { EntityStore } from '../store/store'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import { type ToolCtx, type PortSel } from './tools'
import { SelectTool } from './selectTool'
import { RackTool } from './rackTool'
import { portCell } from '../views/rackRow'
import { DeviceTool } from './deviceTool'
import { CordTool, type BulkFrom, type PatchPreview } from './cordTool'
import { cordEndGrips, portPlus } from './portGrips'
import { AssignTool } from './assignTool'
import { deleteEntities, deleteImpact, impactText, installedCordsGoing } from './commands'
import { patchList } from '../domain/reports'
import { BUILTIN_DEVICE_TEMPLATES, type DeviceTemplate } from '../domain/devices'
import { spaceOf, PLAN, type ViewSpec } from '../views/space'
import { rackRowDisplayList, rackLayout, rackHeight, rowHit, RU_MM } from '../views/rackRow'
import type { Entity } from '../domain/drawing'
import type { Device, Rack, Cord, Link } from '../domain/types'

const ROW: ViewSpec = { kind: 'row', spaceId: 'SR-A', face: 'front' }
const R2: Rack = { type: 'rack', id: 'R2', levelId: 'L33', spaceId: 'SR-A', order: 1, name: 'A02', kind: 'cabinet', heightU: 42, widthMm: 600, depthMm: 1000 }

function harness(spec: ViewSpec, extra: Entity[] = []) {
	const store = new EntityStore()
	store.load([...demoProject(), ...extra])
	let sel: string[] = []
	let ports: PortSel | null = null
	const said: string[] = []
	const ctx = (): ToolCtx => {
		const index = new ProjectIndex(store.all())
		const row = spec.kind === 'row' ? spec : null
		return {
			store, index, levelId: 'L33', opts: { z: 0, w: 100, h: 50 }, space: spaceOf(spec), work: { z: 0, depth: 0 },
			prims: () => (row ? rackRowDisplayList(index, row) : []), tol: () => 5,
			snap: (p) => ({ p, kind: 'none' }) as never,
			selection: sel, select: (ids) => { sel = ids }, setMarquee: () => {}, ask: () => {}, say: (m) => said.push(m),
			...(row ? { rowHit: (p: { x: number; y: number }) => rowHit(index, row, p), portSel: () => ports, selectPorts: (s: PortSel | null) => { ports = s } } : {}),
		}
	}
	return { store, ctx, sel: () => sel, ports: () => ports, said }
}
const at = (x: number, y: number, extra: Partial<{ count: number }> = {}) => ({ p: { x, y }, shift: false, ctrl: false, alt: false, ...extra })
/** The view point in the middle of U `u` of a rack in the front row view. */
function uPoint(store: EntityStore, rackId: string, u: number) {
	const ix = new ProjectIndex(store.all())
	const l = rackLayout(ix, { spaceId: 'SR-A', face: 'front' }).find((x) => x.rack.id === rackId)!
	const base = (rackHeight(l.rack) - l.rack.heightU * RU_MM) / 2
	// left of the middle, on a device's BODY beside its ports (a press on a port picks ports — backlog "Drag to select a
	// block of ports"): the 450 mm device's edge is 225 mm out, its port area 215 mm
	return { x: l.x0 + l.rack.widthMm / 2 - 220, y: -(base + (u - 0.5) * RU_MM) }
}
const tpl = (id: string): DeviceTemplate => BUILTIN_DEVICE_TEMPLATES.find((t) => t.id === id)!

describe('drawing racks on the plan', () => {
	it('each click draws a new rack like the last one, named after it, in the same room and row', () => {
		const h = harness(PLAN, [{ ...R2, rowId: 'ROW', at: { x: 0, y: 0 }, rot: 90 }])
		const tool = new RackTool(() => {})
		tool.down(at(1000, 0), h.ctx())
		tool.down(at(2000, 0), h.ctx())
		const drawn = h.store.ofType('rack').filter((r) => r.id !== 'R1' && r.id !== 'R2')
		expect(drawn.map((r) => r.name)).toEqual(['A03', 'A04'])
		expect(drawn[0]).toMatchObject({ spaceId: 'SR-A', rowId: 'ROW', rot: 90, at: { x: 1000, y: 0 } })
	})
})

describe('devices in the rack row', () => {
	it('click a device, Shift-click another in the rack: every device between them on this face (Dave: U10 to U4)', () => {
		const dev = (id: string, u: number, face: Device['face'] = 'both', heightU = 1): Device => ({ type: 'device', id, rackId: 'R1', name: id, kind: 'panel', u, heightU, face, portCount: 24 })
		const h = harness(ROW, [dev('U10', 10), dev('U8', 7, 'both', 2), dev('U6', 6, 'front'), dev('U5', 5, 'rear'), dev('U4', 4), dev('U2', 2)])
		const sel = new SelectTool()
		const a = uPoint(h.store, 'R1', 10), b = uPoint(h.store, 'R1', 4)
		sel.down(at(a.x, a.y), h.ctx()); sel.up(at(a.x, a.y), h.ctx())
		sel.down({ ...at(b.x, b.y), shift: true }, h.ctx()); sel.up({ ...at(b.x, b.y), shift: true }, h.ctx())
		expect(h.sel()).toEqual(['U10', 'U8', 'U6', 'U4'])   // top down; the rear-only U5 isn't on this face, U2 is outside
		expect(h.ports()).toBeNull()
	})
	it('outlets dropped on a panel itself (not a port) go on from its first free port (Dave: drag rows "to a panel")', () => {
		const px: Device = { type: 'device', id: 'PX', rackId: 'R1', name: 'PX', kind: 'panel', u: 30, heightU: 1, face: 'both', portCount: 24, panel: { tier: 'low' } }
		const h = harness(ROW, [px])
		const added: Link[][] = []
		const tool = new AssignTool(() => {}, (_l, add) => { added.push(add) })
		tool.outlets = ['O2']
		const body = h.ctx().prims().find((p) => p.src === 'PX' && p.k === 'line' && p.cls.startsWith('device'))!
		const xs = body.k === 'line' ? body.pts.map((q) => q.x) : [], ys = body.k === 'line' ? body.pts.map((q) => q.y) : []
		tool.down(at(Math.min(...xs) + 3, (Math.min(...ys) + Math.max(...ys)) / 2), h.ctx())   // the panel's edge, clear of its ports
		expect(added[0]?.map((l) => [l.a.on, l.a.port, l.b.on, l.b.port])).toEqual([['PX', 1, 'O2', 1], ['PX', 2, 'O2', 2]])
	})
	it('picked panel ports dragged onto another panel’s port take their outlets there; patched ones stay; a click picks one', () => {
		const px: Device = { type: 'device', id: 'PX', rackId: 'R1', name: 'PX', kind: 'panel', u: 30, heightU: 1, face: 'both', portCount: 24, panel: { tier: 'low' } }
		const h = harness(ROW, [px])
		const cell = (on: string, n: number) => { const p = h.ctx().prims().find((q) => q.k === 'line' && q.src === on && q.sub === String(n) && q.cls.startsWith('port'))!; const xs = p.k === 'line' ? p.pts : []; return { x: (xs[0].x + xs[2].x) / 2, y: (xs[0].y + xs[2].y) / 2 } }
		const sel = new SelectTool()
		h.ctx().selectPorts!({ on: 'P1', face: 'front', ports: [1, 2, 3, 4], anchor: 1 })   // P1 1–4: O1 (patched on 1, 2), O2
		const a = cell('P1', 3), b = cell('PX', 5)
		sel.down(at(a.x, a.y), h.ctx()); sel.move(at(b.x, b.y), h.ctx()); sel.up(at(b.x, b.y), h.ctx())
		const links = h.store.ofType('link')
		expect(links.filter((l) => l.a.on === 'PX').map((l) => [l.a.port, l.b.on, l.b.port]).sort()).toEqual([[5, 'O2', 1], [6, 'O2', 2]])
		expect(links.filter((l) => l.a.on === 'P1').map((l) => l.a.port).sort()).toEqual([1, 2])   // the patched ports stayed
		expect(h.ports()).toMatchObject({ on: 'PX', ports: [5, 6] })
		expect(h.said.at(-1)).toMatch(/2 patched port\(s\) stay/)
		// a click (no drag) on a picked port picks that port alone
		const c5 = cell('PX', 5)
		sel.down(at(c5.x, c5.y), h.ctx()); sel.up(at(c5.x, c5.y), h.ctx())
		expect(h.ports()).toMatchObject({ on: 'PX', ports: [5] })
	})
	it('the device tool adds the chosen template at the clicked U', () => {
		const h = harness(ROW)
		const tool = new DeviceTool(() => tpl('builtin:panel-24'))
		tool.down(at(uPoint(h.store, 'R1', 30).x, uPoint(h.store, 'R1', 30).y), h.ctx())
		const added = h.store.ofType('device').find((d) => d.u === 30)
		expect(added).toMatchObject({ rackId: 'R1', kind: 'panel', portCount: 24, name: 'PP1' })
	})
	it('a spot taken on that face is refused with the reason', () => {
		const h = harness(ROW)
		const tool = new DeviceTool(() => tpl('builtin:panel-24'))
		const p = uPoint(h.store, 'R1', 40)   // Panel 1 is at U40
		tool.down(at(p.x, p.y), h.ctx())
		expect(h.store.ofType('device')).toHaveLength(2)
		expect(h.said[0]).toMatch(/overlap Panel 1/)
	})
	it('Select drags a device by whole U; onto another rack it moves there', () => {
		const h = harness(ROW, [R2])
		const sel = new SelectTool()
		const from = uPoint(h.store, 'R1', 38)   // Switch 1
		sel.down(at(from.x, from.y), h.ctx())
		const to = uPoint(h.store, 'R1', 35)
		sel.move(at(to.x, to.y), h.ctx()); sel.up(at(to.x, to.y), h.ctx())
		expect((h.store.get('SW1') as Device).u).toBe(35)
		const other = uPoint(h.store, 'R2', 35)
		sel.down(at(to.x, to.y), h.ctx())
		sel.move(at(other.x, other.y), h.ctx()); sel.up(at(other.x, other.y), h.ctx())
		expect(h.store.get('SW1')).toMatchObject({ rackId: 'R2', u: 35 })
	})
	it('clicking ports selects them: one, Shift = a range, Ctrl = add / drop one; empty space clears', () => {
		const h = harness(ROW)
		const sel = new SelectTool()
		// the centre of Panel 1's port n, in the front row view
		const ix = new ProjectIndex(h.store.all()), l = rackLayout(ix, { spaceId: 'SR-A', face: 'front' })[0]
		const base = (rackHeight(l.rack) - l.rack.heightU * RU_MM) / 2, p1 = h.store.get('P1') as Device
		const port = (n: number) => { const c = portCell(p1, n, l.x0 + l.rack.widthMm / 2, base + (p1.u - 1) * RU_MM)!; return { x: c.x + c.w / 2, y: c.y + c.h / 2 } }
		const click = (n: number, mods: Partial<{ shift: boolean; ctrl: boolean }> = {}) => { const q = port(n); const ev = { ...at(q.x, q.y), ...mods }; sel.down(ev, h.ctx()); sel.up(ev, h.ctx()) }
		click(3)
		expect(h.ports()).toMatchObject({ on: 'P1', ports: [3], face: 'front' })
		expect(h.sel()).toEqual(['P1'])
		click(6, { shift: true })
		expect(h.ports()?.ports).toEqual([3, 4, 5, 6])
		click(10, { ctrl: true }); click(4, { ctrl: true })
		expect(h.ports()?.ports).toEqual([3, 5, 6, 10])
		sel.down(at(-5000, 5000), h.ctx()); sel.up(at(-5000, 5000), h.ctx())
		expect(h.ports()).toBeNull()
	})
	it('a drag from a port picks the ports to the one under the pointer; the device stays (Alt-drag moves it)', () => {
		const h = harness(ROW)
		const sel = new SelectTool()
		const ix = new ProjectIndex(h.store.all()), l = rackLayout(ix, { spaceId: 'SR-A', face: 'front' })[0]
		const base = (rackHeight(l.rack) - l.rack.heightU * RU_MM) / 2, p1 = h.store.get('P1') as Device
		const port = (n: number) => { const c = portCell(p1, n, l.x0 + l.rack.widthMm / 2, base + (p1.u - 1) * RU_MM)!; return at(c.x + c.w / 2, c.y + c.h / 2) }
		sel.down(port(9), h.ctx()); sel.move(port(12), h.ctx()); sel.move(port(5), h.ctx()); sel.up(port(5), h.ctx())
		expect(h.ports()).toMatchObject({ on: 'P1', ports: [5, 6, 7, 8, 9], anchor: 9 })
		expect((h.store.get('P1') as Device).u).toBe(p1.u)
		const p9 = port(9).p, down = { ...at(p9.x, p9.y), alt: true }, to = { ...at(p9.x, p9.y + 3 * RU_MM), alt: true }
		sel.down(down, h.ctx()); sel.move(to, h.ctx()); sel.up(to, h.ctx())
		expect((h.store.get('P1') as Device).u).toBe(p1.u - 3)
	})
	it('the cord tool: port A then port B makes a cord; an unlabelled panel port refuses with the reason', () => {
		const h = harness(ROW)
		const ix = new ProjectIndex(h.store.all()), l = rackLayout(ix, { spaceId: 'SR-A', face: 'front' })[0]
		const base = (rackHeight(l.rack) - l.rack.heightU * RU_MM) / 2, mid = l.x0 + l.rack.widthMm / 2
		const portOf = (id: string, n: number) => { const d = h.store.get(id) as Device; const c = portCell(d, n, mid, base + (d.u - 1) * RU_MM)!; return at(c.x + c.w / 2, c.y + c.h / 2) }
		const tool = new CordTool(() => ({ cableType: 'cat6a', colour: '#ef4444' }), { get: () => null, set: () => {} })
		tool.down(portOf('P1', 10), h.ctx())
		expect(h.said.at(-1)).toMatch(/no label yet/)
		tool.down(portOf('P1', 3), h.ctx()); tool.down(portOf('SW1', 5), h.ctx())
		const cord = h.store.ofType('cord').find((c) => c.a.on === 'P1' && c.a.port === 3)
		expect(cord).toMatchObject({ status: 'add', colour: '#ef4444', a: { face: 'front' }, b: { on: 'SW1', port: 5 } })
		expect(h.sel()).toEqual([cord!.id])
	})
	it('an armed Patch to… / Link to… hands back the tool once made or Esc’d — a stray click doesn’t make a cord (Dave: the crosshair stayed)', () => {
		const h = harness(ROW)
		const ix = new ProjectIndex(h.store.all()), l = rackLayout(ix, { spaceId: 'SR-A', face: 'front' })[0]
		const base = (rackHeight(l.rack) - l.rack.heightU * RU_MM) / 2, mid = l.x0 + l.rack.widthMm / 2
		const portOf = (id: string, n: number) => { const d = h.store.get(id) as Device; const c = portCell(d, n, mid, base + (d.u - 1) * RU_MM)!; return at(c.x + c.w / 2, c.y + c.h / 2) }
		let bulk: BulkFrom | null = { on: 'P1', ports: [3], face: 'front' }, done = 0
		const tool = new CordTool(() => ({ cableType: 'cat6a', colour: '#ef4444' }), { get: () => bulk, set: (b) => { bulk = b } }, () => '', () => done++)
		tool.down(portOf('SW1', 5), h.ctx())
		expect([bulk, done]).toEqual([null, 1])
		bulk = { on: 'P1', ports: [4], face: 'front', kind: 'link' }
		expect(tool.key({ key: 'Escape' } as KeyboardEvent)).toBe(true)
		expect([bulk, done]).toEqual([null, 2])
	})
	it('Patch to… on several ports shows the cords first: nothing is written until OK, then one undo step; Fill / Ctrl fill only free ports', () => {
		const busy: Cord = { type: 'cord', id: 'CX', kind: 'patch', a: { on: 'SW1', port: 4 }, b: { on: 'SW1', port: 40 }, cableType: 'cat6a', colour: '#000', lengthM: 1, lengthLocked: false, status: 'add' }
		const h = harness(ROW, [busy])
		const ix = new ProjectIndex(h.store.all()), l = rackLayout(ix, { spaceId: 'SR-A', face: 'front' })[0]
		const base = (rackHeight(l.rack) - l.rack.heightU * RU_MM) / 2, mid = l.x0 + l.rack.widthMm / 2
		const portOf = (id: string, n: number) => { const d = h.store.get(id) as Device; const c = portCell(d, n, mid, base + (d.u - 1) * RU_MM)!; return at(c.x + c.w / 2, c.y + c.h / 2) }
		let bulk: BulkFrom | null = { on: 'P1', ports: [3, 4], face: 'front' }, done = 0, shown = null as PatchPreview | null, fill = false
		const tool = new CordTool(() => ({ cableType: 'cat6a', colour: '#ef4444' }), { get: () => bulk, set: (b) => { bulk = b } }, () => '', () => done++,
			{ show: (p) => { shown = p }, fill: () => fill, setFill: (on) => { fill = on } })
		const cords = () => h.store.ofType('cord').length, before = cords()
		const rows = () => shown!.rows.map((r) => `${r.a}→${r.b}`)
		tool.down(portOf('SW1', 3), h.ctx())   // in step: SW1:4 is taken, so P1:4 is skipped
		expect([rows(), shown!.skipped.length, cords()]).toEqual([['3→3'], 1, before])
		shown!.setFill(true)
		expect([rows(), shown!.skipped.length, fill]).toEqual([['3→3', '4→5'], 0, true])
		shown!.ok()
		expect([shown, cords(), bulk, done]).toEqual([null, before + 2, null, 1])
		h.store.undo()
		expect(cords()).toBe(before)
		// Ctrl on the click: the other mapping this time (fill is sticky on now → in step); Cancel writes nothing
		bulk = { on: 'P1', ports: [3, 4], face: 'front' }
		tool.down({ ...portOf('SW1', 3), ctrl: true }, h.ctx())
		expect([rows(), shown!.fill]).toEqual([['3→3'], false])
		shown!.cancel()
		expect([shown, cords(), bulk, done]).toEqual([null, before, null, 2])
	})
	it('a selected cord’s end grip dropped on another port re-patches that end; a taken port refuses (Dave: grips for repatching)', () => {
		const h = harness(ROW)
		const cell = (on: string, n: number) => { const p = h.ctx().prims().find((q) => q.k === 'line' && q.src === on && q.sub === String(n) && q.cls.startsWith('port'))!; const xs = p.k === 'line' ? p.pts : []; return { x: (xs[0].x + xs[2].x) / 2, y: (xs[0].y + xs[2].y) / 2 } }
		const sel = new SelectTool()
		h.ctx().select(['C1'])   // P1 1 → SW1 1
		const [ga, gb] = cordEndGrips(h.ctx().prims(), 'C1')
		expect(Math.hypot(ga.at.x - cell('P1', 1).x, ga.at.y - cell('P1', 1).y)).toBeLessThan(1)
		const to = cell('SW1', 7)
		sel.down(at(gb.at.x, gb.at.y), h.ctx()); sel.move(at(to.x, to.y), h.ctx()); sel.up(at(to.x, to.y), h.ctx())
		expect(h.store.get('C1')).toMatchObject({ a: { on: 'P1', port: 1 }, b: { on: 'SW1', port: 7 } })
		const taken = cell('P1', 2)   // C2's
		sel.down(at(ga.at.x, ga.at.y), h.ctx()); sel.move(at(taken.x, taken.y), h.ctx()); sel.up(at(taken.x, taken.y), h.ctx())
		expect(h.store.get('C1')).toMatchObject({ a: { on: 'P1', port: 1 } })
		expect(h.said.at(-1)).toMatch(/already patched/)
	})
	it('the + on a selected port: a patch when it has a link and no cord (a switch: always), a link when it has neither, none when patched', () => {
		const h = harness(ROW)
		const armed: [number[], string][] = []
		const ctx = (): ToolCtx => ({ ...h.ctx(), armPorts: (s, k) => armed.push([s.ports, k]) })
		const pick = (on: string, n: number) => h.ctx().selectPorts!({ on, face: 'front', ports: [n], anchor: n })
		pick('P1', 3)   // K3 → O2, no cord
		expect(portPlus(ctx().index, h.ports(), 'front', ctx().prims())?.kind).toBe('cord')
		pick('P1', 1)   // C1
		expect(portPlus(ctx().index, h.ports(), 'front', ctx().prims())).toBeNull()
		pick('SW1', 9)  // a switch port: patched, not linked (Link to… is a panel's)
		expect(portPlus(ctx().index, h.ports(), 'front', ctx().prims())?.kind).toBe('cord')
		pick('P1', 10)  // nothing
		const plus = portPlus(ctx().index, h.ports(), 'front', ctx().prims())!
		expect(plus.kind).toBe('link')
		const sel = new SelectTool()
		sel.down(at(plus.at.x, plus.at.y), ctx()); sel.up(at(plus.at.x, plus.at.y), ctx())
		expect(armed).toEqual([[[10], 'link']])
	})
	it('Delete on cords: a planned one goes, an installed one is only marked `remove`', () => {
		const h = harness(ROW)
		h.store.transact('installed', (tx) => tx.put({ ...(h.store.get('C2') as Cord), status: 'installed' }))
		deleteEntities(h.store, ['C1', 'C2'])
		expect(h.store.get('C1')).toBeUndefined()
		expect(h.store.get('C2')).toMatchObject({ status: 'remove' })
	})
	it('Delete says what goes with it (to ask first): a rack\'s devices, a device\'s links and cords; an empty rack nothing', () => {
		const h = harness(ROW, [R2])
		const count = (t: 'link' | 'cord', on: string[]) => h.store.ofType(t).filter((x) => on.includes(x.a.on) || on.includes(x.b.on)).length
		const inR1 = h.store.ofType('device').filter((d) => d.rackId === 'R1')
		const r1 = deleteImpact(h.store, ['R1'])
		expect(r1).toMatchObject({ devices: inR1.length, links: count('link', inR1.map((d) => d.id)), cords: count('cord', inR1.map((d) => d.id)) })
		expect(impactText(deleteImpact(h.store, ['R2']))).toBeNull()
		const p1 = deleteImpact(h.store, ['P1'])
		expect([p1.devices, p1.links, p1.cords]).toEqual([0, count('link', ['P1']), count('cord', ['P1'])])
		expect(impactText({ devices: 0, links: 3, cords: 1, viewports: 0, notes: 0 })).toBe('3 links and 1 cord')
		expect(deleteImpact(h.store, ['P1', 'C1']).cords).toBe(count('cord', ['P1']) - 1)   // a selected cord isn't "with it"
		// D3 (patch-list-plan.md): the installed ones are named in the warning
		expect(installedCordsGoing(h.store, ['P1'])).toBe(0)                                  // the demo's cords are `add`
		h.store.transact('t', (tx) => tx.put({ ...(h.store.get('C1') as Cord), status: 'installed' }))
		expect([installedCordsGoing(h.store, ['P1']), installedCordsGoing(h.store, ['R1']), installedCordsGoing(h.store, ['P1', 'C1'])]).toEqual([1, 1, 0])
	})
	it('a panel moved to another U and another rack keeps the labels its cords show', () => {
		const h = harness(ROW, [R2])
		const labels = () => patchList(new ProjectIndex(h.store.all())).map((r) => [r.id, r.fromLabel, r.toLabel].join(' '))
		const before = labels()
		const p1 = h.store.get('P1') as Device
		h.store.transact('move', (tx) => tx.put({ ...p1, u: 10 }))
		expect(labels()).toEqual(before)
		h.store.transact('move', (tx) => tx.put({ ...p1, rackId: 'R2', u: 20 }))
		expect(labels()).toEqual(before)
		expect(patchList(new ProjectIndex(h.store.all()))[0].from).toContain('A02')   // the place follows the move
	})
	it('a drag onto an occupied U stops at the last good place', () => {
		const h = harness(ROW)
		const sel = new SelectTool()
		const from = uPoint(h.store, 'R1', 38), onPanel = uPoint(h.store, 'R1', 40)
		sel.down(at(from.x, from.y), h.ctx())
		sel.move(at(from.x, from.y - RU_MM), h.ctx())     // up one U: free
		sel.move(at(onPanel.x, onPanel.y), h.ctx())       // onto Panel 1: refused
		sel.up(at(onPanel.x, onPanel.y), h.ctx())
		expect((h.store.get('SW1') as Device).u).toBe(39)
		expect(h.said.at(-1)).toMatch(/overlap/)
	})
})
