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
		onDragged?: (rect: any, item: any, copy?: boolean) => void
		children?: any
	} = $props()

	let zoom = $derived(view.zoom)
	let dx = $state(0)
	let dy = $state(0)
	let rect = $derived({ left: shape.left + dx, top: shape.top + dy, width: shape.width, height: shape.height })
	let dragging = $state(false)
	let ctrlHeld = $state(false)
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
		document.addEventListener('keydown', onKeyChange)
		document.addEventListener('keyup', onKeyChange)
		start = getPoint(ev)
		ctrlHeld = 'ctrlKey' in ev && ev.ctrlKey
		dragging = false
	}

	function onMouseMove(ev: MouseEvent | TouchEvent) {
		if (!start) return
		const p = getPoint(ev)
		dx = (p.x - start.x) / zoom
		dy = (p.y - start.y) / zoom
		if ('ctrlKey' in ev) ctrlHeld = ev.ctrlKey
		dragging = true
		onDrag?.(rect, p, item)
	}

	function onKeyChange(ev: KeyboardEvent) {
		ctrlHeld = ev.ctrlKey
	}

	function onMouseUp(ev: MouseEvent | TouchEvent) {
		document.removeEventListener('mousemove', onMouseMove)
		document.removeEventListener('mouseup', onMouseUp)
		document.removeEventListener('touchmove', onMouseMove)
		document.removeEventListener('touchend', onMouseUp)
		document.removeEventListener('keydown', onKeyChange)
		document.removeEventListener('keyup', onKeyChange)
		const isCopy = 'ctrlKey' in ev && ev.ctrlKey
		if (dragging) onDragged?.(rect, item, isCopy)
		else onClick?.(ev as MouseEvent)
		dragging = false
		ctrlHeld = false
		start = null
		dx = 0
		dy = 0
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->

<!-- Original position ghost (shown when ctrl-dragging) -->
{#if dragging && ctrlHeld}
	<div
		class="drag ghost"
		style:left={shape.left + 'px'}
		style:top={shape.top - 1 + 'px'}
		style:width={shape.width + 'px'}
		style:height={shape.height + 1 + 'px'}
	>
		{@render children?.()}
	</div>
{/if}

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- Dragged element -->
<div
	class="drag"
	class:draggable={!disabled}
	class:dragging
	class:selected
	class:copying={dragging && ctrlHeld}
	onmousedown={onMouseDown}
	ontouchstart={onMouseDown}
	onclick={e => e.stopPropagation()}
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
	.ghost {
		opacity: 0.4;
		border: 1px dashed #666;
		z-index: 1;
	}
	.copying {
		border: 2px solid #22c55e;
		box-shadow: 0 0 6px rgba(34, 197, 94, 0.4);
	}
	.selected { border: 2px solid #3b82f6; }
	.draggable { cursor: grab; }
	.dragging { cursor: grabbing; }
</style>
