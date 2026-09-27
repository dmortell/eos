// C1: DXF EXPORT of one viewport — its model objects (projected exactly as Model3d draws them: section clip,
// hidden / frozen layers, a riser drawing's collapsed floors) plus the view's 2D shapes, in REAL MILLIMETRES,
// one DXF layer per Pages layer (ACI colour from the layer colour). Built on the Sheets tool's DXF writer
// (sheets/dxf/dxf.ts, @tarikjabiri/dxf) + dxfEntities.ts (the entities that library gets wrong).
//   plan       X = model x, Y = −model y (DXF is y-up)
//   elevation  X = the drawing's horizontal, Y = height above the ground line (z = 0 → Y = 0), storey levels
//   iso        a wireframe of the model's edges (no hidden lines)
// Annotative sizes (text, dimension figures, arrow ticks) are drawn at the viewport's scale 1:N, as on paper.
// O16 blocks are BLOCK definitions + INSERTs (attributes as ATTDEF / ATTRIB), so a recipient can count / swap them.
// O17 dimensions are real (aligned) DIMENSIONs, their drawn geometry in an anonymous *D block.
// O15 images: a DXF only REFERENCES a raster file — `viewToDxfBundle` rasterises each one (a PDF page / a picture,
//     cropped + resampled to its placement) into a sidecar file and writes IMAGE entities naming it; the caller
//     zips the .dxf with them. Plain `viewToDxf` without `images` counts them in `skipped`.
import { TextHorizontalAlignment, LWPolylineFlags, HatchBoundaryPaths, HatchPolylineBoundary, HatchPredefinedPatterns, BlockFlags, point2d, point3d, vertex, type EntitiesManager } from '@tarikjabiri/dxf'
import { DxfDoc, sanitizeLayer } from '../sheets/dxf/dxf'
import type { Model, Obj, Clip, Dir } from './3dview/types'
import { BASIS } from './3dview/types'
import { project, viewMap, isoBounds, trimToClip, objBounds } from './3dview/projection'
import { storeyMap } from './3dview/storeyMap'
import { GROUND, PLAN_CX, PLAN_CY, STYLE_DEFAULTS, textBox, arcPts, isNote, dimExtLines, type Ent, type Pt, type ElevDir } from './ui/geometry'
import { inThisView, rotCenter, rotatePt, noteGeom, bbox } from './ui/hit'
import { lineLabelAt, groundPts, tileLines, hatchLines, headGeom } from './ui/annotations'
import { blockDef, attrValue, insertScale, type BlockDef } from './ui/blocks'
import { isLegend, legendRows, legendSize, LEGEND } from './ui/legend'
import { dimLabel } from './ui/drawingDefaults'
import { PT_MM } from './constants'
import type { ViewCtx } from './ui/view'
import { AttEnt, DimEnt, addAttribs, anonBlock, pagesDimStyle, fixImageObjects } from './dxfEntities'

/** A rasterised image's sidecar file, as an IMAGE entity references it (relative path + pixel size). */
export type DxfImageRef = { path: string; pxW: number; pxH: number }
export type DxfViewInput = {
	model: Model
	/** The shapes of the model (the export keeps the ones that belong to this view, like the viewport does). */
	ents: Ent[]
	dir: Dir
	clip?: Clip | null
	yaw?: number; pitch?: number
	/** VP Freeze: layer ids hidden in this viewport only. */
	frozen?: string[]
	/** A riser drawing's visible storeys (hidden floors collapse to a break). */
	storeys?: string[]
	/** The viewport's scale denominator N (1:N) — annotative sizes. */
	scaleN: number
	/** The sheet frame id (view-scoped shapes `space: 'view:<id>'`). */
	frameId?: string
	/** O15: image shape id → its rasterised sidecar (viewToDxfBundle fills it); an image without one is skipped. */
	images?: Map<string, DxfImageRef>
}
export type DxfResult = { text: string; objects: number; shapes: number; images: number; skipped: number }
export type DxfFile = { name: string; data: Uint8Array }

