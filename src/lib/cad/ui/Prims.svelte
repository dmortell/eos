<!-- Draws a display list into an SVG group (in drawing mm). Hairlines keep 1 screen px at any zoom; banded lines
     (trunks, walls) are drawn at their real width. Selected entities get the `sel` look. -->
<script lang="ts">
	import { getContext } from 'svelte'
	import { primBounds, type Prim } from '../views/display'
	import type { Id } from '../domain/types'

	/** An image shape's `picture:` reference → the url to show (set by the cad shell; app/pdf.svelte.ts). */
	const pictureOf = getContext<((ref: string) => string | undefined) | undefined>('cad-picture')
	const hrefOf = (url: string) => (url.startsWith('picture:') ? pictureOf?.(url) : url)

	/** `k` = screen px per drawing mm, for text LOD (minPx / maxPx). Omit to draw every text. */
	let { prims, selected, k }: { prims: Prim[]; selected: Set<Id>; k?: number } = $props()

	const ptsOf = (p: { pts: { x: number; y: number }[] }) => p.pts.map((q) => `${q.x},${q.y}`).join(' ')
	const ringsOf = (p: { pts: { x: number; y: number }[]; holes?: { x: number; y: number }[][] }) =>
		[p.pts, ...(p.holes ?? [])].map((r) => `M${r.map((q) => `${q.x},${q.y}`).join('L')}Z`).join('')
	// a shape's own lineweight (paper mm → screen px at 96 dpi, as CAD shows lineweights) and line type (backlog "Shape style")
	const lw = (p: Prim) => (p.k !== 'image' && p.weight ? `${Math.max(0.75, p.weight * 3.78)}px` : undefined)
	const DASH = { dashed: [6, 4], dotted: [1.5, 3], dashdot: [8, 3, 1.5, 3] } as const
	const da = (p: Prim) => { if (p.k === 'image' || !p.dash) return undefined; const f = Math.max(1, (p.weight ?? 0.25) * 3.78); return DASH[p.dash].map((n) => n * f).join(' ') }
	const shown = (p: Prim) => p.k !== 'text' || !k || ((p.minPx === undefined || p.size * k >= p.minPx) && (p.maxPx === undefined || p.size * k < p.maxPx))

	// clip windows (sheet viewports): one <clipPath> per distinct rect; ids unique per instance
	const uid = Math.random().toString(36).slice(2, 8)
	const clipKey = (b: NonNullable<Prim['clip']>) => `${b.x0},${b.y0},${b.x1},${b.y1}`
	const clips = $derived([...new Map(prims.filter((p) => p.clip).map((p) => [clipKey(p.clip!), p.clip!])).entries()])
	const clipIds = $derived(new Map(clips.map(([key], i) => [key, `clip-${uid}-${i}`])))
	const clipOf = (p: Prim) => (p.clip ? `url(#${clipIds.get(clipKey(p.clip))})` : undefined)

	/** The selection as Pages / Sheets show it (Dave 2026-10-06): the item stays as drawn; a thin blue line over its
	 *  lines, and a dashed box round each selected symbol, box or text (a run or wall — open lines only — gets the line
	 *  alone: a box round a long run says nothing). Padded a few screen px when the zoom is known. */
	const overLine = (p: Prim) => !!p.src && selected.has(p.src) && shown(p) && (p.k === 'circle' || (p.k === 'line' && !p.cls.startsWith('opening-pick') && !p.cls.startsWith('viewport')))
	const selBoxes = $derived.by(() => {
		if (!selected.size) return []
		const by = new Map<string, Prim[]>()
		for (const p of prims) if (p.src && selected.has(p.src) && shown(p) && p.k !== 'image' && !p.cls.startsWith('viewport') && !p.cls.startsWith('opening-pick')) (by.get(p.src) ?? by.set(p.src, []).get(p.src)!).push(p)
		const pad = k ? 4 / k : 0
		// a run never (Dave 2026-10-10: a labelled trunk's text brought a box back round the whole run — it looked odd)
		const isRun = (q: Prim) => q.k !== 'image' && (/^(run|riser)\b/.test(q.cls) || q.cls.includes('run-label'))
		return [...by.entries()].filter(([, ps]) => !ps.some(isRun) && ps.some((q) => q.k !== 'line' || q.closed)).map(([id, ps]) => {
			const bs = ps.map(primBounds)
			const b = { x0: Math.min(...bs.map((q) => q.x0)) - pad, y0: Math.min(...bs.map((q) => q.y0)) - pad, x1: Math.max(...bs.map((q) => q.x1)) + pad, y1: Math.max(...bs.map((q) => q.y1)) + pad }
			return { id, b, clip: clipOf(ps[0]) }
		})
	})
