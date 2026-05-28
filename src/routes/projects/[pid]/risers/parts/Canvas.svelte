<script lang="ts">
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

	let canvas: HTMLDivElement | null = null
	let zoomTarget = view.zoom
	let zoomAnimation: number | null = null

	$effect(() => {
		canvas?.addEventListener('wheel', onwheel, { passive: false })
		return () => {
			canvas?.removeEventListener('wheel', onwheel)
		}
	})

	function onwheel(e: WheelEvent) {
		view.panning = true
		if (e.ctrlKey || e.altKey || e.metaKey || e.buttons === 2) doZoom(e)
		else if (e.shiftKey || e.deltaX) pan((e.deltaY || e.deltaX) > 0 ? -110 : 110, 0)
		else pan(0, e.deltaY > 0 ? -110 : 110)
	}

	function mouseOffset(e: MouseEvent) {
		const { left, top } = canvas!.getBoundingClientRect()
		return { x: e.clientX - left, y: e.clientY - top }
	}

	function pan(dx: number, dy: number) {
		view.x += dx
		view.y += dy
	}

	function onmousedown(e: MouseEvent) {
		view.button |= 1 << e.button
		// Pan with middle or right button only — leave left clicks for the children.
		if (e.button === 1 || e.button === 2) {
			e.preventDefault()
			view.panning = true
			document.addEventListener('mousemove', onmousemove)
			document.addEventListener('mouseup', onmouseup)
		}
	}

	function onmousemove(e: MouseEvent) {
		if (e.movementX === 0 && e.movementY === 0) return
		if (view.panning) pan(e.movementX, e.movementY)
	}

	function onmouseup(e: MouseEvent) {
		view.panning = false
		view.button &= ~(1 << e.button)
		document.removeEventListener('mousemove', onmousemove)
		document.removeEventListener('mouseup', onmouseup)
	}

	function oncontextmenu(e: MouseEvent) {
		e.preventDefault()
	}

	function doZoom(e: WheelEvent) {
		e.preventDefault()
		const pt = mouseOffset(e)
		const base = 1.2
		const factor = e.deltaY < 0 ? base : 1 / base
		zoomTarget = Math.min(5, Math.max(0.001, zoomTarget * factor))
		startZoomAnimation(pt)
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
	{onmousedown}
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
