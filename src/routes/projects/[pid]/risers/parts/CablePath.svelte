<script lang="ts">
	import type { Cable } from './types'
	import type { CableRun } from './engine'
	import { cablePolylinePoints, type FloorYBand } from './engine'
	import type { RiserRoom, Ladder } from './types'

	let {
		cable,
		runs,
		rooms,
		ladders,
		bands,
		selected = false,
		onmousedown,
	}: {
		cable: Cable
		runs: CableRun[]
		rooms: RiserRoom[]
		ladders: Ladder[]
		bands: FloorYBand[]
		selected?: boolean
		onmousedown?: (e: MouseEvent) => void
	} = $props()

	const points = $derived(cablePolylinePoints(cable, runs, { rooms, ladders, bands }))
	const stroke = $derived(cable.color ?? defaultColor(cable))

	function defaultColor(c: Cable): string {
		if (c.media === 'fiber') return 'rgb(245, 158, 11)'   // amber
		if (c.media === 'copper') return 'rgb(37, 99, 235)'   // blue
		return 'rgb(20, 184, 166)'                              // teal default
	}

	// Pick the visual midpoint of the longest horizontal run for the label.
	const labelPos = $derived.by(() => {
		if (!points) return null
		const hRun = runs
			.filter((r) => r.type === 'h')
			.sort((a, b) => (b.hi - b.lo) - (a.hi - a.lo))[0]
		if (!hRun) return null
		const band = bands.find((b) => b.floor === hRun.floor)
		if (!band) return null
		const midX = (hRun.lo + hRun.hi) / 2
		// Approximate Y at the lane (mirrors engine's levelYMm logic for label placement).
		const baseY = hRun.level === 'high'
			? (band.topMm + band.plenumBottomMm) / 2
			: (band.raisedFloorTopMm + band.slabTopMm) / 2
		return { x: midX, y: baseY - 80 }
	})
</script>

{#if points}
	<g
		class="cable"
		class:selected
		data-cable-id={cable.id}
		onmousedown={(e) => onmousedown?.(e)}
		role="button"
		tabindex="-1"
	>
		<!-- Hit area (wide invisible stroke for easier clicking) -->
		<polyline {points} class="hit" />
		<!-- Visible cable -->
		<polyline
			{points}
			fill="none"
			stroke={stroke}
			stroke-width={selected ? 60 : 40}
			stroke-linejoin="round"
			stroke-linecap="round"
			vector-effect="non-scaling-stroke"
		/>
		{#if selected}
			<polyline
				{points}
				fill="none"
				stroke="rgba(59, 130, 246, 0.4)"
				stroke-width="120"
				stroke-linejoin="round"
				stroke-linecap="round"
				vector-effect="non-scaling-stroke"
				pointer-events="none"
			/>
		{/if}
		{#if labelPos}
			<text
				x={labelPos.x}
				y={labelPos.y}
				class="cable-label"
				text-anchor="middle"
				fill={stroke}
			>
				{cable.label || cable.type}
			</text>
		{/if}
	</g>
{/if}

<style>
	.cable { cursor: pointer; }
	.hit {
		fill: none;
		stroke: transparent;
		stroke-width: 200;
		stroke-linejoin: round;
		stroke-linecap: round;
	}
	.cable-label {
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 180px;
		font-weight: 600;
		pointer-events: none;
		paint-order: stroke;
		stroke: rgba(255, 255, 255, 0.85);
		stroke-width: 60px;
	}
	:global(.dark) .cable-label {
		stroke: rgba(20, 20, 25, 0.85);
	}
</style>
