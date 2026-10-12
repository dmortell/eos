<!-- A placed BLOCK (an insert): General (its layer) · Position (rotation, scale, Z — its height above the floor, where
     it shows in elevations — and whether it shows there) · Attributes · Block (explode it into its shapes). -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Shape } from '../domain/shapes'
	import { put } from './propsKit'
	import PropGroup from './PropGroup.svelte'
	import LayerPick from './LayerPick.svelte'
	import InsertAttrs from './InsertAttrs.svelte'
	import NumberField from './fields/NumberField.svelte'
	import CheckField from './fields/CheckField.svelte'

	let { project, ws, s }: { project: CadProject; ws: Workspace; s: Shape } = $props()

	const g = $derived(s.geom.kind === 'insert' ? s.geom : null)
	const b = $derived(g ? project.blockOf(g.blockId) : undefined)
	const setGeom = (label: string, patch: Record<string, unknown>) => put(project.store, s, label, { geom: { ...s.geom, ...patch } as Shape['geom'] })
</script>

{#if g}
	<PropGroup kind="block" title="General">
		{#if !b}<p class="text-red-600">The block is missing</p>{/if}
		<LayerPick {project} ids={[s.id]} />
	</PropGroup>
	<PropGroup kind="block" title="Position">
		<NumberField label="Rotation" unit="°" title="Turned clockwise" value={g.rot ?? 0} onchange={(v) => setGeom('Rotate', { rot: v || undefined })} />
		<NumberField label="Scale" step={0.1} value={g.scale ?? 1} onchange={(v) => v != null && v > 0 && setGeom('Scale', { scale: v === 1 ? undefined : v })} />
		<NumberField label="Z" unit="mm" step={50} title="Its height above the floor (FFL): where it shows in elevations and sections" value={g.z ?? 0} onchange={(v) => setGeom('Block height', { z: v || undefined })} />
		{#if s.levelId}
			<CheckField label="Elevations" text="show in elevations" title="Show it in elevations and sections too (a wall faceplate); otherwise only on the plan" checked={!!g.inElevations}
				onchange={(on) => setGeom(on ? 'Show in elevations' : 'Plan only', { inElevations: on || undefined })} />
		{/if}
	</PropGroup>
	<InsertAttrs {project} inserts={[s]} />
	{#if b}
		<PropGroup kind="block" title="Block">
			<div class="acts"><button class="btn" title="Replace this insert with the block's shapes, to edit them freely" onclick={() => ws.select(project.explode(s.id))}>Explode</button></div>
			{#if !b.builtin && !b.retired}
				<div class="acts"><button class="btn del" title="Delete the block from the library (all projects): it can't be picked any more, but drawings that use it keep it"
					onclick={() => ws.ask2(`Delete block ${b.name} from the library (every project)? Inserts already placed keep drawing it. This can't be undone.`, 'Delete block', () => project.retireBlock(b.id))}>Delete block…</button></div>
			{:else if b.retired}<p class="muted">Deleted from the library (kept here)</p>{/if}
		</PropGroup>
	{/if}
{/if}
