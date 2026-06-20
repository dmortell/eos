<script lang="ts">
	import { getContext } from 'svelte'
	import { page } from '$app/state'
	import { Window, Icon } from '$lib'
	import type { Firestore } from '$lib/db.svelte'
	import { portal } from '../edit/portal'
	import { LAYERS } from './layers'
	import { modelStore } from '../tools/model3d/models.svelte'
	import type { ViewportEditor } from '../viewports.svelte'
	import type { SheetViewport } from '../types'

	let { vps, vp: vpOverride = null }: { vps: ViewportEditor; vp?: SheetViewport | null } = $props()
	// Layers act on the given viewport (model mode) or the active/single-selected one.
	let vp = $derived(vpOverride ?? vps.activeViewport ?? vps.selectedViewport)

	// ── model3d viewport: show the *model's* layers (names/colours owned by the
	// model) with per-viewport visibility/lock (stored as viewport layerOverrides,
	// like AutoCAD layer state per layout). B/W = a monochrome display toggle.
	const db = getContext('db') as Firestore
	const pid = $derived(page.params.pid ?? '')
	const m3d = $derived(vp?.source.kind === 'model3d' ? vp.source : null)
	const m3dStore = $derived(m3d ? modelStore(db, pid) : null)
	const m3dModel = $derived(m3d && m3dStore ? m3dStore.models.find((x) => x.id === m3d.modelId) ?? null : null)
	const mUid = () => `L${Math.random().toString(36).slice(2, 8)}`
	function addModelLayer() {
		if (!m3dModel || !m3dStore) return
		m3dModel.layers ??= []
		m3dModel.layers.push({ id: mUid(), name: `Layer ${m3dModel.layers.length + 1}`, color: '#888888', visible: true, locked: false })
		m3dStore.save()
	}
	function delModelLayer(id: string) { if (m3dModel && m3dStore) { m3dModel.layers = (m3dModel.layers ?? []).filter((l) => l.id !== id); m3dStore.save() } }
	function toggleBw() { if (vp && vp.source.kind === 'model3d') { vp.source.bw = !vp.source.bw; vps.notify() } }
	// Sheet annotation layers (Annotations + customs under it) — shared across all
	// viewports, stored in the sheet doc. Shown read-only in the model3d window so
	// annotations placed here can be hidden/locked per viewport, alongside model layers.
	const m3dAnnLayers = $derived(vps.allLayers.filter((l) => l.id === 'annotations' || l.base === 'annotations'))

	// Custom layers grouped under the default layer they're filed below (their category).
	let customByBase = $derived.by(() => {
		const m: Record<string, typeof vps.customLayers> = {}
		for (const l of vps.customLayers) (m[l.base ?? 'annotations'] ??= []).push(l)
		return m
	})
	let activeName = $derived(vps.allLayers.find(l => l.id === vps.activeLayerId)?.name ?? 'Annotations')

	// Inline rename of a custom layer.
	let editingId = $state<string | null>(null)
	let nameBuf = $state('')
	function startRename(id: string, name: string) { editingId = id; nameBuf = name }
	function commitRename() { if (editingId) { vps.renameLayer(editingId, nameBuf.trim() || 'Layer'); editingId = null } }
	let confirmDelete = $state<string | null>(null)

	// Drag a custom layer onto a default-layer header to recategorise it (5a7).
	let dragId = $state<string | null>(null)
	let dragOverBase = $state<string | null>(null)
	function dropOnBase(base: string) {
		if (dragId) vps.setLayerBase(dragId, base)
		dragId = null; dragOverBase = null
	}
</script>

