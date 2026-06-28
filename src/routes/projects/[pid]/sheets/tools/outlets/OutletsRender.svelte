<script lang="ts">
	import type { SheetViewport } from '../../types'
	import type { OutletConfig, TrunkConfig, RackPlacement, PageCalibration } from './types'
	import { trunkWidthMm } from './types'
	import { generateTrunkPolygons, polygonToRoundedPath } from './geometry'
	import { USAGE_COLORS, ROOM_COLORS, OUTLET_RADIUS_MM, INNER_CORNER_RADIUS_MM } from './colors'
	import { objLayerOf, objLayerColor } from '../../layers/layers'

	type RackCfg = { widthMm: number; depthMm: number; label?: string; heightU?: number }

	let {
		outlets = [],
		trunks = [],
		rackPlacements = [],
		racksById = {},
		calibration = null,
		pdfUrl = null,
		pageW = 0,
		pageH = 0,
		vp,
		onview,
		view = null,
		onsvg,
		children,
		hidden = [],
		layers = [],
	}: {
		outlets?: OutletConfig[]
		trunks?: TrunkConfig[]
		rackPlacements?: RackPlacement[]
		racksById?: Record<string, RackCfg>
		calibration?: PageCalibration | null
		pdfUrl?: string | null
		pageW?: number
		pageH?: number
		vp: SheetViewport
		onview?: (v: { x: number; y: number; w: number; h: number; den: number }) => void
		/** Model-mode viewBox override (real-mm window); when set, replaces the vp-derived viewBox. */
		view?: { x: number; y: number; w: number; h: number } | null
		onsvg?: (el: SVGSVGElement) => void
		children?: any
		/** Hidden layer ids (per-object: an object hides when its effective layer is here). */
		hidden?: string[]
		/** All sheet layers (defaults + customs) — for per-object layer + colour resolution. */
		layers?: import('../../layers/layers').LayerDef[]
	} = $props()

	// NOTE: outlet/trunk data is y-down (legacy convention → SheetViewport.version === 1). The
	// y-up flip for version 2 will be added with the conversion tool; current data renders direct.

	const cid = `oclip-${Math.random().toString(36).slice(2, 8)}`

	// ── PDF underlay placement in real-mm ── (pdf-px → mm via toMm: (px - origin) * scaleFactor)
	let pdfRect = $derived.by(() => {
		if (!calibration || !pdfUrl || !pageW || !pageH) return null
		const { origin, scaleFactor } = calibration
		return {
			x: -origin.x * scaleFactor,
			y: -origin.y * scaleFactor,
			w: pageW * scaleFactor,
			h: pageH * scaleFactor,
		}
	})
	let cropRect = $derived.by(() => {
		if (!calibration?.crop) return null
		const { origin, scaleFactor, crop } = calibration
		return {
			x: (crop.x - origin.x) * scaleFactor,
			y: (crop.y - origin.y) * scaleFactor,
			w: crop.width * scaleFactor,
			h: crop.height * scaleFactor,
		}
	})

	// ── Content bounds (real-mm) for fit + default offset ──
	let bounds = $derived.by(() => {
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
		const ext = (x: number, y: number) => { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y }
		const r = cropRect ?? pdfRect
		if (r) { ext(r.x, r.y); ext(r.x + r.w, r.y + r.h) }
		for (const o of outlets) { ext(o.position.x - OUTLET_RADIUS_MM, o.position.y - OUTLET_RADIUS_MM); ext(o.position.x + OUTLET_RADIUS_MM, o.position.y + OUTLET_RADIUS_MM) }
		for (const t of trunks) for (const n of t.nodes) ext(n.position.x, n.position.y)
		for (const p of rackPlacements) ext(p.position.x, p.position.y)
		if (!isFinite(minX)) return { x: 0, y: 0, w: 1000, h: 1000 }
		const padX = (maxX - minX) * 0.02 || 100
		const padY = (maxY - minY) * 0.02 || 100
		return { x: minX - padX, y: minY - padY, w: (maxX - minX) + padX * 2, h: (maxY - minY) + padY * 2 }
	})

	// ── viewBox (real-mm window mapped into the viewport) ──
	let fit = $derived(!vp.scale || vp.scale <= 0)
	let vb = $derived.by(() => {
		if (fit) return { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h }
		const s = vp.scale as number
		return { x: vp.contentOffsetMm?.x ?? bounds.x, y: vp.contentOffsetMm?.y ?? bounds.y, w: vp.w * s, h: vp.h * s }
	})
	let den = $derived(fit ? (vp.w > 0 && vp.h > 0 ? Math.max(bounds.w / vp.w, bounds.h / vp.h) : 0) : (vp.scale as number))
	let viewBox = $derived(view ? `${view.x} ${view.y} ${view.w} ${view.h}` : `${vb.x} ${vb.y} ${vb.w} ${vb.h}`)
	let par = $derived(view ? 'xMidYMid meet' : fit ? 'xMidYMid meet' : 'xMinYMin meet')
	$effect(() => { onview?.({ ...vb, den }) })

	let svgEl: SVGSVGElement | undefined = $state()
	$effect(() => { if (svgEl) onsvg?.(svgEl) })

	function isCeiling(t: TrunkConfig) { return t.location === 'ceiling-plenum' || t.location === 'ceiling-tray' }
	function trunkPath(t: TrunkConfig): string {
		const r = t.bendRadiusMm ?? INNER_CORNER_RADIUS_MM
		return generateTrunkPolygons(t).map(poly => polygonToRoundedPath(poly, r)).join(' ')
	}

	// Outlet symbol geometry (mm)
	function triangle(cx: number, cy: number, r: number): string {
		const a = Math.PI / 2
		return [a, a + (2 * Math.PI) / 3, a + (4 * Math.PI) / 3]
			.map(t => `${cx + r * Math.cos(t)},${cy + r * Math.sin(t)}`).join(' ')
	}
	function square(cx: number, cy: number, r: number): string {
		const half = (r * Math.SQRT2) / 2
		return `${cx - half},${cy - half} ${cx + half},${cy - half} ${cx + half},${cy + half} ${cx - half},${cy + half}`
	}
	const R = OUTLET_RADIUS_MM
