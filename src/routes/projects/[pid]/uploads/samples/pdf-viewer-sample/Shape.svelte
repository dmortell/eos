<script lang="ts">
	import type { ShapeBase } from "../types/shape"
	import { useCadStores } from "../stores"
	import { getContext } from "svelte"
	import { handlers, type ShapeContext } from './shapeHandlers'
	import PdfImage from './assets/PdfImage.svelte'
	import PdfTiledImage from './assets/PdfTiledImage.svelte'
	import Self from './Shape.svelte'

	let { shape, clone=false, child=false, selected=false, editing=false } = $props()
	let { shapes, view, project } = useCadStores()

	// Optional shape resolver from ViewportContent context (for group children in viewports)
	let resolveShape: ((id: string) => ShapeBase | undefined) | undefined
	try { resolveShape = getContext('resolveShape') } catch { /* not in viewport context */ }

	// Optional model layer lock checker from ViewportContent (uses model page layers, not paper page layers)
	let checkLayerLocked: ((layerId: string | undefined) => boolean) | undefined
	try { checkLayerLocked = getContext('checkLayerLocked') } catch { /* not in viewport context */ }

	// Layer state — use model page layers when inside a viewport, otherwise paper page layers
	const isLocked = $derived(checkLayerLocked ? checkLayerLocked(shape.layerId) : shapes.isLayerLocked(shape.layerId))

	// Layer color overrides shape stroke unless layer color is 'none' or unset
	const layerColor = $derived(shapes.getLayerColor(shape.layerId))
	const effectiveStroke = $derived(selected ? '#3b82f6' : (layerColor || shape.stroke || '#000000'))

	const context: ShapeContext = $derived({
		child,
		cursor: isLocked ? 'default' : editing ? "default" : (child || clone) ? null : 'move',
		stroke: effectiveStroke,
		strokeScale: view.strokeScale,
		paperScale: view.paperScale,
		editing,
		selected,
		projectSettings: project.settings,
		layerLinetype: shapes.getLayerLinetype(shape.layerId),
		layerLineweight: shapes.getLayerLineweight(shape.layerId),
	})

	const handler = $derived(handlers[shape.type] ?? handlers['rect'])
	const tag = $derived(handler.tag)
	const args = $derived(handler.getArgs(shape, context))
	const parts = $derived(handler.getParts(shape, context))
	const children = $derived(shape.children?.map((id:string) => resolveShape?.(id) ?? shapes.get(id)).filter((s:ShapeBase) => s !== undefined))

	const groupTransform = $derived.by(() => {
		if (!shape.a) return undefined
		const cx = (shape.x1 + shape.x2) / 2, cy = (shape.y1 + shape.y2) / 2
		return `rotate(${shape.a},${cx},${cy})`
	})

	// Detect PDF image shapes (pdfPage set, or src ends with .pdf)
	const isPdf = $derived(shape.type === 'image' && ((shape as any).pdfPage != null || (shape as any).src?.toLowerCase().endsWith('.pdf')))

	// Use tiled rendering for large shapes (world area > 500x500 mm)
	const useTiled = $derived(isPdf && Math.abs(shape.x2 - shape.x1) * Math.abs(shape.y2 - shape.y1) > 250000)

	// CSS filter for image grayscale/contrast
	const filterStyle = $derived.by(() => {
		if (shape.type !== 'image') return undefined
		const s = shape as any
		const parts: string[] = []
		if (s.grayscale) parts.push(`grayscale(${s.grayscale})`)
		if (s.contrast != null && s.contrast !== 1) parts.push(`contrast(${s.contrast})`)
		return parts.length ? `filter: ${parts.join(' ')}` : undefined
	})

</script>

<g class={shape.type} transform={groupTransform} data-id={shape.id}
	opacity={shape.opacity != null && shape.opacity !== 1 ? shape.opacity : undefined}
	pointer-events={isLocked ? 'none' : undefined}
	style={filterStyle}>
	{#if useTiled}
		<PdfTiledImage {shape} />
	{:else if isPdf}
		<PdfImage {shape} />
	{:else}
		{#if tag === 'g' && shape.type !== 'line' && shape.type !== 'annotation'}
			<!-- Transparent hit-target for group-type shapes (not lines/annotations - they use thick paths) -->
			<rect x={shape.x1} y={shape.y1} width={shape.x2-shape.x1} height={shape.y2-shape.y1}
				fill="transparent" data-type={shape.type} data-id={shape.id} cursor={context.cursor} />
		{/if}
		<svelte:element this={tag} {...args}>
			{#each parts as p}
				<svelte:element this={p.tag} {...p.args} xmlns={p.xmlns}>
					{p.content}
				</svelte:element>
			{/each}
		</svelte:element>
	{/if}
	{#if children}
		<g data-children={shape.id}>
			{#each children as kid (kid.id)}
				<Self shape={kid} {clone} child />
			{/each}
		</g>
	{/if}
</g>
