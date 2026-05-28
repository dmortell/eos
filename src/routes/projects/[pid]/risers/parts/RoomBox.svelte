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

	// Vertical extent — full floor: from the bottom of the upper slab (top of
	// this floor's plenum) down to the top of this floor's structural slab.
	const inset = 50
	const yTop = $derived(band.topMm + inset)
	const yBot = $derived(band.slabTopMm - inset)
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
		<!-- Outer glow halo -->
		<rect
			x={xLeft - 120}
			y={yTop - 120}
			width={room.widthMm + 240}
			height={height + 240}
			class="selection-halo"
			rx="100"
			ry="100"
		/>
		<!-- Inner crisp outline -->
		<rect
			x={xLeft - 40}
			y={yTop - 40}
			width={room.widthMm + 80}
			height={height + 80}
			class="selection-outline"
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
	.selection-halo {
		fill: rgba(59, 130, 246, 0.18);
		stroke: rgba(59, 130, 246, 0.35);
		stroke-width: 8;
		vector-effect: non-scaling-stroke;
		pointer-events: none;
	}
	.selection-outline {
		fill: none;
		stroke: rgb(37, 99, 235);
		stroke-width: 4;
		stroke-dasharray: 14 8;
		vector-effect: non-scaling-stroke;
		pointer-events: none;
	}
</style>
