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
	import { STYLE_DEFAULTS, textBox } from '../geometry'
	import { PT_MM } from '../../constants'
	import { isFlatElev, flatXSpan, rotCenter, rotatePt, groundInIso } from '../hit'
	import { arrowPts, cloudPath, groundPts, headGeom, dashArray, type HeadGeom } from '../annotations'
	import { imageSrc } from '../../imageStore'
	import { pdfImageUrl, PDF_SRC } from './pdfRaster.svelte'
	import { blockDef, byBlock, attrValue, attrColor } from '../blocks'
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
		}
		/** Iso view only: projects a plan point onto the ground plane (drawing coords). Null elsewhere. */
		isoGround?: ((x: number, y: number) => Pt) | null
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
	const ink = $derived.by(() => { const c = e.color ?? style.layerColor(e.layer) ?? style.ink; return style.adapt ? style.adapt(c) : c })
	// An explicit per-object weight ALWAYS renders; LWT only chooses the thickness for objects with no weight
	// set (on = the default 1.2, off = a thin 0.5 display line).
	const w = $derived((e.weight ?? (style.lwt ? STYLE_DEFAULTS.weight : 0.5)) / (style.canvasZoom || 1))
	const fill = $derived(e.fill ?? 'none')
	// XP32: the object's own line type, else its layer's (ByLayer) — screen-px dashes, like the weights.
	const da = $derived(dashArray(e.dash ?? style.layerDash?.(e.layer), style.canvasZoom))
	const paperMm = $derived(style.paperMm)
	const canvasZoom = $derived(style.canvasZoom)
	const SEL = $derived(style.sel)
</script>

