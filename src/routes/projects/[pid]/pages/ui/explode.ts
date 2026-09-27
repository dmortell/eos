// EXPLODE: a shape → its parts (drawing coords). A polyline → its segments (2-point lines); a rect → 4 lines; a block
// insert → its block's shapes (+ its visible attribute values as text), transformed exactly as the Viewport draws
// them (translate(a) · scale(±k, k), then the insert's rotation about its box centre). Others don't explode (null).
import { translate, type Ent, type Pt } from './geometry'
import { blockDef, byBlock, attrValue, insertScale } from './blocks'
import { mirrorAbout, scaleAbout, rotateAbout } from './groupXf'
import { rotatePt } from './hit'
import { PT_MM } from '../constants'

type Opts = { centreOf: (e: Ent) => Pt; paperMm: number; uid: () => string }

export function explodeEnt(e: Ent, o: Opts): Ent[] | null {
	const base = { layer: e.layer, color: e.color, weight: e.weight, lw: e.lw, dash: e.dash, plane: e.plane, space: e.space }
	const line = (a: Pt, b: Pt): Ent => ({ ...base, id: o.uid(), type: 'polyline', pts: [a, b] })
	if (e.type === 'polyline' && (e.pts?.length ?? 0) > 2) {
		const c = o.centreOf(e), W = (p: Pt) => (e.rot ? rotatePt(p, c, e.rot) : p), p = e.pts!
		return p.slice(1).map((q, i) => line(W(p[i]), W(q)))
	}
	if (e.type === 'rect') {
		const [ax, ay] = e.a!, [bx, by] = e.b!, c = o.centreOf(e), W = (p: Pt) => (e.rot ? rotatePt(p, c, e.rot) : p)
		const q: Pt[] = [[ax, ay], [bx, ay], [bx, by], [ax, by]].map((p) => W(p as Pt))
		return q.map((p, i) => line(p, q[(i + 1) % 4]))
	}
	if (e.type === 'insert') {
		const def = blockDef(e.block); if (!def) return null
		const k = insertScale(e, o.paperMm), rc = o.centreOf(e)
		const place = (s: Ent): Ent => {
			let t: Ent = { ...s, id: o.uid(), plane: e.plane, space: e.space }
			if (e.mirror) t = mirrorAbout(t, [0, 0], [0, 1], o.centreOf)
			t = translate(scaleAbout(t, [0, 0], k), e.a![0], e.a![1])
			return e.rot ? rotateAbout(t, rc, e.rot, o.centreOf(t)) : t
		}
		const shapes = def.shapes.map((s) => place({ ...byBlock(s, e), groupId: undefined }))
		const texts = def.attributes.filter((ad) => ad.visible !== false && attrValue(e, ad) && ad.tag !== 'LINK').map((ad): Ent => {
			let t: Ent = { id: o.uid(), type: 'text', a: [e.a![0] + (e.mirror ? -ad.pos[0] : ad.pos[0]) * k, e.a![1] + ad.pos[1] * k], text: attrValue(e, ad),
				align: 'center', fontPt: Math.max(1, Math.round(((ad.height * k) / (PT_MM * o.paperMm)) * 2) / 2), layer: e.layer, plane: e.plane, space: e.space }
			if (e.rot) t = { ...t, a: rotatePt(t.a!, rc, e.rot) }
			return t
		})
		return [...shapes, ...texts]
	}
	return null
}
