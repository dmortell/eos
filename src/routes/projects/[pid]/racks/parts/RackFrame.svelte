<script lang="ts">
	import type { RackConfig, ViewState } from './types'
	import { DEFAULT_SHELF_HEIGHTS } from './types'
	import { RU_HEIGHT_MM, RACK_19IN_MM } from './constants'

	let { rack, view, selected = false, overlaps = new Set() }: {
		rack: RackConfig & { _x: number; _z: number }
		view: ViewState
		selected?: boolean
		overlaps?: Set<number>
	} = $props()

	let scale = $derived(view.scale)
	let width = $derived(rack.widthMm * scale)
	let height = $derived(rack.heightMm * scale)
	let cx = $derived(width / 2)
	let inner = $derived(RACK_19IN_MM / 2 * scale)
	let railWidth = $derived(70 * scale)

	let isRU = $derived(rack.type !== 'desk' && rack.type !== 'shelf' && rack.type !== 'vcm')

	// Position: racks are placed at x based on order, z = floor level
	let left = $derived(rack._x * scale)
	let top = $derived((view.bottom - rack._z - rack.heightMm) * scale)

	let u2y = (u: number) => height - u * RU_HEIGHT_MM * scale

	// Shelf/tray line positions (mm from base) for desk/shelf types
	let shelfHeights = $derived(rack.shelfHeights ?? DEFAULT_SHELF_HEIGHTS[rack.type] ?? [])
</script>

<!-- Label above rack -->
<div class="absolute flex justify-between items-center gap-2 pointer-events-none select-none"
	style:left={left + 'px'} style:top={top - 24 + 'px'} style:width={width + 'px'}>
	<b class="text-sm text-gray-700">{rack.label}</b>
	{#if isRU}
		<span class="text-[10px] text-gray-400">{rack.heightU}U {rack.type}</span>
	{:else}
		<span class="text-[10px] text-gray-400">{rack.heightMm}mm {rack.type}</span>
	{/if}
</div>

<!-- SVG rack frame -->
<svg class="absolute" width={width} height={height}
	style:left={left + 'px'} style:top={top + 'px'}
	class:ring-2={selected} class:ring-blue-500={selected}>

{#if rack.type === 'desk' || rack.type === 'shelf'}
	<!-- Desk / Shelf: simple rect with horizontal tray lines -->
	<rect {width} {height} fill="white" stroke="#333" stroke-width={2} />

	<!-- Vertical side rails -->
	<line x1={4 * scale} y1={0} x2={4 * scale} y2={height} stroke="#999" stroke-width={1} />
	<line x1={width - 4 * scale} y1={0} x2={width - 4 * scale} y2={height} stroke="#999" stroke-width={1} />

	<!-- Shelf/tray lines at configurable heights -->
	{#each shelfHeights as h, i}
		{#if h > 0}
			{@const y = height - h * scale}
			<rect x={1} y={y - 3 * scale} width={width - 2} height={6 * scale}
				fill="#e5e7eb" stroke="#999" stroke-width={1} />
			<text x={width - 6} y={y + 3 * scale} fill="#888" font-size={Math.max(7, 20 * scale)}
				font-family="sans-serif" text-anchor="end" class="pointer-events-none select-none">
				{h}
			</text>
		{/if}
	{/each}

{:else if rack.type === 'vcm'}
	<!-- Vertical Cable Manager: narrow rect with vertical channels -->
	<rect {width} {height} fill="#f8f8f8" stroke="#333" stroke-width={2} />

	<!-- Vertical finger channels -->
	{@const chW = Math.max(10 * scale, width * 0.2)}
	{@const gap = (width - chW * 2) / 3}
	<rect x={gap} y={4 * scale} width={chW} height={height - 8 * scale}
		fill="none" stroke="#aaa" stroke-width={1} stroke-dasharray="4,3" />
	<rect x={gap * 2 + chW} y={4 * scale} width={chW} height={height - 8 * scale}
		fill="none" stroke="#aaa" stroke-width={1} stroke-dasharray="4,3" />

	<!-- Cross hatches every 200mm -->
	{#each Array.from({ length: Math.floor(rack.heightMm / 200) }) as _, i}
		{@const y = height - (i + 1) * 200 * scale}
		<line x1={gap} y1={y} x2={gap + chW} y2={y} stroke="#ccc" stroke-width={1} />
		<line x1={gap * 2 + chW} y1={y} x2={gap * 2 + chW * 2} y2={y} stroke="#ccc" stroke-width={1} />
	{/each}

{:else}
	<!-- Standard rack: 2-post / 4-post / cabinet -->
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
		<text x={cx - inner - 22} y={yBottom - 4} fill={overlaps.has(u) ? '#dc2626' : '#999'} font-size={Math.max(8, 28 * scale)}
			font-family="monospace" text-anchor="middle" class="pointer-events-none select-none"
			font-weight={overlaps.has(u) ? 'bold' : 'normal'}>{u}</text>
		<text x={cx + inner + 22} y={yBottom - 4} fill={overlaps.has(u) ? '#dc2626' : '#999'} font-size={Math.max(8, 28 * scale)}
			font-family="monospace" text-anchor="middle" class="pointer-events-none select-none"
			font-weight={overlaps.has(u) ? 'bold' : 'normal'}>{u}</text>

		<!-- Overlap warning -->
		{#if overlaps.has(u)}
			<g>
				<title>Overlap: multiple devices at U{u}</title>
				<rect x={cx + inner + 1} y={yBottom - RU_HEIGHT_MM * scale} width={railWidth - 2} height={RU_HEIGHT_MM * scale}
					fill="#fef2f2" fill-opacity={0.7} />
				<text x={cx + inner + railWidth - 2} y={yBottom - 3} fill="#dc2626" font-size={Math.max(7, 22 * scale)}
					font-family="sans-serif" text-anchor="end" font-weight="bold">!</text>
			</g>
		{/if}
	{/each}
{/if}
</svg>
