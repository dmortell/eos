<script lang="ts">
	import { PanZoomInputAdapter, type PanZoomPoint } from '$lib/ui/panzoom-controller'
	import type { ViewState } from './types'

	let {
		view = $bindable(),
		width,
		height,
		children,
	}: {
		view: ViewState
		width: number
		height: number
		children?: any
	} = $props()

	// `$state()` so bind:this assignment triggers the $effect that attaches
	// the wheel listener. As a plain `let` it raced mount timing — fine in
	// standalone, fragile in the workspace embed.
	let canvas: HTMLDivElement | null = $state(null)
	let input: PanZoomInputAdapter | null = null
	let zoomTarget = view.zoom
	let zoomAnimation: number | null = null

	$effect(() => {
		if (!canvas) return
		input?.dispose()
		input = new PanZoomInputAdapter({
			element: canvas,
			onPan: pan,
			onZoom: (factor, center) => zoomByFactor(factor, center),
			onPanningChange: (panning) => {
				view.panning = panning
			},
			onButtonMaskChange: (button, down) => {
				if (down) view.button |= 1 << button
				else view.button &= ~(1 << button)
			},
			panButtons: [1, 2],
			enableTouch: true,
			wheelZoomSpeed: 0.04,
		})

		return () => {
			input?.dispose()
			input = null
			view.panning = false
		}
	})

	function pan(dx: number, dy: number) {
		view.x += dx
		view.y += dy
	}

	function oncontextmenu(e: MouseEvent) {
		e.preventDefault()
	}

	function zoomByFactor(factor: number, center: PanZoomPoint) {
		zoomTarget = Math.min(5, Math.max(0.001, view.zoom * factor))
		startZoomAnimation(center)
	}

	function startZoomAnimation(center: { x: number; y: number }) {
		const animate = () => {
			const next = view.zoom + (zoomTarget - view.zoom) * 0.2
			if (Math.abs(next - zoomTarget) < 0.0001) {
				applyZoom(zoomTarget, center)
				view.zoom = zoomTarget
				zoomAnimation = null
				return
			}
			applyZoom(next, center)
			view.zoom = next
			zoomAnimation = requestAnimationFrame(animate)
		}
		if (zoomAnimation) cancelAnimationFrame(zoomAnimation)
		zoomAnimation = requestAnimationFrame(animate)
	}

	function applyZoom(newScale: number, center: { x: number; y: number }) {
		const factor = newScale / view.zoom
		view.x = center.x - (center.x - view.x) * factor
		view.y = center.y - (center.y - view.y) * factor
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	{oncontextmenu}
	bind:this={canvas}
	class="panzoom"
	style:width="{width}px"
	style:height="{height}px"
>
	<div
		class="layer"
		style:transform="translate({view.x}px, {view.y}px) scale({view.zoom})"
		style:transform-origin="0 0"
	>
		{@render children?.()}
	</div>
</div>

<style>
	.panzoom {
		overflow: hidden;
		position: relative;
		background: rgb(250, 250, 252);
	}
	:global(.dark) .panzoom {
		background: rgb(15, 15, 18);
	}
	.layer {
		position: absolute;
		left: 0;
		top: 0;
	}
	@media print {
		.panzoom {
			overflow: visible;
			background: white !important;
		}
	}
</style>
