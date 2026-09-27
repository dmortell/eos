<svelte:options namespace="svg" />

<script lang="ts">
	// ONE drawn 2D entity (review.md §R1, step 8) — the Viewport's `drawn` / `drawnGround` snippets as a
	// component, so PaperPage / SheetRender (X5 print) can draw entities without the editor. Output is the
	// same elements / attributes / classes / clip-path ids as the snippets; everything the snippets read from
	// the Viewport's closures arrives as a prop (`style`, `isoGround`, `imgCrop`, `clipNs`) or via `ctx`.
	// The per-entity DISPATCH the Viewport's paint loop did (ground projection in iso → `drawnGround`; a rotated
	// entity → `<g transform="rotate(…)">` around `drawn`) lives here too, so the caller renders
	// `<EntRender {e} {ctx} …/>` per entity; the loop's FILTER (inline-edited text, hidden layer, inThisView)
	// stays with the caller. Tool UI (`preview`, `drawDot`, `crosshair` snippets) stays in the Viewport.
	import type { Pt, Ent, Dash } from '../geometry'
	import type { ViewCtx } from '../view'
	import { STYLE_DEFAULTS, textBox, arcPath, isNote, dimExtLines, dimGeom, dimTextAt } from '../geometry'
	import { PT_MM } from '../../constants'
	import { isFlatElev, flatXSpan, flatY, rotCenter, rotatePt, groundInIso, noteGeom, bbox } from '../hit'
	import { isoFacing, isoAnnoEnt } from '../isoAnno'
	import { noteRuns } from '../noteLayout'
	import { arrowPts, cloudPath, cloudPathPts, groundPts, headGeom, dashArray, lineLabelAt, tileLines, hatchLines, type HeadGeom } from '../annotations'
	import { imageSrc } from '../../imageStore'
	import { srcMissing, srcName } from './fileWatch.svelte'
	import { pdfImageUrl, PDF_SRC } from './pdfRaster.svelte'
	import { blockDef, byBlock, attrValue, attrColor, insertScale } from '../blocks'
	import { isLegend, legendRows, legendSize, LEGEND } from '../legend'
	import { dimLabel } from '../drawingDefaults'
	import EntRender from './EntRender.svelte'   // a block's shapes are drawn by this same component

	let { e, ctx, selected = false, style, isoGround = null, imgCrop = null, clipNs }: {
		e: Ent
		ctx: ViewCtx
		/** Selection shows via the grips, NOT by recolouring — only a dim's colour flips to `style.sel`. */
		selected?: boolean
		style: {
			/** LWT toggle: on = objects with no weight draw at STYLE_DEFAULTS.weight, off = a thin 0.5 display line. */
			lwt: boolean
			/** The ancestor CSS canvas zoom — screen-constant strokes divide by it (non-scaling-stroke can't see it). */
			canvasZoom: number
			/** Model mm per paper mm (= 1/dscale): annotative sizes (arrowheads, dim ticks/text, cloud bumps, text). */
			paperMm: number
			/** Grip size in drawing units — the iso ground TEXT font is `2 × gripSize` today (screen-constant).
			 *  B3's paper-mm switch would replace this with `k × paperMm` here; kept as-is for the port. */
			gripSize: number
			/** Tool ink (the ByLayer fallback) and the selection colour. */
			ink: string
			sel: string
			/** A layer's colour by id (ByLayer resolution: object colour → layer colour → ink). */
			layerColor: (id?: string) => string | undefined
			/** A layer's line type by id (XP32 ByLayer dash). */
			layerDash?: (id?: string) => Dash | undefined
			/** B31: dark model space — maps a resolved colour to one that reads on the dark background. */
			adapt?: (c: string) => string
			/** I2: a black-and-white viewport — every colour is the ink. */
			mono?: boolean
		}
		/** Iso view only: projects a plan point onto the ground plane (drawing coords). Null elsewhere. Lays plan
		 *  shapes on the ground, and anchors the screen-facing callouts / legends (ui/isoAnno.ts). */
		isoGround?: ((x: number, y: number, z?: number) => Pt) | null
		/** The id of the image currently in CROP calibration (shows the full image faint + the crop window), or null. */
		imgCrop?: string | null
		/** Per-viewport-instance namespace for <clipPath> ids (a sheet renders the same image in several viewports). */
		clipNs: string
	} = $props()

	// colour resolves ByLayer: explicit object colour → its layer's colour → the tool ink.
	// an image's href: a PDF page (floorplan shapes, `pdf:<fileId>#<page>`, rendered once per session) or an imported image
	const href = $derived(e.type !== 'image' ? '' : e.src?.startsWith(PDF_SRC) ? pdfImageUrl(e.src) : imageSrc(e.src))
	// in dark model space a PDF page is inverted (white paper → dark, black lines → light), like an AutoCAD xref
	const pdfDark = $derived(!!style.adapt && !!e.src?.startsWith(PDF_SRC))
	// the image's CSS filter: dark-space inversion for a PDF page, greyscale when asked (I7)
	const imgFilter = $derived([pdfDark ? 'invert(1) hue-rotate(180deg)' : '', e.grey || style.mono ? 'grayscale(1)' : ''].filter(Boolean).join(' ') || undefined)
	// I2: a black-and-white viewport draws every shape in the tool ink (fills too, so a filled symbol stays solid)
	const tone = (c: string) => (style.mono ? style.ink : style.adapt ? style.adapt(c) : c)
	const ink = $derived(tone(e.color ?? style.layerColor(e.layer) ?? style.ink))
	// An explicit per-object weight ALWAYS renders; LWT only chooses the thickness for objects with no weight
	// set (on = the default 1.2, off = a thin 0.5 display line).
	const w = $derived((e.weight ?? (style.lwt ? STYLE_DEFAULTS.weight : 0.5)) / (style.canvasZoom || 1))
	const fill = $derived(style.mono && e.fill && e.fill !== 'none' && e.fill.toLowerCase() !== '#ffffff' ? style.ink : e.fill ?? 'none')
	// XP32: the object's own line type, else its layer's (ByLayer) — screen-px dashes, like the weights.
	const da = $derived(dashArray(e.dash ?? style.layerDash?.(e.layer), style.canvasZoom))
	const paperMm = $derived(style.paperMm)
	const canvasZoom = $derived(style.canvasZoom)
	const SEL = $derived(style.sel)
	// ISO: a callout / legend faces the SCREEN (ui/isoAnno.ts) — its anchors (text position, leader tip, legend corner)
	// projected into iso drawing coords, then drawn by the ordinary 2D path at paper size, upright. The child render
	// gets a non-iso ctx so it takes the `drawn` branch instead of the ground projection (the copy's points are
	// already projected); every other ctx field (paperMm, the model's layers for a legend's rows) is the view's own.
	const isoAnno = $derived(isoGround && groundInIso(ctx, e) && isoFacing(e) ? isoAnnoEnt(e, isoGround) : null)
	const flatCtx = $derived<ViewCtx>(isoAnno ? { ...ctx, isIso: false } : ctx)
