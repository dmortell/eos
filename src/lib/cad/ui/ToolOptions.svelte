<!-- The active tool's options (split out of CadShell): sizes and heights for runs and walls (with the level's named
     Locations for trunks / conduits, UX20), outlet / shape / dimension options, the opening's size and swing, the
     block to insert, the device template, the cord's type and color. Nothing for tools without options. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace, ToolId } from '../app/workspace.svelte'
	import type { Level } from '../domain/types'
	import type { ViewSpec } from '../views/space'
	import { sortedCableTypes } from '../domain/cableTypes'
	import { coresOf } from '../domain/multicore'
	import { RUN_PLACES, placeOf, type RunPlace } from '../domain/runEdit'
	import ColorPick from './ColorPick.svelte'
	import OutletOptions from './OutletOptions.svelte'
	import ShapeOptions from './ShapeOptions.svelte'
	import DimOptions from './DimOptions.svelte'
	import CordMode from './CordMode.svelte'

	let { project, ws, level, kind, guidesKey = '' }: {
		project: CadProject; ws: Workspace; level: Level | undefined; kind: ViewSpec['kind']
		/** The active pane's guides key: Clear takes its guides. */
		guidesKey?: string
	} = $props()

	const DRAWS = new Set<ToolId>(['line', 'trunk', 'conduit', 'wall'])

	// Location presets for a trunk / conduit (UX20, decision "Height presets" (a)): the same names as Properties
	const places = $derived(Object.keys(RUN_PLACES).map((k) => ({ k: k as RunPlace, at: placeOf(level?.heights, k as RunPlace, ws.opts.h) })).filter((x) => x.at))
	const placeNow = $derived(places.find((x) => x.at!.z === ws.opts.z)?.k ?? '')
	/** Link to…'s type is multi-core: the ports go into cables of this many cores. */
	const linkPorts = $derived((ws.bulkFrom?.ports.length ?? 0) + (ws.bulkFrom?.more ?? []).reduce((n, m) => n + m.ports.length, 0))
	const linkCores = $derived(coresOf(project.settings, ws.linkType || ws.cordDefaults.cableType))
</script>

