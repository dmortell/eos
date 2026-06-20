<svelte:options namespace="svg" />

<script lang="ts">
	import type { Sheet } from './sheet.svelte'
	import { HANDLES, u2paper, v2paper, type View } from './types'
	import ViewObjects from './ViewObjects.svelte'

	let { sheet, view }: { sheet: Sheet; view: View } = $props()

	const active = $derived(sheet.isActive(view))
	const selected = $derived(sheet.isSelected(view))
	const panMode = $derived(sheet.isPanMode(view))
	const objectsClickable = $derived(active && !panMode)

	const HS = 2.5 // resize-handle size, in paper mm

	// Section marker: shown on a plan when a clipped elevation of the same model is selected.
	const marker = $derived(
		view.direction === 'plan' && sheet.markerView && sheet.markerView.modelId === view.modelId && sheet.markerView.id !== view.id
			? sheet.markerView : null,
	)
	const markerInfo = $derived(marker?.clip ? { v: marker, c: marker.clip } : null)
	const CORNERS = [['x0', 'y0'], ['x1', 'y0'], ['x0', 'y1'], ['x1', 'y1']] as const
	const ppu = $derived(sheet.maximizedId === view.id ? sheet.mzoom : sheet.zoom)
	const MHS = $derived(7 / ppu) // marker handle size ≈ 7px
	// Marker/preview rect in paper coords from a model-space x/y box.
	const rectOf = (x0: number, y0: number, x1: number, y1: number) => {
		const X0 = u2paper(view, Math.min(x0, x1)), X1 = u2paper(view, Math.max(x0, x1))
		const Yt = v2paper(view, Math.max(y0, y1)), Yb = v2paper(view, Math.min(y0, y1))
		return { x: X0, y: Yt, w: X1 - X0, h: Yb - Yt }
	}
</script>

<!-- interior interaction layer (below objects so empty space is hit) -->
<rect fill="transparent" style="pointer-events:all" role="button" tabindex="-1" aria-label={view.name}
	x={view.fx} y={view.fy} width={view.fw} height={view.fh}
	ondblclick={() => { if (!active) sheet.activate(view) }}
	onpointerdown={(e) => {
		if (sheet.drawingSection && view.direction === 'plan' && e.button === 0) { sheet.startSectionDraw(e, view); return }
		if (panMode) { sheet.startContentPan(e, view); return }
		if (view.direction === 'iso' && e.button === 0) { sheet.startIsoRotate(e, view); return }
		if (active && e.button === 0) { e.stopPropagation(); sheet.selectedObj = null }
	}}
	onwheel={(e) => { if (panMode || view.direction === 'iso') sheet.contentZoom(e, view) }}
/>

<g clip-path="url(#clip-{view.id})">
	<defs>
		<clipPath id="clip-{view.id}"><rect x={view.fx} y={view.fy} width={view.fw} height={view.fh} /></clipPath>
	</defs>
	<ViewObjects {sheet} {view} clickable={objectsClickable} />

	<!-- section draw preview -->
	{#if sheet.sectionPreview && sheet.sectionPreview.viewId === view.id}
		{@const p = sheet.sectionPreview}
		{@const r = rectOf(p.x0, p.y0, p.x1, p.y1)}
		<rect class="section-preview" x={r.x} y={r.y} width={r.w} height={r.h} />
	{/if}

	<!-- section marker for a selected elevation of this model -->
	{#if markerInfo}
		{@const c = markerInfo.c}
		{@const r = rectOf(c.x0, c.y0, c.x1, c.y1)}
		<rect class="section-marker" x={r.x} y={r.y} width={r.w} height={r.h}
			role="button" tabindex="-1" aria-label="section region"
			style="cursor:move" onpointerdown={(e) => sheet.startMarkerMove(e, view, markerInfo.v)} />
		<text x={r.x + 1} y={r.y - 1} class="section-label">{markerInfo.v.name}</text>
		{#each CORNERS as [xk, yk] (xk + yk)}
			<rect class="section-handle" x={u2paper(view, c[xk]) - MHS / 2} y={v2paper(view, c[yk]) - MHS / 2} width={MHS} height={MHS}
				role="button" tabindex="-1" aria-label="resize section"
				style="cursor:nwse-resize" onpointerdown={(e) => sheet.startMarkerResize(e, view, markerInfo.v, xk, yk)} />
		{/each}
	{/if}
</g>

<!-- visual frame (non-interactive): gray, or blue when selected -->
<rect fill="none" style="pointer-events:none" class="frame {selected ? 'sel' : ''}"
	x={view.fx} y={view.fy} width={view.fw} height={view.fh}
	stroke={selected ? '#2563eb' : '#cbd5e1'}
	stroke-width={selected ? 0.8 : 0.3}
/>

{#if active}
	<!-- active view: thicker black border (non-printing, non-interactive) -->
	<rect class="active-border"
		x={view.fx} y={view.fy} width={view.fw} height={view.fh}
		fill="none" stroke="#000000" stroke-width="1" style="pointer-events:none"
	/>
{:else}
	<!-- frame border hit target: click to select, drag to reposition -->
	<rect fill="none" stroke="transparent" stroke-width="3" role="button" tabindex="0"
		x={view.fx} y={view.fy} width={view.fw} height={view.fh}
		style="pointer-events:stroke;cursor:{selected ? 'move' : 'pointer'}"
		ondblclick={() => sheet.activate(view)}
		onpointerdown={(e) => e.button === 0 ? sheet.startFrameMove(e, view) : sheet.maybePanPage(e)}
	/>
	{#if selected}
		<!-- corner resize handles -->
		{#each HANDLES as h (h.corner)}
			<rect class="handle" role="button" tabindex="-1" aria-label="resize {h.corner}"
				x={view.fx + h.dx * view.fw - HS / 2} y={view.fy + h.dy * view.fh - HS / 2}
				width={HS} height={HS}
				style="pointer-events:all;cursor:{h.cur}-resize"
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
			<button title="Pan/zoom view contents" class:on={panMode}
				onpointerdown={(e) => e.stopPropagation()}
				onclick={() => sheet.togglePan(view)}
			>✋</button>
			<button title="Maximize view"
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

	/* Section tool: draw preview + region marker on the plan. */
	.section-preview { fill: #2563eb18; stroke: #2563eb; stroke-width: 0.4; stroke-dasharray: 2 1.5; pointer-events: none; }
	.section-marker { fill: #2563eb14; stroke: #2563eb; stroke-width: 0.5; stroke-dasharray: 2 1.5; }
	.section-label { font-size: 3px; fill: #2563eb; pointer-events: none; }
	.section-handle { fill: #fff; stroke: #2563eb; stroke-width: 0.4; pointer-events: all; }

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
