<script lang="ts">
	let {
		orientation = 'vertical',
		min = 120,
		max = 800,
		value = $bindable<number>(),
		side = 'right',
	}: {
		/** vertical = drag horizontally to resize width; horizontal = drag vertically to resize height */
		orientation?: 'vertical' | 'horizontal'
		min?: number
		max?: number
		value: number
		/** which edge of the host panel the handle sits on (affects drag direction sign) */
		side?: 'right' | 'left' | 'top' | 'bottom'
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
		;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging) return
		const cur = orientation === 'vertical' ? e.clientX : e.clientY
		const delta = cur - startPx
		// `side` controls drag sign: dragging right-edge to the right grows width,
		// dragging left-edge to the right shrinks width, etc.
		const sign = side === 'right' || side === 'bottom' ? 1 : -1
		value = Math.max(min, Math.min(max, startVal + sign * delta))
	}

	function onPointerUp(e: PointerEvent) {
		if (!dragging) return
		dragging = false
		try {
			;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
		} catch {
			// already released
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="absolute z-20 group transition-colors {dragging ? 'bg-blue-500/40' : 'hover:bg-blue-500/30'}"
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
	aria-orientation={orientation}
></div>
