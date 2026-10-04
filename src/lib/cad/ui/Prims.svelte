<!-- Draws a display list into an SVG group (in drawing mm). Hairlines keep 1 screen px at any zoom; banded lines
     (trunks, walls) are drawn at their real width. Selected entities get the `sel` look. -->
<script lang="ts">
	import type { Prim } from '../views/display'
	import type { Id } from '../domain/types'

	/** `k` = screen px per drawing mm, for text LOD (minPx / maxPx). Omit to draw every text. */
	let { prims, selected, k }: { prims: Prim[]; selected: Set<Id>; k?: number } = $props()

	const ptsOf = (p: { pts: { x: number; y: number }[] }) => p.pts.map((q) => `${q.x},${q.y}`).join(' ')
	const shown = (p: Prim) => p.k !== 'text' || !k || ((p.minPx === undefined || p.size * k >= p.minPx) && (p.maxPx === undefined || p.size * k < p.maxPx))

	// clip windows (sheet viewports): one <clipPath> per distinct rect; ids unique per instance
	const uid = Math.random().toString(36).slice(2, 8)
	const clipKey = (b: NonNullable<Prim['clip']>) => `${b.x0},${b.y0},${b.x1},${b.y1}`
	const clips = $derived([...new Map(prims.filter((p) => p.clip).map((p) => [clipKey(p.clip!), p.clip!])).entries()])
	const clipIds = $derived(new Map(clips.map(([key], i) => [key, `clip-${uid}-${i}`])))
	const clipOf = (p: Prim) => (p.clip ? `url(#${clipIds.get(clipKey(p.clip))})` : undefined)
</script>

