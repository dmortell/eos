<!-- A ROW of racks picked in the Navigator: its name, containment (HAC / CAC / both — the rack BOM's accessories) and its
     racks (a click selects one); its room is a link. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { RackRow } from '../domain/types'
	import { racksInOrder } from '../domain/devices'
	import { put } from './propsKit'
	import PropGroup from './PropGroup.svelte'
	import TextField from './fields/TextField.svelte'
	import SelectField from './fields/SelectField.svelte'

	let { project, ws, row }: { project: CadProject; ws: Workspace; row: RackRow } = $props()

	const room = $derived(project.index.get(row.spaceId))
	const racks = $derived(racksInOrder(project.index, row.spaceId, row.id))
	const CONT: [string, string][] = [['none', 'none'], ['hac', 'hot aisle (HAC)'], ['cac', 'cold aisle (CAC)'], ['combined', 'both']]
</script>

<PropGroup kind="row" title="General">
	<TextField label="Name" value={row.name} onchange={(v) => v && v !== row.name && put(project.store, row, `Rename row ${row.name} → ${v}`, { name: v })} />
	<SelectField label="Containment" title="Aisle containment: hot (HAC), cold (CAC) or both — adds the matching caps, kits and end panels to the rack BOM" value={row.containment ?? 'none'} options={CONT}
		onchange={(v) => put(project.store, row, 'Row containment', { containment: v === 'none' ? undefined : (v as RackRow['containment']) })} />
	{#if room?.type === 'space'}<div class="acts ind"><button class="lnk" title="Select the room: its floor, ceiling and rows" onclick={() => ws.select([room.id])}>Room {room.name} ›</button></div>{/if}
</PropGroup>
<PropGroup kind="row" title="Racks">
	{#each racks as r (r.id)}
		<button class="lnk blk" title="Select this rack" onclick={() => ws.select([r.id])}>{r.name || r.kind}{r.at ? '' : ' (not on the plan)'}</button>
	{:else}
		<p class="muted">No racks in this row — set a rack's Row to put it here</p>
	{/each}
	{#if room?.type === 'space'}
		<div class="acts"><button class="btn" title="This row's rack view in the active pane" onclick={() => ws.openInTab({ levelId: room.levelId, spec: { kind: 'row', spaceId: room.id, face: 'front', rowId: row.id } })}>Open row view</button></div>
	{/if}
</PropGroup>

<style>
	.lnk { color: var(--cad-link, #2563eb); text-align: left; }
	.lnk:hover { text-decoration: underline; }
	.blk { display: block; }
</style>
