<!-- A drag handle on a panel's edge (copied from workspace/parts/ResizeHandle.svelte): drag to resize; `onend` once
     the drag is over (to save the size). Pointer events, so a finger or a pen drags it too. -->
<script lang="ts">
	let {
		orientation = 'vertical',
		min = 120,
		max = 800,
		value = $bindable<number>(),
		side = 'right',
		onend,
	}: {
		/** vertical = drag horizontally to resize width; horizontal = drag vertically to resize height */
		orientation?: 'vertical' | 'horizontal'
		min?: number
		max?: number
		value: number
		/** which edge of the host panel the handle sits on (affects drag direction sign) */
		side?: 'right' | 'left' | 'top' | 'bottom'
		onend?: () => void
	} = $props()

	let dragging = $state(false)
	let startPx = 0
	let startVal = 0

	function onPointerDown(e: PointerEvent) {
		if (e.button !== 0) return
		e.preventDefault()
		dragging = true
		startPx = orientation === 'vertical' ? e.clientX : e.clientY
		startVal = value
		try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* synthetic pointer */ }
	}
	function onPointerMove(e: PointerEvent) {
		if (!dragging) return
		const delta = (orientation === 'vertical' ? e.clientX : e.clientY) - startPx
		// dragging a right / bottom edge outwards grows the panel; a left / top edge, inwards
		const sign = side === 'right' || side === 'bottom' ? 1 : -1
		value = Math.max(min, Math.min(max, startVal + sign * delta))
	}
	function onPointerUp(e: PointerEvent) {
		if (!dragging) return
		dragging = false
		try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* already released */ }
		onend?.()
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="rh absolute z-20 transition-colors {dragging ? 'bg-blue-500/40' : 'hover:bg-blue-500/30'}"
	class:cursor-col-resize={orientation === 'vertical'}
	class:cursor-row-resize={orientation === 'horizontal'}
	class:top-0={side === 'right' || side === 'left'}
	class:bottom-0={side === 'right' || side === 'left'}
	class:left-0={side === 'left' || side === 'top' || side === 'bottom'}
	class:right-0={side === 'right' || side === 'top' || side === 'bottom'}
	style:width={orientation === 'vertical' ? '5px' : undefined}
	style:height={orientation === 'horizontal' ? '5px' : undefined}
	style:transform={side === 'right' ? 'translateX(50%)' : side === 'left' ? 'translateX(-50%)' : side === 'top' ? 'translateY(-50%)' : side === 'bottom' ? 'translateY(50%)' : undefined}
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointercancel={onPointerUp}
	role="separator"
	data-side={side}
	aria-orientation={orientation}
></div>

<style>
	/* a finger drags it (the browser mustn't scroll instead); on a touch screen the 5 px strip is grabbed by ~14 px more,
	   mostly towards its own panel (a dock clips what sticks out of it) */
	.rh { touch-action: none; }
	@media (any-pointer: coarse) {
		.rh::before { content: ''; position: absolute; }
		.rh[data-side='right']::before { inset: 0 -4px 0 -10px; }
		.rh[data-side='left']::before { inset: 0 -10px 0 -4px; }
		.rh[data-side='top']::before { inset: -4px 0 -10px 0; }
		.rh[data-side='bottom']::before { inset: -10px 0 -4px 0; }
	}
</style>
