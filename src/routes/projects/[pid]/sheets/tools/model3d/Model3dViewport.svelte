<script lang="ts">
	import { getContext } from 'svelte'
	import { page } from '$app/state'
	import type { Firestore } from '$lib/db.svelte'
	import type { SheetViewport } from '../../types'
	import type { ViewportEditor } from '../../viewports.svelte'
	import { History } from '../../edit/history.svelte'
	import { portal } from '../../edit/portal'
	import { modelStore } from './models.svelte'
	import { Model3dEditor } from './model3d-editor.svelte'
	import Model3dRender from './Model3dRender.svelte'
	import Model3dEditLayer from './Model3dEditLayer.svelte'
	import Model3dUnderlayImage from './Model3dUnderlayImage.svelte'
	import Model3dEditPanel from './Model3dEditPanel.svelte'
	import AnnotationLayer from '../../annotations/AnnotationLayer.svelte'
	import EditBackground from '../../edit/EditBackground.svelte'
	import { useAnnotations } from '../../edit/annotations.svelte'
	import { modelZRange } from './projection'
	import { toast } from 'svelte-sonner'
	// (model layers now live in the shared sheet Layers window)

	const ANN_TOOLS = ['text', 'line', 'rect', 'arrow', 'ellipse', 'cloud', 'symbol', 'callout', 'dimension', 'image']

	// Host for a `model3d` viewport source: resolves the referenced 3D model and
	// renders its projection; when active, mounts the geometry edit layer.
	let { vp, vps, zoom = 1, active = false, view = null, onview, hidden = [], locked = [] }: {
		vp: SheetViewport
		vps: ViewportEditor
		zoom?: number
		active?: boolean
		view?: { x: number; y: number; w: number; h: number } | null
		onview?: (v: { x: number; y: number; w: number; h: number; den: number }) => void
		hidden?: string[]
		locked?: string[]
	} = $props()

	const db = getContext('db') as Firestore
	const pid = $derived(page.params.pid ?? '')
	const src = $derived(vp.source.kind === 'model3d' ? vp.source : null)

	// Project-shared, persisted models (synced to models3d/{pid}).
	const store = $derived(modelStore(db, pid))
	const model = $derived(store.models.find((m) => m.id === src?.modelId) ?? null)

	// Underlays for this view's direction (z-order = array order; later = on top).
	const underlays = $derived((model?.underlays ?? []).filter((u) => u.dir === src?.direction))

	// In-viewport geometry editor — operates on the shared model, persists via the store.
	const editor = new Model3dEditor()
	$effect(() => { editor.model = model; editor.direction = src?.direction ?? 'plan'; editor.layerOverrides = vp.layerOverrides ?? {} })
	$effect(() => { if (!active) { editor.clearSel(); editor.cancelPlacing(); editor.cancelSection() } })

	// Section tool: a box drawn on this plan spawns a new clipped FRONT elevation
	// viewport on the sheet (z spans the model so the cut is full-height). The user
	// then sets its View direction / scale and drags it where they want.
	$effect(() => {
		editor.onSection = (box) => {
			if (!model || !src) return
			const { z0, z1 } = modelZRange(model.objects)
			const clip = {
				x0: Math.round(Math.min(box.x0, box.x1)), x1: Math.round(Math.max(box.x0, box.x1)),
				y0: Math.round(Math.min(box.y0, box.y1)), y1: Math.round(Math.max(box.y0, box.y1)), z0, z1,
			}
			const n = vps.viewports.filter((v) => v.source?.kind === 'model3d' && (v.source as any).clip).length
			vps.addViewport({ x: Math.min(vp.x + 10 + n * 5, 380), y: Math.min(vp.y + vp.h + 8 + n * 5, 250), w: 130, h: 95 })
			const v = vps.selectedViewport
			if (v) { v.label = `Section ${n + 1}`; v.source = { kind: 'model3d', modelId: src.modelId, direction: 'front', hiddenLines: true, bw: false, clip }; v.version = 2; vps.notify() }
		}
	})

	// Editable section markers on the plan: surface every OTHER clipped model3d
	// viewport of the same model as a draggable/resizable box; edits write back to
	// that viewport's clip; delete removes the elevation viewport.
	$effect(() => {
		editor.sectionsProvider = () => vps.viewports
			.filter((v) => v.id !== vp.id && v.source?.kind === 'model3d' && (v.source as any).modelId === src?.modelId && (v.source as any).clip)
			.map((v) => ({ id: v.id, clip: (v.source as any).clip, label: v.label || (v.source as any).direction }))
		editor.onSectionChange = (id, clip) => { const v = vps.viewports.find((x) => x.id === id); if (v && v.source.kind === 'model3d') { v.source.clip = clip; vps.notify() } }
		editor.onSectionDelete = (id) => {
			const removed = vps.viewports.find((v) => v.id === id); if (!removed) return
			const snap = $state.snapshot(removed)
			vps.viewports = vps.viewports.filter((v) => v.id !== id); vps.notify()
			toast('Section deleted', { action: { label: 'Undo', onClick: () => { vps.viewports = [...vps.viewports, snap as any]; vps.notify() } } })
		}
	})

	// Annotations (shared sheet system): text/line/rect to start. Stored on the
	// viewport (vp.annotations), drawn in the render's real-mm space. `tool` is the
	// unified mode — 'select' lets the geometry editor work; an annotation tool
	// routes clicks to placement via EditBackground.
	let tool = $state('select')
	let viewDen = $state(1)
	const annEditor = useAnnotations({ vp: () => vp, active: () => active, vps, toolEditor: editor })
	annEditor.onPlaced = () => (tool = 'select') // back to Select so the new annote shows handles
	$effect(() => { if (!active) { annEditor.clearSel(); tool = 'select' } })

	// Undo/redo over the model *geometry* only (objects). Layer definitions and
	// underlays are edited through other save paths (Layers window / properties),
	// so keeping them out of the snapshot avoids geometry-undo clobbering them.
	const history = new History()
	const snap = {
		snapshot: () => model ? $state.snapshot({ objects: model.objects }) : {},
		seed: (s: any) => { if (model) model.objects = s.objects ?? [] },
		notify: () => store.save(),
	}
	history.register(snap)
	$effect(() => { editor.onChange = () => { store.save(); history.touch() } })
	// Baseline once when the viewport becomes active (and the model is loaded).
	let baselined = false
	$effect(() => {
		if (active && model && store.loaded) { if (!baselined) { history.reset(); baselined = true } }
		else baselined = false
	})

	$effect(() => {
		if (!active) return
		const onKey = (e: KeyboardEvent) => {
			if ((e.target as Element)?.closest?.('input, textarea, select, [contenteditable]')) return
			if (editor.placing) {
				if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); editor.finishPlacing(); return }
				if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); editor.cancelPlacing(); return }
			}
			const mod = e.ctrlKey || e.metaKey
			if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) history.redo(); else history.undo(); return }
			if (mod && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); e.stopPropagation(); history.redo(); return }
			// Annotation selection takes precedence for clipboard/delete when one is selected.
			const annSel = annEditor.selAnn || annEditor.hasMultiSel()
			if (mod && (e.key === 'c' || e.key === 'C') && annSel) { e.preventDefault(); e.stopPropagation(); annEditor.copySel(); return }
			if (mod && (e.key === 'v' || e.key === 'V')) { e.preventDefault(); e.stopPropagation(); annEditor.paste(); return }
			if (mod && (e.key === 'd' || e.key === 'D') && annSel) { e.preventDefault(); e.stopPropagation(); annEditor.duplicateSel(); return }
			if (mod && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); e.stopPropagation(); editor.duplicateSel(); return }
			if (mod && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); e.stopPropagation(); editor.copySel(); return }
			if (mod && (e.key === 'x' || e.key === 'X')) { e.preventDefault(); e.stopPropagation(); editor.cutSel(); return }
			if (e.key === 'Escape' && tool !== 'select') { e.preventDefault(); e.stopPropagation(); tool = 'select'; return }
			if (e.key === 'Delete' || e.key === 'Backspace') {
				e.preventDefault(); e.stopPropagation()
				if (annSel) annEditor.deleteSel(); else editor.deleteSel()
			}
		}
		window.addEventListener('keydown', onKey, true)
		return () => window.removeEventListener('keydown', onKey, true)
	})
