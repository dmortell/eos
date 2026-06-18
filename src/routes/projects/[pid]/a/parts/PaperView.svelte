<svelte:options namespace="svg" />

<script lang="ts">
	import type { Sheet } from './sheet.svelte'
	import { HANDLES, type View } from './types'
	import ViewObjects from './ViewObjects.svelte'

	let { sheet, view }: { sheet: Sheet; view: View } = $props()

	const active = $derived(sheet.isActive(view))
	const selected = $derived(sheet.isSelected(view))
	const panMode = $derived(sheet.isPanMode(view))
	const objectsClickable = $derived(active && !panMode)

	const HS = 2.5 // resize-handle size, in paper mm
</script>

<!-- interior interaction layer (below objects so empty space is hit) -->
<rect
	x={view.fx} y={view.fy} width={view.fw} height={view.fh}
	fill="transparent" style="pointer-events:all"
	role="button" tabindex="-1" aria-label={view.name}
	ondblclick={() => { if (!active) sheet.activate(view) }}
	onpointerdown={(e) => {
		if (panMode) { sheet.startContentPan(e, view); return }
		if (view.direction === 'iso' && e.button === 0) { sheet.startIsoRotate(e, view); return }
		if (active && e.button === 0) { e.stopPropagation(); sheet.selectedObj = null }
	}}
	onwheel={(e) => { if (panMode) sheet.contentZoom(e, view) }}
/>

<g clip-path="url(#clip-{view.id})">
	<defs>
		<clipPath id="clip-{view.id}">
			<rect x={view.fx} y={view.fy} width={view.fw} height={view.fh} />
		</clipPath>
	</defs>
	<ViewObjects {sheet} {view} clickable={objectsClickable} />
</g>

<!-- visual frame (non-interactive): gray, or blue when selected -->
<rect
	class="frame {selected ? 'sel' : ''}"
	x={view.fx} y={view.fy} width={view.fw} height={view.fh}
	fill="none" style="pointer-events:none"
	stroke={selected ? '#2563eb' : '#cbd5e1'}
	stroke-width={selected ? 0.8 : 0.3}
/>

{#if active}
	<!-- active view: thicker black border (non-printing, non-interactive) -->
	<rect
		class="active-border"
		x={view.fx} y={view.fy} width={view.fw} height={view.fh}
		fill="none" stroke="#000000" stroke-width="1" style="pointer-events:none"
	/>
{:else}
	<!-- frame border hit target: click to select, drag to reposition -->
	<rect
		x={view.fx} y={view.fy} width={view.fw} height={view.fh}
		fill="none" stroke="transparent" stroke-width="3"
		style="pointer-events:stroke;cursor:{selected ? 'move' : 'pointer'}"
		role="button" tabindex="0"
		ondblclick={() => sheet.activate(view)}
		onpointerdown={(e) => e.button === 0 ? sheet.startFrameMove(e, view) : sheet.maybePanPage(e)}
	/>
	{#if selected}
		<!-- corner resize handles -->
		{#each HANDLES as h (h.corner)}
			<rect
				class="handle"
				x={view.fx + h.dx * view.fw - HS / 2} y={view.fy + h.dy * view.fh - HS / 2}
				width={HS} height={HS}
				style="pointer-events:all;cursor:{h.cur}-resize"
				role="button" tabindex="-1" aria-label="resize {h.corner}"
				onpointerdown={(e) => sheet.startResize(e, view, h.corner)}
			/>
		{/each}
	{/if}
{/if}

<text x={view.fx + 1} y={view.fy - 1} font-size="3" fill="#64748b" style="pointer-events:none">{view.name}</text>

{#if selected || active}
	<!-- per-view toolbar, top-right inside the frame -->
	<foreignObject x={view.fx + view.fw - 17} y={view.fy + 1} width="16" height="8">
		<div xmlns="http://www.w3.org/1999/xhtml" class="vtools">
			<button
				class:on={panMode}
				title="Pan/zoom view contents"
				onpointerdown={(e) => e.stopPropagation()}
				onclick={() => sheet.togglePan(view)}
			>✋</button>
			<button
				title="Maximize view"
				onpointerdown={(e) => e.stopPropagation()}
				onclick={() => sheet.toggleMax(view)}
			>⤢</button>
		</div>
	</foreignObject>
{/if}

<style>
	.frame { cursor: pointer; outline: none; }

	/* Corner resize handles on a selected view. */
	.handle { fill: #fff; stroke: #2563eb; stroke-width: 0.4; }

	/* Per-view toolbar rendered via <foreignObject> (units = paper mm). */
	.vtools { display: flex; gap: 0.6px; justify-content: flex-end; }
	.vtools button {
		width: 7px; height: 7px;
		padding: 0; line-height: 1;
		font-size: 4px;
		display: flex; align-items: center; justify-content: center;
		border: none;
		border-radius: 1px;
		background: transparent;
		cursor: pointer;
	}
	.vtools button:hover { background: #e2e8f0; }
	.vtools button.on { background: #2563eb; color: #fff; }

	@media print {
		/* Don't print selection highlight, toolbar, active border, or handles. */
		.frame.sel { stroke: #cbd5e1 !important; stroke-width: 0.3px !important; }
		.vtools { display: none !important; }
		.active-border { display: none !important; }
		.handle { display: none !important; }
	}
</style>
