<svelte:options namespace="svg" />

<script lang="ts">
	// Single background catcher for the merged edit overlay, hosted inside the tool render <svg>
	// (shared real-mm space). Routes a left press by the unified `tool`: annotation add-tools place
	// via the annotation editor, object add-tools via the host's `onadd`, and Select clears both
	// selections. `namespace="svg"` is required — see OutletsEditLayer for the rationale.
	import type { Point } from '$lib/ui/print/types'
	import type { AnnotationEditor } from '../annotations/annotations.svelte'
	import type { SurfaceEditor } from './surface.svelte'

	let { tool, annEditor, toolEditor, annLocked = false, onadd, onmove, ondbl, onblocked }: {
		tool: string
		annEditor: AnnotationEditor
		toolEditor: SurfaceEditor
		annLocked?: boolean
		/** Object add-tools (e.g. outlet / trunk). Return true if the press was consumed. */
		onadd?: (tool: string, w: Point, shift: boolean) => boolean
		onmove?: (w: Point) => void
		ondbl?: () => void
		/** Called when an annotation add is refused because the Annotations layer is hidden/locked. */
		onblocked?: () => void
	} = $props()

	const ANN = ['text', 'line', 'arrow', 'rect', 'cloud', 'symbol', 'callout', 'dimension', 'leader']

	function bg(e: MouseEvent) {
		if (e.button !== 0) return
		const w = annEditor.toWorld(e); if (!w) return
		if (ANN.includes(tool)) {
			if (annLocked) { onblocked?.(); return }
			e.stopPropagation()
			annEditor.tool = tool as any
			annEditor.place(w)
			return
		}
		if (tool === 'select') {
			annEditor.clearSel()
			const beginMarquee = (toolEditor as { beginMarquee?: (e: MouseEvent) => void }).beginMarquee
			if (beginMarquee) beginMarquee.call(toolEditor, e); else toolEditor.clearSel()
			return
		}
		if (onadd?.(tool, w, e.shiftKey)) e.stopPropagation()
	}
	function move(e: MouseEvent) { if (onmove) { const w = annEditor.toWorld(e); if (w) onmove(w) } }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<rect x="-1e6" y="-1e6" width="2e6" height="2e6" fill="transparent"
	style:cursor={tool === 'select' ? 'default' : 'crosshair'}
	onmousedown={bg} onmousemove={move} ondblclick={() => ondbl?.()} />
