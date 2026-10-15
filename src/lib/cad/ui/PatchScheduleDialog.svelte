<!-- The PATCH SCHEDULE export (was "Cord BOM", User 2026-10-06; patch-list-plan.md Slice 3): what — every cord or only the
     changes (add / change / remove); where — all rooms (a sheet per room, D4), any one room with cords, the patch list's
     selected rows or the rows it shows; the cord BOM of that on screen (same counting as the Excel's BOM sheet). -->
<script lang="ts">
	import { untrack } from 'svelte'
	import CadDialog from './CadDialog.svelte'
	import type { CadProject } from '../app/project.svelte'
	import type { Cord } from '../domain/types'
	import { cableTypeLabel } from '../domain/cableTypes'
	import { cordBom } from '../domain/reports'
	import { CORD_STATUSES } from '../domain/cords'
	import { naturalCompare } from '../domain/labels'
	import { cordRoom, exportPatchSchedule, scheduleSheets, SCHEDULE_SORTS, type ScheduleSort } from '../render/exports'

	/** `roomId` = the open room (start there when `thisRoom`); `selected` / `shown` = the patch list's selected rows and
	 *  the rows its filters show (offered when there are some). */
	let { project, projectName, roomId, thisRoom = false, selected = [], shown: listed = [], onclose, ondone }: {
		project: CadProject; projectName: string; roomId?: string; thisRoom?: boolean; selected?: Cord[]; shown?: Cord[]
		onclose: () => void; ondone: (msg: string) => void
	} = $props()

	const STATUSES = CORD_STATUSES
	/** 'all' · 'room:<id>' · 'sel' · 'shown' */
	let where = $state(untrack(() => (selected.length > 1 ? 'sel' : thisRoom && roomId ? `room:${roomId}` : 'all')))
	let changesOnly = $state(false)
	let sortBy = $state<ScheduleSort>('fromLabel')
	let busy = $state(false)
	const rooms = $derived([...new Set(project.index.cords.map((c) => cordRoom(project.index, c)).filter((r): r is string => !!r))]
		.map((id) => ({ id, name: project.index.nameOf(id) })).sort((a, b) => naturalCompare(a.name, b.name)))
	const roomOf = $derived(where.startsWith('room:') ? where.slice(5) : undefined)
	const typeLabel = (id: string) => cableTypeLabel(project.settings, id)
	const picked = $derived(where === 'sel' ? selected : where === 'shown' ? listed : roomOf ? project.index.cords.filter((c) => cordRoom(project.index, c) === roomOf) : project.index.cords)
	const cords = $derived(picked.filter((c) => !changesOnly || c.status !== 'installed'))
	const what = $derived(where === 'sel' ? 'selected' : where === 'shown' ? 'shown' : roomOf ? project.index.nameOf(roomOf) : 'all rooms')
	const lines = $derived(cordBom(cords, typeLabel))
	const shown = $derived(STATUSES.filter((s) => !changesOnly || s !== 'installed'))
	const sum = (s: Cord['status']) => lines.reduce((n, l) => n + l.n[s], 0)
	const perRoom = $derived(where === 'all')

	async function exportXlsx() {
		if (busy) return
		busy = true
		try {
			const sheets = scheduleSheets(project.index, cords, perRoom, roomOf ? project.index.nameOf(roomOf) : where === 'sel' ? 'Selected' : 'Patch Schedule', sortBy)
			const tag = [where === 'all' ? '' : what, changesOnly ? 'changes' : ''].filter(Boolean).join('-')
			const n = await exportPatchSchedule(project.index, projectName, sheets, typeLabel, tag)
			if (n === null) return   // the name box was cancelled: the dialog stays
			ondone(`Patch schedule (${what}${perRoom && sheets.length > 1 ? `, ${sheets.length} sheets` : ''}): ${n} cord${n === 1 ? '' : 's'}${changesOnly ? ' to add / change / remove' : ''}`)
			onclose()
		}
		catch (e) { project.error = `Export failed: ${(e as Error).message}` }
		finally { busy = false }
	}
</script>

<CadDialog title="Patch schedule · cord BOM" label="Patch schedule" width="40rem" top="5vh" {onclose}>
		{#snippet bar()}
			<select title="Which cords: every room (a sheet each in the Excel), one room, or the patch list's selected / shown rows" bind:value={where}>
				<option value="all">All rooms (a sheet per room)</option>
				{#each rooms as r (r.id)}<option value="room:{r.id}">{r.name}</option>{/each}
				{#if selected.length}<option value="sel">The selected rows ({selected.length})</option>{/if}
				{#if listed.length}<option value="shown">The rows the list shows ({listed.length})</option>{/if}
			</select>
			<label title="Only the work (add / change / remove), not the cords already installed — here and in the Excel"><input type="checkbox" bind:checked={changesOnly} /> changes only</label>
			<label title="The order of the rows inside each status group (remove → change → add → installed) in the Excel">sort by
				<select bind:value={sortBy}>{#each SCHEDULE_SORTS as [k, label] (k)}<option value={k}>{label}</option>{/each}</select></label>
			<span class="grow"></span>
			<button class="btn go" disabled={busy || !cords.length} title="The patch schedule (work order: remove → change → add → installed) and this cord BOM, as Excel" onclick={exportXlsx}>{busy ? 'Exporting…' : 'Export to Excel'}</button>
		{/snippet}
			<table>
				<thead><tr><th>Cable type</th><th class="n">Length (m)</th>{#each shown as s (s)}<th class="n"><span class="chip s-{s}">{s}</span></th>{/each}<th class="n">Total</th></tr></thead>
				<tbody>
					{#each lines as l (`${l.type}|${l.lengthM}`)}
						<tr><td>{l.type}</td><td class="n">{l.lengthM || '-'}</td>{#each shown as s (s)}<td class="n" class:zero={!l.n[s]}>{l.n[s]}</td>{/each}<td class="n b">{l.total}</td></tr>
					{:else}
						<tr><td colspan={shown.length + 3} class="hint">No cords{changesOnly ? ' to add / change / remove' : ''} ({what}).</td></tr>
					{/each}
					{#if lines.length}
						<tr class="tot"><td colspan="2">Total</td>{#each shown as s (s)}<td class="n">{sum(s)}</td>{/each}<td class="n">{cords.length}</td></tr>
					{/if}
				</tbody>
			</table>
</CadDialog>

<style>
	.grow { flex: 1; }
	select { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; background: var(--cad-input, white); color: inherit; }
	.btn { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; padding: 2px 10px; background: var(--cad-input, white); }
	.btn.go { background: #2563eb; color: white; border-color: #2563eb; }
	.btn:disabled { opacity: 0.5; }
	.hint { color: var(--cad-muted, #71717a); padding: 8px 6px; }
	table { width: 100%; border-collapse: collapse; }
	th { text-align: left; font-weight: 600; color: var(--cad-muted, #52525b); border-bottom: 1px solid var(--cad-line, #e4e4e7); padding: 2px 6px; position: sticky; top: 0; background: var(--cad-panel, white); }
	td { padding: 1px 6px; border-bottom: 1px solid var(--cad-line-faint, #f4f4f5); }
	.n { text-align: right; white-space: nowrap; }
	.b { font-weight: 600; }
	.zero { color: var(--cad-muted, #a1a1aa); }
	.tot td { font-weight: 600; border-bottom: none; }
	.chip { font-size: 10px; font-weight: 600; border-radius: 3px; padding: 0 5px; text-transform: uppercase; }
	.s-add { background: #dcfce7; color: #166534; }
	.s-change { background: #fef9c3; color: #854d0e; }
	.s-remove { background: #fee2e2; color: #991b1b; }
	.s-replace { background: #f3e8ff; color: #7e22ce; }
	.s-installed { background: #e4e4e7; color: #3f3f46; }
</style>
