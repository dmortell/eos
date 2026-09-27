import { describe, it, expect, beforeAll } from 'vitest'
import { viewToDxf, viewToDxfBundle, imageCut, visibleRect, type DxfImageRef } from './exportDxf'
import { setBlockResolver, type BlockDef } from './ui/blocks'
import type { Model } from './3dview/types'
import type { Ent } from './ui/geometry'

const model: Model = {
	id: 'm', name: 'M',
	layers: [
		{ id: 'walls', name: 'Walls', color: '#ff0000', visible: true, locked: false },
		{ id: 'off', name: 'Hidden', color: '#00ff00', visible: false, locked: false },
		{ id: 'anno', name: 'Annotations', color: '#0000ff', visible: true, locked: false, group: 'General' },
	],
	objects: [
		{ type: 'prism', id: 'p1', layer: 'walls', x: 1000, y: 2000, z: 0, w: 600, d: 400, h: 2000, edges: 4, label: 'IDF-A' },
		{ type: 'prism', id: 'p2', layer: 'off', x: 0, y: 0, z: 0, w: 10, d: 10, h: 10, edges: 4 },
	],
} as Model
const ents: Ent[] = [
	{ id: 'r', type: 'rect', a: [0, 0], b: [100, 50], layer: 'anno' },
	{ id: 't', type: 'text', a: [10, 10], text: 'HELLO', layer: 'anno' },
	{ id: 'i', type: 'image', a: [0, 0], b: [10, 10], src: 'x', layer: 'anno' },
	{ id: 'e', type: 'rect', a: [0, 0], b: [10, 10], layer: 'anno', plane: 'front' },   // an elevation shape: not in the plan
]

// ── a tiny DXF reader: records (0 = type) with their group codes, and which section each sits in ──
type Rec = { type: string; section: string; g: [number, string][] }
function records(text: string): Rec[] {
	const ln = text.split(/\r?\n/), out: Rec[] = []
	let section = '', cur: Rec | null = null
	for (let i = 0; i + 1 < ln.length; i += 2) {
		const code = Number(ln[i].trim()), val = ln[i + 1].trim()
		if (code === 0) { cur = { type: val, section, g: [] }; out.push(cur); continue }
		if (cur?.type === 'SECTION' && code === 2) section = val
		cur?.g.push([code, val])
	}
	return out
}
const get = (r: Rec, code: number) => r.g.find(([c]) => c === code)?.[1]
const num = (r: Rec, code: number) => Number(get(r, code))
const ofType = (rs: Rec[], t: string, section = 'ENTITIES') => rs.filter((r) => r.type === t && r.section === section)

describe('DXF export (C1)', () => {
	it('exports the plan: visible objects (y flipped), labels, plan shapes; hidden layers + unrasterised images left out', () => {
		const r = viewToDxf({ model, ents, dir: 'plan', scaleN: 100 })
		expect(r.objects).toBe(1)
		expect(r.shapes).toBe(2)
		expect(r.images).toBe(0)
		expect(r.skipped).toBe(1)
		expect(r.text).toContain('Walls')
		expect(r.text).toContain('Annotations')
		expect(r.text).not.toContain('Hidden')
		expect(r.text).toContain('IDF-A')
		expect(r.text).toContain('HELLO')
		expect(r.text).toMatch(/\n-2000(\.0+)?\r?\n/)   // the box's y = 2000 → DXF −2000 (y-up)
	})
	it('an elevation keeps its own shapes and puts the ground at Y = 0', () => {
		const r = viewToDxf({ model, ents, dir: 'front', scaleN: 50 })
		expect(r.shapes).toBe(1)
		expect(r.text).toMatch(/\n2000(\.0+)?\r?\n/)   // the 2000-high box's top
	})
})

// ── O16: blocks as BLOCK + INSERT, attributes as ATTDEF / ATTRIB ──
const lib: Record<string, BlockDef> = {
	out: { id: 'out', name: 'Data outlet', shapes: [{ id: 's', type: 'rect', a: [-100, -100], b: [100, 100] }],
		attributes: [{ tag: 'LABEL', label: 'Label', pos: [0, -150], height: 50 }, { tag: 'TYPE', label: 'Type', pos: [0, 0], height: 30, visible: false, default: 'data' }] },
	dup: { id: 'dup', name: 'Data outlet', shapes: [{ id: 's', type: 'rect', a: [0, 0], b: [10, 10] }], attributes: [] },
}
const bare: Model = { id: 'm', name: 'M', layers: [{ id: 'anno', name: 'Annotations', color: '#0000ff', visible: true, locked: false }], objects: [] } as unknown as Model

