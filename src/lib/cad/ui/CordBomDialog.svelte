<!-- The CORD BOM on screen (backlog "Cord BOM on screen", Dave 2026-10-06: a dialog, with the Excel export in it): cords
     by type × length, a column per status, for all rooms or the patch list's room; "Export to Excel" writes the patch
     schedule + this BOM (all cords, or only the changes). Same counting as the Excel sheet (`cordBom`). -->
<script lang="ts">
	import { untrack } from 'svelte'
	import { backdropClose } from './backdrop'
	import type { CadProject } from '../app/project.svelte'
	import type { Cord } from '../domain/types'
	import { cordBom } from '../domain/reports'
	import { cordsForSchedule, exportPatchSchedule } from '../render/exports'

	/** `thisRoom` = start on the patch list's room (it shows that room). */
	let { project, projectName, roomId, thisRoom = false, onclose, ondone }: { project: CadProject; projectName: string; roomId?: string; thisRoom?: boolean; onclose: () => void; ondone: (msg: string) => void } = $props()

	const STATUSES: Cord['status'][] = ['add', 'change', 'remove', 'installed']
	let here = $state(untrack(() => thisRoom))
	let changesOnly = $state(false)
	let busy = $state(false)
	const room = $derived(here && roomId ? { id: roomId, name: project.index.nameOf(roomId) } : undefined)
	const typeLabel = (id: string) => project.settings?.cableTypes.find((t) => t.id === id)?.label ?? id
	const cords = $derived(cordsForSchedule(project.index, room?.id).filter((c) => !changesOnly || c.status !== 'installed'))
	const lines = $derived(cordBom(cords, typeLabel))
	const shown = $derived(STATUSES.filter((s) => !changesOnly || s !== 'installed'))
	const sum = (s: Cord['status']) => lines.reduce((n, l) => n + l.n[s], 0)

	async function exportXlsx() {
		if (busy) return
		busy = true
		try { const n = await exportPatchSchedule(project.index, projectName, room, typeLabel, changesOnly); ondone(`Patch schedule${room ? ` (${room.name})` : ''}: ${n} cord${n === 1 ? '' : 's'}${changesOnly ? ' to add / change / remove' : ''}`); onclose() }
		catch (e) { project.error = `Export failed: ${(e as Error).message}` }
		finally { busy = false }
	}
</script>

<div class="backdrop" role="presentation" use:backdropClose={onclose}>
	<div class="dlg" role="dialog" aria-label="Cord BOM" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === 'Escape' && onclose()}>
		<div class="head"><b>Cord BOM</b><button class="x" title="Close (Esc)" onclick={onclose}>✕</button></div>
		<section class="opts">
			<select title="Every cord, or only this room's (the open rack view's, else the selected rack's)" value={room ? 'room' : 'all'} onchange={(e) => (here = e.currentTarget.value === 'room')}>
				<option value="all">All rooms</option>
				<option value="room" disabled={!roomId}>{roomId ? project.index.nameOf(roomId) : 'This room (open a rack view)'}</option>
			</select>
			<label title="Only the work (add / change / remove), not the cords already installed — here and in the Excel"><input type="checkbox" bind:checked={changesOnly} /> changes only</label>
			<span class="grow"></span>
			<button class="btn go" disabled={busy || !cords.length} title="The patch schedule (work order: remove → change → add → installed) and this cord BOM, as Excel" onclick={exportXlsx}>{busy ? 'Exporting…' : 'Export to Excel'}</button>
		</section>
		<div class="body">
			<table>
				<thead><tr><th>Cable type</th><th class="n">Length (m)</th>{#each shown as s (s)}<th class="n"><span class="chip s-{s}">{s}</span></th>{/each}<th class="n">Total</th></tr></thead>
				<tbody>
					{#each lines as l (`${l.type}|${l.lengthM}`)}
						<tr><td>{l.type}</td><td class="n">{l.lengthM || '-'}</td>{#each shown as s (s)}<td class="n" class:zero={!l.n[s]}>{l.n[s]}</td>{/each}<td class="n b">{l.total}</td></tr>
					{:else}
						<tr><td colspan={shown.length + 3} class="hint">No cords{changesOnly ? ' to add / change / remove' : ''}{room ? ` in ${room.name}` : ''}.</td></tr>
					{/each}
					{#if lines.length}
						<tr class="tot"><td colspan="2">Total</td>{#each shown as s (s)}<td class="n">{sum(s)}</td>{/each}<td class="n">{cords.length}</td></tr>
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>

<style>
	.backdrop { position: fixed; inset: 0; z-index: 50; background: rgb(0 0 0 / 0.25); display: flex; align-items: flex-start; justify-content: center; padding-top: 5vh; }
	.dlg { width: min(40rem, 96vw); max-height: 88vh; display: flex; flex-direction: column; background: var(--cad-panel, white); color: var(--cad-text, #18181b); border: 1px solid var(--cad-line, #e4e4e7); border-radius: 8px; box-shadow: 0 8px 30px rgb(0 0 0 / 0.2); font-size: 12px; }
	.head { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--cad-line, #e4e4e7); }
	.x { color: var(--cad-muted, #71717a); }
	.opts { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding: 8px 12px; border-bottom: 1px solid var(--cad-line, #e4e4e7); }
	.grow { flex: 1; }
	select { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; background: var(--cad-input, white); color: inherit; }
	.btn { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; padding: 2px 10px; background: var(--cad-input, white); }
	.btn.go { background: #2563eb; color: white; border-color: #2563eb; }
	.btn:disabled { opacity: 0.5; }
	.body { overflow: auto; padding: 0 12px 12px; }
	.hint { color: var(--cad-muted, #71717a); padding: 8px 6px; }
	table { width: 100%; border-collapse: collapse; margin-top: 8px; }
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
	.s-installed { background: #e4e4e7; color: #3f3f46; }
</style>
