import { describe, it, expect } from 'vitest'
import { viewToDxf } from './exportDxf'
import { dxfEntStyle, DXF_LW } from './dxfEntities'
import type { Model } from './3dview/types'
import type { Ent } from './ui/geometry'

// the DXF's records (0 = type) with their group codes, in order
type Rec = { type: string; g: [number, string][] }
function records(text: string): Rec[] {
	const ln = text.split(/\r?\n/), out: Rec[] = []
	let cur: Rec | null = null
	for (let i = 0; i + 1 < ln.length; i += 2) {
		const code = Number(ln[i].trim()), val = ln[i + 1].trim()
		if (code === 0) { cur = { type: val, g: [] }; out.push(cur); continue }
		cur?.g.push([code, val])
	}
	return out
}
const get = (r: Rec, code: number) => r.g.find(([c]) => c === code)?.[1]

describe('DXF object style', () => {
	it('dxfEntStyle: an own colour → ACI + RGB, ByLayer → none; lineweight own (hundredths) or BYLAYER', () => {
		expect(dxfEntStyle({ color: '#ff0000', lw: 0.5 })).toEqual({ aci: 1, rgb: 0xff0000, lw: 50 })
		expect(dxfEntStyle({})).toEqual({ lw: DXF_LW.byLayer })
		expect(dxfEntStyle({ color: 'bylayer', weight: 1.2 })).toEqual({ lw: 25 })
		expect(dxfEntStyle({ color: '#f00' }).rgb).toBe(0xff0000)
	})
	it('inside a block: byblock colour → 0, no lineweight → BYBLOCK', () => {
		expect(dxfEntStyle({ color: 'byblock' }, true)).toEqual({ aci: 0, lw: DXF_LW.byBlock })
		expect(dxfEntStyle({ lw: 0.18 }, true)).toEqual({ lw: 18 })
	})

	const model = {
		id: 'm', name: 'M', objects: [],
		layers: [
			{ id: 'anno', name: 'Annotations', color: '#0000ff', visible: true, locked: false, lw: 0.35 },
			{ id: 'old', name: 'Old', color: '#00ff00', visible: true, locked: false, weight: 2 },
			{ id: 'plain', name: 'Plain', color: '#00ff00', visible: true, locked: false },
		],
	} as unknown as Model
	const ents: Ent[] = [
		{ id: 'a', type: 'rect', a: [0, 0], b: [10, 10], layer: 'anno', color: '#ff0000', lw: 0.7 },
		{ id: 'b', type: 'rect', a: [0, 0], b: [20, 20], layer: 'plain' },
	]
	it('writes each shape’s colour (62 + 420) and lineweight (370) in its AcDbEntity section', () => {
		const rs = records(viewToDxf({ model, ents, dir: 'plan', scaleN: 100 }).text)
		const polys = rs.filter((r) => r.type === 'LWPOLYLINE')
		expect(polys).toHaveLength(2)
		const [a, b] = polys
		expect(get(a, 62)).toBe('1')
		expect(get(a, 420)).toBe(String(0xff0000))
		expect(get(a, 370)).toBe('70')
		expect(get(b, 62)).toBeUndefined()   // BYLAYER
		expect(get(b, 370)).toBe('-1')
		// 370 sits before the entity's own subclass marker (in AcDbEntity)
		const marks = a.g.filter(([c]) => c === 100).map(([, v]) => v)
		expect(marks).toEqual(['AcDbEntity', 'AcDbPolyline'])
		const i370 = a.g.findIndex(([c]) => c === 370), iPoly = a.g.findIndex(([c, v]) => c === 100 && v === 'AcDbPolyline')
		expect(i370).toBeLessThan(iPoly)
	})
	it('each layer’s lineweight: its lw, a legacy weight mapped, else DEFAULT (−3) — not the library’s 0.00 mm', () => {
		const rs = records(viewToDxf({ model, ents, dir: 'plan', scaleN: 100 }).text)
		const layer = (n: string) => rs.find((r) => r.type === 'LAYER' && get(r, 2) === n)!
		expect(get(layer('Annotations'), 370)).toBe('35')
		expect(get(layer('Plain'), 370)).toBe('-3')
		// 'Old' has no shapes here, so it isn't written; layer 0 is DEFAULT
		expect(get(layer('0'), 370)).toBe('-3')
	})
})
