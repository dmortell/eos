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
	import CordLabelsDialog from './CordLabelsDialog.svelte'
	import { exportOutletSchedule } from '../render/outletSchedule'
	import { planDisplayList } from '../views/plan'
	import { displayListToDxf } from '../render/dxf'
	import { applyLayers } from '../views/layers'
	import { fileSafe, saveFile } from '../render/download'
	import { exportPortMap, exportPanelLabels, roomsWithRacks } from '../render/exports'
	import { exportFrameSheets } from '../render/frameSheets'
	import { markPrinted } from '../domain/ports'
	import type { Device } from '../domain/types'
	import { portMapPick } from '../domain/portMap'

	/** `roomId` = the cord BOM's "this room" (the open rack view's, else the selection's). */
	let { project, ws, level, projectName, roomId }: { project: CadProject; ws: Workspace; level: Level | undefined; projectName: string; roomId?: string } = $props()

	const tell = (t: string) => ws.say(t)

	export async function outletSchedule(all: boolean) {
		try { if (await ws.building('the outlet schedule', () => exportOutletSchedule(project.index, projectName, all || !level ? undefined : { id: level.id, name: level.name }))) tell(`Outlet schedule exported (${all || !level ? 'all levels' : level.name})`) }
		catch (e) { project.error = `Excel export failed: ${(e as Error).message}` }
	}
	/** Frame label sheets (Excel) for every server room on this level, or on all levels (Q47). */
	export async function frameSheets(all: boolean) {
		const rooms = roomsWithRacks(project.index, all || !level ? undefined : level.id)
		try {
			const r = await ws.building('the frame label sheets', () => exportFrameSheets(project.index, projectName, rooms, false))
			if (!r) return   // the name box was cancelled
			tell(r.racks ? `${r.racks} frame(s) exported from ${rooms.length} room(s)` : `No racks with patch panels ${all || !level ? 'in the project' : `on ${level.name}`}`)
		} catch (e) { project.error = `Excel export failed: ${(e as Error).message}` }
	}
	/** Panel labels (Excel) for every server room on this level, or on all levels; then the usual "Mark printed" offer (Q47). */
	export async function panelLabels(all: boolean) {
		try {
			const lv = all || !level ? undefined : { id: level.id, name: level.name }
			const r = await ws.building('the panel labels', () => exportPanelLabels(project.index, projectName, undefined, lv))
			if (!r) return   // the name box was cancelled
			const panels = r.panels.map((id) => project.index.get(id)).filter((d): d is Device => d?.type === 'device')
			if (!panels.length) { tell(r.rows ? `${r.rows} port labels exported` : 'No patch panels to label'); return }
			ws.ask2(`${r.rows} port labels exported. Mark the ${panels.length} panel(s) as printed?`, 'Mark printed',
				() => { const now = Date.now(); project.store.transact('Panel labels printed', (tx) => { for (const d of panels) tx.put(markPrinted(project.index, d, now)) }) })
		} catch (e) { project.error = `Excel export failed: ${(e as Error).message}` }
	}
	/** The open plan as DXF — the same display list as the screen, your hidden layers left out (floorplan images too). */
	export async function dxf() {
		const lv = level
		if (lv) await ws.building('the DXF', () => dxfOf(lv))
	}
	async function dxfOf(level: Level) {
		const plan = withFields(applyLayers(planDisplayList(project.index, level.id, { scale: 100, blocks: project.blockOf }), project.index, { hidden: ws.layers.hidden, sort: true }).draw,
			fieldCtx(project.index, { project: projectName, building: project.details?.buildingName?.trim(), blocks: project.blockOf, levels: [level.id] }))
		const r = displayListToDxf(plan, new Map(project.index.layers.filter((l) => !l.id.startsWith('sys:')).map((l) => [l.id, l.name])), 100, project.blockOf)   // blocks as BLOCK + INSERT
		if (!await saveFile(r.text, `${fileSafe(projectName)}_${fileSafe(level.name)}_plan.dxf`, 'application/dxf', { what: 'Plan', scope: level.name })) return
		tell(`DXF: ${r.entities} entities${r.skippedImages ? ' — the floorplan picture is not included (its frame is on layer A-IMAGE)' : ''}`)
	}
	/** The port map (VLAN) as Excel (port-map-plan.md): `ids` = a port map view's devices; else the selection's — a
	 *  selected rack counts as its devices, a port pick as its device. */
	export async function portMap(ids: string[] = portMapPick(project.index, ws.selection, ws.portSel?.on)) {
		if (!ids.length) { tell('Port map: select the panels or switches first (in a rack view), or their rack'); return }
		try { const n = await ws.building('the port map', () => exportPortMap(project.index, projectName, ids)); if (n != null) tell(`Port map: ${n} ports — fill in the VLAN column`) }
		catch (e) { project.error = `Excel export failed: ${(e as Error).message}` }
	}
	let bomOpen = $state(false), cablesOpen = $state(false), cordsOpen = $state(false), labelsOpen = $state(false)
	export const openCordLabels = () => (labelsOpen = true)
	export const openBom = () => (bomOpen = true)
	export const openCables = () => (cablesOpen = true)
	export const openCordBom = () => (cordsOpen = true)
</script>

{#if bomOpen}<BomDialog {project} {projectName} onclose={() => (bomOpen = false)} ondone={tell} />{/if}
{#if cablesOpen}<CableScheduleDialog {project} {projectName} onclose={() => (cablesOpen = false)} ondone={tell} />{/if}
{#if cordsOpen}<PatchScheduleDialog {project} {projectName} {roomId} thisRoom={!!roomId} onclose={() => (cordsOpen = false)} ondone={tell} />{/if}
{#if labelsOpen}<CordLabelsDialog {project} onclose={() => (labelsOpen = false)} />{/if}

