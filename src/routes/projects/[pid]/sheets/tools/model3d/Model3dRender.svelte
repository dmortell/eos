<script lang="ts">
	import type { SheetViewport } from '../../types'
	import type { Dir, Model, Obj } from './types'
	import { project, faces3d, isoR, isoDepthR, xyCenter, DEFAULT_YAW, DEFAULT_PITCH } from './projection'

	// Read-only projection of a 3D model into a sheet viewport, drawn in real mm so
	// the viewport's scale (1:N) prints true to size — same contract as the other
	// tool renders (compute content `bounds`, derive viewBox from vp.scale /
	// contentOffsetMm, report the effective view + scale denominator via `onview`).
	let { model, direction, yaw, pitch, hiddenLines = true, bw = false, vp, view = null, onview, onsvg, pre, children }: {
		model: Model
		direction: Dir
		yaw?: number
		pitch?: number
		hiddenLines?: boolean
		bw?: boolean
		vp: SheetViewport
		view?: { x: number; y: number; w: number; h: number } | null
		onview?: (v: { x: number; y: number; w: number; h: number; den: number }) => void
		onsvg?: (el: SVGSVGElement) => void
		pre?: any      // drawn first (behind geometry) — underlay images
		children?: any // drawn last (on top) — edit handles
	} = $props()

	const yawE = $derived(yaw ?? DEFAULT_YAW)
	const pitchE = $derived(pitch ?? DEFAULT_PITCH)
	const pivot = $derived(xyCenter(model.objects))

	// Drawing-plane (u, v-up) → SVG (x, y-down): flip v.
	const xy = (p: { u: number; v: number }) => `${p.u},${-p.v}`

	const layerColor = (o: Obj) => bw ? '#000000' : (model.layers?.find((l) => l.id === o.layer)?.color ?? '#111827')
	// Visibility is per-viewport (layerOverrides), so the same model can show
	// different layers in different viewports (plan vs elevation, etc.).
	const isVisible = (o: Obj) => !(vp.layerOverrides?.[o.layer ?? '']?.hidden)
	const shown = $derived(model.objects.filter(isVisible))

	// Per-object projected outlines (used in every mode + for bounds).
	const drawn = $derived(shown.map((o) => ({ color: layerColor(o), shapes: project(o, direction, yawE, pitchE, pivot.cx, pivot.cy) })))

	// Hidden-line faces (iso only): opaque white, sorted far→near (painter's).
	const isoMode = $derived(direction === 'iso' && hiddenLines)
	const faces = $derived.by(() => {
		if (!isoMode) return []
		return shown.flatMap((o) => faces3d(o).map((f) => ({
			color: layerColor(o),
			pts: f.pts.map((p) => xy(isoR(p, yawE, pitchE, pivot.cx, pivot.cy))).join(' '),
			depth: Math.max(...f.pts.map((p) => isoDepthR(p, yawE, pitchE, pivot.cx, pivot.cy))),
		}))).sort((a, b) => b.depth - a.depth)
	})

	// Content bounds (mm) from all projected points, in SVG (x, -v) space.
	const bounds = $derived.by(() => {
		let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
		for (const d of drawn) for (const s of d.shapes) for (const p of s.pts) {
			x0 = Math.min(x0, p.u); x1 = Math.max(x1, p.u)
			y0 = Math.min(y0, -p.v); y1 = Math.max(y1, -p.v)
		}
		if (x0 === Infinity) return { x: 0, y: 0, w: 1, h: 1 }
		const pad = Math.max(2, (x1 - x0 + y1 - y0) * 0.01) // small breathing room
		return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad }
	})

	const fit = $derived(!vp.scale || vp.scale <= 0)
	const vb = $derived.by(() => {
		if (fit) return { ...bounds }
		const s = vp.scale as number
		return { x: vp.contentOffsetMm?.x ?? bounds.x, y: vp.contentOffsetMm?.y ?? bounds.y, w: vp.w * s, h: vp.h * s }
	})
	const den = $derived(fit ? (vp.w > 0 && vp.h > 0 ? Math.max(bounds.w / vp.w, bounds.h / vp.h) : 0) : (vp.scale as number))
	const viewBox = $derived(view ? `${view.x} ${view.y} ${view.w} ${view.h}` : `${vb.x} ${vb.y} ${vb.w} ${vb.h}`)
	const par = $derived(view ? 'xMidYMid meet' : fit ? 'xMidYMid meet' : 'xMinYMin meet')
	$effect(() => { onview?.({ ...vb, den }) })

	let svgEl: SVGSVGElement | undefined = $state()
	$effect(() => { if (svgEl) onsvg?.(svgEl) })

	const pts = (s: { pts: { u: number; v: number }[] }) => s.pts.map(xy).join(' ')
</script>

<svg bind:this={svgEl} class="h-full w-full" {viewBox} preserveAspectRatio={par} style:overflow="hidden">
	{@render pre?.()}
	{#if isoMode}
		{#each faces as f, i (i)}
			<polygon points={f.pts} fill="#ffffff" stroke={f.color} stroke-width="0.6" vector-effect="non-scaling-stroke" stroke-linejoin="round" />
		{/each}
	{:else}
		{#each drawn as d, di (di)}
			{#each d.shapes as s, si (si)}
				{#if s.closed}
					<polygon points={pts(s)} fill="none" stroke={d.color} stroke-width="0.6" vector-effect="non-scaling-stroke" stroke-linejoin="round" />
				{:else}
					<polyline points={pts(s)} fill="none" stroke={d.color} stroke-width="0.6" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" />
				{/if}
			{/each}
		{/each}
	{/if}

	{@render children?.()}
</svg>
