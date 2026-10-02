<!-- Draws a display list into an SVG group (in drawing mm). Hairlines keep 1 screen px at any zoom; banded lines
     (trunks, walls) are drawn at their real width. Selected entities get the `sel` look. -->
<script lang="ts">
	import type { Prim } from '../views/display'
	import type { Id } from '../domain/types'

	/** `k` = screen px per drawing mm, for text LOD (minPx / maxPx). Omit to draw every text. */
	let { prims, selected, k }: { prims: Prim[]; selected: Set<Id>; k?: number } = $props()

	const ptsOf = (p: { pts: { x: number; y: number }[] }) => p.pts.map((q) => `${q.x},${q.y}`).join(' ')
	const shown = (p: Prim) => p.k !== 'text' || !k || ((p.minPx === undefined || p.size * k >= p.minPx) && (p.maxPx === undefined || p.size * k < p.maxPx))
</script>

{#each prims as p, i (i)}
	{@const sel = !!p.src && selected.has(p.src)}
	{#if shown(p)}
	{#if p.k === 'image'}
		<image href={p.url} x={p.x} y={p.y} width={p.w} height={p.h} opacity={p.opacity ?? 1} preserveAspectRatio="none" />
	{:else if p.k === 'line'}
		{#if p.closed}
			<polygon points={ptsOf(p)} class="{p.cls} {p.fill ? 'filled' : ''}" class:sel vector-effect="non-scaling-stroke" />
		{:else if p.w}
			<!-- the real width, plus a 1 px centre line so a run stays visible when zoomed far out -->
			<!-- inline style: a stylesheet stroke-width would beat the presentation attribute -->
			<polyline points={ptsOf(p)} class="{p.cls} band" class:sel style:stroke-width={p.w} />
			<polyline points={ptsOf(p)} class="{p.cls} centre" class:sel vector-effect="non-scaling-stroke" />
		{:else}
			<polyline points={ptsOf(p)} class={p.cls} class:sel vector-effect="non-scaling-stroke" style:stroke={p.color} />
		{/if}
	{:else if p.k === 'circle'}
		<circle cx={p.c.x} cy={p.c.y} r={p.r} class="{p.cls} {p.fill ? 'filled' : ''}" class:sel vector-effect="non-scaling-stroke" />
	{:else if p.k === 'text'}
		<text x={p.at.x} y={p.at.y} font-size={p.size} text-anchor={p.anchor ?? 'start'} class={p.cls} class:sel
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
	.rack { stroke: #1e293b; fill: #f1f5f9; }
	.rack-x { stroke: #94a3b8; }
	.rack-front { stroke: #1e293b; stroke-width: 2; }
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
	text.datum-label { fill: #71717a; }
	.workplane { stroke: #16a34a; stroke-dasharray: 8 4; stroke-width: 1.5; }
	.port { stroke: #94a3b8; fill: #f8fafc; }
	.port-labelled { fill: #fef9c3; }
	.port-linked { fill: #e0f2fe; stroke: #0284c7; }
	.port-stale { stroke: #dc2626; stroke-width: 2; }
	.port-sel { fill: #2563eb; fill-opacity: 0.35; stroke: #1d4ed8; stroke-width: 2; }
	text.device-stale { fill: #b91c1c; }
	text.port-label { fill: #0c4a6e; font-family: ui-monospace, monospace; }
	text.u-label { fill: #94a3b8; }
	text.device-label { fill: #1e293b; font-weight: 600; }
	.cord { stroke-width: 2; opacity: 0.85; }
	.cord-installed { stroke-dasharray: none; }
	.cord-add { stroke-dasharray: 6 3; }
	.draft { stroke: #2563eb; opacity: 0.5; }
	.draft.line { opacity: 1; stroke-dasharray: 4 3; }
	.grip { fill: #f59e0b; stroke: white; }
	.snap { stroke: #16a34a; stroke-width: 1.5; fill: none; }
	.sel { stroke: #f59e0b !important; }
	.band.sel { opacity: 0.9; }
	text.sel { fill: #b45309; font-weight: 600; }
	circle.sel, polygon.sel { stroke-width: 2.5; }
</style>
