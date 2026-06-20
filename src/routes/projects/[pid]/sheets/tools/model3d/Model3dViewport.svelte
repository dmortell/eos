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
	// (model layers now live in the shared sheet Layers window)

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
	$effect(() => { if (!active) editor.clearSel() })

	// Undo/redo over the whole model (objects + layers + underlays), driven off the
	// editor's change flow (touch coalesces a burst into one step).
	const history = new History()
	const snap = {
		snapshot: () => model ? $state.snapshot({ name: model.name, objects: model.objects, layers: model.layers, underlays: model.underlays }) : {},
		seed: (s: any) => { if (!model) return; model.objects = s.objects ?? []; model.layers = s.layers; model.underlays = s.underlays; if (s.name != null) model.name = s.name },
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
			const mod = e.ctrlKey || e.metaKey
			if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) history.redo(); else history.undo(); return }
			if (mod && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); e.stopPropagation(); history.redo(); return }
			if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); editor.deleteSel() }
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
		{vp} {view} {onview}
		onsvg={(el) => (editor.svg = el)}
	>
		{#snippet pre()}
			{#each underlays as u (u.id)}
				<Model3dUnderlayImage underlay={u} {store} />
			{/each}
		{/snippet}
		{#if active}
			<Model3dEditLayer {editor} {model} direction={src.direction} interactive={true} {zoom} />
		{/if}
	</Model3dRender>
	{#if active}
		<!-- portalled out of the zoomed canvas so the panels render at normal size -->
		<div use:portal><Model3dEditPanel {editor} {model} /></div>
	{/if}
{:else}
	<div class="flex h-full w-full items-center justify-center text-zinc-400 print:hidden" style:font-size="{14 / zoom}px">
		{src ? 'Model not found' : 'Choose a 3D model'}
	</div>
{/if}
