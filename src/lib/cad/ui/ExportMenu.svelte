<!-- The tool bar's Export menu (split out of CadShell): outlet schedules, the plan as DXF (your hidden layers left
     out), the project BOM. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Level } from '../domain/types'
	import { exportBom } from '../render/exports'
	import { exportOutletSchedule } from '../render/outletSchedule'
	import { planDisplayList } from '../views/plan'
	import { displayListToDxf } from '../render/dxf'
	import { applyLayers } from '../views/layers'
	import { download, fileSafe } from '../render/download'

	let { project, ws, level, projectName }: { project: CadProject; ws: Workspace; level: Level | undefined; projectName: string } = $props()

	let menu: HTMLDetailsElement
	let notice = $state<string | null>(null)
	const tell = (t: string) => { notice = t; setTimeout(() => (notice = null), 5000) }

	async function outletSchedule(all: boolean) {
		try { await exportOutletSchedule(project.index, projectName, all || !level ? undefined : { id: level.id, name: level.name }) }
		catch (e) { project.error = `Excel export failed: ${(e as Error).message}` }
	}
	/** The open plan as DXF — the same display list as the screen, your hidden layers left out (floorplan images too). */
	function dxf() {
		if (!level) return
		const plan = applyLayers(planDisplayList(project.index, level.id, { scale: 100, blocks: project.blockOf }), project.index, { hidden: ws.layers.hidden, sort: true }).draw
		const r = displayListToDxf(plan, new Map(project.index.layers.filter((l) => !l.id.startsWith('sys:')).map((l) => [l.id, l.name])))
		download(r.text, `${fileSafe(projectName)}_${fileSafe(level.name)}_plan.dxf`, 'application/dxf')
		tell(`DXF: ${r.entities} entities${r.skippedImages ? ' — the floorplan PDF is not included' : ''}`)
	}
	async function bom() {
		try {
			const { PANDUIT_SEED } = await import('$lib/catalog/panduitSeed')
			tell(`BOM: ${await exportBom(project.index, projectName, PANDUIT_SEED, project.routes)} lines`)
		} catch (e) { project.error = `BOM export failed: ${(e as Error).message}` }
	}
	const run = (f: () => void) => () => { menu.open = false; f() }
</script>

<details class="menu" bind:this={menu}>
	<summary class="rounded px-2 py-0.5 hover:bg-zinc-100">Export ▾</summary>
	<div class="menu-list">
		<button onclick={run(() => outletSchedule(false))}>Outlet schedule — this level (Excel)</button>
		<button onclick={run(() => outletSchedule(true))}>Outlet schedule — all levels (Excel)</button>
		<button onclick={run(dxf)}>This plan (DXF)</button>
		<button title="Material quantities for the whole project: outlets, panels, devices, racks + accessories (Panduit), cable (routed metres + waste), cords, containment" onclick={run(bom)}>Bill of materials (Excel)</button>
	</div>
</details>
{#if notice}<span class="ml-1 text-xs text-emerald-700">{notice}</span>{/if}

<style>
	.menu { position: relative; }
	.menu summary { list-style: none; cursor: pointer; }
	.menu summary::-webkit-details-marker { display: none; }
	.menu-list { position: absolute; z-index: 30; top: 100%; left: 0; min-width: 16rem; display: flex; flex-direction: column; background: var(--cad-panel); border: 1px solid var(--cad-line); border-radius: 6px; box-shadow: 0 4px 12px rgb(0 0 0 / 0.1); padding: 4px 0; }
	.menu-list button { text-align: left; padding: 3px 10px; white-space: nowrap; }
	.menu-list button:hover { background: var(--cad-hover); }
</style>
