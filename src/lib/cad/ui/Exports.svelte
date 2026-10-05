<!-- EXPORTS (was the tool bar's Export menu; now File → Export in the menu bar, UX review S4): outlet schedules, the
     open plan as DXF (your hidden layers left out), the project BOM, the cable schedule and the cord BOM. Headless: the
     menu calls these functions; this component owns their dialogs. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Level } from '../domain/types'
	import BomDialog from './BomDialog.svelte'
	import CableScheduleDialog from './CableScheduleDialog.svelte'
	import CordBomDialog from './CordBomDialog.svelte'
	import { exportOutletSchedule } from '../render/outletSchedule'
	import { planDisplayList } from '../views/plan'
	import { displayListToDxf } from '../render/dxf'
	import { applyLayers } from '../views/layers'
	import { download, fileSafe } from '../render/download'

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
		const plan = applyLayers(planDisplayList(project.index, level.id, { scale: 100, blocks: project.blockOf }), project.index, { hidden: ws.layers.hidden, sort: true }).draw
		const r = displayListToDxf(plan, new Map(project.index.layers.filter((l) => !l.id.startsWith('sys:')).map((l) => [l.id, l.name])))
		download(r.text, `${fileSafe(projectName)}_${fileSafe(level.name)}_plan.dxf`, 'application/dxf')
		tell(`DXF: ${r.entities} entities${r.skippedImages ? ' — the floorplan PDF is not included' : ''}`)
	}
	let bomOpen = $state(false), cablesOpen = $state(false), cordsOpen = $state(false)
	export const openBom = () => (bomOpen = true)
	export const openCables = () => (cablesOpen = true)
	export const openCordBom = () => (cordsOpen = true)
</script>

{#if bomOpen}<BomDialog {project} {projectName} onclose={() => (bomOpen = false)} ondone={tell} />{/if}
{#if cablesOpen}<CableScheduleDialog {project} {projectName} onclose={() => (cablesOpen = false)} ondone={tell} />{/if}
{#if cordsOpen}<CordBomDialog {project} {projectName} {roomId} thisRoom={!!roomId} onclose={() => (cordsOpen = false)} ondone={tell} />{/if}