describe('DXF export — blocks (O16)', () => {
	beforeAll(() => setBlockResolver((id) => (id ? lib[id] : undefined)))
	it('writes each block once as a BLOCK (ATTDEFs, flags) and each insert as an INSERT with its ATTRIBs + one SEQEND', () => {
		const ins: Ent[] = [
			{ id: 'i1', type: 'insert', block: 'out', a: [1000, 2000], attrs: { LABEL: 'A-01' }, layer: 'anno' },
			{ id: 'i2', type: 'insert', block: 'out', a: [3000, 2000], attrs: { LABEL: 'A-02', TYPE: 'wap' }, layer: 'anno', scale: 2, mirror: true },
			{ id: 'i3', type: 'insert', block: 'dup', a: [0, 0], layer: 'anno' },
		]
		const rs = records(viewToDxf({ model: bare, ents: ins, dir: 'plan', scaleN: 100 }).text)
		const blocks = ofType(rs, 'BLOCK', 'BLOCKS').map((b) => get(b, 2))
		expect(blocks).toContain('Data outlet')
		expect(blocks).toContain('Data outlet_2')   // a name clash → made unique
		const defIdx = rs.findIndex((r) => r.type === 'BLOCK' && get(r, 2) === 'Data outlet')
		expect(num(rs[defIdx], 70)).toBe(2)   // has non-constant attributes
		const attdefs = ofType(rs, 'ATTDEF', 'BLOCKS')
		expect(attdefs.map((a) => get(a, 2))).toEqual(['LABEL', 'TYPE'])
		expect(attdefs.map((a) => num(a, 70))).toEqual([0, 1])   // TYPE is hidden → invisible
		expect(get(attdefs[1], 1)).toBe('data')   // the default value
		expect(num(attdefs[0], 20)).toBe(150)   // pos y −150 (y-down) → block y +150
		// no exploded geometry in model space — just the INSERTs
		expect(ofType(rs, 'LWPOLYLINE')).toHaveLength(0)
		const inserts = ofType(rs, 'INSERT')
		expect(inserts.map((i) => get(i, 2))).toEqual(['Data outlet', 'Data outlet', 'Data outlet_2'])
		expect([num(inserts[0], 10), num(inserts[0], 20)]).toEqual([1000, -2000])
		expect(num(inserts[0], 66)).toBe(1)
		expect([num(inserts[1], 41), num(inserts[1], 42)]).toEqual([-2, 2])   // mirrored, scale 2
		expect(num(inserts[2], 66)).toBe(0)   // no attributes → none follow
		// entity order: INSERT, ATTRIB, ATTRIB, SEQEND for each attributed insert
		const seq = rs.filter((r) => r.section === 'ENTITIES' && r.type !== 'SECTION' && r.type !== 'ENDSEC').map((r) => r.type)
		expect(seq).toEqual(['INSERT', 'ATTRIB', 'ATTRIB', 'SEQEND', 'INSERT', 'ATTRIB', 'ATTRIB', 'SEQEND', 'INSERT'])
		const attribs = ofType(rs, 'ATTRIB')
		expect(attribs.map((a) => `${get(a, 2)}=${get(a, 1)}/${num(a, 70)}`)).toEqual(['LABEL=A-01/0', 'TYPE=data/1', 'LABEL=A-02/0', 'TYPE=wap/1'])
		expect([num(attribs[0], 10), num(attribs[0], 20)]).toEqual([1000, -1850])   // at the insert + pos, in world coords
		expect(num(attribs[2], 40)).toBe(100)   // height × the insert's scale
		// the SEQEND and ATTRIBs are owned by their INSERT
		const seqEnd = rs.find((r) => r.type === 'SEQEND')!
		expect(get(seqEnd, 330)).toBe(get(inserts[0], 5))
		expect(get(attribs[0], 330)).toBe(get(inserts[0], 5))
	})
	it('a rotated insert: DXF angle = −rot about its rotated insertion point', () => {
		const rs = records(viewToDxf({ model: bare, ents: [{ id: 'i', type: 'insert', block: 'dup', a: [0, 0], rot: 90, layer: 'anno' }], dir: 'plan', scaleN: 100 }).text)
		const ins = ofType(rs, 'INSERT')[0]
		expect(num(ins, 50)).toBe(-90)
		// block extent 0..10 → rotation centre (5, 5); a = (0, 0) turns to (10, 0) → DXF (10, −0)
		expect(num(ins, 10)).toBeCloseTo(10)
		expect(num(ins, 20)).toBeCloseTo(0)
	})
})