{#if clips.length}
	<defs>
		{#each clips as [key, b] (key)}<clipPath id={clipIds.get(key)}><rect x={b.x0} y={b.y0} width={b.x1 - b.x0} height={b.y1 - b.y0} /></clipPath>{/each}
	</defs>
{/if}
{#each prims as p, i (i)}
	{@const sel = !!p.src && selected.has(p.src)}
	{@const col = sel ? undefined : p.color}
	<!-- col = the item's / its layer's colour; the selection look wins. Polygons take it as their outline, and as their
	     fill only in outlet symbols (a coloured Racks layer mustn't fill rack bodies solid over their devices). -->
	{#if shown(p)}
	{#if p.k === 'image'}
		<image href={p.url} x={p.x} y={p.y} width={p.w} height={p.h} opacity={p.opacity ?? 1} preserveAspectRatio={p.fit === 'contain' ? 'xMinYMid meet' : 'none'} clip-path={clipOf(p)} />
	{:else if p.k === 'line'}
		{#if p.closed}
			<polygon points={ptsOf(p)} class="{p.cls} {p.fill ? 'filled' : ''}" class:sel vector-effect="non-scaling-stroke" style:stroke={col} style:fill={p.fill && (p.cls.startsWith('outlet') || p.cls === 'note-bg') ? col : undefined} clip-path={clipOf(p)} />
		{:else if p.w}
			<!-- the real width, plus a 1 px centre line so a run stays visible when zoomed far out -->
			<!-- inline style: a stylesheet stroke-width would beat the presentation attribute -->
			<polyline points={ptsOf(p)} class="{p.cls} band" class:sel style:stroke-width={p.w} style:stroke={col} clip-path={clipOf(p)} />
			<polyline points={ptsOf(p)} class="{p.cls} centre" class:sel vector-effect="non-scaling-stroke" style:stroke={col} clip-path={clipOf(p)} />
		{:else}
			<polyline points={ptsOf(p)} class={p.cls} class:sel vector-effect="non-scaling-stroke" style:stroke={col} clip-path={clipOf(p)} />
		{/if}
	{:else if p.k === 'circle'}
		<circle cx={p.c.x} cy={p.c.y} r={p.r} class="{p.cls} {p.fill ? 'filled' : ''}" class:sel vector-effect="non-scaling-stroke" style:stroke={col} style:fill={p.fill ? col : undefined} clip-path={clipOf(p)} />
	{:else if p.k === 'text'}
		<text x={p.at.x} y={p.at.y} font-size={p.size} text-anchor={p.anchor ?? 'start'} class={p.cls} class:sel style:fill={col} clip-path={clipOf(p)}
			transform={p.rot ? `rotate(${p.rot} ${p.at.x} ${p.at.y})` : undefined}>{p.text}</text>
	{/if}
	{/if}
{/each}

<style>
	polyline, polygon, circle { fill: none; stroke: var(--cad-ink, #334155); stroke-width: 1; }
	.filled { fill: var(--cad-fill, #e2e8f0); }
	.band { stroke-linecap: butt; stroke-linejoin: miter; vector-effect: none; }
	/* the hairline drawn along every banded run */
	.centre { opacity: 1; stroke-width: 1.5; }
	.run { stroke: #0ea5e9; opacity: 0.55; }
	.run-high { stroke: #f97316; }
	.wall { stroke: #475569; opacity: 0.8; }
	.riser { stroke: #be185d; fill: #fce7f3; }
	.rack { stroke: #1e293b; fill: none; }   /* no shading (Dave); still picked by its whole body */
	.rack-x { stroke: #94a3b8; }
	.paper { fill: #ffffff; stroke: #a1a1aa; }
	.paper-margin { stroke: #d4d4d8; stroke-dasharray: 4 3; }
	.viewport-bg.filled { fill: #ffffff; stroke: none; }
	text.note { fill: #0f172a; }
	.note-bg { stroke: none; fill: #ffffff; }
	.dim { stroke: #0f172a; stroke-width: 1; fill: none; }
	text.dim-text { fill: #0f172a; }
	.leader { stroke: #0f172a; }
	.leader-head.filled { fill: #0f172a; }
	.cloud { stroke: #dc2626; stroke-width: 1.25; }
	.tb-frame { stroke: #64748b; }
	.tb-frame.filled { fill: #ffffff; }
	.tb-rule { stroke: #cbd5e1; }
	.tb-border { stroke: #64748b; }
	text.tb-label { fill: #94a3b8; letter-spacing: 0.05em; }
	text.tb-value { fill: #1f2937; font-weight: 600; }
	text.tb-logo { fill: #1f2937; font-weight: 700; }
	text.tb-company-name { fill: #1f2937; font-weight: 700; }
	text.tb-company { fill: #475569; }
	.viewport { stroke: #2563eb; stroke-dasharray: 6 3; }
	.viewport.filled { fill: none; }
	.viewport.sel { stroke: #f97316; stroke-width: 2; }
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
	.datum { stroke: #a1a1aa; stroke-dasharray: 6 4; }
	.datum-ffl { stroke: #52525b; stroke-dasharray: none; }
	/* a device on the rack's other face: faint, behind this face's devices */
	.device-other { stroke: #a1a1aa; stroke-dasharray: 3 2; fill: none; }
	text.device-other-label { fill: #a1a1aa; font-style: italic; }
	.datum-slab { stroke: #3f3f46; stroke-dasharray: none; stroke-width: 2; }   /* a slab face: a little heavier than FFL */
	text.datum-label { fill: #71717a; }
	.workplane { stroke: #16a34a; stroke-dasharray: 8 4; stroke-width: 1.5; }
	.port { stroke: #94a3b8; fill: #f8fafc; }
	.port-labelled { fill: #fef9c3; }
	.port-linked { fill: #e0f2fe; stroke: #0284c7; }
	.port-stale { stroke: #dc2626; stroke-width: 2; }
	.trace-cord { stroke: #f59e0b; stroke-width: 4; opacity: 0.9; }
	/* handles (openings / sections): blue + white so they show on an orange selection */
	.opening-pick { stroke: transparent; }
	.grip-bar { stroke: #1d4ed8; stroke-width: 6; stroke-opacity: 0.35; stroke-linecap: butt; }
	.grip-bar.grip-bar-sel { stroke: #ea580c; stroke-opacity: 0.8; }
	.grip.grip-handle.filled { fill: #ffffff; stroke: #1d4ed8; stroke-width: 2; }
	.grip.grip-round.filled { fill: #1d4ed8; stroke: #ffffff; stroke-width: 2; }
	/* a picked node / segment of the selected run (Delete removes it; Properties: Disconnect) */
	.grip.grip-sel.filled { fill: #2563eb; stroke: #ffffff; stroke-width: 2; }
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
	.riser-ffl { stroke: #57534e; stroke-width: 1.5; }
	.riser-ceiling { stroke: #a8a29e; stroke-dasharray: 6 4; }
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
	.trace-route { stroke: #10b981; stroke-width: 4; stroke-dasharray: 8 5; opacity: 0.85; fill: none; stroke-linecap: round; }
	.trace-port { fill: #fde68a; stroke: #d97706; stroke-width: 2; }
	.cord-remove { stroke-dasharray: 2 3; opacity: 0.5; }
	.cord-change { stroke-dasharray: 8 2 2 2; }
	.port-reserved { fill: #f5f3ff; stroke: #8b5cf6; stroke-dasharray: 3 2; }
	.port-sel { fill: #2563eb; fill-opacity: 0.35; stroke: #1d4ed8; stroke-width: 2; }
	text.device-stale { fill: #b91c1c; }
	text.port-label { fill: #0c4a6e; font-family: ui-monospace, monospace; }
	text.u-label { fill: #94a3b8; }
	.riser-break { stroke: #94a3b8; stroke-width: 1; fill: none; }
	text.pick-order { fill: #c2410c; font-weight: 700; paint-order: stroke; stroke: white; stroke-width: 3px; }
	text.device-label { fill: #1e293b; font-weight: 600; }
	text.device-label.on-ports { paint-order: stroke; stroke: white; stroke-width: 3px; stroke-opacity: 0.9; }
	text.device-label.on-ports-small { fill-opacity: 0.45; font-weight: 500; stroke: none; }
	.cord { stroke-width: 2; opacity: 0.85; }
	.cord-installed { stroke-dasharray: none; }
	.cord-add { stroke-dasharray: 6 3; }
	.draft { stroke: #2563eb; opacity: 0.5; }
	.draft.line { opacity: 1; stroke-dasharray: 4 3; }
	/* the Device tool's drop ghost; red = it can't go there */
	.draft-bad { stroke: #dc2626; opacity: 0.8; stroke-dasharray: 4 3; }
	.grip { fill: #f59e0b; stroke: white; }
	.snap { stroke: #16a34a; stroke-width: 1.5; fill: none; }
	.sel { stroke: #f59e0b !important; }
	.opening-pick.sel { stroke: transparent !important; }   /* a selected wall's gaps stay open */
	.band.sel { opacity: 0.9; }
	text.sel { fill: #b45309; font-weight: 600; }
	circle.sel, polygon.sel { stroke-width: 2.5; }
</style>
