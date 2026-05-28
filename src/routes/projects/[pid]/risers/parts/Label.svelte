<script lang="ts">
	import type { TextLabel } from './types'

	let {
		label,
		selected = false,
		onmousedown,
	}: {
		label: TextLabel
		selected?: boolean
		onmousedown?: (e: MouseEvent) => void
	} = $props()

	const fontSize = $derived(label.fontSizeMm ?? 240)
	const color = $derived(label.color ?? 'rgb(20, 20, 25)')
	const bg = $derived(label.background ?? 'transparent')
	const width = $derived(label.widthMm && label.widthMm > 0 ? label.widthMm : 4000)
	// Estimate height — line count × line-height + padding. Caps at width × 5
	// (kept generous so wrapping has room).
	const lines = $derived(label.text.split('\n').length)
	const height = $derived(Math.max(lines, 1) * fontSize * 1.3 + fontSize * 0.6)
</script>

<g
	class="label"
	class:selected
	data-label-id={label.id}
	onmousedown={(e) => onmousedown?.(e)}
	role="button"
	tabindex="-1"
>
	{#if selected}
		<rect
			x={label.xMm - 60}
			y={label.yMm - 60}
			width={width + 120}
			height={height + 120}
			class="selection"
			rx="40"
			ry="40"
		/>
	{/if}
	<foreignObject x={label.xMm} y={label.yMm} {width} {height}>
		<div
			class="label-text"
			style:font-size="{fontSize}px"
			style:color={color}
			style:background={bg}
			style:padding="{fontSize * 0.2}px {fontSize * 0.3}px"
		>{label.text}</div>
	</foreignObject>
</g>

<style>
	.label {
		cursor: pointer;
	}
	.selection {
		fill: rgba(59, 130, 246, 0.1);
		stroke: rgb(59, 130, 246);
		stroke-width: 3;
		stroke-dasharray: 12 8;
		vector-effect: non-scaling-stroke;
		pointer-events: none;
	}
	.label-text {
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-weight: 600;
		line-height: 1.3;
		white-space: pre-wrap;
		word-wrap: break-word;
		display: inline-block;
		border-radius: 8px;
	}
</style>
