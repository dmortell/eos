import { describe, it, expect, beforeAll } from 'vitest'
import { DEFAULT_BLOCKS, setBlockResolver, blockExtent, insertBounds, byBlock, attrValue, attrColor, OUTLET_ATTRS, BYBLOCK, insertLink, blockFromShapes } from './blocks'
import { hitEnt, bbox, inThisView } from './hit'
import type { Ent } from './geometry'
import type { ViewCtx } from './view'

const lib = Object.fromEntries(DEFAULT_BLOCKS.map((b) => [b.id, b]))
beforeAll(() => setBlockResolver((id) => (id ? lib[id] : undefined)))
const ctx = { dir: 'plan', isPlan: true, isElev: false, isIso: false, elevDir: 'front', cx: 0, cy: 0, ground: 0, paperMm: 100, mdl: undefined, yaw: 0, pitch: 0 } as ViewCtx
const ins = (over: Partial<Ent> = {}): Ent => ({ id: 'i', type: 'insert', block: 'outlet-box', a: [1000, 2000], color: '#2563eb', fill: '#3b82f6', attrs: { LABEL: '33.3.012', PORTS: '2', NOTE: 'Mtg Rm', TYPE: 'network' }, ...over })

describe('blocks (global library model)', () => {
	it('the three outlet blocks share the LABEL / PORTS / NOTE / TYPE attributes; TYPE is not drawn', () => {
		const outlets = DEFAULT_BLOCKS.filter((b) => b.category === 'outlet')
		expect(outlets.map((b) => b.id)).toEqual(['outlet-box', 'outlet-wall', 'outlet-floor'])
		for (const b of outlets) expect(b.attributes.map((a) => a.tag)).toEqual(['LABEL', 'PORTS', 'NOTE', 'TYPE'])
		expect(OUTLET_ATTRS.find((a) => a.tag === 'TYPE')!.visible).toBe(false)
	})
	it('D3 symbols: markers / elevation tags carry a hidden LINK; tags come with 1-4 arms, one ref each; a mirrored insert flips its box', () => {
		for (const id of ['section-mark', 'detail-mark', 'photo-mark', 'eltag-1', 'eltag-4']) expect(lib[id].attributes.find((a) => a.tag === 'LINK')?.visible).toBe(false)
		expect([1, 2, 3, 4].map((n) => lib[`eltag-${n}`].attributes.filter((a) => /^R\d$/.test(a.tag)).length)).toEqual([1, 2, 3, 4])
		const door = ins({ block: 'door', attrs: {} }), [x0, , x1] = insertBounds(door), [m0, , m1] = insertBounds({ ...door, mirror: true })
		expect([m0, m1]).toEqual([2000 - x1, 2000 - x0])
		expect(insertLink(ins({ block: 'section-mark', attrs: { LINK: ' sh1 ' } }))).toBe('sh1')
	})
	it('D5: shapes become a block around their centre, without their own layer / group / scope', () => {
		const r = blockFromShapes([{ id: 'a', type: 'rect', a: [100, 100], b: [300, 200], layer: 'L', groupId: 'g', space: 'view:f' }, { id: 'b', type: 'text', a: [100, 300], text: 'X' }], 'blk', 'Mine')
		expect(r.at).toEqual([200, 200])
		expect(r.def.shapes[0]).toEqual({ id: 's1', type: 'rect', a: [-100, -100], b: [100, 0] })
		expect(r.def.shapes[1]).toMatchObject({ id: 's2', a: [-100, 100], text: 'X' })
		expect(r.def.category).toBe('custom')
	})
	it("the rosette's triangle is centred in its circle (every corner on the circle)", () => {
		const t = lib['outlet-box'].shapes.find((s) => s.type === 'polyline')!
		for (const [x, y] of t.pts!) expect(Math.hypot(x, y)).toBeCloseTo(150, 0)
	})
	it('an insert covers its block extent, scaled, at the insertion point; a missing block is a 200 mm box', () => {
		expect(blockExtent(lib['outlet-box'])).toEqual([-150, -150, 150, 150])
		expect(insertBounds(ins({ scale: 2 }))).toEqual([700, 1700, 1300, 2300])
		expect(insertBounds(ins({ block: 'gone' }))).toEqual([900, 1900, 1100, 2100])
		expect(bbox(ctx, ins())).toEqual([850, 1850, 1150, 2150])
	})
	it("resolves 'byblock' colour / fill from the insert (no insert fill = an outline symbol)", () => {
		const circle = lib['outlet-box'].shapes[0]
		expect(circle.color).toBe(BYBLOCK)
		expect(byBlock(circle, ins())).toMatchObject({ color: '#2563eb', fill: '#3b82f6' })
		expect(byBlock(circle, ins({ fill: undefined })).fill).toBe('none')
	})
	it('attribute values fall back to the definition default; PORTS text contrasts with a filled symbol', () => {
		const ports = OUTLET_ATTRS.find((a) => a.tag === 'PORTS')!
		expect(attrValue(ins(), ports)).toBe('2')
		expect(attrValue(ins({ attrs: {} }), ports)).toBe('1')
		expect(attrColor(ins(), ports)).toBe('#ffffff')
		expect(attrColor(ins({ fill: undefined }), ports)).toBe('#2563eb')
		expect(attrColor(ins(), OUTLET_ATTRS[0])).toBeUndefined()   // LABEL = normal ink
	})
	it('picks anywhere on the symbol; swapping the block keeps the attributes; not shown in elevations', () => {
		expect(hitEnt(ctx, ins(), [1100, 2100], 1)).toBe(true)
		expect(hitEnt(ctx, ins(), [1300, 2000], 1)).toBe(false)
		const swapped = { ...ins(), block: 'outlet-floor' }
		expect(swapped.attrs).toEqual(ins().attrs)
		expect(inThisView({ ...ctx, isPlan: false, isElev: true, dir: 'front' } as ViewCtx, ins())).toBe(false)
	})
})