{#if DRAWS.has(ws.toolId)}
	<span class="sep"></span>
	{#if kind === 'elevation'}
		<label class="opt" title="Where clicks land in the elevation: distance along the view direction (blank = the middle of the floor)">Depth
			<input type="number" value={ws.depth ?? ''} placeholder="auto" onchange={(e) => (ws.depth = e.currentTarget.value === '' ? null : Number(e.currentTarget.value))} /></label>
	{/if}
	{#if ws.toolId !== 'line'}
		{#if (ws.toolId === 'trunk' || ws.toolId === 'conduit') && places.length}
			<label class="opt" title="Where it runs: sets Z from the level's heights (as Properties → Location)">Location
				<select class="tpl" value={placeNow} onchange={(e) => { const p = places.find((x) => x.k === e.currentTarget.value); if (p?.at) ws.opts.z = p.at.z }}>
					<option value="">custom</option>
					{#each places as p (p.k)}<option value={p.k}>{RUN_PLACES[p.k]} (Z {p.at!.z})</option>{/each}
				</select></label>
		{/if}
		<label class="opt">Z <input type="number" bind:value={ws.opts.z} /></label>
		<label class="opt">{ws.toolId === 'conduit' ? 'Ø' : ws.toolId === 'wall' ? 'Thick' : 'W'} <input type="number" bind:value={ws.opts.w} /></label>
		{#if ws.toolId !== 'conduit'}<label class="opt">{ws.toolId === 'wall' ? 'Height' : 'H'} <input type="number" bind:value={ws.opts.h} /></label>{/if}
	{/if}
{/if}
{#if ws.toolId === 'outlet'}<OutletOptions {project} {ws} />{/if}
{#if ws.toolId === 'shape'}<ShapeOptions {ws} />{/if}
{#if ws.toolId === 'box'}<ShapeOptions {ws} box upright={kind === 'elevation' || kind === 'section'} />{/if}
{#if ws.toolId === 'dimension'}<DimOptions {ws} />{/if}
{#if ws.toolId === 'guide'}
	<!-- the Guide tool: which guides a click places; Clear takes this view's away -->
	<span class="sep"></span>
	<span class="opt">Place
		<select class="tpl" value={ws.guideAxis} title="What a click places through the point" onchange={(e) => (ws.guideAxis = e.currentTarget.value as typeof ws.guideAxis)}>
			<option value="both">both (a cross)</option><option value="v">vertical</option><option value="h">horizontal</option>
		</select></span>
	{@const n = ws.guidesOf(guidesKey).length}
	<button class="opt" disabled={!n} title="Take every guide off this view" onclick={() => { ws.setGuides(guidesKey, []); ws.say('Guides cleared from this view') }}>Clear {n || ''}</button>
{/if}
{#if ws.toolId === 'opening'}
	<span class="sep"></span>
	<label class="opt" title="Width (mm)">W <input type="number" bind:value={ws.opts.w} /></label>
	<label class="opt" title="Bottom of the hole above FFL (mm)">Z <input type="number" bind:value={ws.opts.z} /></label>
	<label class="opt" title="Height of the hole (mm)">H <input type="number" bind:value={ws.opts.h} /></label>
	<label class="opt">Swing
		<select class="tpl" value={ws.openingSwing ?? ''} onchange={(e) => (ws.openingSwing = (e.currentTarget.value || undefined) as 'left' | 'right' | undefined)}>
			<option value="">none</option><option value="left">left</option><option value="right">right</option>
		</select></label>
{/if}
{#if ws.toolId === 'insert'}
	<span class="sep"></span>
	<span class="text-xs {ws.insertBlock ? '' : 'text-amber-700'}">{ws.insertBlock ? `Block: ${ws.insertBlock.name}` : 'Pick a block in the Blocks list'}</span>
{/if}
{#if ws.toolId === 'device'}
	<span class="sep"></span>
	<label class="opt">Template
		<select class="tpl" value={ws.deviceTemplate?.id ?? ''} onchange={(e) => (ws.deviceTemplate = project.deviceTemplates.find((t) => t.id === e.currentTarget.value) ?? null)}>
			{#each project.deviceTemplates as t (t.id)}<option value={t.id}>{t.name}{t.builtin ? '' : ' ★'}</option>{/each}
		</select></label>
	{#if ws.deviceTemplate?.face === 'both'}
		<label class="opt" title="Fix a front-and-rear device (a panel) to one side only, so it can share its U with a device on the other side">Mount
			<select class="tpl" value={ws.deviceMount ?? ''} onchange={(e) => (ws.deviceMount = (e.currentTarget.value || undefined) as 'front' | 'rear' | undefined)}>
				<option value="">full depth</option><option value="front">front</option><option value="rear">rear</option>
			</select></label>
	{/if}
{/if}
{#if ws.toolId === 'cord'}
	<span class="sep"></span>
	{#if ws.bulkFrom?.kind === 'link'}
		<!-- interconnects take their own type, kept as last chosen (not the cords') -->
		<label class="opt" title="The cable type for Link to… (ties, backbone) — kept separately from the patch cords' type">Link type
			<select class="tpl" value={ws.linkType || ws.cordDefaults.cableType} onchange={(e) => (ws.linkType = e.currentTarget.value)}>
				{#each sortedCableTypes(project.settings) as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
			</select></label>
	{:else}
	<label class="opt">Type
		<select class="tpl" bind:value={ws.cordDefaults.cableType}>
			{#each sortedCableTypes(project.settings) as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
			{#if !(project.settings?.cableTypes ?? []).some((t) => t.id === ws.cordDefaults.cableType)}<option value={ws.cordDefaults.cableType}>{ws.cordDefaults.cableType}</option>{/if}
		</select></label>
	{/if}
	{#if ws.bulkFrom?.kind !== 'link'}<span class="opt" role="group" aria-label="Color">Color <ColorPick value={ws.cordDefaults.colour} onchange={(v) => { if (v) ws.cordDefaults.colour = v }} /></span>
		<span class="opt" title="What new cords start as: ADD (planning) or INSTALLED (surveying a built site) — a project setting">New cords <CordMode {project} /></span>{/if}
	{#if ws.bulkFrom}<span class="ml-2 text-xs text-blue-700">{ws.bulkFrom.kind === 'link' ? `Link ${linkPorts} port(s) from ${project.index.nameOf(ws.bulkFrom.on)}${ws.bulkFrom.more?.length ? ` + ${ws.bulkFrom.more.length} more panel(s)` : ''}${linkCores > 1 ? ` in ${Math.ceil(linkPorts / linkCores)} × ${linkCores}-core cable(s)` : ''} — open the other room's rack view (any floor) and click the first port · Esc cancels` : `Bulk: ${ws.bulkFrom.ports.length} port(s) — click the first port to patch them to (${ws.patchFill ? 'filling free ports' : 'in step'}; Ctrl-click: ${ws.patchFill ? 'in step' : 'fill free ports'}) · Esc cancels`}</span>{/if}
{/if}

<style>
	.sep { display: inline-block; margin: 0 8px; height: 1.25rem; width: 1px; background: var(--cad-line); vertical-align: middle; }
	.opt { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--cad-muted); margin-left: 6px; }
	.opt input { width: 4.5rem; border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 4px; background: var(--cad-input); color: var(--cad-text); }
	.opt select.tpl { max-width: 13rem; border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 2px; font-size: 12px; background: var(--cad-input); color: var(--cad-text); }
</style>
