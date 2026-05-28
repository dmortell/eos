<script lang="ts">
	import type { FloorYBand } from './engine'
	import type { FloorConfig } from '$lib/types/project'
	import { fmtFloor } from '$lib/utils/floor'

	let {
		band,
		widthMm,
		floors = [],
		floorFormat = 'L01',
	}: {
		band: FloorYBand
		widthMm: number
		floors?: FloorConfig[]
		floorFormat?: string
	} = $props()

	const labelX = $derived(-200)
</script>

<g class="floor-band" data-floor={band.floor}>
	<!-- Plenum void -->
	<rect
		x="0"
		y={band.topMm}
		width={widthMm}
		height={band.plenumBottomMm - band.topMm}
		class="plenum"
	/>
	<!-- Ceiling line -->
	<line
		x1="0"
		y1={band.plenumBottomMm}
		x2={widthMm}
		y2={band.plenumBottomMm}
		class="ceiling"
	/>
	<!-- Clear / occupiable space (no fill, just the bounding lines) -->
	<!-- Raised floor void -->
	{#if band.heights.raisedFloorMm > 0}
		<rect
			x="0"
			y={band.raisedFloorTopMm}
			width={widthMm}
			height={band.slabTopMm - band.raisedFloorTopMm}
			class="raised-floor"
		/>
		<!-- Walking surface (top of raised floor) -->
		<line
			x1="0"
			y1={band.raisedFloorTopMm}
			x2={widthMm}
			y2={band.raisedFloorTopMm}
			class="raised-floor-top"
		/>
	{/if}
	<!-- Structural slab -->
	<rect
		x="0"
		y={band.slabTopMm}
		width={widthMm}
		height={band.slabBottomMm - band.slabTopMm}
		class="slab"
	/>

	<!-- Floor label (left margin) -->
	<text
		x={labelX}
		y={(band.raisedFloorTopMm + band.plenumBottomMm) / 2}
		class="floor-label"
		text-anchor="end"
		dominant-baseline="middle"
	>
		{fmtFloor(band.floor, floorFormat, floors)}
	</text>
</g>

<style>
	.plenum {
		fill: rgba(120, 130, 160, 0.08);
		stroke: rgba(120, 130, 160, 0.3);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}
	.raised-floor {
		fill: rgba(160, 140, 100, 0.1);
		stroke: rgba(160, 140, 100, 0.3);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}
	.slab {
		fill: rgba(60, 60, 70, 0.85);
		stroke: rgba(20, 20, 30, 0.95);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}
	.ceiling {
		stroke: rgba(80, 90, 110, 0.6);
		stroke-width: 1.5;
		vector-effect: non-scaling-stroke;
	}
	.raised-floor-top {
		stroke: rgba(90, 80, 50, 0.7);
		stroke-width: 1.5;
		vector-effect: non-scaling-stroke;
	}
	.floor-label {
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 280px;
		font-weight: 600;
		fill: rgb(63, 63, 70);
	}
	:global(.dark) .floor-label {
		fill: rgb(212, 212, 216);
	}
	:global(.dark) .plenum {
		fill: rgba(120, 130, 160, 0.15);
		stroke: rgba(140, 150, 180, 0.4);
	}
	:global(.dark) .raised-floor {
		fill: rgba(180, 160, 110, 0.15);
		stroke: rgba(180, 160, 110, 0.35);
	}
	:global(.dark) .slab {
		fill: rgba(30, 30, 40, 0.9);
		stroke: rgba(10, 10, 15, 1);
	}
</style>