</script>

{#if isoAnno}
	<EntRender e={isoAnno} ctx={flatCtx} {selected} {style} {imgCrop} {clipNs} />
	<!-- no grips in the iso view (VpOverlays skips ground-in-iso shapes): a selected one shows a dashed frame instead -->
	{#if selected}
		{@const bb = bbox(flatCtx, isoAnno)}
		{@const m = style.gripSize}
		<rect x={bb[0] - m} y={bb[1] - m} width={bb[2] - bb[0] + 2 * m} height={bb[3] - bb[1] + 2 * m} fill="none" stroke={SEL} stroke-width={1 / (canvasZoom || 1)} stroke-dasharray="{4 / (canvasZoom || 1)} {3 / (canvasZoom || 1)}" vector-effect="non-scaling-stroke" style="pointer-events:none" />
	{/if}
{:else if groundInIso(ctx, e)}
	<!-- a plan 2D shape laid on the GROUND in the iso view: outline points (rotated by e.rot) projected via
	     isoGround. Text places at its projected anchor; other types draw as a (foreshortened) poly. -->
	{#if isoGround}
		{#if e.type === 'text'}
			{@const tp = isoGround(e.a![0], e.a![1], e.z)}
			<text class="anno" x={tp[0]} y={tp[1]} font-size={style.gripSize * 2} fill={ink} text-anchor="start">{(e.text ?? '').split('\n')[0]}</text>
		{:else}
			{@const g = groundPts(e)}
			{@const c = e.rot ? rotCenter(ctx, e) : null}
			{@const pr = g.pts.map((p) => { const q = e.rot && c ? rotatePt(p, c, e.rot) : p; return isoGround!(q[0], q[1], e.z) })}
			{#if pr.length >= 2}
				{#if g.closed}<polygon points={pr.map((p) => p.join(',')).join(' ')} fill={fill} stroke={ink} stroke-width={w} vector-effect="non-scaling-stroke" />
				{:else}<polyline points={pr.map((p) => p.join(',')).join(' ')} fill="none" stroke={ink} stroke-width={w} vector-effect="non-scaling-stroke" />{/if}
			{/if}
		{/if}
	{/if}
{:else if e.rot && !isFlatElev(ctx, e)}
	{@const c = rotCenter(ctx, e)}
	<!-- (a flat plan shape edge-on in an elevation isn't turned in the view: its plan turn is already in its span) -->
	<g transform="rotate({e.rot} {c[0]} {c[1]})">{@render drawn()}</g>
{:else}
	{@render drawn()}
{/if}

{#snippet head(g: HeadGeom | null, col: string)}
	{#if g?.kind === 'arrow'}<polygon points={g.pts} fill={col} />
	{:else if g?.kind === 'dot'}<circle cx={g.c[0]} cy={g.c[1]} r={g.r} fill={col} />
	{:else if g?.kind === 'tick'}<line x1={g.a[0]} y1={g.a[1]} x2={g.b[0]} y2={g.b[1]} stroke={col} stroke-width={w * 1.6} vector-effect="non-scaling-stroke" />{/if}
{/snippet}

{#snippet drawn()}
	<!-- Selection is shown by the grips, NOT by recolouring/thickening the stroke — so colour and
	     lineweight edits are visible live while the object stays selected. -->
	{#if isFlatElev(ctx, e)}
		<!-- any flat plan object seen in elevation is an edge-on line at its height above the floor (z; 0 = the ground) -->
		{@const sp = flatXSpan(ctx, e)}
		{@const fy = flatY(ctx, e)}
		<line x1={sp[0]} y1={fy} x2={sp[1]} y2={fy} stroke={ink} stroke-width={w} stroke-dasharray={da} vector-effect="non-scaling-stroke" />
	{:else if e.type === 'image'}
		<!-- an imported background image placed FULL in the a→b rect (origin + scale); CROP is the visible
		     WINDOW = a normalized sub-rect of that placement (the rest is trimmed away). -->
		{@const rx = Math.min(e.a![0], e.b![0])}{@const ry = Math.min(e.a![1], e.b![1])}
		{@const rw = Math.abs(e.b![0] - e.a![0])}{@const rh = Math.abs(e.b![1] - e.a![1])}
		{@const cr = e.crop ?? { x: 0, y: 0, w: 1, h: 1 }}
		{@const cropping = imgCrop === e.id}
		<clipPath id="{clipNs}-{e.id}"><rect x={rx + cr.x * rw} y={ry + cr.y * rh} width={cr.w * rw} height={cr.h * rh} /></clipPath>
		{#if srcMissing(e.src)}
			<!-- its file was deleted (Uploads): a placeholder, so it can be seen, replaced (Properties) or deleted -->
			<rect x={rx + cr.x * rw} y={ry + cr.y * rh} width={cr.w * rw} height={cr.h * rh} fill="#ef444414" stroke="#ef4444" stroke-width={1.5 / (canvasZoom || 1)} stroke-dasharray="{6 / (canvasZoom || 1)} {4 / (canvasZoom || 1)}" vector-effect="non-scaling-stroke" />
			<text x={rx + (cr.x + cr.w / 2) * rw} y={ry + (cr.y + cr.h / 2) * rh} text-anchor="middle" dominant-baseline="middle" fill="#ef4444" font-size={Math.min(cr.w * rw, cr.h * rh) / 12}>Missing file: {srcName(e.src ?? '')}</text>
		{:else}
			{#if cropping}<image {href} x={rx} y={ry} width={rw} height={rh} opacity="0.35" preserveAspectRatio="none" style:filter={imgFilter} />{/if}
			<image {href} x={rx} y={ry} width={rw} height={rh} opacity={e.opacity ?? 1} clip-path="url(#{clipNs}-{e.id})" preserveAspectRatio="none" style:filter={imgFilter} />
		{/if}
		{#if cropping}<rect x={rx + cr.x * rw} y={ry + cr.y * rh} width={cr.w * rw} height={cr.h * rh} fill="none" stroke={SEL} stroke-width={1 / (canvasZoom || 1)} stroke-dasharray="{5 / (canvasZoom || 1)} {3 / (canvasZoom || 1)}" vector-effect="non-scaling-stroke" />{/if}
	{:else if e.type === 'polyline' && e.cloud}
		<!-- REVCLOUD: a cloud round the closed outline -->
		<path d={cloudPathPts(e.pts ?? [], 4 * paperMm)} fill={fill} stroke={ink} stroke-width={w} vector-effect="non-scaling-stroke" stroke-linejoin="round" />
	{:else if e.type === 'polyline'}
		<polyline points={(e.pts ?? []).map(p => p.join(',')).join(' ')} fill={fill} stroke={ink} stroke-width={w} stroke-dasharray={da} vector-effect="non-scaling-stroke" stroke-linejoin="round" />
		<!-- XP33: a head at each end (arrow / dot / tick), anchored on the first / last point. Properties only
		     offers them on a 2-point line, but nothing stops one at the data level, so this isn't gated. -->
		{#if (e.pts?.length ?? 0) >= 2}
			{@const p0 = e.pts![0]}{@const p1 = e.pts![e.pts!.length - 1]}
			{@const lb = e.text ? lineLabelAt(e.pts!, e.textPos, 1.2 * paperMm) : null}
			{@render head(headGeom(e.headEnd, p0, p1, 3.5 * paperMm), ink)}
			{@render head(headGeom(e.headStart, p1, p0, 3.5 * paperMm), ink)}
			<!-- D7: the line's text label, along it at the start / middle / end, upright, like a dimension figure -->
			{#if lb}<text class="anno" x={lb.p[0]} y={lb.p[1]} font-size={2.5 * paperMm} fill={ink} text-anchor={lb.anchor} transform="rotate({lb.rot} {lb.p[0]} {lb.p[1]})">{e.text}</text>{/if}
		{/if}
	{:else if isNote(e)}
		<!-- K3 NOTE: the markdown laid out in paper mm (ui/noteLayout.ts), scaled by paperMm (annotative) -->
		{@const n = noteGeom(e, paperMm)}
		<g transform="translate({e.a![0]} {e.a![1]}) scale({n.k})">
			{#if e.noteBox}<rect x="0" y="0" width={e.noteW ?? 90} height={n.layout.h} fill={fill === 'none' ? 'none' : fill} stroke={ink} stroke-width={w} vector-effect="non-scaling-stroke" />
			{:else if fill !== 'none'}<rect x="0" y="0" width={e.noteW ?? 90} height={n.layout.h} fill={fill} />{/if}
			{#each n.layout.items as it, i (i)}
				{#if it.kind === 'text'}<text class="anno" x={it.x} y={it.y} font-size={it.size} font-weight={it.bold ? 700 : 400} fill={ink}>{#each noteRuns(it.text) as [t, b], j (j)}<tspan font-weight={b ? 700 : undefined}>{t}</tspan>{/each}</text>
				{:else}<line x1={it.a[0]} y1={it.a[1]} x2={it.b[0]} y2={it.b[1]} stroke={ink} stroke-width={w * 0.8} vector-effect="non-scaling-stroke" />{/if}
			{/each}
		</g>
	{:else if e.type === 'arc'}
		<path d={arcPath(e)} fill="none" stroke={ink} stroke-width={w} stroke-dasharray={da} vector-effect="non-scaling-stroke" />
	{:else if e.type === 'rect'}
		{#if e.cloud}
			<path d={cloudPath(e.a!, e.b!, 4 * paperMm)} fill={fill} stroke={ink} stroke-width={w} vector-effect="non-scaling-stroke" stroke-linejoin="round" />
		{:else}
			<rect x={Math.min(e.a![0], e.b![0])} y={Math.min(e.a![1], e.b![1])} width={Math.abs(e.b![0] - e.a![0])} height={Math.abs(e.b![1] - e.a![1])} fill={fill} stroke={ink} stroke-width={w} stroke-dasharray={da} vector-effect="non-scaling-stroke" />
		{/if}
		<!-- D2: a floor-tile grid inside the rect -->
		{#if e.tile}{#each tileLines(e.a!, e.b!, e.tile, e.tileOff) as [p, q], i (i)}<line x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke={ink} stroke-opacity="0.55" stroke-width={w * 0.6} vector-effect="non-scaling-stroke" />{/each}{/if}
	{:else if e.type === 'ellipse'}
		<ellipse cx={(e.a![0] + e.b![0]) / 2} cy={(e.a![1] + e.b![1]) / 2} rx={Math.abs(e.b![0] - e.a![0]) / 2} ry={Math.abs(e.b![1] - e.a![1]) / 2} fill={fill} stroke={ink} stroke-width={w} stroke-dasharray={da} vector-effect="non-scaling-stroke" />
	{:else if e.type === 'dim'}
		<!-- a real dimension: dim line with arrowheads, perpendicular extension ticks, and the measured
		     length (mm) set above the line, aligned to it, at a constant on-screen size. Aligned / horizontal /
		     vertical (dimMode) — geometry.ts dimGeom places the dim line and the extension lines. -->
		{@const col = selected ? SEL : (e.color ?? '#0e766e')}
		{@const g = dimGeom(e)}
		{@const A = g.A}{@const B = g.B}
		{@const px = g.p[0]}{@const py = g.p[1]}
		{@const tk = 1.5 * paperMm}
		{@const ta = dimTextAt(e, paperMm)}
		{@const mx = ta.p[0]}{@const my = ta.p[1]}
		{@const rang = ta.rot}
		{@const len = g.len}
		<line x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} stroke={col} stroke-width={w} stroke-dasharray={da} vector-effect="non-scaling-stroke" />
		<!-- XP33: a dimension's ends default to ARROW; each end can be arrow / dot / tick / none -->
		{@render head(headGeom(e.headStart ?? 'arrow', B, A, 3.5 * paperMm), col)}
		{@render head(headGeom(e.headEnd ?? 'arrow', A, B, 3.5 * paperMm), col)}
		<line x1={A[0] - px * tk} y1={A[1] - py * tk} x2={A[0] + px * tk} y2={A[1] + py * tk} stroke={col} stroke-width={w} vector-effect="non-scaling-stroke" />
		<line x1={B[0] - px * tk} y1={B[1] - py * tk} x2={B[0] + px * tk} y2={B[1] + py * tk} stroke={col} stroke-width={w} vector-effect="non-scaling-stroke" />
		{#each dimExtLines(e, paperMm) as [p, q], i (i)}<line x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke={col} stroke-width={w} vector-effect="non-scaling-stroke" />{/each}
		<text class="anno" x={mx} y={my} font-size={2.5 * paperMm} fill={col} text-anchor="middle" transform="rotate({rang} {mx} {my})">{dimLabel(len, e.unit, e.text)}</text>
	{:else if e.type === 'insert'}
		<!-- a BLOCK insert: the definition's shapes ('byblock' colour / fill from this insert) + its attribute
		     texts, at the insertion point, scaled (rotation is the shared wrapper above) -->
		{@const def = blockDef(e.block)}
		{@const k = insertScale(e, paperMm)}
		{#if isLegend(e)}
			<!-- D1: a LEGEND — its rows from the model's layers (ui/legend.ts), in paper mm from its top-left corner -->
			{@const rows = legendRows(ctx.mdl, e.attrs)}
			{@const [lw, lh] = legendSize(rows.length)}
			{@const counts = (e.attrs?.COUNTS ?? 'yes').toLowerCase() !== 'no'}
			<g transform="translate({e.a![0]} {e.a![1]}) scale({k})">
				<rect x="0" y="0" width={lw} height={lh} fill={style.adapt ? 'none' : '#ffffff'} stroke={ink} stroke-width={w} vector-effect="non-scaling-stroke" />
				<text class="anno" x={LEGEND.pad} y={LEGEND.title - 1.6} font-size="3" font-weight="700" fill={ink}>{e.attrs?.TITLE || 'LEGEND'}</text>
				{#each rows as r, i (r.id)}
					{@const y = LEGEND.title + i * LEGEND.row + LEGEND.row / 2}
					{@const c = tone(r.color)}
					{#if r.line}<line x1={LEGEND.pad} y1={y} x2={LEGEND.pad + 9} y2={y} stroke={c} stroke-width={w * 1.4} stroke-dasharray={dashArray(r.dash as Dash | undefined, style.canvasZoom)} vector-effect="non-scaling-stroke" />
					{:else}<rect x={LEGEND.pad} y={y - 1.5} width="9" height="3" fill={c} />{/if}
					<text class="anno" x={LEGEND.pad + 12} y={y + 0.9} font-size="2.4" fill={ink}>{r.name}</text>
					{#if counts}<text class="anno" x={lw - LEGEND.pad} y={y + 0.9} font-size="2.4" text-anchor="end" fill={ink}>{r.count}</text>{/if}
				{/each}
			</g>
		{:else}
		<!-- D3: a mirrored insert flips its geometry left↔right; its attribute texts stay readable (only moved) -->
		<g transform="translate({e.a![0]} {e.a![1]}) scale({e.mirror ? -k : k} {k})">
			{#if def}{#each def.shapes as bs (bs.id)}<EntRender e={byBlock(bs, e)} {ctx} {style} clipNs="{clipNs}-{e.id}" />{/each}{/if}
		</g>
		<g transform="translate({e.a![0]} {e.a![1]}) scale({k})">
			{#if def}
				{#each def.attributes as ad (ad.tag)}
					{#if ad.visible !== false && attrValue(e, ad)}
						{@const c = attrColor(e, ad)}
						<text class="anno" x={e.mirror ? -ad.pos[0] : ad.pos[0]} y={ad.pos[1]} font-size={Math.max(ad.height, ((ad.minPaper ?? 0) * paperMm) / (k || 1))} text-anchor="middle"
							fill={c ? (c !== '#ffffff' ? tone(c) : c) : ink}>{attrValue(e, ad)}</text>
					{/if}
				{/each}
			{:else}
				<!-- the block is missing from the library: a crossed box, still pickable -->
				<rect x="-100" y="-100" width="200" height="200" fill="none" stroke={ink} stroke-width={w} />
				<line x1="-100" y1="-100" x2="100" y2="100" stroke={ink} stroke-width={w} /><line x1="-100" y1="100" x2="100" y2="-100" stroke={ink} stroke-width={w} />
			{/if}
		</g>
		{/if}
	{:else if e.type === 'text'}
		{@const fs = (e.fontPt ?? STYLE_DEFAULTS.fontPt) * PT_MM * paperMm}
		{@const anchor = e.align === 'center' ? 'middle' : e.align === 'right' ? 'end' : 'start'}
		{@const lines = (e.text ?? '').split('\n')}
		{@const lh = fs * 1.18}
		<!-- vertical align shifts the whole block about the anchor a[1] (top = first baseline here). -->
		{@const oy = e.valign === 'middle' ? -((lines.length - 1) * lh) / 2 : e.valign === 'bottom' ? -((lines.length - 1) * lh) : 0}
		{#if e.callout}
			<!-- callout: a box around the text + a leader line to e.leader (attached to the box side nearest the tip) -->
			{@const bb = textBox(e, PT_MM * paperMm)}
			{@const pad = fs * 0.4}
			{@const bx0 = bb[0] - pad}
			{@const by0 = bb[1] - pad}
			{@const bx1 = bb[2] + pad}
			{@const by1 = bb[3] + pad}
			{@const lp = e.leader ?? [bb[0] - fs * 3, bb[3] + fs * 3]}
			{@const cb = e.calloutBorder ?? 'box'}
			{@const nx = lp[0] < (bx0 + bx1) / 2 ? bx0 : bx1}
			{@const ny = cb === 'underline' ? by1 : lp[1] < (by0 + by1) / 2 ? by0 : by1}
			<!-- D9: the frame — a box, an underline (the leader leaves from its nearer end), or none -->
			{#if cb === 'box'}<rect x={bx0} y={by0} width={bx1 - bx0} height={by1 - by0} rx={fs * 0.3} fill="none" stroke={ink} stroke-width={1.2 / (canvasZoom || 1)} vector-effect="non-scaling-stroke" />
			{:else if cb === 'underline'}<line x1={bx0} y1={by1} x2={bx1} y2={by1} stroke={ink} stroke-width={1.2 / (canvasZoom || 1)} vector-effect="non-scaling-stroke" />{/if}
			<line x1={nx} y1={ny} x2={lp[0]} y2={lp[1]} stroke={ink} stroke-width={1.2 / (canvasZoom || 1)} vector-effect="non-scaling-stroke" />
			<polygon points={arrowPts([nx, ny] as Pt, lp as Pt, 3.5 * paperMm)} fill={ink} />
		{/if}
		<text class="anno" x={e.a![0]} y={e.a![1] + oy} font-size={fs} fill={ink} font-weight="600" text-anchor={anchor} dominant-baseline={e.valign === 'middle' ? 'central' : undefined}>
			{#each lines as line, i (i)}<tspan x={e.a![0]} dy={i === 0 ? 0 : lh}>{line}</tspan>{/each}
		</text>
	{/if}
	<!-- HATCH (2D): the line pattern across a rect / ellipse / closed polyline — not on its edge-on elevation line -->
	{#if e.hatch && !isFlatElev(ctx, e)}{#each hatchLines(e) as [p, q], i (i)}<line x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke={ink} stroke-width={w * 0.8} stroke-dasharray={da} vector-effect="non-scaling-stroke" />{/each}{/if}
{/snippet}

<style>
	/* The Viewport's `.vp-svg text.anno` rule is component-scoped, so it can't reach these elements; the same
	   monospace face lives here. (Everything else the snippets relied on was inline attributes.) */
	text.anno { font-family:'Consolas','SF Mono',ui-monospace,'Menlo',monospace; }
</style>