// ── O17: dimensions as real DIMENSION entities ──
describe('DXF export — dimensions (O17)', () => {
	const dim = (over: Partial<Ent> = {}): Ent => ({ id: 'd', type: 'dim', a: [0, 0], b: [1000, 0], layer: 'anno', ...over })
	it('an aligned DIMENSION: measured points, dim line, figure position, its *D block + a 1:N dimstyle', () => {
		const rs = records(viewToDxf({ model: bare, ents: [dim({ dimExt: 300 })], dir: 'plan', scaleN: 100 }).text)
		const d = ofType(rs, 'DIMENSION')[0]
		expect(d).toBeDefined()
		expect(get(d, 8)).toBe('Annotations')
		expect(num(d, 70)).toBe(1 | 32 | 128)   // aligned, own block, text placed
		expect([num(d, 13), num(d, 23), num(d, 14), num(d, 24)]).toEqual([0, 300, 1000, 300])   // dimExt back from the line (y-down −300 → up)
		expect([num(d, 10), num(d, 20)]).toEqual([1000, 0])   // the dimension line through b
		expect([num(d, 11), num(d, 21)]).toEqual([500, -250])   // the figure: mid, 2.5 paper mm × 100 off the line
		expect(num(d, 42)).toBe(1000)
		expect(get(d, 1)).toBeUndefined()   // no override → the measurement
		expect(get(d, 3)).toBe('PAGES_1_100')
		const blk = get(d, 2)!
		expect(blk).toMatch(/^\*D\d+$/)
		const bi = rs.findIndex((r) => r.type === 'BLOCK' && get(r, 2) === blk)
		expect(num(rs[bi], 70)).toBe(1)   // anonymous
		const inBlock: string[] = []
		for (let i = bi + 1; rs[i].type !== 'ENDBLK'; i++) inBlock.push(rs[i].type)
		expect(inBlock).toContain('HATCH')   // the arrowheads, filled
		expect(inBlock).toContain('TEXT')
		expect(inBlock.filter((t) => t === 'LINE').length).toBe(5)   // dim line + 2 end ticks + 2 extension lines
		const ds = rs.find((r) => r.type === 'DIMSTYLE' && get(r, 2) === 'PAGES_1_100')!
		expect(num(ds, 40)).toBe(100)   // DIMSCALE
		// no loose lines in model space any more
		expect(ofType(rs, 'LINE')).toHaveLength(0)
	})
	it('keeps text overrides: an mm template passes through; a cm / m figure is fixed; ticks pick the tick style', () => {
		const rs = records(viewToDxf({ model: bare, ents: [dim({ id: 'a', text: 'W=<>' }), dim({ id: 'b', unit: 'm' }), dim({ id: 'c', headStart: 'tick', headEnd: 'tick' })], dir: 'plan', scaleN: 50 }).text)
		const ds = ofType(rs, 'DIMENSION')
		expect(get(ds[0], 1)).toBe('W=<>')
		expect(get(ds[1], 1)).toBe('1.00')
		expect(get(ds[2], 3)).toBe('PAGES_1_50_TICK')
		const v = ofType(records(viewToDxf({ model: bare, ents: [dim({ b: [0, 3000] })], dir: 'plan', scaleN: 50 }).text), 'DIMENSION')[0]
		expect(num(v, 50)).toBe(-90)   // a vertical dim's direction (down the page = −y in the DXF)
		expect(new Set(ds.map((d) => get(d, 2))).size).toBe(3)   // one geometry block each
	})
})

