<script lang="ts">
	import type { SheetViewport } from '../../types'
	import type { RiserRoom, Ladder, Cable, TextLabel, FloorHeights, RiserSettings } from './types'
	import { DEFAULT_RISER_SETTINGS } from './types'
	import { buildFloorBands, compressionBreaks, computeCableLanes, cablePolylinePoints, totalStackHeightMm, bandForFloor } from './engine'
	import { objLayerOf, objLayerColor } from '../../layers/layers'

	let {
		rooms = [], ladders = [], cables = [], labels = [], floorHeights = {}, settings = null,
		hiddenFloors = [], fromFloor, toFloor, vp, onview, view = null, onsvg, children, hidden = [], layers = [],
	}: {
		rooms?: RiserRoom[]
		ladders?: Ladder[]
		cables?: Cable[]
		labels?: TextLabel[]
		floorHeights?: Record<number, FloorHeights>
		settings?: RiserSettings | null
		hiddenFloors?: number[]
		fromFloor: number
		toFloor: number
		vp: SheetViewport
		onview?: (v: { x: number; y: number; w: number; h: number; den: number }) => void
		view?: { x: number; y: number; w: number; h: number } | null
		onsvg?: (el: SVGSVGElement) => void
		children?: any
		hidden?: string[]
		layers?: import('../../layers/layers').LayerDef[]
	} = $props()

	const LEFT = 1500, RIGHT = 500, TOP = 500, BOTTOM = 500

	let cfg = $derived(settings ?? DEFAULT_RISER_SETTINGS)
	let bands = $derived(buildFloorBands({ floorHeights, settings: cfg, hiddenFloors }, fromFloor, toFloor))
	let breaks = $derived(compressionBreaks(bands))
	// Hidden-floor gaps: half-height hatched spacer + the ceiling slab of the
	// floor directly below the gap (its ceiling = the hidden floor's slab).
	let floorGaps = $derived(
		bands
			.map((b, i) => ({ b, above: bands[i - 1] }))
			.filter(({ b }) => (b.gapAboveMm ?? 0) > 0)
			.map(({ b, above }) => {
				const gapMm = b.gapAboveMm ?? 0
				const slabMm = b.heights.slabMm
				return {
					yMm: b.topMm - gapMm,
					hMm: Math.max(0, gapMm - slabMm),
					slabY: b.topMm - slabMm,
					slabMm,
					count: above ? above.floor - b.floor - 1 : 0,
				}
			}),
	)
	let runsByCable = $derived(computeCableLanes(cables, { rooms, ladders }))
	let stackH = $derived(totalStackHeightMm(bands))
	let buildingWidthMm = $derived(cfg.widthMm)

	let visibleFloors = $derived(new Set(bands.map(b => b.floor)))
	let visibleRooms = $derived(rooms.filter(r => visibleFloors.has(r.floor)))
	let visibleLadders = $derived(ladders.filter(l => {
		const lo = Math.min(l.fromFloor, l.toFloor), hi = Math.max(l.fromFloor, l.toFloor)
		return bands.some(b => b.floor >= lo && b.floor <= hi)
	}))

	// ── viewBox (content box in mm) ──
	let bounds = $derived({ x: -LEFT, y: -TOP, w: LEFT + buildingWidthMm + RIGHT, h: TOP + stackH + BOTTOM })
	let fit = $derived(!vp.scale || vp.scale <= 0)
	let vb = $derived.by(() => {
		if (fit) return { ...bounds }
		const s = vp.scale as number
		return { x: vp.contentOffsetMm?.x ?? bounds.x, y: vp.contentOffsetMm?.y ?? bounds.y, w: vp.w * s, h: vp.h * s }
	})
	let den = $derived(fit ? (vp.w > 0 && vp.h > 0 ? Math.max(bounds.w / vp.w, bounds.h / vp.h) : 0) : (vp.scale as number))
	let viewBox = $derived(view ? `${view.x} ${view.y} ${view.w} ${view.h}` : `${vb.x} ${vb.y} ${vb.w} ${vb.h}`)
	let par = $derived(view ? 'xMidYMid meet' : fit ? 'xMidYMid meet' : 'xMinYMin meet')
	$effect(() => { onview?.({ ...vb, den }) })

	let svgEl: SVGSVGElement | undefined = $state()
	$effect(() => { if (svgEl) onsvg?.(svgEl) })

	function hexToRgba(hex: string | undefined, a: number): string {
		if (!hex || hex[0] !== '#') return hex || `rgba(100,100,100,${a})`
		let h = hex.slice(1)
		if (h.length === 3) h = h.split('').map(c => c + c).join('')
		const n = parseInt(h, 16)
		return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
	}
	function cableColor(c: Cable): string {
		return c.color ?? (c.media === 'fiber' ? 'rgb(245,158,11)' : c.media === 'copper' ? 'rgb(37,99,235)' : 'rgb(20,184,166)')
	}
	function ladderSpan(l: Ladder) {
		const lo = Math.min(l.fromFloor, l.toFloor), hi = Math.max(l.fromFloor, l.toFloor)
		const top = bandForFloor(bands, hi)?.topMm ?? bands[0]?.topMm ?? 0
		const bot = bandForFloor(bands, lo)?.slabBottomMm ?? bands[bands.length - 1]?.slabBottomMm ?? 0
		return { top, bot }
	}
	function labelPos(str: string): { x: number; y: number } | null {
		const pts = str.split(' ').map(p => p.split(',').map(Number))
		let best: { x: number; y: number } | null = null, bestLen = -1
		for (let i = 0; i < pts.length - 1; i++) {
			const [x1, y1] = pts[i], [x2, y2] = pts[i + 1]
			if (Math.abs(y1 - y2) < 1) { const len = Math.abs(x2 - x1); if (len > bestLen) { bestLen = len; best = { x: (x1 + x2) / 2, y: y1 } } }
		}
		return best ?? (pts[0] ? { x: pts[0][0], y: pts[0][1] } : null)
	}
