<!-- A placed BLOCK (an insert): General (its layer) · Position (rotation, scale, Z — its height above the floor, where
     it shows in elevations — and whether it shows there) · Attributes · Block (explode it into its shapes). Deleting
     the block from the LIBRARY (every project, no undo) is the Blocks window's, not here beside the header's Delete. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Shape } from '../domain/shapes'
	import type { ViewSpec } from '../views/space'
	import { put } from './propsKit'
	import PropGroup from './PropGroup.svelte'
	import LayerPick from './LayerPick.svelte'
	import InsertAttrs from './InsertAttrs.svelte'
	import NumberField from './fields/NumberField.svelte'
	import CheckField from './fields/CheckField.svelte'

	let { project, ws, s, current }: { project: CadProject; ws: Workspace; s: Shape; /** the active pane's view: Explode shows the block as it draws it */ current?: { spec: ViewSpec } } = $props()

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
			<CheckField label="Elevations" text="show in elevations" title="Show it in elevations and sections too (a wall faceplate){b?.front ? ' — its front drawing, at the Z above' : ''}; otherwise only on the plan" checked={!!g.inElevations}
				onchange={(on) => setGeom(on ? 'Show in elevations' : 'Plan only', { inElevations: on || undefined })} />
		{/if}
	</PropGroup>
	<InsertAttrs {project} inserts={[s]} />
	{#if b}
		<PropGroup kind="block" title="Block">
			<div class="acts">
				<button class="btn" title="Replace this insert with the block's shapes, to edit them freely" onclick={() => ws.select(project.explode(s.id, current?.spec))}>Explode</button>
				<button class="lnk" title="The block library (every project): place more of it, or delete your own blocks from it (✕ on its row)" onclick={() => ws.openWindow('blocks')}>Blocks window ›</button>
			</div>
			{#if b.retired}<p class="muted">Deleted from the library (kept here)</p>{/if}
		</PropGroup>
	{/if}
{/if}

<style>
	.lnk { font-size: 11px; color: var(--cad-link, #2563eb); }
	.lnk:hover { text-decoration: underline; }
</style>
