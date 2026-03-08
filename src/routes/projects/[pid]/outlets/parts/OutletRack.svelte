<script lang="ts">
	import type { RackConfig } from '../../racks/parts/types'

	let {
		rect,
		selected,
		zoom,
		roomColor,
		onmousedown,
	}: {
		rect: { x: number; y: number; w: number; h: number; cfg: RackConfig; rotation: number }
		selected: boolean
		zoom: number
		roomColor: string
		onmousedown?: (e: MouseEvent) => void
	} = $props()

	const cx = $derived(rect.x + rect.w / 2)
	const cy = $derived(rect.y + rect.h / 2)
	const textRotation = $derived( - rect.rotation)
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<g class="pointer-events-auto" style:cursor="pointer" transform="rotate({rect.rotation} {cx} {cy})">
	<!-- Hit area (invisible, larger for easy clicking) -->
	<rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill="transparent" {onmousedown} />

	<!-- Selection highlight -->
	{#if selected}
		<rect
			x={rect.x - 3 / zoom}
			y={rect.y - 3 / zoom}
			width={rect.w + 6 / zoom}
			height={rect.h + 6 / zoom}
			fill="none"
			stroke="#06b6d4"
			stroke-width={2 / zoom}
			rx={2 / zoom}
		/>
	{/if}

	<!-- Rack body -->
	<rect x={rect.x} y={rect.y} width={rect.w} height={rect.h}
		opacity="0.8" fill="{roomColor}10" stroke={roomColor} stroke-width={1.5 / zoom} rx={1 / zoom}
	/>

	<!-- Front indicator (thick line on top edge = front before rotation) -->
	<line x1={rect.x} y1={rect.y} x2={rect.x + rect.w} y2={rect.y} stroke={roomColor} stroke-width={6 / zoom} opacity="0.9" />

	<!-- Text stays vertical regardless of rack rotation -->
	<g transform="rotate({textRotation} {cx} {cy})">
		<text x={cx} y={cy + rect.h * 0.05} font-size={rect.w * 0.15} text-anchor="middle" fill="#333333" class="select-none pointer-events-none" font-weight="bold" >{rect.cfg.label}</text>
		<text x={cx} y={cy + rect.h * 0.2} font-size={rect.w * 0.1} text-anchor="middle" fill="#444444" class="select-none pointer-events-none" font-weight="bold" opacity="0.8" >{rect.cfg.heightU}U</text>
	</g>
</g>
