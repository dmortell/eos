<script lang="ts">
	import type { RiserRoom } from './types'
	import type { FloorYBand } from './engine'

	let {
		room,
		band,
		selected = false,
		onmousedown,
	}: {
		room: RiserRoom
		band: FloorYBand
		selected?: boolean
		onmousedown?: (e: MouseEvent) => void
	} = $props()

	// Vertical extent — occupy the clear space (between ceiling and raised floor),
	// inset slightly so the box doesn't kiss the slab/ceiling lines.
	const inset = 50
	const yTop = $derived(band.plenumBottomMm + inset)
	const yBot = $derived(band.raisedFloorTopMm - inset)
	const height = $derived(Math.max(200, yBot - yTop))
	const xLeft = $derived(room.xMm - room.widthMm / 2)

	const fill = $derived(
		room.color ??
			(room.kind === 'server'
				? 'rgba(80, 130, 200, 0.18)'
				: 'rgba(200, 160, 80, 0.22)'),
	)
	const stroke = $derived(
		room.color
			? room.color
			: room.kind === 'server'
				? 'rgb(40, 90, 160)'
				: 'rgb(160, 110, 30)',
	)
	const badge = $derived(room.kind === 'server' ? 'SER' : 'EPS')
</script>

<g
	class="room-box"
	class:selected
	data-room-id={room.id}
	onmousedown={(e) => onmousedown?.(e)}
	role="button"
	tabindex="-1"
>
	<rect
		x={xLeft}
		y={yTop}
		width={room.widthMm}
		height={height}
		rx="60"
		ry="60"
		{fill}
		{stroke}
		stroke-width="20"
		vector-effect="non-scaling-stroke"
	/>
	<!-- Kind badge (top-left corner) -->
	<text
		x={xLeft + 80}
		y={yTop + 240}
		class="badge"
		fill={stroke}
		text-anchor="start"
	>
		{badge}
	</text>
	<!-- Room label, centered -->
	<text
		x={room.xMm}
		y={(yTop + yBot) / 2}
		class="label"
		text-anchor="middle"
		dominant-baseline="middle"
		fill={stroke}
	>
		{room.label}
	</text>
	{#if selected}
		<rect
			x={xLeft - 60}
			y={yTop - 60}
			width={room.widthMm + 120}
			height={height + 120}
			class="selection"
			rx="80"
			ry="80"
		/>
	{/if}
</g>

<style>
	.room-box {
		cursor: pointer;
	}
	.label {
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 280px;
		font-weight: 700;
		pointer-events: none;
	}
	.badge {
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 220px;
		font-weight: 700;
		opacity: 0.6;
		pointer-events: none;
	}
	.selection {
		fill: none;
		stroke: rgb(59, 130, 246);
		stroke-width: 3;
		stroke-dasharray: 12 8;
		vector-effect: non-scaling-stroke;
		pointer-events: none;
	}
</style>
