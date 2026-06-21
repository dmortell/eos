import { toast } from 'svelte-sonner'
import { AnnotationEditor } from '../annotations/annotations.svelte'
import { annTargetLayer, layerCategory, effectiveLayers, type LayerDef } from '../layers/layers'
import type { SurfaceEditor } from './surface.svelte'
import type { ViewportEditor } from '../viewports.svelte'
import type { SheetViewport } from '../types'

/**
 * Per-viewport annotation editor wiring, shared by every tool viewport. Seeds from
 * `vp.annotations` while idle (seed-once when mounted active, for model mode), persists through
 * `vps`, and pairs with the tool editor so object/annotation selections stay mutually exclusive.
 * Call once during a tool viewport's component init.
 */
export function useAnnotations(opts: {
	vp: () => SheetViewport
	active: () => boolean
	vps: ViewportEditor
	toolEditor: SurfaceEditor
	/** Called after each annotation change persists — e.g. to notify an undo History. */
	afterChange?: () => void
	/** Override the layer list (e.g. model3d adds its model layers so symbols can file
	 *  onto them). Defaults to the project/sheet layers. Also drives the new-annotation
	 *  active layer when `activeLayer` is given. */
	layers?: () => LayerDef[]
	activeLayer?: () => string | undefined
	/** Locked layer ids for this viewport (model3d adds its model layers). Defaults to
	 *  the viewport's locked sheet layers. Blocks adding annotations to a locked layer. */
	locked?: () => string[]
	/** Hidden layer ids for this viewport (model3d adds its model layers). Defaults to the
	 *  viewport's hidden sheet layers. Hidden annotations aren't marquee-selectable. */
	hidden?: () => string[]
}): AnnotationEditor {
	const ed = new AnnotationEditor()
	ed.peer = opts.toolEditor
	opts.toolEditor.peer = ed
	const layerList = () => opts.layers?.() ?? opts.vps.allLayers
	ed.isLayerLocked = (id) => (opts.locked?.() ?? effectiveLayers(opts.vp(), opts.vps.allLayers).locked).includes(id)
	ed.isLayerHidden = (id) => (opts.hidden?.() ?? effectiveLayers(opts.vp(), opts.vps.allLayers).hidden).includes(id)
	// Mirror the layer list for the props-panel picker, and resolve the layer new annotations land on.
	// An active layer from a non-annotation category can't hold annotations → fall back + warn (5a5).
	$effect(() => { ed.layers = layerList() })
	$effect(() => { ed.annoDefaults = opts.vps.annoDefaults }) // project-wide defaults + dim unit
	ed.nextLayerId = () => {
		const active = opts.activeLayer?.() ?? opts.vps.activeLayerId
		const target = annTargetLayer(active, layerList())
		if (target !== active && layerCategory(active, layerList()) !== 'annotations') {
			const name = layerList().find(l => l.id === active)?.name ?? active
			toast.info(`“${name}” isn't an annotation layer — added to Annotations`)
		}
		return target
	}
	let seeded = false
	$effect(() => {
		const a = opts.vp().annotations
		if (!opts.active()) { ed.seed(a); seeded = true; return }
		if (!seeded) { ed.seed(a); seeded = true }
	})
	$effect(() => {
		ed.onChange = () => { opts.vps.setAnnotations(opts.vp().id, ed.snapshot()); opts.afterChange?.() }
		return () => { ed.onChange = null }
	})
	return ed
}