// ── O15: images as IMAGE + IMAGEDEF referencing sidecar files ──
describe('DXF export — images (O15)', () => {
	const img = (over: Partial<Ent> = {}): Ent => ({ id: 'im', type: 'image', a: [1000, 1000], b: [5000, 4000], src: 'pdf:f#1', layer: 'anno', ...over })
	it('imageCut: whole image kept as is; a crop cuts the source rect; a stretched placement is resampled to its aspect', () => {
		expect(imageCut(img(), 400, 300)).toMatchObject({ sx: 0, sy: 0, sw: 400, sh: 300, dw: 400, dh: 300, whole: true })
		expect(imageCut(img({ crop: { x: 0.25, y: 0.5, w: 0.5, h: 0.5 } }), 400, 300)).toMatchObject({ sx: 100, sy: 150, sw: 200, sh: 150, dw: 200, dh: 150, whole: false })
		expect(imageCut(img({ b: [5000, 7000] }), 400, 300)).toMatchObject({ dw: 400, dh: 600, whole: false })   // 4000 × 6000 mm → 2:3
		expect(imageCut(img(), 16000, 12000, 8000)).toMatchObject({ dw: 8000, dh: 6000, whole: false })   // capped
		expect(visibleRect(img({ crop: { x: 0.25, y: 0.5, w: 0.5, h: 0.5 } }))).toEqual([2000, 2500, 4000, 4000])
	})
	it('an IMAGE at the visible rect (bottom-left insertion, width / px per pixel), its IMAGEDEF naming the file, opacity → fade', () => {
		const images = new Map<string, DxfImageRef>([['im', { path: 'plan_img1.png', pxW: 400, pxH: 300 }]])
		const r = viewToDxf({ model: bare, ents: [img({ opacity: 0.6 })], dir: 'plan', scaleN: 100, images })
		expect(r.images).toBe(1)
		expect(r.skipped).toBe(0)
		const rs = records(r.text)
		const im = ofType(rs, 'IMAGE')[0]
		expect([num(im, 10), num(im, 20)]).toEqual([1000, -4000])   // bottom-left (y-down 4000 → −4000)
		expect(num(im, 11)).toBeCloseTo(10)   // u: 4000 mm / 400 px
		expect(num(im, 22)).toBeCloseTo(10)   // v
		expect([num(im, 13), num(im, 23)]).toEqual([400, 300])
		expect(num(im, 283)).toBe(40)
		const def = rs.find((x) => x.type === 'IMAGEDEF')!
		expect(get(def, 1)).toBe('plan_img1.png')
		expect(get(im, 340)).toBe(get(def, 5))
	})
	it('a rotated image turns clockwise on screen = its u vector points down in the y-up DXF', () => {
		const images = new Map<string, DxfImageRef>([['im', { path: 'a.png', pxW: 400, pxH: 300 }]])
		const im = ofType(records(viewToDxf({ model: bare, ents: [img({ rot: 90 })], dir: 'plan', scaleN: 100, images }).text), 'IMAGE')[0]
		expect(num(im, 11)).toBeCloseTo(0)
		expect(num(im, 21)).toBeCloseTo(-10)
		expect(num(im, 12)).toBeCloseTo(10)   // v: the image's up = +x
		expect(num(im, 22)).toBeCloseTo(0)
	})
	it('several images: ONE ACAD_IMAGE_DICT, raster variables, the CLASSES records AutoCAD needs', () => {
		const images = new Map<string, DxfImageRef>([['a', { path: 'a.png', pxW: 10, pxH: 10 }], ['b', { path: 'b.png', pxW: 10, pxH: 10 }]])
		const rs = records(viewToDxf({ model: bare, ents: [img({ id: 'a' }), img({ id: 'b' })], dir: 'plan', scaleN: 100, images }).text)
		const root = rs.find((r) => r.type === 'DICTIONARY' && r.section === 'OBJECTS')!
		const keys = root.g.filter(([c]) => c === 3).map(([, v]) => v)
		expect(keys.filter((k) => k === 'ACAD_IMAGE_DICT')).toHaveLength(1)
		expect(keys).toContain('ACAD_IMAGE_VARS')
		const dictH = root.g[root.g.findIndex(([c, v]) => c === 3 && v === 'ACAD_IMAGE_DICT') + 1][1]
		const dict = rs.find((r) => r.type === 'DICTIONARY' && get(r, 5) === dictH)!
		expect(dict.g.filter(([c]) => c === 350)).toHaveLength(2)   // both IMAGEDEFs in it
		expect(rs.filter((r) => r.type === 'IMAGEDEF').every((d) => get(d, 330) === dictH)).toBe(true)
		expect(rs.filter((r) => r.type === 'CLASS').map((c) => get(c, 1))).toEqual(['IMAGE', 'IMAGEDEF', 'IMAGEDEF_REACTOR', 'RASTERVARIABLES'])
		expect(rs.some((r) => r.type === 'RASTERVARIABLES')).toBe(true)
		const imgs = ofType(rs, 'IMAGE')   // each reactor is owned by its IMAGE
		expect(rs.filter((r) => r.type === 'IMAGEDEF_REACTOR').map((r) => get(r, 330))).toEqual(imgs.map((i) => get(i, 5)))
	})
	it('viewToDxfBundle: rasterises each image once (same picture, same cut → one file), names the sidecars, skips failures', async () => {
		const calls: string[] = []
		const ras = async (e: Ent) => { calls.push(e.id); return e.src === 'bad' ? null : { data: new Uint8Array([1, 2, 3]), ext: 'png', w: 40, h: 30 } }
		const list = [img({ id: 'a' }), img({ id: 'b', a: [9000, 0], b: [13000, 3000] }), img({ id: 'c', crop: { x: 0, y: 0, w: 0.5, h: 1 } }), img({ id: 'd', src: 'bad' })]
		const r = await viewToDxfBundle({ model: bare, ents: list, dir: 'plan', scaleN: 100 }, 'Plan_1', ras)
		expect(calls).toEqual(['a', 'c', 'd'])   // b = a's picture at a's aspect → shared
		expect(r.files.map((f) => f.name)).toEqual(['Plan_1_img1.png', 'Plan_1_img2.png'])
		expect(r.images).toBe(3)
		expect(r.skipped).toBe(1)
		expect(r.text).toContain('Plan_1_img1.png')
		// no images → no files (the caller downloads the bare .dxf)
		expect((await viewToDxfBundle({ model: bare, ents: [], dir: 'plan', scaleN: 100 }, 'x', ras)).files).toEqual([])
	})
})
