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

	function hexToRgba(hex: string, alpha: number): string {
		const h = hex.trim()
		if (!h.startsWith('#')) return h
		let r = 0, g = 0, b = 0
		if (h.length === 4) {
			r = parseInt(h[1] + h[1], 16)
			g = parseInt(h[2] + h[2], 16)
			b = parseInt(h[3] + h[3], 16)
		} else if (h.length >= 7) {
			r = parseInt(h.slice(1, 3), 16)
			g = parseInt(h.slice(3, 5), 16)
			b = parseInt(h.slice(5, 7), 16)
		}
		return `rgba(${r}, ${g}, ${b}, ${alpha})`
	}

	// Stroke + text use the saturated color; fill is a low-opacity tint so
	// the text and badge stay readable against a colored room.
	const baseColor = $derived(
		room.color
			? room.color
			: room.kind === 'server'
				? '#285aa0'
				: '#a06e1e',
	)
	const fill = $derived(hexToRgba(baseColor, 0.18))
	const stroke = $derived(baseColor)
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
		{height} {fill} {stroke}
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
