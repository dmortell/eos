<script lang="ts">
	import type { PrintSettings, Point } from './types'
	import { paperDimsMm } from './types'

	let { settings, toPx, zoom = 1 }: {
		settings: PrintSettings
		toPx: (mm: Point) => Point
		zoom: number
	} = $props()

	/** Effective scale — for 'Fit' (0), default to 100 for display; actual fit computed at print time */
	let effectiveScale = $derived(settings.scale || 100)

	/** Paper dimensions in real-world mm (how much real-world space the paper covers) */
	let paperMm = $derived.by(() => {
		const dims = paperDimsMm(settings)
		return { w: dims.w * effectiveScale, h: dims.h * effectiveScale }
	})

	/** Paper rect corners in px coordinates (using calibration toPx) */
	let paperRect = $derived.by(() => {
		const off = settings.drawingOffset
		const topLeft = toPx({ x: off.x, y: off.y })
		const bottomRight = toPx({ x: off.x + paperMm.w, y: off.y + paperMm.h })
		return {
			x: topLeft.x,
			y: topLeft.y,
			w: bottomRight.x - topLeft.x,
			h: bottomRight.y - topLeft.y,
		}
	})

	/** Margin rect (inset from paper) */
	let marginRect = $derived.by(() => {
		const off = settings.drawingOffset
		const m = settings.margins * effectiveScale
		const topLeft = toPx({ x: off.x + m, y: off.y + m })
		const bottomRight = toPx({ x: off.x + paperMm.w - m, y: off.y + paperMm.h - m })
		return {
			x: topLeft.x,
			y: topLeft.y,
			w: bottomRight.x - topLeft.x,
			h: bottomRight.y - topLeft.y,
		}
	})
</script>

{#if settings.showPaper}
	<!-- Paper background (white) -->
	<rect x={paperRect.x} y={paperRect.y} width={paperRect.w} height={paperRect.h}
		fill="white" stroke="#9ca3af" stroke-width={1 / zoom}
		class="pointer-events-none" />

	<!-- Margin boundary (dashed) -->
	<rect x={marginRect.x} y={marginRect.y} width={marginRect.w} height={marginRect.h}
		fill="none" stroke="#d1d5db" stroke-width={0.5 / zoom}
		stroke-dasharray="{4 / zoom} {3 / zoom}"
		class="pointer-events-none" />

	<!-- Paper size label -->
	<text x={paperRect.x + 4 / zoom} y={paperRect.y + 10 / zoom}
		font-size={8 / zoom} fill="#9ca3af"
		class="select-none pointer-events-none">
		{settings.paperSize} {settings.orientation} — 1:{effectiveScale}
	</text>
{/if}