</script>

<svg bind:this={svgEl} class="h-full w-full" {viewBox} preserveAspectRatio={par} style:overflow="hidden">
	{#if cropRect}
		<clipPath id={cid}><rect x={cropRect.x} y={cropRect.y} width={cropRect.w} height={cropRect.h} /></clipPath>
	{/if}

	<!-- PDF underlay -->
	{#if pdfRect && pdfUrl}
		<g clip-path={cropRect ? `url(#${cid})` : undefined}>
			<image href={pdfUrl} x={pdfRect.x} y={pdfRect.y} width={pdfRect.w} height={pdfRect.h} preserveAspectRatio="none" />
		</g>
	{/if}

	<!-- Trunks -->
	{#each trunks as t (t.id)}
		{@const eff = objLayerOf(t.layerId, 'trunks', layers)}
		{#if t.visible !== false && t.nodes.length >= 2 && !hidden.includes(eff)}
			{@const color = objLayerColor(eff, layers) ?? t.color ?? '#000000'}
			<path d={trunkPath(t)} fill="{color}33" stroke={color} stroke-width="0.5" vector-effect="non-scaling-stroke"
				fill-rule="evenodd" opacity={t.isPrimary ? 0.85 : 0.5}
				stroke-dasharray={isCeiling(t) ? '4 3' : undefined} />
		{/if}
	{/each}

	<!-- Racks -->
	{#each rackPlacements as p, i (p.rackId + ':' + i)}
		{@const eff = objLayerOf(p.layerId, 'racks', layers)}
		{#if !hidden.includes(eff)}
		{@const cfg = racksById[p.rackId]}
		{@const w = cfg?.widthMm ?? p.widthMm ?? 600}
		{@const h = cfg?.depthMm ?? p.depthMm ?? 1000}
		{@const label = cfg?.label ?? p.label}
		{@const color = objLayerColor(eff, layers) ?? ROOM_COLORS[p.room] ?? '#64748b'}
		{@const cx = p.position.x + w / 2}
		{@const cy = p.position.y + h / 2}
		<g transform="rotate({p.rotation} {cx} {cy})">
			<rect x={p.position.x} y={p.position.y} width={w} height={h} fill="{color}1a" stroke={color} stroke-width="0.4" vector-effect="non-scaling-stroke" />
			<!-- front-of-rack indicator (top edge) -->
			<line x1={p.position.x} y1={p.position.y} x2={p.position.x + w} y2={p.position.y} stroke={color} stroke-width="0.9" vector-effect="non-scaling-stroke" opacity="0.9" />
			{#if label}
				<text x={cx} y={cy} font-size={Math.min(w, h) * 0.18} text-anchor="middle" dominant-baseline="middle" fill="#333" font-weight="bold">{label}</text>
			{/if}
		</g>
		{/if}
	{/each}

	<!-- Outlets -->
	{#each outlets as o (o.id)}
		{@const eff = objLayerOf(o.layerId, 'outlets', layers)}
		{#if !hidden.includes(eff)}
		{@const c = USAGE_COLORS[o.usage] ?? USAGE_COLORS.network}
		{@const lc = objLayerColor(eff, layers)}
		{@const stroke = lc ?? c.stroke}
		{@const fillC = lc ?? c.fill}
		{@const low = o.level === 'low'}
		{@const x = o.position.x}
		{@const y = o.position.y}
		<g>
			{#if o.mountType === 'wall'}
				<polygon points={triangle(x, y, R)} fill={low ? fillC : 'none'} stroke={stroke} stroke-width={low ? 0.5 : 0.7} vector-effect="non-scaling-stroke" opacity="0.9" />
			{:else if o.mountType === 'floor'}
				<polygon points={square(x, y, R * 1.2)} fill={low ? fillC : 'none'} stroke={stroke} stroke-width={low ? 0.5 : 0.7} vector-effect="non-scaling-stroke" opacity="0.9" />
			{:else}
				<circle cx={x} cy={y} r={R * 0.9} fill={low ? fillC : 'none'} stroke={stroke} stroke-width={low ? 0.5 : 0.7} vector-effect="non-scaling-stroke" opacity="0.9" />
			{/if}
			<text x={x} y={y + R * 0.35} font-size={R * 0.9} text-anchor="middle" font-weight="bold" fill={low ? 'white' : stroke}>{o.portCount}</text>
			{#if o.label}
				<text x={x} y={y - R * 1.3} font-size={R * 0.6} text-anchor="middle" fill="#374151">{o.label}</text>
			{/if}
		</g>
		{/if}
	{/each}

	{@render children?.()}
</svg>
