<!-- PROPERTIES of the selection: the header (what it is, Select similar, Delete), then the kind's own Props component —
     every field inside a group (PropGroup). Several selected: one group per kind ("3 racks", "5 outlets") with the same
     inner groups as one item; each edit sets them all, one undo step. The shared field kit is propsKit.ts, ui/fields/
     and props.css. -->
<script lang="ts">
	import { KEYS } from './shellKeys'
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Entity, Sheet } from '../domain/drawing'
	import type { Outlet, Rack, Device, Cord } from '../domain/types'
	import type { Shape } from '../domain/shapes'
	import { groupSelection, ungroupSelection } from '../editor/commands'
	import { renumberable } from '../domain/renumber'
	import { selectionKinds, countsText, type SelKind } from './propsKit'
	import PropsHeader from './PropsHeader.svelte'
	import PropGroup from './PropGroup.svelte'
	import RenumberPanel from './RenumberPanel.svelte'
	import OutletProps from './OutletProps.svelte'
	import RackProps from './RackProps.svelte'
	import DeviceProps from './DeviceProps.svelte'
	import CordProps from './CordProps.svelte'
	import CordActions from './CordActions.svelte'
	import SheetProps from './SheetProps.svelte'
	import SheetMultiProps from './SheetMultiProps.svelte'
	import SectionProps from './SectionProps.svelte'
	import NoteProps from './NoteProps.svelte'
	import LegendProps from './LegendProps.svelte'
	import PathProps from './PathProps.svelte'
	import RunsMultiProps from './RunsMultiProps.svelte'
	import InsertProps from './InsertProps.svelte'
	import ShapeProps from './ShapeProps.svelte'
	import ShapesMultiProps from './ShapesMultiProps.svelte'
	import BackboneProps from './BackboneProps.svelte'
	import MakeBlock from './MakeBlock.svelte'
	import { blockProblem, frontProblem } from '../domain/blocks'
	import ViewBasics from './ViewBasics.svelte'
	import type { ViewSpec } from '../views/space'
	import RoomProps from './RoomProps.svelte'
	import RackRowProps from './RackRowProps.svelte'
	import './props.css'

	let { project, ws, current, onfloors }: {
		project: CadProject; ws: Workspace
		/** What the active pane shows: with nothing selected, its basics (a sheet's paper, a level's heights). */
		current?: { levelId?: string; spec: ViewSpec }
		onfloors?: () => void
	} = $props()

	const items = $derived(ws.selection.map((id) => project.index.get(id)).filter((e): e is Entity => !!e))
	const one = $derived(items.length === 1 ? items[0] : undefined)
	const kinds = $derived(one ? [] : selectionKinds(items))
	/** Drawn shapes in the selection (not inserts) — what "Make block" can take. */
	const blockable = $derived(items.filter((e): e is Shape => e.type === 'shape' && e.geom.kind !== 'insert' && !!e.levelId))
	const drawn = $derived(items.filter((e): e is Shape => e.type === 'shape'))
	const NOTES = new Set(['text', 'leader', 'cloud', 'dimension'])
</script>

