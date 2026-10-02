<!-- The racks of the open level, by server room. A rack not yet on the plan has "Place" (the next click puts it
     there); a placed rack is selected by clicking its name. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Rack } from '../domain/types'
	import { naturalCompare } from '../domain/labels'
	import type { ViewSpec } from '../views/space'

	let { project, ws, levelId, onview }: { project: CadProject; ws: Workspace; levelId: string; onview?: (s: ViewSpec) => void } = $props()

	const groups = $derived.by(() => {
		const racks = project.index.racks.filter((r) => r.levelId === levelId)
		const by = new Map<string, Rack[]>()
		for (const r of racks) by.set(r.spaceId, [...(by.get(r.spaceId) ?? []), r])
		return [...by].map(([space, rs]) => ({
			space,
			name: project.index.nameOf(space) || 'No room',
			racks: rs.sort((a, b) => Number(!!a.at) - Number(!!b.at) || a.order - b.order || naturalCompare(a.name, b.name)),
		})).sort((a, b) => naturalCompare(a.name, b.name))
	})
	const selected = $derived(new Set(ws.selection))
</script>

{#if groups.length}
	<p class="mt-3 px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Racks</p>
	{#each groups as g (g.name)}
		<div class="room">
			<span>{g.name}</span>
			{#if onview}<button class="place" title="Open this room's racks as an elevation (front / rear) in the active pane" onclick={() => onview({ kind: 'row', spaceId: g.space, face: 'front' })}>Elevation</button>{/if}
		</div>
		{#each g.racks as r (r.id)}
			<div class="rack" class:sel={selected.has(r.id)}>
				<button class="name" onclick={() => ws.select([r.id])} title="{project.index.devicesIn(r.id).length} devices · {r.heightU}U">{r.name}</button>
				{#if !r.at}
					<button class="place" class:armed={ws.toolId === 'rack' && ws.rackTool.target === r.id} onclick={() => ws.placeRack(r.id)}>Place</button>
				{/if}
			</div>
		{/each}
	{/each}
{/if}

<style>
	.room { display: flex; align-items: center; justify-content: space-between; padding: 4px 4px 0; font-size: 11px; color: #a1a1aa; }
	.rack { display: flex; align-items: center; justify-content: space-between; border-radius: 4px; padding: 0 4px; font-size: 12px; }
	.rack:hover { background: #f4f4f5; }
	.rack.sel { background: #fef3c7; }
	.name { text-align: left; flex: 1; padding: 1px 4px; }
	.place { font-size: 11px; color: #2563eb; padding: 0 4px; border-radius: 3px; }
	.place:hover, .place.armed { background: #dbeafe; }
</style>
