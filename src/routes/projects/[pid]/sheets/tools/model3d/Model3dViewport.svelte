<script lang="ts">
	import { getContext } from 'svelte'
	import { page } from '$app/state'
	import type { Firestore } from '$lib/db.svelte'
	import type { SheetViewport } from '../../types'
	import type { ViewportEditor } from '../../viewports.svelte'
	import { modelStore } from './models.svelte'
	import Model3dRender from './Model3dRender.svelte'

	// Host for a `model3d` viewport source: resolves the referenced 3D model and
	// renders its projection (read-only for now; in-place editing comes next).
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
</script>

{#if src && model}
	<Model3dRender
		{model}
		direction={src.direction}
		yaw={src.yaw}
		pitch={src.pitch}
		hiddenLines={src.hiddenLines ?? true}
		{vp} {view} {onview}
	/>
{:else}
	<div class="flex h-full w-full items-center justify-center text-zinc-400 print:hidden" style:font-size="{14 / zoom}px">
		{src ? 'Model not found' : 'Choose a 3D model'}
	</div>
{/if}