</script>

<svg bind:this={svgEl} class="h-full w-full" {viewBox} preserveAspectRatio={par} style:overflow="hidden">
	{#if floorGaps.length}
		<defs>
			<pattern id="sheet-riser-gap" width="600" height="600" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
				<rect width="600" height="600" fill="rgba(120,120,140,0.06)" />
				<line x1="0" y1="0" x2="0" y2="600" stroke="rgba(120,120,140,0.35)" stroke-width="60" />
			</pattern>
		</defs>
	{/if}
	<!-- Floor bands -->
	{#each bands as b (b.floor)}
		<rect x="0" y={b.topMm} width={buildingWidthMm} height={b.plenumBottomMm - b.topMm} fill="rgba(120,130,160,0.08)" stroke="rgba(120,130,160,0.3)" stroke-width="0.4" vector-effect="non-scaling-stroke" />
		<line x1="0" y1={b.plenumBottomMm} x2={buildingWidthMm} y2={b.plenumBottomMm} stroke="rgba(80,90,110,0.6)" stroke-width="0.5" vector-effect="non-scaling-stroke" />
		{#if b.heights.raisedFloorMm > 0}
			<rect x="0" y={b.raisedFloorTopMm} width={buildingWidthMm} height={b.slabTopMm - b.raisedFloorTopMm} fill="rgba(160,140,100,0.0)" stroke="rgba(160,140,100,0.3)" stroke-width="0.4" vector-effect="non-scaling-stroke" />
		{/if}
		<rect x="0" y={b.slabTopMm} width={buildingWidthMm} height={b.slabBottomMm - b.slabTopMm} fill="rgba(60,60,70,0.25)" stroke="rgba(20,20,30,0.95)" stroke-width="0.2" vector-effect="non-scaling-stroke" />
		<text x="-200" y={(b.raisedFloorTopMm + b.plenumBottomMm) / 2} text-anchor="end" dominant-baseline="middle" font-size="560" font-weight="600" fill="#3f3f46">{b.floor}F</text>
	{/each}

	<!-- Hidden-floor gap blocks (hatched spacer + ceiling slab of the floor below) -->
	{#each floorGaps as g (g.yMm)}
		<rect x="0" y={g.yMm} width={buildingWidthMm} height={g.hMm} fill="url(#sheet-riser-gap)" stroke="rgba(120,120,140,0.4)" stroke-width="0.3" stroke-dasharray="120 80" vector-effect="non-scaling-stroke" />
		<rect x="0" y={g.slabY} width={buildingWidthMm} height={g.slabMm} fill="rgba(60,60,70,0.25)" stroke="rgba(20,20,30,0.95)" stroke-width="0.2" vector-effect="non-scaling-stroke" />
		<text x={buildingWidthMm / 2} y={g.yMm + g.hMm / 2} text-anchor="middle" dominant-baseline="middle" font-size="280" font-weight="500" fill="#71717a">{g.count} floor{g.count === 1 ? '' : 's'} hidden</text>
	{/each}

	<!-- Ladders -->
	{#each visibleLadders as l (l.id)}
		{@const eff = objLayerOf(l.layerId, 'ladders', layers)}
		{#if !hidden.includes(eff)}
		{@const lc = objLayerColor(eff, layers)}
		{@const span = ladderSpan(l)}
		{@const w = l.widthMm ?? 450}
		{@const xLeft = l.xMm - w / 2}
		{@const stroke = lc ?? l.color ?? 'rgb(100,70,140)'}
		<rect x={xLeft} y={span.top} width={w} height={Math.max(100, span.bot - span.top)} fill={hexToRgba(lc ?? l.color, 0.12)} {stroke} stroke-width="0.3" vector-effect="non-scaling-stroke" />
		{#each breaks.filter(br => br.yMm > span.top && br.yMm < span.bot) as br (br.yMm)}
			<line x1={l.xMm - w / 2 - 120} y1={br.yMm + 480} x2={l.xMm + w / 2 + 120} y2={br.yMm + 80} {stroke} stroke-width="0.3" vector-effect="non-scaling-stroke" />
		{/each}
		<text x={l.xMm} y={span.top - 120} text-anchor="middle" font-size="220" font-weight="700" fill={stroke}>{l.label}</text>
		{#if l.level !== 'both'}
			<text x={l.xMm} y={span.bot + 220} text-anchor="middle" font-size="180" font-weight="600" fill={stroke} opacity="0.7">{l.level === 'high' ? 'HIGH' : 'LOW'}</text>
		{/if}
		{/if}
	{/each}

	<!-- Cables -->
	{#each cables as c (c.id)}
		{@const eff = objLayerOf(c.layerId, 'cables', layers)}
		{#if !hidden.includes(eff)}
		{@const points = cablePolylinePoints(c, runsByCable.get(c.id) ?? [], { rooms, ladders, bands })}
		{#if points}
			{@const lc = objLayerColor(eff, layers)}
			{@const stroke = lc ?? cableColor(c)}
			{@const lp = labelPos(points)}
			<polyline {points} fill="none" {stroke} stroke-width=".6" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
			{#if lp}
				<text x={lp.x} y={lp.y - 40} text-anchor="middle" font-size="180" font-weight="600" fill={stroke} paint-order="stroke" stroke="rgba(255,255,255,0.85)" stroke-width="60">{c.label || c.type}</text>
			{/if}
		{/if}
		{/if}
	{/each}

	<!-- Rooms -->
	{#each visibleRooms as room (room.id)}
		{@const eff = objLayerOf(room.layerId, 'rooms', layers)}
		{#if !hidden.includes(eff)}
		{@const band = bandForFloor(bands, room.floor)}
		{#if band}
			{@const lc = objLayerColor(eff, layers)}
			{@const yTop = band.topMm + 50}
			{@const yBot = band.slabTopMm - 50}
			{@const height = Math.max(200, yBot - yTop)}
			{@const xLeft = room.xMm - room.widthMm / 2}
			{@const base = lc ?? room.color ?? (room.kind === 'server' ? '#285aa0' : '#a06e1e')}
			<rect x={xLeft} y={yTop} width={room.widthMm} {height} fill={hexToRgba(base, 0.18)} stroke={base} stroke-width="0.4" vector-effect="non-scaling-stroke" />
			<text x={xLeft + 80} y={yTop + 240} font-size="220" font-weight="700" fill={base} opacity="0.6">{room.kind === 'server' ? 'SER' : 'EPS'}</text>
			<text x={room.xMm} y={(yTop + yBot) / 2} text-anchor="middle" dominant-baseline="middle" font-size="280" font-weight="700" fill={base}>{room.label}</text>
		{/if}
		{/if}
	{/each}

	<!-- Free-form labels -->
	{#if !hidden.includes('annotations')}
	{#each labels as lb (lb.id)}
		{@const fs = lb.fontSizeMm ?? 240}
		{@const w = lb.widthMm && lb.widthMm > 0 ? lb.widthMm : 4000}
		{@const h = Math.max(lb.text.split('\n').length, 1) * fs * 1.3 + fs * 0.6}
		<foreignObject x={lb.xMm} y={lb.yMm} width={w} height={h}>
			<div style:font-size="{fs}px" style:color={lb.color ?? 'rgb(20,20,25)'} style:background={lb.background ?? 'transparent'} style:font-weight="600" style:line-height="1.3" style:white-space="pre-wrap" style:word-wrap="break-word" style:padding="{fs * 0.2}px {fs * 0.3}px">{lb.text}</div>
		</foreignObject>
	{/each}
	{/if}

	{@render children?.()}
</svg>