/** The view's frame of reference: its ViewCtx, the layer gates, and which 2D shapes belong to it. */
function viewScope(inp: DxfViewInput) {
	const { model, dir } = inp, yaw = inp.yaw ?? 0, pitch = inp.pitch ?? 0, N = inp.scaleN || 1
	const isPlan = dir === 'plan', isIso = dir === 'iso', isElev = !isPlan && !isIso
	const layers = model.layers ?? [], frozen = new Set(inp.frozen ?? [])
	const layerOf = (id?: string) => layers.find((l) => l.id === id)
	const shown = (id?: string) => { const l = layerOf(id); return (!l || l.visible) && !(id && frozen.has(id)) }
	const ctx: ViewCtx = { dir, isPlan, isElev, isIso, elevDir: (isElev ? dir : 'front') as ElevDir, cx: PLAN_CX, cy: PLAN_CY, ground: GROUND, frameId: inp.frameId, paperMm: N, mdl: model, yaw, pitch }
	// a plan shape seen in an elevation is an edge-on line — the viewport shows it at the ground; not exported
	const keep = (e: Ent) => !isIso && shown(e.layer) && inThisView(ctx, e) && !(isElev && e.plane !== dir)
	return { ctx, N, yaw, pitch, isPlan, isIso, isElev, layerOf, shown, keep }
}

/** The image shapes this view exports (what viewToDxfBundle rasterises). */
export const dxfImageEnts = (inp: DxfViewInput): Ent[] => { const s = viewScope(inp); return inp.ents.filter((e) => e.type === 'image' && s.keep(e)) }

/** Per-export state shared by the entity writers. */
type Ex = { doc: DxfDoc; ctx: ViewCtx; N: number; blocks: Map<string, string | null>; blockNames: Set<string>; anon: number }

export function viewToDxf(inp: DxfViewInput): DxfResult {
	const { model, dir } = inp
	const { ctx, N, yaw, pitch, isIso, isElev, layerOf, shown, keep } = viewScope(inp)
	const doc = new DxfDoc(), ms = doc.w.modelSpace
	const dxfLayer = (id?: string) => { const l = layerOf(id); return l ? doc.layer(l.name, l.color) : '0' }
	// drawing coords (y-down, the viewport's own) → DXF (y-up; an elevation's ground line at Y = 0)
	const baseY = isElev ? GROUND : 0
	const P = (p: Pt): [number, number] => [p[0], baseY - p[1]]
	const isoBox = isIso ? isoBounds(model.objects, yaw, pitch, PLAN_CX, PLAN_CY, (o) => shown(o.layer)) : null
	const vm = viewMap(dir, PLAN_CX, PLAN_CY, GROUND, yaw, pitch, isoBox)
	const sm = isElev && inp.storeys && model.storeys?.length ? storeyMap(model.storeys, inp.storeys) : null
	const vs = isElev ? BASIS[dir as ElevDir].vs : 1
	const uv = (q: { u: number; v: number }) => P(vm.uvToDraw(sm ? { u: q.u, v: vs * sm.map(vs * q.v) } : q))
	const x: Ex = { doc, ctx, N, blocks: new Map(), blockNames: new Set(), anon: 0 }
	let objects = 0, shapes = 0, images = 0, skipped = 0
	// the drawing's extents (DXF coords) → $EXTMIN / $EXTMAX + the *Active view, so a viewer (LibreCAD) OPENS on the
	// content instead of round the origin with it off screen
	const ext = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
	const grow = (q: [number, number]) => { if (!Number.isFinite(q[0]) || !Number.isFinite(q[1])) return; ext.x0 = Math.min(ext.x0, q[0]); ext.y0 = Math.min(ext.y0, q[1]); ext.x1 = Math.max(ext.x1, q[0]); ext.y1 = Math.max(ext.y1, q[1]) }

	// ── images first: an underlay sits BELOW everything (DXF draws in entity order) ──
	for (const e of inp.ents) {
		if (e.type !== 'image' || !keep(e)) continue
		const ref = inp.images?.get(e.id)
		if (ref && imageToDxf(ms, e, ctx, P, dxfLayer(e.layer), ref, `PAGES_IMG_${images + 1}`)) { images++; const [a, b, c, d] = bbox(ctx, e); grow(P([a, b])); grow(P([c, d])) }
		else skipped++
	}
	if (images) fixImageObjects(doc.w)

	// ── model objects ──
	for (const o of model.objects) {
		if (!shown(o.layer)) continue
		if (sm) { const b = objBounds(o); if (sm.hidden(b.z0, b.z1)) continue }
		const to: Obj | null = inp.clip ? trimToClip(o, inp.clip) : o; if (!to) continue
		const layer = dxfLayer(o.layer)
		for (const s of project(to, dir, yaw, pitch, PLAN_CX, PLAN_CY)) { const pts = s.pts.map(uv); pts.forEach(grow); doc.poly(pts, { closed: s.closed, layer }) }
		if (o.label && !isIso) {   // a labelled object's name (a riser room "IDF01-A"), centred like the viewport draws it
			const b = objBounds(o), mid = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, z: (b.z0 + b.z1) / 2 }
			const [dx, dy] = vm.toDraw(mid)
			text(ms, P([dx, dy]), 2.2 * N, o.label, layer, 'center', 0)
		}
		objects++
	}
	// ── storey levels (an elevation of a building) ──
	if (isElev && model.storeys?.length) {
		const layer = doc.layer('Levels', '#94a3b8'), xs: number[] = []
		// oblique: phase 5 — two opposite bounds corners give the u extent only on an axis-aligned frame
		for (const o of model.objects) { const b = objBounds(o); xs.push(vm.toDraw({ x: b.x0, y: b.y0, z: 0 })[0], vm.toDraw({ x: b.x1, y: b.y1, z: 0 })[0]) }
		const x0 = xs.length ? Math.min(...xs) - 1500 : 0, x1 = xs.length ? Math.max(...xs) + 500 : 10000
		for (const st of sm ? sm.shown : model.storeys) {
			const y = sm ? sm.map(st.z) : st.z
			doc.line([x0, y], [x1, y], layer)
			text(ms, [x0, y + 1 * N], 2.2 * N, st.name, layer, 'left', 0)
		}
	}

	// ── 2D shapes that belong to this view ──
	for (const e of inp.ents) {
		if (e.type === 'image' || !keep(e)) continue
		entToDxf(x, ms, e, P, dxfLayer(e.layer))
		const [a, b, c, d] = bbox(ctx, e); grow(P([a, b])); grow(P([c, d]))
		shapes++
	}
	const has = ext.x0 <= ext.x1
	if (has) setExtents(doc, ext)
	const dxf = doc.stringify()
	return { text: has ? activeView(dxf, ext) : dxf, objects, shapes, images, skipped }
}