{#if groundInIso(ctx, e)}
	<!-- a plan 2D shape laid on the GROUND in the iso view: outline points (rotated by e.rot) projected via
	     isoGround. Text places at its projected anchor; other types draw as a (foreshortened) poly. -->
	{#if isoGround}
		{#if e.type === 'text'}
			{@const tp = isoGround(e.a![0], e.a![1])}
			<text class="anno" x={tp[0]} y={tp[1]} font-size={style.gripSize * 2} fill={ink} text-anchor="start">{(e.text ?? '').split('\n')[0]}</text>
		{:else}
			{@const g = groundPts(e)}
			{@const c = e.rot ? rotCenter(ctx, e) : null}
			{@const pr = g.pts.map((p) => { const q = e.rot && c ? rotatePt(p, c, e.rot) : p; return isoGround!(q[0], q[1]) })}
			{#if pr.length >= 2}
				{#if g.closed}<polygon points={pr.map((p) => p.join(',')).join(' ')} fill={e.fill ?? 'none'} stroke={ink} stroke-width={w} vector-effect="non-scaling-stroke" />
				{:else}<polyline points={pr.map((p) => p.join(',')).join(' ')} fill="none" stroke={ink} stroke-width={w} vector-effect="non-scaling-stroke" />{/if}
			{/if}
		{/if}
	{/if}
{:else if e.rot}
	{@const c = rotCenter(ctx, e)}
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
		<!-- any flat (z=0, no height) object seen in elevation is an edge-on line at the ground -->
		{@const sp = flatXSpan(ctx, e)}
		<line x1={sp[0]} y1={ctx.ground} x2={sp[1]} y2={ctx.ground} stroke={ink} stroke-width={w} stroke-dasharray={da} vector-effect="non-scaling-stroke" />
	{:else if e.type === 'image'}
		<!-- an imported background image placed FULL in the a→b rect (origin + scale); CROP is the visible
		     WINDOW = a normalized sub-rect of that placement (the rest is trimmed away). -->
		{@const rx = Math.min(e.a![0], e.b![0])}{@const ry = Math.min(e.a![1], e.b![1])}
		{@const rw = Math.abs(e.b![0] - e.a![0])}{@const rh = Math.abs(e.b![1] - e.a![1])}
		{@const cr = e.crop ?? { x: 0, y: 0, w: 1, h: 1 }}
		{@const cropping = imgCrop === e.id}
		<clipPath id="{clipNs}-{e.id}"><rect x={rx + cr.x * rw} y={ry + cr.y * rh} width={cr.w * rw} height={cr.h * rh} /></clipPath>
		{#if cropping}<image {href} x={rx} y={ry} width={rw} height={rh} opacity="0.35" preserveAspectRatio="none" style:filter={pdfDark ? 'invert(1) hue-rotate(180deg)' : undefined} />{/if}
		<image {href} x={rx} y={ry} width={rw} height={rh} opacity={e.opacity ?? 1} clip-path="url(#{clipNs}-{e.id})" preserveAspectRatio="none" style:filter={pdfDark ? 'invert(1) hue-rotate(180deg)' : undefined} />
		{#if cropping}<rect x={rx + cr.x * rw} y={ry + cr.y * rh} width={cr.w * rw} height={cr.h * rh} fill="none" stroke={SEL} stroke-width={1 / (canvasZoom || 1)} stroke-dasharray="{5 / (canvasZoom || 1)} {3 / (canvasZoom || 1)}" vector-effect="non-scaling-stroke" />{/if}
	{:else if e.type === 'polyline'}
		<polyline points={(e.pts ?? []).map(p => p.join(',')).join(' ')} fill={fill} stroke={ink} stroke-width={w} stroke-dasharray={da} vector-effect="non-scaling-stroke" stroke-linejoin="round" />
		<!-- XP33: a head at each end (arrow / dot / tick), anchored on the first / last point. Properties only
		     offers them on a 2-point line, but nothing stops one at the data level, so this isn't gated. -->
		{#if (e.pts?.length ?? 0) >= 2}
			{@const p0 = e.pts![0]}{@const p1 = e.pts![e.pts!.length - 1]}
			{@render head(headGeom(e.headEnd, p0, p1, 3.5 * paperMm), ink)}
			{@render head(headGeom(e.headStart, p1, p0, 3.5 * paperMm), ink)}
		{/if}
	{:else if e.type === 'rect'}
		{#if e.cloud}
			<path d={cloudPath(e.a!, e.b!, 4 * paperMm)} fill={fill} stroke={ink} stroke-width={w} vector-effect="non-scaling-stroke" stroke-linejoin="round" />
		{:else}
			<rect x={Math.min(e.a![0], e.b![0])} y={Math.min(e.a![1], e.b![1])} width={Math.abs(e.b![0] - e.a![0])} height={Math.abs(e.b![1] - e.a![1])} fill={fill} stroke={ink} stroke-width={w} stroke-dasharray={da} vector-effect="non-scaling-stroke" />
		{/if}
	{:else if e.type === 'ellipse'}
		<ellipse cx={(e.a![0] + e.b![0]) / 2} cy={(e.a![1] + e.b![1]) / 2} rx={Math.abs(e.b![0] - e.a![0]) / 2} ry={Math.abs(e.b![1] - e.a![1]) / 2} fill={fill} stroke={ink} stroke-width={w} stroke-dasharray={da} vector-effect="non-scaling-stroke" />
	{:else if e.type === 'dim'}
		<!-- a real dimension: dim line with arrowheads, perpendicular extension ticks, and the measured
		     length (mm) set above the line, aligned to it, at a constant on-screen size. -->
		{@const col = selected ? SEL : (e.color ?? '#0e766e')}
		{@const A = e.a!}{@const B = e.b!}
		{@const len = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1}
		{@const ux = (B[0] - A[0]) / len}{@const uy = (B[1] - A[1]) / len}
		{@const px = -uy}{@const py = ux}
		{@const tk = 1.5 * paperMm}
		{@const off = e.dimOff ?? 2.5 * paperMm}
		{@const t = e.dimT ?? 0.5}
		{@const mx = A[0] + ux * len * t + px * off}
		{@const my = A[1] + uy * len * t + py * off}
		{@const ang = Math.atan2(uy, ux) * 180 / Math.PI}
		{@const rang = ang > 90 || ang < -90 ? ang + 180 : ang}
		<line x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} stroke={col} stroke-width={w} stroke-dasharray={da} vector-effect="non-scaling-stroke" />
		<!-- XP33: a dimension's ends default to ARROW; each end can be arrow / dot / tick / none -->
		{@render head(headGeom(e.headStart ?? 'arrow', B, A, 3.5 * paperMm), col)}
		{@render head(headGeom(e.headEnd ?? 'arrow', A, B, 3.5 * paperMm), col)}
		<line x1={A[0] - px * tk} y1={A[1] - py * tk} x2={A[0] + px * tk} y2={A[1] + py * tk} stroke={col} stroke-width={w} vector-effect="non-scaling-stroke" />
		<line x1={B[0] - px * tk} y1={B[1] - py * tk} x2={B[0] + px * tk} y2={B[1] + py * tk} stroke={col} stroke-width={w} vector-effect="non-scaling-stroke" />
		<text class="anno" x={mx} y={my} font-size={2.5 * paperMm} fill={col} text-anchor="middle" transform="rotate({rang} {mx} {my})">{Math.round(len)}</text>
	{:else if e.type === 'insert'}
		<!-- a BLOCK insert: the definition's shapes ('byblock' colour / fill from this insert) + its attribute
		     texts, at the insertion point, scaled (rotation is the shared wrapper above) -->
		{@const def = blockDef(e.block)}
		{@const k = e.scale ?? 1}
		<g transform="translate({e.a![0]} {e.a![1]}) scale({k})">
			{#if def}
				{#each def.shapes as bs (bs.id)}<EntRender e={byBlock(bs, e)} {ctx} {style} clipNs="{clipNs}-{e.id}" />{/each}
				{#each def.attributes as ad (ad.tag)}
					{#if ad.visible !== false && attrValue(e, ad)}
						{@const c = attrColor(e, ad)}
						<text class="anno" x={ad.pos[0]} y={ad.pos[1]} font-size={ad.height} text-anchor="middle"
							fill={c ? (style.adapt && c !== '#ffffff' ? style.adapt(c) : c) : ink}>{attrValue(e, ad)}</text>
					{/if}
				{/each}
			{:else}
				<!-- the block is missing from the library: a crossed box, still pickable -->
				<rect x="-100" y="-100" width="200" height="200" fill="none" stroke={ink} stroke-width={w} />
				<line x1="-100" y1="-100" x2="100" y2="100" stroke={ink} stroke-width={w} /><line x1="-100" y1="100" x2="100" y2="-100" stroke={ink} stroke-width={w} />
			{/if}
		</g>
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
			{@const nx = lp[0] < (bx0 + bx1) / 2 ? bx0 : bx1}
			{@const ny = lp[1] < (by0 + by1) / 2 ? by0 : by1}
			<rect x={bx0} y={by0} width={bx1 - bx0} height={by1 - by0} rx={fs * 0.3} fill="none" stroke={ink} stroke-width={1.2 / (canvasZoom || 1)} vector-effect="non-scaling-stroke" />
			<line x1={nx} y1={ny} x2={lp[0]} y2={lp[1]} stroke={ink} stroke-width={1.2 / (canvasZoom || 1)} vector-effect="non-scaling-stroke" />
			<polygon points={arrowPts([nx, ny] as Pt, lp as Pt, 3.5 * paperMm)} fill={ink} />
		{/if}
		<text class="anno" x={e.a![0]} y={e.a![1] + oy} font-size={fs} fill={ink} font-weight="600" text-anchor={anchor} dominant-baseline={e.valign === 'middle' ? 'central' : undefined}>
			{#each lines as line, i (i)}<tspan x={e.a![0]} dy={i === 0 ? 0 : lh}>{line}</tspan>{/each}
		</text>
	{/if}
{/snippet}

<style>
	/* The Viewport's `.vp-svg text.anno` rule is component-scoped, so it can't reach these elements; the same
	   monospace face lives here. (Everything else the snippets relied on was inline attributes.) */
	text.anno { font-family:'Consolas','SF Mono',ui-monospace,'Menlo',monospace; }
</style>