</script>

{#if src && model}
	<Model3dRender
		{model}
		direction={src.direction}
		yaw={src.yaw}
		pitch={src.pitch}
		hiddenLines={src.hiddenLines ?? true}
		bw={src.bw ?? false}
		clip={src.clip ?? null}
		{zoom} {vp} {view} onview={(v) => { viewDen = v.den || 1; onview?.(v) }}
		onsvg={(el) => { editor.svg = el; annEditor.svg = el }}
	>
		{#snippet pre()}
			{#if !(vp.layerOverrides?.['background']?.hidden)}
				{#each underlays as u (u.id)}
					<Model3dUnderlayImage underlay={u} {store} />
				{/each}
			{/if}
		{/snippet}
		{#if active && ANN_TOOLS.includes(tool)}
			<!-- annotation draw-capture (only while an annotation tool is armed) -->
			<EditBackground {tool} {annEditor} toolEditor={editor} />
		{/if}
		{#if active}
			<Model3dEditLayer {editor} {model} direction={src.direction} interactive={tool === 'select'} {zoom} />
		{/if}
		<!-- annotations render in real-mm; interactive (select/move) only in Select mode -->
		<AnnotationLayer editor={annEditor} interactive={active && tool === 'select'} {hidden} {locked} den={viewDen} />
	</Model3dRender>
	{#if active}
		<!-- portalled out of the zoomed canvas so the panels render at normal size -->
		<div use:portal><Model3dEditPanel {editor} {model} {annEditor} bind:tool /></div>
	{/if}
{:else}
	<div class="flex h-full w-full items-center justify-center text-zinc-400 print:hidden" style:font-size="{14 / zoom}px">
		{src ? 'Model not found' : 'Choose a 3D model'}
	</div>
{/if}
