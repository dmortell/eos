<script lang="ts">
	import type { ViewState } from './types'

	let { item, shape = { left: 0, top: 0, width: 100, height: 50 }, view, disabled = false, selected = false, onClick, onDrag, onDragged, children }: {
		item: any
		shape: { left: number; top: number; width: number; height: number }
		view: ViewState
		disabled?: boolean
		selected?: boolean
		onClick?: (e: MouseEvent) => void
		onDrag?: (rect: any, mouse: any, item: any) => void
		onDragged?: (rect: any, item: any) => void
		children?: any
	} = $props()

	let zoom = $derived(view.zoom)
	let rect = $derived(shape)
	let dragging = $state(false)
	let start: { x: number; y: number } | null = null

	function getPoint(e: MouseEvent | TouchEvent) {
		if ('touches' in e && e.touches.length) return { x: e.touches[0].pageX, y: e.touches[0].pageY }
		return { x: (e as MouseEvent).pageX, y: (e as MouseEvent).pageY }
	}

	function onMouseDown(ev: MouseEvent | TouchEvent) {
		if (disabled) return
		if ('button' in ev && ev.button !== 0) return
		ev.preventDefault()
		ev.stopPropagation()
		document.addEventListener('mousemove', onMouseMove)
		document.addEventListener('mouseup', onMouseUp)
		document.addEventListener('touchmove', onMouseMove)
		document.addEventListener('touchend', onMouseUp)
		start = getPoint(ev)
		dragging = false
	}

	function onMouseMove(ev: MouseEvent | TouchEvent) {
		if (!start) return
		const p = getPoint(ev)
		const dx = (p.x - start.x) / zoom
		const dy = (p.y - start.y) / zoom
		rect = { ...shape, left: shape.left + dx, top: shape.top + dy }
		dragging = true
		onDrag?.(rect, p, item)
	}

	function onMouseUp(ev: MouseEvent | TouchEvent) {
		document.removeEventListener('mousemove', onMouseMove)
		document.removeEventListener('mouseup', onMouseUp)
		document.removeEventListener('touchmove', onMouseMove)
		document.removeEventListener('touchend', onMouseUp)
		if (dragging) onDragged?.(rect, item)
		else onClick?.(ev as MouseEvent)
		dragging = false
		start = null
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="drag"
	class:draggable={!disabled}
	class:dragging
	class:selected
	onmousedown={onMouseDown}
	ontouchstart={onMouseDown}
	style:left={rect.left + 'px'}
	style:top={rect.top - 1 + 'px'}
	style:width={rect.width + 'px'}
	style:height={rect.height + 1 + 'px'}
>
	{@render children?.()}
</div>

<style>
	.drag {
		position: absolute;
		border: 1px solid #000;
		background-color: #d8d8d8;
		box-sizing: border-box;
		z-index: 2;
	}
	.selected { border: 2px solid #3b82f6; }
	.draggable { cursor: grab; }
	.dragging { cursor: grabbing; }
</style>
