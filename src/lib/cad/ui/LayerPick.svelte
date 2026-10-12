<!-- Properties → Layer: which layer the selected items are on, and moving them to another (shapes, outlets, racks).
     Picking an item's own default layer clears its `layerId` (it follows its kind again). -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Id } from '../domain/types'
	import type { Entity } from '../domain/drawing'
	import { layersOf, layerOf, defaultLayer } from '../domain/layers'
	import { MIXED } from './propsKit'

	let { project, ids }: { project: CadProject; ids: Id[] } = $props()

	const layers = $derived(layersOf(project.index.layers))
	const items = $derived(ids.map((id) => project.index.get(id)).filter((e): e is Entity => e?.type === 'shape' || e?.type === 'outlet' || e?.type === 'rack'))
	const on = $derived.by(() => {
		const known = new Set(layers.map((l) => l.id))
		const now = new Set(items.map((e) => layerOf(e, known)))
		return now.size === 1 ? [...now][0] ?? '' : ''
	})

	function move(id: Id): void {
		const name = layers.find((l) => l.id === id)?.name ?? id
		project.store.transact(`Move ${items.length === 1 ? '1 item' : `${items.length} items`} to ${name}`, (tx) => {
			for (const e of items) {
				const { layerId: _, ...rest } = e as Entity & { layerId?: Id }
				tx.put((id === defaultLayer(e) ? rest : { ...rest, layerId: id }) as Entity)
			}
		})
	}
</script>

{#if items.length}
	<label class="row" title="The layer it's on — pick another to move {items.length === 1 ? 'it' : 'them'}">
		<span>Layer</span>
		<select value={on} onchange={(e) => move((e.currentTarget as HTMLSelectElement).value)}>
			{#if !on}<option value="" disabled>{MIXED}</option>{/if}
			{#each layers as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
		</select>
	</label>
{/if}

<style>
	/* the same row and box as the Properties fields beside it (Kind, Label …) */
	.row { display: grid; grid-template-columns: 6.5rem 1fr; align-items: center; gap: 0.25rem; }
	select { width: 100%; border: 1px solid var(--cad-line); border-radius: 4px; padding: 1px 4px; background: var(--cad-input); color: var(--cad-text); }
</style>
