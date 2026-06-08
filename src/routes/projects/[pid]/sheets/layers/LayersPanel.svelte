<script lang="ts">
	import { Window } from '$lib'
	import { portal } from '../edit/portal'
	import { LAYERS } from './layers'
	import type { ViewportEditor } from '../viewports.svelte'

	import type { SheetViewport } from '../types'
	let { vps, vp: vpOverride = null }: { vps: ViewportEditor; vp?: SheetViewport | null } = $props()
	// Layers act on the given viewport (model mode) or the active/single-selected one.
	let vp = $derived(vpOverride ?? vps.activeViewport ?? vps.selectedViewport)
</script>

{#if vp}
	{@const v = vp}
	<div use:portal>
		<Window title="Layers" name="sheet-layers" right={10} top={72} open class="w-56 p-2 text-zinc-700">
			{#each LAYERS as l (l.id)}
				{@const ov = v.layerOverrides?.[l.id] ?? {}}
				<div class="flex items-center gap-2 py-0.5 text-xs">
					<span class="inline-block h-3 w-3 shrink-0 rounded-sm" style:background={l.color}></span>
					<span class="flex-1 truncate" class:opacity-40={ov.hidden}>{l.name}</span>
					<button class="px-1 leading-none {ov.hidden ? 'opacity-30' : ''}" title="Show / hide"
						onclick={() => vps.setLayerOverride(v.id, l.id, { hidden: !ov.hidden })}>👁</button>
					<button class="px-1 leading-none {ov.locked ? 'text-red-600' : 'text-zinc-400'}" title="Lock / unlock"
						onclick={() => vps.setLayerOverride(v.id, l.id, { locked: !ov.locked })}>{ov.locked ? '🔒' : '🔓'}</button>
				</div>
			{/each}
		</Window>
	</div>
{/if}
