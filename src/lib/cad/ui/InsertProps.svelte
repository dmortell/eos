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
	import type { Sheet } from '../domain/drawing'
	import { linkUrl } from '../domain/links'
	import { is3d } from '../domain/blocks'
	import { enterKey } from './keyGuards'

	let { project, ws, s, current }: { project: CadProject; ws: Workspace; s: Shape; /** the active pane's view: Explode shows the block as it draws it */ current?: { spec: ViewSpec } } = $props()

	const g = $derived(s.geom.kind === 'insert' ? s.geom : null)
	const b = $derived(g ? project.blockOf(g.blockId) : undefined)
	const setGeom = (label: string, patch: Record<string, unknown>) => put(project.store, s, label, { geom: { ...s.geom, ...patch } as Shape['geom'] })
	// a link: the sheet or web page a double-click on this marker opens (each insert has its own)
	const sheets = $derived((project.index.ofType('sheet') as Sheet[]).filter((x) => x.status !== 'archived' || g?.link?.kind === 'sheet' && g.link.sheetId === x.id).sort((a, c) => a.order - c.order))
	const link = $derived(g?.link)
	const linkKind = $derived(link?.kind ?? 'none')
	let urlText = $state(''), urlBad = $state(false)
	$effect(() => { urlText = link?.kind === 'url' ? link.url : ''; urlBad = false })
	function setKind(k: string) {
		if (k === 'sheet') { const first = sheets[0]; if (first) setGeom('Link to a sheet', { link: { kind: 'sheet', sheetId: first.id } }); else ws.say('No sheet to link to yet') }
		else if (k === 'url') { urlText = ''; urlBad = false; ws.say('Type the web address, then Enter') }
		else setGeom('Remove link', { link: undefined })
	}
	function saveUrl() {
		const u = linkUrl(urlText)
		urlBad = !!urlText.trim() && !u
		if (u) setGeom('Link to a web page', { link: { kind: 'url', url: u } })
		else if (!urlText.trim()) setGeom('Remove link', { link: undefined })
	}
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
		{#if s.levelId && b && is3d(b)}
			<p class="muted" title="Its boxes are model: every plan, elevation and section shows them">3D: in every plan, elevation and section</p>
		{:else if s.levelId}
			<CheckField label="Elevations" text="show in elevations" title="Show it in elevations and sections too (a wall faceplate), at the Z above; otherwise only on the plan" checked={!!g.inElevations}
				onchange={(on) => setGeom(on ? 'Show in elevations' : 'Plan only', { inElevations: on || undefined })} />
		{/if}
	</PropGroup>
	<InsertAttrs {project} inserts={[s]} />
	<PropGroup kind="block" title="Link">
		<label class="row" title="A double-click on this marker opens it: a sheet in a tab, a web page in a new browser tab">Opens
			<select class="inp" value={linkKind} onchange={(e) => setKind(e.currentTarget.value)}>
				<option value="none">Nothing</option><option value="sheet">A sheet</option><option value="url">A web page</option>
			</select></label>
		{#if link?.kind === 'sheet'}
			<label class="row">Sheet
				<select class="inp" value={link.sheetId} onchange={(e) => setGeom('Link to a sheet', { link: { kind: 'sheet', sheetId: e.currentTarget.value } })}>
					{#each sheets as x (x.id)}<option value={x.id}>{x.number} {x.title}</option>{/each}
					{#if !sheets.some((x) => x.id === link.sheetId)}<option value={link.sheetId}>(sheet gone)</option>{/if}
				</select></label>
		{/if}
		{#if linkKind === 'url'}
			<label class="row">Address
				<input class="inp" class:bad={urlBad} bind:value={urlText} placeholder="https://…" aria-label="Web address" title={urlBad ? 'Not a web address we open (http, https or mailto)' : 'Enter saves it; blank removes the link'}
					onkeydown={(e) => enterKey(e) && saveUrl()} onblur={saveUrl} /></label>
		{/if}
		{#if link}<div class="acts"><button class="btn" title="Open it now (a double-click on the marker does the same)" onclick={() => (link.kind === 'sheet' && !project.index.get(link.sheetId) ? ws.say('The linked sheet is gone') : ws.openLink(link))}>Open</button></div>{/if}
	</PropGroup>
	{#if b}
		<PropGroup kind="block" title="Block">
			<div class="acts">
				<button class="btn" title="Replace this insert with the block's shapes, to edit them freely" onclick={() => ws.select(project.explode(s.id, current?.spec))}>Explode</button>
				<button class="lnk" title="The block library (every project): place more of it, or delete your own blocks from it (✕ on its row)" onclick={() => ws.openWindow('blocks')}>Blocks window ›</button>
			</div>
			{#if b.retired}<p class="muted">Deleted from the library (kept here)</p>{/if}
			<!-- the product the block stands for: its spec sheet, on the BLOCK (every insert, every project); built-ins have none -->
			{#if !b.builtin}
				<label class="row" title="A link to the product's data sheet — saved on the block in the library (every project); blank removes it">Spec sheet
					<input class="inp" value={b.productUrl ?? ''} placeholder="https://…" onchange={(e) => { const v = e.currentTarget.value; void project.setBlockUrl(b.id, v).catch((x) => (project.error = `Couldn't save it: ${(x as Error).message}`)) }} /></label>
			{/if}
			{#if b.productUrl}<p class="muted"><a class="lnk" href={b.productUrl} target="_blank" rel="noopener noreferrer">Open the spec sheet ↗</a></p>{/if}
		</PropGroup>
	{/if}
{/if}

<style>
	.bad { outline: 1px solid #dc2626; }
	.lnk { font-size: 11px; color: var(--cad-link, #2563eb); }
	.lnk:hover { text-decoration: underline; }
</style>
