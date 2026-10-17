<!-- A CHANGE LIST's properties (design log step 2): its title and text size, and what it lists — this round's changes
     linked to its package's sheets. The rows come from the Log; edit them there. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Shape } from '../domain/shapes'
	import type { DesignChange, SheetPackage } from '../domain/drawing'
	import { currentCycle, listChanges, listSheets } from '../domain/changes'
	import { put as kitPut, num } from './propsKit'
	import PropGroup from './PropGroup.svelte'
	import LayerPick from './LayerPick.svelte'

	let { project, ws, s }: { project: CadProject; ws: Workspace; s: Shape } = $props()

	const g = $derived(s.geom.kind === 'changeList' ? s.geom : null)
	const setGeom = (label: string, patch: Record<string, unknown>) => kitPut(project.store, s, label, { geom: { ...s.geom, ...patch } as Shape['geom'] })
	const all = $derived(project.index.ofType('change') as DesignChange[])
	const sheets = $derived(s.sheetId ? listSheets(project.index.ofType('package') as SheetPackage[], s.sheetId) : [])
	const rows = $derived(listChanges(all, sheets, currentCycle(all, project.settings?.changeCycle)))
	const sheetNames = $derived(sheets.map((id) => { const x = project.index.get(id); return x?.type === 'sheet' ? x.number || x.title : '' }).filter(Boolean).join(', '))
</script>

{#if g}
<PropGroup kind="changelist" title="Change list">
	<label class="row">Title <input class="inp" value={g.title ?? ''} placeholder="CHANGES" onchange={(e) => setGeom('Change list title', { title: e.currentTarget.value.trim() || undefined })} /></label>
	<label class="row">Text (mm) <input class="inp" type="number" min="1" step="0.5" value={g.sizeMm ?? 2.5} onchange={(e) => num(e.currentTarget.value) && setGeom('Change list size', { sizeMm: Math.max(1, Number(e.currentTarget.value)) })} /></label>
	<p class="muted">{rows.length} change{rows.length === 1 ? '' : 's'} of this round linked to {sheets.length > 1 ? `its package’s sheets (${sheetNames})` : 'this sheet'} — No · What, from the Log. Rejected / superseded ones are left off; a release that numbers from 1 again starts it empty.</p>
	<div class="acts"><button class="btn" onclick={() => ws.openLog()}>Log ›</button></div>
	<LayerPick {project} ids={[s.id]} />
</PropGroup>
{/if}

<style>
	.row { display: grid; grid-template-columns: 5rem 1fr; align-items: center; gap: 4px; margin-bottom: 3px; }
	.acts { display: flex; gap: 4px; margin: 4px 0; }
</style>
