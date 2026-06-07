<script lang="ts">
	// Annotation host: a separate <svg> overlaid on the viewport content, sharing the tool's
	// current viewBox so model-space annotations line up exactly (and print). Read-only unless
	// the viewport is active. Persists to the sheet doc via vps.setAnnotations.
	import AnnotationLayer from './AnnotationLayer.svelte'
	import AnnotationToolbar from './AnnotationToolbar.svelte'
	import { AnnotationEditor } from './annotations.svelte'
	import type { SheetViewport } from '../types'
	import type { ViewportEditor } from '../viewports.svelte'

	let { vp, vps, view, active = false }: {
		vp: SheetViewport
		vps: ViewportEditor
		view: { x: number; y: number; w: number; h: number } | null
		active?: boolean
	} = $props()

	const editor = new AnnotationEditor()
	$effect(() => { if (!active) editor.seed(vp.annotations) })
	$effect(() => { editor.onChange = () => vps.setAnnotations(vp.id, editor.snapshot()); return () => { editor.onChange = null } })

	let svgEl: SVGSVGElement | undefined = $state()
	$effect(() => { editor.svg = active ? (svgEl ?? null) : null })

	$effect(() => {
		if (!active) return
		const onKey = (e: KeyboardEvent) => {
			const f = (e.target as Element)?.closest?.('input, textarea, select, [contenteditable]')
			if (e.key === 'Delete' && !f && editor.selAnn) { e.preventDefault(); e.stopPropagation(); editor.deleteSel() }
		}
		window.addEventListener('keydown', onKey, true)
		return () => window.removeEventListener('keydown', onKey, true)
	})
</script>

{#if view}
	<svg bind:this={svgEl} class="absolute inset-0 h-full w-full" viewBox="{view.x} {view.y} {view.w} {view.h}"
		preserveAspectRatio="xMidYMid meet" style:pointer-events="none" style:overflow="hidden">
		<AnnotationLayer {editor} {active} />
	</svg>
{/if}
{#if active}
	<AnnotationToolbar {editor} />
{/if}
