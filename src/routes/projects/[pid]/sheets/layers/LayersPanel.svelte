<script lang="ts">
	import { Window, Icon } from '$lib'
	import { portal } from '../edit/portal'
	import { LAYERS } from './layers'
	import type { ViewportEditor } from '../viewports.svelte'
	import type { SheetViewport } from '../types'

	let { vps, vp: vpOverride = null }: { vps: ViewportEditor; vp?: SheetViewport | null } = $props()
	// Layers act on the given viewport (model mode) or the active/single-selected one.
	let vp = $derived(vpOverride ?? vps.activeViewport ?? vps.selectedViewport)

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
</script>

{#if vp}
	{@const v = vp}
	<div use:portal>
		<Window title="Layers" name="sheet-layers" right={10} top={72} open class="w-64 p-2 text-zinc-700">
			<div class="mb-1 flex items-center justify-between">
				<span class="truncate text-[11px] text-zinc-500">New objects → <span class="font-medium text-zinc-700">{activeName}</span></span>
				<button class="flex items-center gap-0.5 rounded border border-zinc-300 px-1 py-0.5 text-[11px] hover:bg-zinc-100"
					title="Add a custom layer" onclick={() => startRename(vps.addCustomLayer('annotations'), 'New layer')}>
					<Icon name="plus" size={11} /> Layer
				</button>
			</div>

			{#each LAYERS as l (l.id)}
				{@const ov = v.layerOverrides?.[l.id] ?? {}}
				{@const active = vps.activeLayerId === l.id}
				<div class="flex items-center gap-1.5 py-0.5 text-xs {active ? 'rounded bg-blue-50' : ''}">
					<span class="inline-block h-3 w-3 shrink-0 rounded-sm" style:background={l.color}></span>
					<button class="flex-1 truncate text-left {ov.hidden ? 'opacity-40' : ''}" title="Make active layer (new objects go here)" onclick={() => vps.setActiveLayer(l.id)}>{l.name}</button>
					{#if active}<span class="text-[9px] font-semibold text-blue-600">ACTIVE</span>{/if}
					<button class="px-0.5 leading-none {ov.hidden ? 'opacity-30' : ''}" title="Show / hide" onclick={() => vps.setLayerOverride(v.id, l.id, { hidden: !ov.hidden })}>👁</button>
					<button class="px-0.5 leading-none {ov.locked ? 'text-red-600' : 'text-zinc-400'}" title="Lock / unlock" onclick={() => vps.setLayerOverride(v.id, l.id, { locked: !ov.locked })}>{ov.locked ? '🔒' : '🔓'}</button>
				</div>

				{#each customByBase[l.id] ?? [] as c (c.id)}
					{@const cov = v.layerOverrides?.[c.id] ?? {}}
					{@const cactive = vps.activeLayerId === c.id}
					<div class="flex items-center gap-1.5 py-0.5 pl-3 text-xs {cactive ? 'rounded bg-blue-50' : ''}">
						<span class="text-zinc-300">↳</span>
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
							<button class="px-0.5 leading-none {cov.hidden ? 'opacity-30' : ''}" title="Show / hide" onclick={() => vps.setLayerOverride(v.id, c.id, { hidden: !cov.hidden })}>👁</button>
							<button class="px-0.5 leading-none {cov.locked ? 'text-red-600' : 'text-zinc-400'}" title="Lock / unlock" onclick={() => vps.setLayerOverride(v.id, c.id, { locked: !cov.locked })}>{cov.locked ? '🔒' : '🔓'}</button>
						{/if}
					</div>
				{/each}
			{/each}
		</Window>
	</div>
{/if}
