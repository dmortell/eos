<!-- The rack's row (under its Row field): rename it, its containment (HAC / CAC / combined — drives the rack BOM's
     accessories), and how many racks it has. One undo step per edit. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { RackRow } from '../domain/types'
	import { put as kitPut } from './propsKit'
	import InlineName from './InlineName.svelte'

	let { project, ws, rowId }: { project: CadProject; ws: Workspace; rowId: string } = $props()

	const row = $derived(project.index.get<RackRow>(rowId))
	const count = $derived(project.index.racks.filter((r) => r.rowId === rowId).length)
	const put = (label: string, patch: Partial<RackRow>) => { const r = row; if (r?.type === 'rackRow') kitPut(project.store, r, label, patch) }
</script>

{#if row?.type === 'rackRow'}
	<div class="rowbox">
		<!-- renamed by clicking its name, as in the Racks window -->
		<span><InlineName value={row.name} title="Click to rename this row" onsave={(t) => put(`Rename row ${row.name} → ${t}`, { name: t })} /> · {count} rack{count === 1 ? '' : 's'}</span>
		<label title="Aisle containment: hot (HAC), cold (CAC) or both — adds the matching caps, kits and end panels to the rack BOM">Containment
			<select value={row.containment ?? 'none'} onchange={(e) => put('Row containment', { containment: e.currentTarget.value === 'none' ? undefined : (e.currentTarget.value as RackRow['containment']) })}>
				<option value="none">none</option><option value="hac">hot aisle (HAC)</option><option value="cac">cold aisle (CAC)</option><option value="combined">both</option>
			</select></label>
	</div>
{/if}

<style>
	.rowbox { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; margin: 0 0 2px 6.75rem; font-size: 11px; color: var(--cad-muted); }
	select { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 2px; background: var(--cad-input); color: var(--cad-text); font-size: 11px; }
</style>
