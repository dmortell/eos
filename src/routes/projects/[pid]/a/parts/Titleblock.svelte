<svelte:options namespace="svg" />

<script lang="ts">
	import { PAPER } from './types'

	// Titleblock width in paper mm.
	let { width = 50 }: { width?: number } = $props()

	const x = PAPER.w - width

	// Fake titleblock content (replace with real sheet/project metadata later).
	const fields = [
		{ label: 'PROJECT', value: 'Sunny Jetty Data Centre' },
		{ label: 'CLIENT', value: 'Acme Corporation Ltd.' },
		{ label: 'DRAWING TITLE', value: '33F Containment Plan' },
		{ label: 'DRAWING NUMBER', value: 'EOS-33F-DC-001' },
	]
	const grid = [
		{ label: 'SCALE', value: '1:50' },
		{ label: 'DATE', value: '2026-06-18' },
		{ label: 'REV', value: 'A' },
	]
	const rowH = 15
	const gridH = 12
	const gridTop = PAPER.h - gridH
	const fieldsTop = gridTop - fields.length * rowH
	// Give the date cell more room than scale/rev so it doesn't clip.
	const gridW = [0.32, 0.46, 0.22].map((f) => f * width)
	const gridX = gridW.map((_, i) => x + gridW.slice(0, i).reduce((a, b) => a + b, 0))
</script>

<g style="pointer-events:none" font-family="sans-serif">

	<!-- Paper border -->
	<rect x="0" y="0" width={PAPER.w} height={PAPER.h} fill="none" stroke="#000000" stroke-width=".4" style="pointer-events:none" />

	<rect {x} y="0" width={width} height={PAPER.h} fill="white" stroke="#000000" stroke-width=".4" />

	<!-- Company header -->
	<text x={x + width / 2} y="14" font-size="5" font-weight="700" text-anchor="middle" fill="#1e293b">EOS</text>
	<text x={x + width / 2} y="19" font-size="2.2" text-anchor="middle" fill="#64748b">Engineering Office Systems</text>
	<line x1={x} y1="24" x2={PAPER.w} y2="24" stroke="#000000" stroke-width=".4" />

	<!-- Stacked labelled fields -->
	{#each fields as f, i (f.label)}
		{@const top = fieldsTop + i * rowH}
		<line x1={x} y1={top} x2={PAPER.w} y2={top} stroke="#000000" stroke-width=".3" />
		<text x={x + 2} y={top + 3.5} font-size="1.8" fill="#64748b">{f.label}</text>
		<text x={x + 2} y={top + 9.5} font-size="3.2" font-weight="600" fill="#0f172a">{f.value}</text>
	{/each}

	<!-- Bottom grid: scale / date / rev -->
	<line x1={x} y1={gridTop} x2={PAPER.w} y2={gridTop} stroke="#000000" stroke-width=".4" />
	{#each grid as c, i (c.label)}
		{@const cx = gridX[i]}
		{#if i > 0}
			<line x1={cx} y1={gridTop} x2={cx} y2={PAPER.h} stroke="#000000" stroke-width=".3" />
		{/if}
		<text x={cx + 1.5} y={gridTop + 3.5} font-size="1.8" fill="#64748b">{c.label}</text>
		<text x={cx + 1.5} y={gridTop + 9} font-size="3" font-weight="600" fill="#0f172a">{c.value}</text>
	{/each}
</g>