type Ext = { x0: number; y0: number; x1: number; y1: number }
/** $EXTMIN / $EXTMAX: the drawing's extents in the header. */
export function setExtents(doc: DxfDoc, e: Ext) {
	doc.w.setVariable('$EXTMIN', { 10: e.x0, 20: e.y0, 30: 0 })
	doc.w.setVariable('$EXTMAX', { 10: e.x1, 20: e.y1, 30: 0 })
}
/** The *Active viewport's centre (12 / 22) and height (40), 5 % margin, fitting a ~16:10 window either way — what
 *  LibreCAD opens on. Patched into the text: @tarikjabiri/dxf ignores its VPORT's viewCenter / viewHeight and always
 *  writes 0,0 / 200 (the content then opened off screen, Dave 2026-09-27). */
export function activeView(dxf: string, e: Ext): string {
	const cx = (e.x0 + e.x1) / 2, cy = (e.y0 + e.y1) / 2, h = Math.max(1, (e.y1 - e.y0) * 1.05, ((e.x1 - e.x0) * 1.05) / 1.6)
	return dxf.replace(/(\n2\n\*Active\n[\s\S]*?\n12\n)0(\n22\n)0([\s\S]*?\n40\n)200\n/, `$1${cx}$2${cy}$3${h}\n`)
}

/** Rasterises one image shape for the DXF (a browser job — dxfImages.ts): the sidecar's bytes + extension + pixel size. */
export type Rasterise = (e: Ent) => Promise<{ data: Uint8Array; ext: string; w: number; h: number } | null>
/** O15: the view as DXF + its images as sidecar files (`<stem>_img<N>.<ext>`, referenced by relative path — keep
 *  them in the .dxf's folder). Shapes showing the same picture the same way share one file. An image that can't be
 *  rasterised (a deleted upload, a session-only picture after a reload, a CORS-blocked URL) is `skipped`. */
