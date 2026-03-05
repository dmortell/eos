<script lang="ts">
	import type { RackConfig, ViewState } from './types'
	import { RU_HEIGHT_MM, RACK_19IN_MM } from './constants'

	let { rack, view, selected = false }: {
		rack: RackConfig & { _x: number; _z: number }
		view: ViewState
		selected?: boolean
	} = $props()

	let scale = $derived(view.scale)
	let width = $derived(rack.widthMm * scale)
	let height = $derived(rack.heightMm * scale)
	let cx = $derived(width / 2)
	let inner = $derived(RACK_19IN_MM / 2 * scale)
	let railWidth = $derived(70 * scale)

	// Position: racks are placed at x based on order, z = floor level
	let left = $derived(rack._x * scale)
	let top = $derived((view.bottom - rack._z - rack.heightMm) * scale)

	let u2y = (u: number) => height - u * RU_HEIGHT_MM * scale
</script>

<!-- Label above rack -->
<div class="absolute flex justify-between items-center gap-2 pointer-events-none select-none"
	style:left={left + 'px'} style:top={top - 24 + 'px'} style:width={width + 'px'}>
	<b class="text-sm text-gray-700">{rack.label}</b>
	<span class="text-[10px] text-gray-400">{rack.heightU}U {rack.type}</span>
</div>

<!-- SVG rack frame -->
<svg class="absolute" width={width} height={height}
	style:left={left + 'px'} style:top={top + 'px'}
	class:ring-2={selected} class:ring-blue-500={selected}>

	<!-- Outer frame -->
	<rect {width} {height} fill="white" stroke="#333" stroke-width={2} />

	<!-- 19" internal area -->
	<rect x={cx - inner} y={u2y(rack.heightU + 1)} width={inner * 2} height={rack.heightU * RU_HEIGHT_MM * scale}
		fill="none" stroke="#999" stroke-width={1} />

	<!-- RU markings -->
	{#each Array.from({ length: rack.heightU }) as _, i}
		{@const u = i + 1}
		{@const yBottom = height - u * RU_HEIGHT_MM * scale}

		<!-- Divider lines -->
		<line x1={cx - inner - railWidth} y1={yBottom} x2={cx - inner - 1} y2={yBottom} stroke="#ddd" stroke-width={1} />
		<line x1={cx + inner} y1={yBottom} x2={cx + inner + railWidth - 1} y2={yBottom} stroke="#ddd" stroke-width={1} />

		<!-- RU numbers -->
		<text x={cx - inner - 22} y={yBottom - 4} fill="#999" font-size={Math.max(8, 28 * scale)}
			font-family="monospace" text-anchor="middle" class="pointer-events-none select-none">{u}</text>
		<text x={cx + inner + 22} y={yBottom - 4} fill="#999" font-size={Math.max(8, 28 * scale)}
			font-family="monospace" text-anchor="middle" class="pointer-events-none select-none">{u}</text>
	{/each}
</svg>