{#snippet many(k: SelKind)}
	{#if k.key === 'outlet'}<OutletProps {project} {ws} outlets={k.items as Outlet[]} />
	{:else if k.key === 'rack'}<RackProps {project} {ws} racks={k.items as Rack[]} />
	{:else if k.key === 'device'}<DeviceProps {project} {ws} devices={k.items as Device[]} />
	{:else if k.key === 'cord'}<PropGroup kind="cord" title="Install"><CordActions {project} {ws} cords={k.items as Cord[]} column /></PropGroup>
	{:else if k.key === 'sheet'}<SheetMultiProps {project} {ws} sheets={k.items as Sheet[]} />
	{:else if k.key === 'run'}<RunsMultiProps {project} runs={k.items as Shape[]} />
	{:else if k.key === 'shape'}<ShapesMultiProps {project} shapes={k.items as Shape[]} />
	{:else}<p class="muted">{k.items.map((e) => project.index.nameOf(e.id) || e.type).join(', ')}</p>
	{/if}
{/snippet}

<div class="cad-props space-y-1 p-3 text-xs">
	{#if items.length}<PropsHeader {project} {ws} {items} />{/if}
	<!-- Renumber: the tool's panel, or a folded group for several outlets / racks / sheets (after the header, so it doesn't jump) -->
	{#if ws.toolId === 'renumber'}
		<RenumberPanel {project} {ws} open />
	{:else if items.filter(renumberable).length > 1 || (ws.renumberMode === 'replace' && items.some(renumberable))}
		<RenumberPanel {project} {ws} open={ws.renumberMode === 'replace'} />
	{/if}
	{#if !items.length}
		<ViewBasics {project} {ws} {current} {onfloors} />
	{:else if !one}
		{#each kinds as k (k.key)}
			{#if kinds.length > 1}
				<PropGroup kind="multi" id={k.key} title={countsText([[k.items.length, k.one, k.many]])}>{@render many(k)}</PropGroup>
			{:else}{@render many(k)}{/if}
		{/each}
		{#if drawn.length >= 2 || blockable.length}
			<!-- groups: shapes that select and move as one (Ctrl+G / Ctrl+Shift+G); Make block from the drawn ones -->
			<PropGroup kind="multi" title="Group and block">
				<div class="acts">
					{#if drawn.length >= 2}<button class="btn" title="Group these shapes: a click on one selects them all ({KEYS.group})" onclick={() => { const r = groupSelection(project.store, ws.selection); ws.say('problem' in r ? r.problem : `Grouped ${r.n} shapes`) }}>Group</button>{/if}
					{#if drawn.some((s) => s.groupId)}<button class="btn" title="Take these shapes out of their group ({KEYS.ungroup})" onclick={() => ws.say(`Ungrouped ${ungroupSelection(project.store, ws.selection)} shapes`)}>Ungroup</button>{/if}
				</div>
				{#if blockable.length && blockProblem(blockable) && frontProblem(blockable)}<p class="muted">{blockProblem(blockable)}</p>
				{:else}<MakeBlock {project} {ws} shapes={blockable} />{/if}
			</PropGroup>
		{/if}
	{:else if one.type === 'outlet'}
		<OutletProps {project} {ws} outlets={[one]} />
	{:else if one.type === 'rack'}
		<RackProps {project} {ws} racks={[one]} />
	{:else if one.type === 'device'}
		<DeviceProps {project} {ws} devices={[one]} />
	{:else if one.type === 'space'}
		<RoomProps {project} {ws} room={one} />
	{:else if one.type === 'rackRow'}
		<RackRowProps {project} {ws} row={one} />
	{:else if one.type === 'link' && one.kind === 'backbone'}
		<BackboneProps {project} link={one} />
	{:else if one.type === 'sheet'}
		<SheetProps {project} {ws} s={one} />
	{:else if one.type === 'cord'}
		<CordProps {project} {ws} c={one} />
	{:else if one.type === 'section'}
		<SectionProps {project} {ws} s={one} />
	{:else if one.type === 'shape' && NOTES.has(one.geom.kind)}
		<NoteProps {project} s={one} />
	{:else if one.type === 'shape' && one.geom.kind === 'legend'}
		<LegendProps {project} s={one} />
	{:else if one.type === 'shape' && one.geom.kind === 'path'}
		<PathProps {project} {ws} s={one} />
	{:else if one.type === 'shape' && one.geom.kind === 'insert'}
		<InsertProps {project} {ws} s={one} {current} />
	{:else if one.type === 'shape'}
		<ShapeProps {project} {ws} s={one} />
	{:else}
		<p class="font-semibold">{one.type}</p>
	{/if}
</div>