export async function viewToDxfBundle(inp: DxfViewInput, stem: string, rasterise: Rasterise): Promise<DxfResult & { files: DxfFile[] }> {
	const files: DxfFile[] = [], images = new Map<string, DxfImageRef>(), byKey = new Map<string, DxfImageRef | null>()
	for (const e of dxfImageEnts(inp)) {
		const [x0, y0, x1, y1] = visibleRect(e)
		const key = JSON.stringify([e.src, e.crop, !!e.grey, Math.round(((y1 - y0) / (x1 - x0 || 1)) * 1e4)])
		let ref = byKey.get(key)
		if (ref === undefined) {
			const r = await rasterise(e).catch(() => null)
			ref = r ? { path: `${stem}_img${files.length + 1}.${r.ext}`, pxW: r.w, pxH: r.h } : null
			if (r && ref) files.push({ name: ref.path, data: r.data })
			byKey.set(key, ref)
		}
		if (ref) images.set(e.id, ref)
	}
	return { ...viewToDxf({ ...inp, images }), files }
}

/** An image shape's VISIBLE rect in drawing coords — the crop window of its a→b placement (as the viewport clips it). */
export function visibleRect(e: Ent): [number, number, number, number] {
	const rx = Math.min(e.a![0], e.b![0]), ry = Math.min(e.a![1], e.b![1]), rw = Math.abs(e.b![0] - e.a![0]), rh = Math.abs(e.b![1] - e.a![1])
	const c = e.crop ?? { x: 0, y: 0, w: 1, h: 1 }
	return [rx + c.x * rw, ry + c.y * rh, rx + (c.x + c.w) * rw, ry + (c.y + c.h) * rh]
}

/** How to cut an image of W×H px for the DXF: the crop's source rect (sx, sy, sw, sh) and the sidecar's size
 *  dw×dh — the horizontal resolution kept, the height following the placement's aspect (a DXF IMAGE has SQUARE
 *  pixels, so an image stretched in Pages is resampled), capped at `maxPx`. `whole` = the source file can be used
 *  as it is (no crop, aspect within a pixel). Pure. */
export function imageCut(e: Ent, W: number, H: number, maxPx = 8000) {
	const c = e.crop ?? { x: 0, y: 0, w: 1, h: 1 }
	const sx = Math.round(c.x * W), sy = Math.round(c.y * H), sw = Math.max(1, Math.round(c.w * W)), sh = Math.max(1, Math.round(c.h * H))
	const [x0, y0, x1, y1] = visibleRect(e), aspect = (y1 - y0) / (x1 - x0 || 1)
	let dw = sw, dh = Math.max(1, Math.round(sw * aspect))
	const whole = sx === 0 && sy === 0 && sw === W && sh === H && Math.abs(dh - H) <= 1 && Math.max(W, H) <= maxPx
	if (whole) dh = H
	const k = Math.min(1, maxPx / Math.max(dw, dh))
	if (k < 1) { dw = Math.max(1, Math.round(dw * k)); dh = Math.max(1, Math.round(dh * k)) }
	return { sx, sy, sw, sh, dw, dh, whole }
}

/** One IMAGE (+ IMAGEDEF) for an image shape: its visible rect, rotated with the shape; the library's IMAGE takes
 *  the bottom-left corner, the WIDTH in drawing units (its `scale`), and a CLOCKWISE angle (its u vector is
 *  (cos, −sin)) — i.e. the shape's own `rot`. Opacity → fade. */
function imageToDxf(out: EntitiesManager, e: Ent, ctx: ViewCtx, P: (p: Pt) => [number, number], layer: string, ref: DxfImageRef, name: string): boolean {
	if (!e.a || !e.b || !ref.pxW || !ref.pxH) return false
	const [x0, , x1, y1] = visibleRect(e), c = e.rot ? rotCenter(ctx, e) : null
	const bl = P(c ? rotatePt([x0, y1], c, e.rot!) : [x0, y1])
	const fade = Math.round(Math.min(90, Math.max(0, (1 - (e.opacity ?? 1)) * 100)))
	out.addImage(ref.path, name, point3d(bl[0], bl[1], 0), ref.pxW, ref.pxH, Math.max(0.001, x1 - x0), e.rot ?? 0, { layerName: layer, ...(fade ? { fade } : {}) })
	return true
}

