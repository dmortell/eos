<script lang="ts">
	import { getContext } from 'svelte'
	import { page } from '$app/state'
	import type { Firestore } from '$lib/db.svelte'
	import type { SheetViewport } from '../../types'
	import type { ViewportEditor } from '../../viewports.svelte'
	import { History } from '../../edit/history.svelte'
	import { SelectionCoordinator } from '../../edit/selection'
	import { portal } from '../../edit/portal'
	import { armHotkey } from '../../edit/hotkeys'
	import { modelStore } from './models.svelte'
	import { Model3dEditor } from './model3d-editor.svelte'
	import Model3dRender from './Model3dRender.svelte'
	import Model3dEditLayer from './Model3dEditLayer.svelte'
	import MarqueeOverlay from './MarqueeOverlay.svelte'
	import Model3dUnderlayImage from './Model3dUnderlayImage.svelte'
	import Model3dEditPanel from './Model3dEditPanel.svelte'
	import Model3dElevationPreview from './Model3dElevationPreview.svelte'
	import type { Dir } from './types'
	import AnnotationLayer from '../../annotations/AnnotationLayer.svelte'
	import EditBackground from '../../edit/EditBackground.svelte'
	import { useAnnotations } from '../../edit/annotations.svelte'
	import { modelZRange, DEFAULT_YAW, DEFAULT_PITCH } from './projection'
	import { toast } from 'svelte-sonner'

	// Iso orbit: drag updates the source yaw/pitch (pitch clamped to avoid flip-over).
	function startOrbit(e: MouseEvent) {
		if (e.button !== 0 || !src) return
		e.stopPropagation()
		const sx = e.clientX, sy = e.clientY, yaw0 = src.yaw ?? DEFAULT_YAW, pitch0 = src.pitch ?? DEFAULT_PITCH
		const move = (ev: MouseEvent) => { if (!src) return; src.yaw = yaw0 + (ev.clientX - sx) * 0.01; src.pitch = Math.max(0.05, Math.min(Math.PI / 2, pitch0 + (ev.clientY - sy) * 0.01)); vps.notify() }
		const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
		window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
	}
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
	$effect(() => { editor.activeLayer = src?.activeLayer }) // active layer chosen in the Layers window
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
	let elevDir = $state<Dir>('front') // direction for the floating elevation preview
	// Layers a symbol can file onto, PER-MODEL (per floor): this model's own layers
	// (base:'annotations' makes them annotation-assignable) + the un-deletable global
	// 'annotations' default. Project-wide CUSTOM layers are NOT offered here (creating/
	// deleting them is project-wide — the footgun); add a model layer instead. Existing
	// annotations already on a project custom keep it selectable (transitional) so they
	// don't orphan. Both share vp.layerOverrides for per-viewport hide/lock.
	const usedAnnLayers = $derived(new Set((vp.annotations ?? []).map((a) => a.layerId).filter(Boolean)))
	const annLayerDefs = $derived([
		...(model?.layers ?? []).map((l) => ({ id: l.id, name: l.name, color: l.color, base: 'annotations' })),
		...vps.allLayers.filter((l) => l.id === 'annotations' || (l.base === 'annotations' && usedAnnLayers.has(l.id))),
	])
	// Hide/lock lists for annotations must also cover model layers (per-viewport overrides).
	const annHidden = $derived([...hidden, ...(model?.layers ?? []).filter((l) => vp.layerOverrides?.[l.id]?.hidden).map((l) => l.id)])
	const annLocked = $derived([...locked, ...(model?.layers ?? []).filter((l) => vp.layerOverrides?.[l.id]?.locked).map((l) => l.id)])

	// History is created first so the annotation editor can touch() it after each change.
	const history = new History()
	const annEditor = useAnnotations({ vp: () => vp, active: () => active, vps, toolEditor: editor, afterChange: () => history.touch(), layers: () => annLayerDefs, activeLayer: () => src?.activeLayer, locked: () => annLocked })
	annEditor.onPlaced = () => (tool = 'select') // back to Select so the new annote shows handles
	$effect(() => { if (!active) { annEditor.clearSel(); tool = 'select' } })
	// Cross-editor selection actions (delete / duplicate over a mixed object+annotation selection).
	const selection = new SelectionCoordinator([editor, annEditor])

	// Undo/redo over the model geometry (objects) AND this viewport's annotations, so a
	// drag / ctrl-drag of either is undoable. Layer defs + underlays are edited through
	// other save paths, so they stay out of the snapshot.
	const snap = {
		// Selection is in the snapshot so undo re-selects what was selected (e.g. the originals
		// after undoing a ctrl-drag copy), not the now-deleted clones.
		snapshot: () => ({ objects: model ? $state.snapshot(model.objects) : [], annotations: annEditor.snapshot(), objSel: editor.selectionState(), annSel: annEditor.selectionState() }),
		seed: (s: any) => {
			if (model) model.objects = s.objects ?? []
			annEditor.seed(s.annotations ?? [])
			editor.restoreSelection(s.objSel); annEditor.restoreSelection(s.annSel)
			editor.pruneSelection(); annEditor.pruneSelection()
		},
		notify: () => { store.save(); annEditor.notify() },
	}
	history.register(snap)
	$effect(() => { editor.onChange = () => { store.save(); history.touch() } })
	// Checkpoint the pre-gesture state (e.g. originals before a ctrl-drag copy) so undo re-selects them.
	editor.beforeMutate = annEditor.beforeMutate = selection.beforeMutate = () => history.commit()
	// Baseline once when the viewport becomes active (and the model is loaded).
	let baselined = false
	$effect(() => {
		if (active && model && store.loaded) { if (!baselined) { history.reset(); baselined = true } }
		else baselined = false
	})

	$effect(() => {
		if (!active) return
		const onKey = (e: KeyboardEvent) => {
			// Let Escape through even from a form control (e.g. the Symbol select) so it can revert
			// an armed insert tool; other keys are ignored while typing.
			const el = e.target as HTMLElement
			const inField = !!el?.closest?.('input, textarea, select, [contenteditable]')
			if (inField && e.key !== 'Escape') return
			if (editor.placing) {
				if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); editor.finishPlacing(); return }
				if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); editor.cancelPlacing(); return }
			}
			const mod = e.ctrlKey || e.metaKey
			if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) history.redo(); else history.undo(); return }
			if (mod && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); e.stopPropagation(); history.redo(); return }
			// Clipboard / duplicate over the combined object + annotation selection.
			if (mod && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); e.stopPropagation(); selection.copySelection(); return }
			if (mod && (e.key === 'v' || e.key === 'V')) { e.preventDefault(); e.stopPropagation(); selection.paste(); return }
			if (mod && (e.key === 'x' || e.key === 'X')) { e.preventDefault(); e.stopPropagation(); selection.cutSelection(); return }
			if (mod && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); e.stopPropagation(); selection.duplicateSelection(); return }
			if (e.key === 'Escape' && tool !== 'select') { e.preventDefault(); e.stopPropagation(); tool = 'select'; return }
			// Escape from inside a field (nothing armed): just blur it — don't deactivate the viewport.
			if (inField && e.key === 'Escape') { el?.blur?.(); e.stopPropagation(); return }
			if (e.key === 'Delete' || e.key === 'Backspace') {
				e.preventDefault(); e.stopPropagation()
				selection.deleteSelection() // combined object + annotation selection (multi-aware)
				return
			}
			// Arrow keys: nudge the selection 1mm (10mm with Shift); Ctrl = resize W/H instead.
			const arrow: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
			if (arrow[e.key] && selection.hasSelection()) {
				e.preventDefault(); e.stopPropagation()
				const [ux, uy] = arrow[e.key], step = e.shiftKey ? 10 : 1
				if (mod) selection.resize(ux * step, uy * step); else selection.nudge(ux * step, uy * step)
				return
			}
			// Plain-key markup / symbol hotkeys → arm that annotation tool (e.g. C cloud, O outlet, S section).
			if (!mod && !e.altKey && active && !editor.placing) {
				const armed = armHotkey(e)
				if (armed) { e.preventDefault(); e.stopPropagation(); if (armed.symbol) annEditor.symbol = armed.symbol; tool = armed.tool; return }
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
		{#if active && src.direction === 'iso' && tool === 'select'}
			<!-- iso orbit: drag to rotate (horizontal = yaw, vertical = pitch) -->
			<rect x="-1000000" y="-1000000" width="2000000" height="2000000" fill="transparent"
				style:pointer-events="auto" style:cursor="grab" onmousedown={startOrbit} />
		{/if}
		{#if active}
			<Model3dEditLayer {editor} {model} direction={src.direction} clip={src.clip ?? null} interactive={tool === 'select'} {zoom} />
		{/if}
		<!-- annotations render in real-mm; interactive (select/move) only in Select mode -->
		<AnnotationLayer editor={annEditor} interactive={active && tool === 'select'} hidden={annHidden} locked={annLocked} den={viewDen} {zoom} />
		<!-- marquee on top of everything (objects + annotations/symbols) -->
		{#if active && src.direction !== 'iso'}<MarqueeOverlay marquee={editor.marquee} {zoom} />{/if}
	</Model3dRender>
	{#if active}
		<!-- portalled out of the zoomed canvas so the panels render at normal size -->
		<div use:portal><Model3dEditPanel {editor} {model} {annEditor} bind:tool /></div>
		<!-- floating auto-fit elevation of the plan selection (drag top edge = height) -->
		{#if src.direction === 'plan' && model && editor.selIndex !== null}
			<div use:portal><Model3dElevationPreview {model} store={store} selIndex={editor.selIndex} bind:direction={elevDir} /></div>
		{/if}
	{/if}
{:else}
	<div class="flex h-full w-full items-center justify-center text-zinc-400 print:hidden" style:font-size="{14 / zoom}px">
		{src ? 'Model not found' : 'Choose a 3D model'}
	</div>
{/if}