</script>

{#if clips.length}
	<defs>
		{#each clips as [key, b] (key)}<clipPath id={clipIds.get(key)}><rect x={b.x0} y={b.y0} width={b.x1 - b.x0} height={b.y1 - b.y0} /></clipPath>{/each}
	</defs>
{/if}
{#each prims as p, i (i)}
	{@const sel = !!p.src && selected.has(p.src)}
	{@const col = p.color}
	<!-- col = the item's / its layer's color, kept when selected (the selection is drawn over it). Polygons take it as
	     their outline, and as their fill only in outlet symbols (a colored Racks layer mustn't fill rack bodies solid
	     over their devices). -->
	{#if shown(p)}
	{#if p.k === 'image'}
		{@const href = hrefOf(p.url)}
		{#if href}<image href={href} x={p.x} y={p.y} width={p.w} height={p.h} opacity={p.opacity ?? 1} style:filter={p.gray ? 'grayscale(1)' : undefined} preserveAspectRatio={p.fit === 'contain' ? 'xMinYMid meet' : p.fit === 'centre' ? 'xMidYMid meet' : 'none'} clip-path={clipOf(p)} />{/if}
	{:else if p.k === 'line'}
		{#if p.closed && p.holes?.length}
			<!-- an outline with holes (a ring of runs): one path, even-odd, so the middle stays clear -->
			<path d={ringsOf(p)} fill-rule="evenodd" class="{p.cls} {p.fill ? 'filled' : ''}" class:sel vector-effect="non-scaling-stroke" style:stroke={col} style:stroke-width={lw(p)} style:stroke-dasharray={da(p)} style:fill={p.fill && p.cls.startsWith('run-body') ? col : undefined} clip-path={clipOf(p)} />
		{:else if p.closed}
			<polygon points={ptsOf(p)} class="{p.cls} {p.fill ? 'filled' : ''}" class:sel vector-effect="non-scaling-stroke" style:stroke={col} style:stroke-width={lw(p)} style:stroke-dasharray={da(p)} style:fill={p.fill && (p.cls.startsWith('outlet') || p.cls.startsWith('run-body') || p.cls === 'note-bg' || p.cls === 'shape-fill' || p.cls === 'port-usage' || p.cls.endsWith(' ink')) ? col : undefined} clip-path={clipOf(p)} />
		{:else if p.w}
			<!-- the real width, plus a 1 px centre line so a run stays visible when zoomed far out -->
			<!-- inline style: a stylesheet stroke-width would beat the presentation attribute -->
			<polyline points={ptsOf(p)} class="{p.cls} band" class:sel style:stroke-width={p.w} style:stroke={col} clip-path={clipOf(p)} />
			<polyline points={ptsOf(p)} class="{p.cls} centre" class:sel vector-effect="non-scaling-stroke" style:stroke={col} clip-path={clipOf(p)} />
		{:else}
			<polyline points={ptsOf(p)} class={p.cls} class:sel vector-effect="non-scaling-stroke" style:stroke={col} style:stroke-width={lw(p)} style:stroke-dasharray={da(p)} clip-path={clipOf(p)} />
		{/if}
	{:else if p.k === 'circle'}
		<circle cx={p.c.x} cy={p.c.y} r={p.r} class="{p.cls} {p.fill ? 'filled' : ''}" class:sel vector-effect="non-scaling-stroke" style:stroke={col} style:stroke-width={lw(p)} style:stroke-dasharray={da(p)} style:fill={p.fill ? col : undefined} clip-path={clipOf(p)} />
	{:else if p.k === 'text'}
		<text x={p.at.x} y={p.at.y} font-size={p.size} text-anchor={p.anchor ?? 'start'} class={p.cls} class:sel style:fill={col} clip-path={clipOf(p)}
			transform={p.rot ? `rotate(${p.rot} ${p.at.x} ${p.at.y})` : undefined}>{p.text}</text>
	{/if}
	{/if}
{/each}
{#if selected.size}
	<!-- the SELECTION, over everything (Pages / Sheets look): thin blue lines on the item's own lines, dashed boxes -->
	{#each prims as p, i (i)}
		{#if overLine(p)}
			{#if p.k === 'circle'}<circle cx={p.c.x} cy={p.c.y} r={p.r} class="sel-line" vector-effect="non-scaling-stroke" clip-path={clipOf(p)} />
			{:else if p.k === 'line' && p.closed}<polygon points={ptsOf(p)} class="sel-line" vector-effect="non-scaling-stroke" clip-path={clipOf(p)} />
			{:else if p.k === 'line'}<polyline points={ptsOf(p)} class="sel-line" vector-effect="non-scaling-stroke" clip-path={clipOf(p)} />{/if}
		{/if}
	{/each}
	{#each selBoxes as s (s.id)}<rect x={s.b.x0} y={s.b.y0} width={s.b.x1 - s.b.x0} height={s.b.y1 - s.b.y0} class="sel-box" vector-effect="non-scaling-stroke" clip-path={s.clip} />{/each}
{/if}

<style>
	polyline, polygon, circle { fill: none; stroke: var(--cad-ink, #334155); stroke-width: 1; }
	.filled { fill: var(--cad-fill, #e2e8f0); }
	/* the selection (Pages / Sheets): a thin blue line over the item's lines, a dashed box round a symbol / box / text */
	.sel-line { fill: none !important; stroke: #2563eb; stroke-width: 1.75px; stroke-linejoin: round; pointer-events: none; }
	.sel-box { fill: none !important; stroke: #2563eb; stroke-width: 1.25px; stroke-dasharray: 4 3; opacity: 0.9; pointer-events: none; }
	.band { stroke-linecap: butt; stroke-linejoin: miter; vector-effect: none; }
	/* the hairline drawn along every banded run */
	.centre { opacity: 1; stroke-width: 1.5; }
	.run { stroke: #0ea5e9; opacity: 0.55; }
	.run-high { stroke: #f97316; }
	/* runs as one outline each (backlog "Trunk drawing style"): a faint fill in the run's color, a thin edge; dashed in the
	   ceiling, stronger when primary. The runs' own bands are invisible over it — they pick and select a run */
	.run-hit { opacity: 0; }
	.run-body { fill: #0ea5e9; fill-opacity: 0.2; stroke: #0ea5e9; stroke-width: 1.25; stroke-linejoin: round; }
	.run-body.run-high { fill: #f97316; stroke: #f97316; }
	.run-ceiling { stroke-dasharray: 6 4; }
	.run-primary { stroke-width: 2.5; fill-opacity: 0.32; }
	.wall { stroke: #475569; opacity: 0.8; }
	.riser { stroke: #be185d; fill: #fce7f3; }
	.rack { stroke: #1e293b; fill: none; }   /* no shading (Dave); still picked by its whole body */
	.rack-x { stroke: #94a3b8; }
	.paper { fill: #ffffff; stroke: #a1a1aa; }
	.paper-margin { stroke: #d4d4d8; stroke-dasharray: 4 3; }
	.viewport-bg.filled { fill: #ffffff; stroke: none; }
	text.note { fill: #0f172a; }
	.note-bg { stroke: none; fill: #ffffff; }
	.shape-fill { stroke: none; }
	.dim { stroke: #0f172a; stroke-width: 1; fill: none; }
	text.dim-text { fill: #0f172a; }
	.leader { stroke: #0f172a; }
	.leader-head.filled { fill: #0f172a; }
	/* filled with the line's own color (line end marks, a symbol's solid parts) */
	.ink.filled { fill: #0f172a; }
	/* an image's frame: unseen, it takes the clicks and shows the selection */
	.image-frame { fill: transparent; stroke: none; }
	.cloud { stroke: #dc2626; stroke-width: 1.25; }
	.tb-frame { stroke: #64748b; }
	.tb-frame.filled { fill: #ffffff; }
	.tb-rule { stroke: #cbd5e1; }
	.tb-border { stroke: #64748b; }
	text.tb-label { fill: #94a3b8; letter-spacing: 0.05em; }
	text.tb-value { fill: #1f2937; font-weight: 600; }
	text.tb-logo { fill: #1f2937; font-weight: 700; }
	.legend { stroke: #64748b; }
	.legend.filled { fill: #ffffff; }
	.legend-rule { stroke: #94a3b8; fill: none; }
	text.legend-title { fill: #0f172a; font-weight: 700; }
	text.legend-text { fill: #1f2937; }
	text.tb-company-name { fill: #1f2937; font-weight: 700; }
	text.tb-company { fill: #475569; }
	.viewport { stroke: #2563eb; stroke-dasharray: 6 3; }
	.viewport.filled { fill: none; }
	.viewport.sel { stroke: #2563eb; stroke-width: 2; }
	.viewport-hidden { stroke-opacity: 0.25; }
	text.viewport-label { fill: #334155; }
	.rack-rails { stroke: #64748b; stroke-width: 1.25; fill: none; }
	.rack-back { stroke: #1e293b; stroke-width: 3.5; }   /* a rack's / box's rear edge, heavy */
	.outlet { stroke: #1d4ed8; }
	.outlet.filled { fill: #3b82f6; }
	.outlet-high { stroke-dasharray: 3 2; }
	text { fill: #0f172a; font-family: ui-sans-serif, system-ui, sans-serif; user-select: none; }
	text.riser-label { fill: #be185d; }
	.device { stroke: #334155; fill: #cbd5e1; }
	.device-panel { fill: #e0f2fe; }
	.device-switch { fill: #dcfce7; }
	.pdu-inlet { stroke: #7f1d1d; fill: #dc2626; }
	.pdu-socket { stroke: #1f2937; fill: #f8fafc; }
	.datum { stroke: #a1a1aa; stroke-dasharray: 6 4; }
	.datum-ffl { stroke: #52525b; stroke-dasharray: none; }
	/* a device on the rack's other face: faint, behind this face's devices */
	.device-other { stroke: #a1a1aa; stroke-dasharray: 3 2; fill: none; }
	text.device-other-label { fill: #a1a1aa; font-style: italic; }
	.datum-slab { stroke: #3f3f46; stroke-dasharray: none; stroke-width: 2; }   /* a slab face: a little heavier than FFL */
	text.datum-label { fill: #71717a; }
	.workplane { stroke: #16a34a; stroke-dasharray: 8 4; stroke-width: 1.5; }
	/* its grip (drag = the work depth / Z) and value, in its green */
	.grip.workplane-grip.filled { fill: #ffffff; stroke: #16a34a; stroke-width: 1.75; }
	text.workplane-label { fill: #15803d; }
	.port { stroke: #94a3b8; fill: #f8fafc; }
	.port-labelled { fill: #fef9c3; }
	.port-linked { fill: #e0f2fe; stroke: #0284c7; }
	.port-patched { stroke: #16a34a; stroke-width: 2; }   /* a cord is plugged in (Dave) */
	.port-stale { stroke: #dc2626; stroke-width: 2; }
	.port-mid { stroke: #334155; stroke-width: 1.5; }   /* the tick under the middle of a 24+ port device's ports */
	.trace-cord { stroke: #f59e0b; stroke-width: 4; opacity: 0.9; }
	/* handles (openings / sections): blue + white so they show on an orange selection */
	.opening-pick { stroke: transparent; }
	.grip-bar { stroke: #1d4ed8; stroke-width: 6; stroke-opacity: 0.35; stroke-linecap: butt; }
	.grip-bar.grip-bar-sel { stroke: #2563eb; stroke-opacity: 0.8; }
	/* a round grip sets a property (a door's swing, a section's depth) — the same look, round */
	/* a picked node / segment of the selected run (Delete removes it; Properties: Disconnect) */
	.grip.grip-hover.filled { fill: #dbeafe; stroke: #1d4ed8; stroke-width: 2; }
	.grip.grip-sel.filled { fill: #2563eb; stroke: #ffffff; stroke-width: 1.75; }
	.grip-plus { stroke: #2563eb; stroke-width: 1.75; }   /* the + on a selected port's grip: start a patch / a link from it */
	.seg-sel { stroke: #2563eb; stroke-width: 7; stroke-opacity: 0.45; stroke-linecap: round; fill: none; }
	.section-extent { stroke: #0f766e; stroke-dasharray: 4 4; fill: rgba(15, 118, 110, 0.05); }
	.section-line { stroke: #0f766e; stroke-width: 2; stroke-dasharray: 10 4 2 4; }
	.section-arrow.filled { fill: #0f766e; }
	.section-arrow { stroke: #0f766e; }
	text.section-label { fill: #0f766e; font-weight: 700; }
	.cut.filled { fill: #334155; }
	.cut { stroke: #0f172a; }
	.opening { stroke: #475569; }
	.opening-swing { stroke: #475569; fill: none; }
	.rack-door { stroke: #475569; fill: none; }
	.opening-hole { fill: #ffffff; stroke: #475569; }
	.riser-slab { fill: #e7e5e4; stroke: none; }
	/* the raised-floor void and the ceiling plenum, lighter than the slab */
	.riser-ffl { stroke: #57534e; stroke-width: 1.5; }
	.riser-ceiling { stroke: #a8a29e; stroke-dasharray: 6 4; }
	.riser-eps { stroke: #0f766e; fill: #f0fdfa; stroke-dasharray: 5 3; }
	.riser-room { fill: #eff6ff; stroke: #2563eb; }
	.riser-shaft { fill: #fef3c7; stroke: #b45309; }
	text.rv-label { fill: #44403c; }
	.backbone { stroke: #7c3aed; stroke-width: 2; fill: none; }
	.backbone-none { stroke: #dc2626; stroke-dasharray: 5 4; }
	text.backbone-label { fill: #5b21b6; }
	.fill-band { opacity: 0.6; }
	.fill-band.fill-ok { stroke: #16a34a; }
	.fill-band.fill-warn { stroke: #f59e0b; }
	.fill-band.fill-over { stroke: #dc2626; }
	text.fill-label { font-weight: 700; paint-order: stroke; stroke: white; stroke-width: 3px; }
	text.fill-label.fill-ok { fill: #166534; }
	text.fill-label.fill-warn { fill: #92400e; }
	text.fill-label.fill-over { fill: #b91c1c; }
	/* the route a selected outlet's cables take: green dashes, so it doesn't read as selected (selection is amber) */
	/* every cable's route (the plan's Routes toggle), in its server room's color */
	/* a panel port cabled to an outlet: a light tint of its usage color (backlog "Usage colors") */
	.port-usage { stroke: none; fill-opacity: 0.35; pointer-events: none; }
	.all-route { stroke-width: 3; opacity: 0.75; fill: none; stroke-linecap: round; }
	.trace-route { stroke: #10b981; stroke-width: 4; stroke-dasharray: 8 5; opacity: 0.85; fill: none; stroke-linecap: round; }
	.trace-port { fill: #f59e0b; fill-opacity: 0.35; stroke: #d97706; stroke-width: 2; }
	.cord-remove { stroke-dasharray: 2 3; opacity: 0.5; }
	.cord-change { stroke-dasharray: 8 2 2 2; }
	.cord-replace { stroke-dasharray: 8 2 2 2 2 2; }
	.port-reserved { fill: #f5f3ff; stroke: #8b5cf6; stroke-dasharray: 3 2; }
	.port-sel { fill: #2563eb; fill-opacity: 0.3; stroke: #1d4ed8; stroke-width: 2; }
	text.device-stale { fill: #b91c1c; }
	text.port-label { fill: #0c4a6e; font-family: ui-monospace, monospace; }
	/* a selected / traced port's label, redrawn over its highlight cell */
	text.port-label-sel { fill: #0b1f4d; font-weight: 700; }
	text.port-label-trace { fill: #78350f; }
	text.u-label { fill: #94a3b8; }
	text.u-label.u-clash { fill: #dc2626; font-weight: 700; }
	.riser-break { stroke: #94a3b8; stroke-width: 1; fill: none; }
	text.pick-order { fill: #c2410c; font-weight: 700; paint-order: stroke; stroke: white; stroke-width: 3px; }
	text.device-label { fill: #1e293b; font-weight: 600; }
	/* a panel's name over its ports: no white halo (Dave: it hid the port labels when zoomed in), full strength */
	text.device-label.on-ports { stroke: none; }
	text.device-label.on-ports-small { fill: #0f172a; font-weight: 600; }
	.cord { stroke-width: 2; opacity: 0.85; }
	.cord-installed { stroke-dasharray: none; }
	.cord-add { stroke-dasharray: 6 3; }
	.draft { stroke: #2563eb; opacity: 0.5; }
	/* an elevation's depth band (UX14): beyond it faded; its edges on the plan */
	.far { opacity: 0.3; }
	.band-edge { stroke: #7c3aed; stroke-dasharray: 10 6; stroke-width: 1.2; }
	.draft.line { opacity: 1; stroke-dasharray: 4 3; }
	text.draft-label { fill: #2563eb; }
	/* the Device tool's drop ghost; red = it can't go there */
	.draft-bad { stroke: #dc2626; opacity: 0.8; stroke-dasharray: 4 3; }
	/* GRIPS look like the Sheets tool's (Dave 2026-10-06): white, a blue edge; a picked one filled blue */
	.grip.filled { fill: #ffffff; stroke: #2563eb; stroke-width: 1.75; }
	.logo-sel { stroke: #2563eb; stroke-dasharray: 4 3; fill: none; }
	/* what a click would take (UX06): a thin light-blue outline */
	.hover { stroke: #60a5fa; stroke-width: 3; stroke-opacity: 0.8; fill: none; }
	text.hover { fill: #2563eb; stroke: none; }
	/* an outlet's port count in the middle of its symbol: white on a filled symbol (over its layer color and the
	   selection), dark with a halo sized to the text (em, so it doesn't grow with the zoom) on an outline one */
	text.on-fill { fill: #ffffff !important; font-weight: 600; }
	text.port-count { paint-order: stroke; stroke: #ffffff; stroke-width: 0.25em; stroke-linejoin: round; }
	.snap { stroke: #16a34a; stroke-width: 1.5; fill: none; }
	/* selected items keep their own look (the selection is drawn over them, above); text never gets an outline */
	text.sel { stroke: none !important; }
</style>