type XY = [number, number]
const p3 = (p: XY) => point3d(p[0], p[1], 0)
/** A polyline (a LINE for two points) into `out` — model space or a block. */
function poly(out: EntitiesManager, pts: XY[], layer: string, closed = false) {
	if (pts.length < 2) return
	if (pts.length === 2 && !closed) { out.addLine(p3(pts[0]), p3(pts[1]), { layerName: layer }); return }
	out.addLWPolyline(pts.map((p) => ({ point: point2d(p[0], p[1]) })), { layerName: layer, ...(closed ? { flags: LWPolylineFlags.Closed } : {}) })
}
/** A solid-filled outline (an arrowhead): a SOLID HATCH; `bulge` 1 on every vertex makes a 2-point boundary a circle (a dot). */
function solid(out: EntitiesManager, pts: XY[], layer: string, bulge = 0) {
	const b = new HatchPolylineBoundary(), paths = new HatchBoundaryPaths()
	for (const p of pts) b.add(vertex(p[0], p[1], bulge))
	paths.addPolylineBoundary(b)
	out.addHatch(paths, { name: HatchPredefinedPatterns.SOLID }, { layerName: layer })
}

type Align = 'left' | 'center' | 'right'
/** DXF TEXT at `at` (already in DXF coords), height `h`, aligned, rotated `rot` degrees (counter-clockwise). */
function text(out: EntitiesManager, at: XY, h: number, value: string, layer: string, align: Align, rot: number) {
	if (!value) return
	const ha = align === 'center' ? TextHorizontalAlignment.Center : align === 'right' ? TextHorizontalAlignment.Right : TextHorizontalAlignment.Left
	const p = p3(at)
	out.addText(p, Math.max(0.5, h), value, { layerName: layer, rotation: rot || undefined, horizontalAlignment: ha, ...(ha !== TextHorizontalAlignment.Left ? { secondAlignmentPoint: p } : {}) })
}

/** O16: a Pages block → a DXF BLOCK (once per export; its name from the block's, made unique). Its shapes in block
 *  coords (y-up about the insertion point) on layer 0 (so they take the INSERT's layer), its attributes as ATTDEFs
 *  (tag, default, prompt = the label; hidden ones invisible). null = a block that (indirectly) contains itself. */
function blockToDxf(x: Ex, def: BlockDef): string | null {
	const known = x.blocks.get(def.id); if (known !== undefined) return known
	x.blocks.set(def.id, null)
	const base = sanitizeLayer(def.name || def.id).replace(/^\*+/, '') || 'BLOCK'
	let name = base
	for (let i = 2; x.blockNames.has(name.toUpperCase()); i++) name = `${base}_${i}`
	x.blockNames.add(name.toUpperCase())
	const blk = x.doc.w.addBlock(name), bP = (p: Pt): XY => [p[0], -p[1]]
	for (const bs of def.shapes) entToDxf(x, blk, { ...bs, rot: undefined }, bP, '0')
	for (const ad of def.attributes) blk.addEntity(new AttEnt('ATTDEF', p3(bP(ad.pos)), Math.max(0.5, ad.height), ad.tag, ad.default ?? '', { layerName: '0', center: true, invisible: ad.visible === false, prompt: ad.label }))
	if (def.attributes.length) blk.flags = BlockFlags.HasNonConstantAttribute
	x.blocks.set(def.id, name)
	return name
}

/** One Pages shape → DXF entities in `out` (model space, or a BLOCK being defined). `P` maps drawing coords to
 *  `out`'s coords; `x.N` = the scale denominator. */
