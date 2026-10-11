<!-- EXPORTS (was the tool bar's Export menu; now File → Export in the menu bar, UX review S4): outlet schedules, the
     open plan as DXF (your hidden layers left out), the project BOM, the cable schedule, the cord BOM and the port map. Headless: the
     menu calls these functions; this component owns their dialogs. -->
<script lang="ts">
	import { fieldCtx, withFields } from '../domain/fields'
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Level } from '../domain/types'
	import BomDialog from './BomDialog.svelte'
	import CableScheduleDialog from './CableScheduleDialog.svelte'
	import PatchScheduleDialog from './PatchScheduleDialog.svelte'
	import { exportOutletSchedule } from '../render/outletSchedule'
	import { planDisplayList } from '../views/plan'
	import { displayListToDxf } from '../render/dxf'
	import { applyLayers } from '../views/layers'
	import { download, fileSafe } from '../render/download'
	import { exportPortMap } from '../render/exports'
	import { portMapPick } from '../domain/portMap'

	/** `roomId` = the cord BOM's "this room" (the open rack view's, else the selection's). */
	let { project, ws, level, projectName, roomId }: { project: CadProject; ws: Workspace; level: Level | undefined; projectName: string; roomId?: string } = $props()

	const tell = (t: string) => ws.say(t)

	export async function outletSchedule(all: boolean) {
		try { await exportOutletSchedule(project.index, projectName, all || !level ? undefined : { id: level.id, name: level.name }) }
		catch (e) { project.error = `Excel export failed: ${(e as Error).message}` }
	}
	/** The open plan as DXF — the same display list as the screen, your hidden layers left out (floorplan images too). */
	export function dxf() {
		if (!level) return
		const plan = withFields(applyLayers(planDisplayList(project.index, level.id, { scale: 100, blocks: project.blockOf }), project.index, { hidden: ws.layers.hidden, sort: true }).draw,
			fieldCtx(project.index, { project: projectName, blocks: project.blockOf, levels: [level.id] }))
		const r = displayListToDxf(plan, new Map(project.index.layers.filter((l) => !l.id.startsWith('sys:')).map((l) => [l.id, l.name])), 100, project.blockOf)   // blocks as BLOCK + INSERT
		download(r.text, `${fileSafe(projectName)}_${fileSafe(level.name)}_plan.dxf`, 'application/dxf')
		tell(`DXF: ${r.entities} entities${r.skippedImages ? ' — the floorplan PDF is not included' : ''}`)
	}
	/** The port map (VLAN) as Excel (port-map-plan.md): `ids` = a port map view's devices; else the selection's — a
	 *  selected rack counts as its devices, a port pick as its device. */
	export async function portMap(ids: string[] = portMapPick(project.index, ws.selection, ws.portSel?.on)) {
		if (!ids.length) { tell('Port map: select the panels or switches first (in a rack view), or their rack'); return }
		try { const n = await exportPortMap(project.index, projectName, ids); tell(`Port map: ${n} ports — fill in the VLAN column`) }
		catch (e) { project.error = `Excel export failed: ${(e as Error).message}` }
	}
	let bomOpen = $state(false), cablesOpen = $state(false), cordsOpen = $state(false)
	export const openBom = () => (bomOpen = true)
	export const openCables = () => (cablesOpen = true)
	export const openCordBom = () => (cordsOpen = true)
</script>

{#if bomOpen}<BomDialog {project} {projectName} onclose={() => (bomOpen = false)} ondone={tell} />{/if}
{#if cablesOpen}<CableScheduleDialog {project} {projectName} onclose={() => (cablesOpen = false)} ondone={tell} />{/if}
{#if cordsOpen}<PatchScheduleDialog {project} {projectName} {roomId} thisRoom={!!roomId} onclose={() => (cordsOpen = false)} ondone={tell} />{/if}