{#if vp}
	{@const v = vp}
	<div use:portal>
		<Window title="Layers" name="sheet-layers" right={10} top={72} open class="w-64 p-2 text-zinc-700">
			{#if m3d && m3dModel}
				<!-- Model3d: model layers, per-viewport visibility/lock -->
				<div class="mb-1 flex items-center justify-between gap-2">
					<label class="flex items-center gap-1 text-[11px] text-zinc-600" title="Render this view in black & white (like a monochrome plot style)">
						<input type="checkbox" checked={m3d.bw ?? false} onchange={toggleBw} /> B / W
					</label>
					<button class="flex items-center gap-0.5 rounded border border-zinc-300 px-1 py-0.5 text-[11px] hover:bg-zinc-100" title="Add a model layer" onclick={addModelLayer}>
						<Icon name="plus" size={11} /> Layer
					</button>
				</div>
				{#each m3dModel.layers ?? [] as l (l.id)}
					{@const ov = v.layerOverrides?.[l.id] ?? {}}
					<div class="flex items-center gap-1.5 py-0.5 text-xs">
						<label class="relative inline-block h-3 w-3 shrink-0 cursor-pointer rounded-sm ring-1 ring-zinc-300" style:background={l.color} title="Colour">
							<input type="color" class="absolute inset-0 h-full w-full cursor-pointer opacity-0" value={l.color}
								oninput={(e) => { l.color = (e.currentTarget as HTMLInputElement).value; m3dStore?.save() }} />
						</label>
						<input class="min-w-0 flex-1 rounded border-transparent bg-transparent px-1 py-0.5 hover:border-zinc-200 focus:border-zinc-300 {ov.hidden ? 'opacity-40' : ''}"
							value={l.name} oninput={(e) => { l.name = (e.currentTarget as HTMLInputElement).value; m3dStore?.save() }} />
						<button class="shrink-0 rounded p-0.5 {ov.hidden ? 'text-blue-600' : 'text-zinc-600'} hover:bg-zinc-100" title="Show / hide (this view)" onclick={() => vps.setLayerOverride(v.id, l.id, { hidden: !ov.hidden })}>
							<Icon name={ov.hidden ? 'eyeSlash' : 'eye'} size={14} />
						</button>
						<button class="shrink-0 rounded p-0.5 hover:bg-zinc-100 {ov.locked ? 'text-red-600' : 'text-zinc-500'}" title="Lock / unlock (this view)" onclick={() => vps.setLayerOverride(v.id, l.id, { locked: !ov.locked })}>
							<Icon name={ov.locked ? 'lock' : 'lockOpen'} size={14} />
						</button>
						<button class="shrink-0 text-zinc-300 hover:text-red-500 disabled:opacity-30" title="Delete layer" disabled={(m3dModel.layers?.length ?? 0) <= 1} onclick={() => delModelLayer(l.id)}>
							<Icon name="trash" size={12} />
						</button>
					</div>
				{/each}

				<!-- Sheet annotation layers (shared) — visibility/lock per viewport -->
				{#if m3dAnnLayers.length}
					<div class="mb-0.5 mt-1.5 border-t border-zinc-100 pt-1 text-[10px] font-medium uppercase tracking-wide text-zinc-400">Annotations</div>
					{#each m3dAnnLayers as l (l.id)}
						{@const ov = v.layerOverrides?.[l.id] ?? {}}
						<div class="flex items-center gap-1.5 py-0.5 text-xs">
							<span class="inline-block h-3 w-3 shrink-0 rounded-sm ring-1 ring-zinc-300" style:background={l.color}></span>
							<span class="min-w-0 flex-1 truncate px-1 {ov.hidden ? 'opacity-40' : ''}">{l.name}</span>
							<button class="shrink-0 rounded p-0.5 {ov.hidden ? 'text-blue-600' : 'text-zinc-600'} hover:bg-zinc-100" title="Show / hide (this view)" onclick={() => vps.setLayerOverride(v.id, l.id, { hidden: !ov.hidden })}>
								<Icon name={ov.hidden ? 'eyeSlash' : 'eye'} size={14} />
							</button>
							<button class="shrink-0 rounded p-0.5 hover:bg-zinc-100 {ov.locked ? 'text-red-600' : 'text-zinc-500'}" title="Lock / unlock (this view)" onclick={() => vps.setLayerOverride(v.id, l.id, { locked: !ov.locked })}>
								<Icon name={ov.locked ? 'lock' : 'lockOpen'} size={14} />
							</button>
						</div>
					{/each}
				{/if}
			{:else}
			<div class="mb-1 flex items-center justify-between">
				<span class="truncate text-[11px] text-zinc-500">New objects → <span class="font-medium text-zinc-700">{activeName}</span></span>
				<button class="flex items-center gap-0.5 rounded border border-zinc-300 px-1 py-0.5 text-[11px] hover:bg-zinc-100"
					title="Add a custom layer (under the active layer's group)" onclick={() => startRename(vps.addCustomLayer(), 'New layer')}>
					<Icon name="plus" size={11} /> Layer
				</button>
			</div>

			{#each LAYERS as l (l.id)}
				{@const ov = v.layerOverrides?.[l.id] ?? {}}
				{@const active = vps.activeLayerId === l.id}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="flex items-center gap-1.5 py-0.5 text-xs {dragOverBase === l.id ? 'rounded bg-emerald-100 ring-1 ring-emerald-400' : active ? 'rounded bg-blue-50' : ''}"
					ondragover={(e: DragEvent) => { if (dragId) { e.preventDefault(); dragOverBase = l.id } }}
					ondragleave={() => { if (dragOverBase === l.id) dragOverBase = null }}
					ondrop={(e: DragEvent) => { e.preventDefault(); dropOnBase(l.id) }}>
					<span class="inline-block h-3 w-3 shrink-0 rounded-sm" style:background={l.color}></span>
					<button class="flex-1 truncate text-left {ov.hidden ? 'opacity-40' : ''}" title="Make active layer (new objects go here)" onclick={() => vps.setActiveLayer(l.id)}>{l.name}</button>
					{#if active}<span class="text-[9px] font-semibold text-blue-600">ACTIVE</span>{/if}
					<button class="shrink-0 rounded p-0.5 text-zinc-600 hover:bg-zinc-100 {ov.hidden ? 'opacity-30' : ''}" title="Show / hide" onclick={() => vps.setLayerOverride(v.id, l.id, { hidden: !ov.hidden })}>
						<Icon name={ov.hidden ? 'eyeSlash' : 'eye'} size={14} />
					</button>
					<button class="shrink-0 rounded p-0.5 hover:bg-zinc-100 {ov.locked ? 'text-red-600' : 'text-zinc-500'}" title="Lock / unlock" onclick={() => vps.setLayerOverride(v.id, l.id, { locked: !ov.locked })}>
						<Icon name={ov.locked ? 'lock' : 'lockOpen'} size={14} />
					</button>
				</div>

				{#each customByBase[l.id] ?? [] as c (c.id)}
					{@const cov = v.layerOverrides?.[c.id] ?? {}}
					{@const cactive = vps.activeLayerId === c.id}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="flex items-center gap-1.5 py-0.5 pl-3 text-xs {cactive ? 'rounded bg-blue-50' : ''} {dragId === c.id ? 'opacity-40' : ''}"
						draggable={editingId !== c.id}
						ondragstart={() => (dragId = c.id)}
						ondragend={() => { dragId = null; dragOverBase = null }}>
						<Icon name="grip" size={11} class="shrink-0 cursor-grab text-zinc-300" />
						<span class="inline-block h-3 w-3 shrink-0 rounded-sm" style:background={c.color}></span>
						{#if editingId === c.id}
							<input class="min-w-0 flex-1 rounded border border-blue-400 bg-white px-1 py-0.5 text-xs"
								bind:value={nameBuf} onkeydown={e => { if (e.key === 'Enter') commitRename(); else if (e.key === 'Escape') editingId = null }}
								onblur={commitRename} />
						{:else}
							<button class="min-w-0 flex-1 truncate text-left {cov.hidden ? 'opacity-40' : ''}" title="Make active layer" onclick={() => vps.setActiveLayer(c.id)}>{c.name}</button>
							{#if cactive}<span class="text-[9px] font-semibold text-blue-600">ACTIVE</span>{/if}
							<button class="text-zinc-400 hover:text-blue-600" title="Rename" onclick={() => startRename(c.id, c.name)}><Icon name="edit" size={11} /></button>
							{#if confirmDelete === c.id}
								<button class="rounded bg-red-600 px-1 text-[10px] leading-tight text-white" title="Confirm delete" onclick={() => { vps.deleteLayer(c.id); confirmDelete = null }}>Del</button>
							{:else}
								<button class="text-zinc-300 hover:text-red-500" title="Delete layer" onclick={() => confirmDelete = c.id}><Icon name="trash" size={11} /></button>
							{/if}
							<button class="shrink-0 rounded p-0.5 text-zinc-600 hover:bg-zinc-100 {cov.hidden ? 'opacity-30' : ''}" title="Show / hide" onclick={() => vps.setLayerOverride(v.id, c.id, { hidden: !cov.hidden })}>
								<Icon name={cov.hidden ? 'eyeSlash' : 'eye'} size={14} />
							</button>
							<button class="shrink-0 rounded p-0.5 hover:bg-zinc-100 {cov.locked ? 'text-red-600' : 'text-zinc-500'}" title="Lock / unlock" onclick={() => vps.setLayerOverride(v.id, c.id, { locked: !cov.locked })}>
								<Icon name={cov.locked ? 'lock' : 'lockOpen'} size={14} />
							</button>
						{/if}
					</div>
				{/each}
			{/each}
			{/if}
		</Window>
	</div>
{/if}