function entToDxf(x: Ex, out: EntitiesManager, e: Ent, P: (p: Pt) => XY, layer: string) {
	const { ctx, N } = x
	// the shape's own rotation (about its bbox centre, as the viewport's <g rotate>)
	const c = e.rot ? rotCenter(ctx, e) : null
	const T = (p: Pt): XY => P(c ? rotatePt(p, c, e.rot!) : p)
	// DXF text angle: screen rotation is clockwise in y-down; DXF is counter-clockwise in y-up → −rot
	const tRot = -(e.rot ?? 0)
	switch (e.type) {
		case 'polyline': {
			const pts = e.pts ?? []
			poly(out, pts.map(T), layer)
			if (e.hatch) for (const [p, q] of hatchLines(e)) poly(out, [T(p), T(q)], layer)   // HATCH on a closed polyline
			const lb = e.text ? lineLabelAt(pts, e.textPos, 1.2 * N) : null
			if (lb) text(out, T(lb.p), 2.5 * N, e.text!, layer, lb.anchor === 'middle' ? 'center' : lb.anchor === 'end' ? 'right' : 'left', -lb.rot + tRot)
			return
		}
		case 'arc': poly(out, arcPts(e).map(T), layer); return
		case 'rect': case 'ellipse': {
			const g = groundPts(e)   // the outline points (a rect's 4 corners / an ellipse's 32)
			poly(out, g.pts.map(T), layer, true)
			if (e.type === 'rect' && e.tile) for (const [p, q] of tileLines(e.a!, e.b!, e.tile, e.tileOff)) poly(out, [T(p), T(q)], layer)   // D2
			if (e.hatch) for (const [p, q] of hatchLines(e)) poly(out, [T(p), T(q)], layer)   // HATCH (2D) — as plain lines
			return
		}
		case 'dim': {   // O17: an ALIGNED DIMENSION; what the viewport draws goes in its anonymous *D block
			const A = e.a!, B = e.b!, len = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1
			const ux = (B[0] - A[0]) / len, uy = (B[1] - A[1]) / len, px = -uy, py = ux, tk = 1.5 * N
			const blk = anonBlock(x.doc.w, 'D', ++x.anon), L = '0'
			poly(blk, [T(A), T(B)], L)
			const hs = e.headStart ?? 'arrow', he = e.headEnd ?? 'arrow'
			for (const g of [headGeom(hs, B, A, 3.5 * N), headGeom(he, A, B, 3.5 * N)]) {
				if (g?.kind === 'arrow') solid(blk, g.pts.split(' ').map((s) => T(s.split(',').map(Number) as Pt)), L)
				else if (g?.kind === 'dot') solid(blk, [T([g.c[0] - g.r, g.c[1]]), T([g.c[0] + g.r, g.c[1]])], L, 1)
				else if (g?.kind === 'tick') poly(blk, [T(g.a), T(g.b)], L)
			}
			poly(blk, [T([A[0] - px * tk, A[1] - py * tk]), T([A[0] + px * tk, A[1] + py * tk])], L)
			poly(blk, [T([B[0] - px * tk, B[1] - py * tk]), T([B[0] + px * tk, B[1] + py * tk])], L)
			for (const [p, q] of dimExtLines(e, N)) poly(blk, [T(p), T(q)], L)
			const off = e.dimOff ?? 2.5 * N, t = e.dimT ?? 0.5
			const m: Pt = [A[0] + ux * len * t + px * off, A[1] + uy * len * t + py * off]
			let ang = (Math.atan2(uy, ux) * 180) / Math.PI; if (ang > 90 || ang < -90) ang += 180
			text(blk, T(m), 2.5 * N, dimLabel(len, e.unit, e.text), L, 'center', -ang + tRot)
			// the measured points sit `dimExt` back from the dim line (a / b ARE on it); the figure: the measurement in mm
			// ('<>' in a template) — a cm / m figure is written as a fixed override (the DXF measures in mm)
			const ext = e.dimExt ?? 0, mA: Pt = [A[0] - px * ext, A[1] - py * ext], mB: Pt = [B[0] - px * ext, B[1] - py * ext]
			const override = !e.unit || e.unit === 'mm' ? e.text || undefined : dimLabel(len, e.unit, e.text)
			out.addEntity(new DimEnt(p3(T(mA)), p3(T(mB)), p3(T(B)), p3(T(m)), { block: blk.name, text: override, style: pagesDimStyle(x.doc.w, N, hs === 'tick' && he === 'tick'), measured: len, layerName: layer }))
			return
		}
		case 'text': if (isNote(e)) {   // a wrapped (markdown) text: each laid-out line as TEXT, a table's grid as lines (N = model mm per paper mm)
			const lay = noteGeom(e, N).layout, a = e.a!, at = (px: number, py: number): Pt => [a[0] + px * N, a[1] + py * N]
			for (const it of lay.items) {
				if (it.kind === 'text') text(out, T(at(it.x, it.y)), it.size * N, it.text.replaceAll('**', ''), layer, 'left', tRot)   // DXF TEXT has no inline bold
				else poly(out, [T(at(it.a[0], it.a[1])), T(at(it.b[0], it.b[1]))], layer)
			}
			if (e.noteBox) poly(out, [T(at(0, 0)), T(at(e.noteW ?? 90, 0)), T(at(e.noteW ?? 90, lay.h)), T(at(0, lay.h))], layer, true)
			return
		}
		{   // a plain text
			const fs = (e.fontPt ?? STYLE_DEFAULTS.fontPt) * PT_MM * N, lh = fs * 1.18
			const lines = (e.text ?? '').split('\n')
			const oy = e.valign === 'middle' ? -((lines.length - 1) * lh) / 2 : e.valign === 'bottom' ? -((lines.length - 1) * lh) : 0
			lines.forEach((ln, i) => text(out, T([e.a![0], e.a![1] + oy + i * lh]), fs, ln, layer, e.align ?? 'left', tRot))
			if (e.callout) {
				const bb = textBox(e, PT_MM * N), pad = fs * 0.4
				const x0 = bb[0] - pad, y0 = bb[1] - pad, x1 = bb[2] + pad, y1 = bb[3] + pad
				const lp = e.leader ?? [bb[0] - fs * 3, bb[3] + fs * 3], frame = e.calloutBorder ?? 'box'
				if (frame === 'box') poly(out, [T([x0, y0]), T([x1, y0]), T([x1, y1]), T([x0, y1])], layer, true)
				else if (frame === 'underline') poly(out, [T([x0, y1]), T([x1, y1])], layer)
				const nx = lp[0] < (x0 + x1) / 2 ? x0 : x1, ny = frame === 'underline' ? y1 : lp[1] < (y0 + y1) / 2 ? y0 : y1
				poly(out, [T([nx, ny]), T(lp)], layer)
			}
			return
		}
		case 'insert': {   // O16: an INSERT of the block's BLOCK (+ its ATTRIBs), at the insertion point, rotated, scaled, mirrored
			const def = blockDef(e.block), k = insertScale(e, N), a = e.a!, mx = e.mirror ? -1 : 1
			const W = (p: Pt): XY => T([a[0] + mx * p[0] * k, a[1] + p[1] * k])   // block-local → `out` coords
			if (isLegend(e)) {   // D1: the legend's content is computed per view — exploded: frame, title, rows (swatches as short lines)
				const rows = legendRows(ctx.mdl, e.attrs), [lw, lh] = legendSize(rows.length), counts = (e.attrs?.COUNTS ?? 'yes').toLowerCase() !== 'no'
				const q = (qx: number, qy: number) => W([qx, qy])
				poly(out, [q(0, 0), q(lw, 0), q(lw, lh), q(0, lh)], layer, true)
				text(out, q(LEGEND.pad, LEGEND.title - 1.6), 3 * k, e.attrs?.TITLE || 'LEGEND', layer, 'left', tRot)
				rows.forEach((r, i) => {
					const y = LEGEND.title + i * LEGEND.row + LEGEND.row / 2, rl = x.doc.layer(r.name, r.color)
					poly(out, [q(LEGEND.pad, y), q(LEGEND.pad + 9, y)], rl)
					text(out, q(LEGEND.pad + 12, y + 0.9), 2.4 * k, r.name, layer, 'left', tRot)
					if (counts) text(out, q(lw - LEGEND.pad, y + 0.9), 2.4 * k, String(r.count), layer, 'right', tRot)
				})
				return
			}
			const name = def ? blockToDxf(x, def) : null
			if (!def || !name) { poly(out, ([[-100, -100], [100, -100], [100, 100], [-100, 100]] as Pt[]).map(W), layer, true); return }
			// block coords are y-up, so: INSERT at the (rotated) insertion point, X scale −k when mirrored, angle −rot
			const ins = out.addInsert(name, p3(T(a)), { layerName: layer, rotationAngle: tRot, scaleFactor: { x: mx * k, y: k, z: 1 } })
			addAttribs(out, ins, def.attributes.map((ad) => ({ at: p3(W(ad.pos)), height: Math.max(0.5, ad.height * k), tag: ad.tag, value: attrValue(e, ad),
				o: { layerName: layer, rotation: tRot, center: true, invisible: ad.visible === false } })))
			return
		}
	}
}
