<!-- The CABLE SCHEDULE on screen (User: in a dialog like the BOM, then Excel): one row per cable (a multi-core cable once) — from, to, cable,
     route, slack, installed length, the 90 m flag — with totals; "Problems only" shows the links over 90 m or with no
     route. -->
<script lang="ts">
	import CadDialog from './CadDialog.svelte'
	import type { CadProject } from '../app/project.svelte'
	import { cableSchedule, scheduleTotals, estimatedTotals } from '../domain/cableSchedule'
	import { cableSettings } from '../domain/routing'
	import { cableTypeLabel } from '../domain/cableTypes'
	import { exportCableSchedule } from '../render/exports'

	let { project, projectName, onclose, ondone }: { project: CadProject; projectName: string; onclose: () => void; ondone: (msg: string) => void } = $props()

	let problems = $state(false), busy = $state(false)
	// the cable type by its name ("CAT6A"), not its id ("cat6a") — on screen and in the Excel (Round 8)
	const typeName = (t: string) => { const [id, ...rest] = t.split(' '); return [cableTypeLabel(project.settings, id), ...rest].join(' ') }
	const all = $derived(cableSchedule(project.index, project.routes, cableSettings(project.index), project.estimates).map((r) => ({ ...r, type: typeName(r.type) })))
	const rows = $derived(problems ? all.filter((r) => r.over90 || r.lengthM == null) : all)
	const t = $derived(scheduleTotals(all)), et = $derived(estimatedTotals(all))

	async function exportXlsx() {
		busy = true
		try { if (await exportCableSchedule(rows, projectName)) { ondone(`Cable schedule: ${rows.length} cables`); onclose() } }
		catch (e) { project.error = `Excel failed: ${(e as Error).message}` }
		finally { busy = false }
	}
</script>

<CadDialog title="Cable schedule" width="72rem" top="5vh" {onclose}>
	{#snippet bar()}
		<span>{t.links} cables · <b>{t.metres} m</b> installed{#if t.unrouted}{' · '}<span class="bad">{t.unrouted} without a route</span>{/if}{#if t.over90}{' · '}<span class="bad">{t.over90} over 90 m</span>{/if}{#if et.cables}{' · '}<span class="est">+ {et.cables} not allocated yet{#if et.unrouted === et.cables}{' — no route to estimate them by'}{:else}, estimated <b>{et.metres} m</b>{#if et.unrouted} ({et.unrouted} without a route){/if}{/if}</span>{/if}</span>
		<label><input type="checkbox" bind:checked={problems} /> Problems only</label>
		<span class="grow"></span>
		<button class="btn go" disabled={busy || !rows.length} onclick={exportXlsx}>{busy ? 'Exporting…' : `Export to Excel${problems ? ' (these)' : ''}`}</button>
	{/snippet}
	<table>
		<thead><tr><th>Label</th><th>Kind</th><th>From</th><th>To</th><th>Cable</th><th class="n">Route</th><th class="n">Slack</th><th class="n">Length</th><th>Note</th></tr></thead>
		<tbody>
			{#each rows as r (r.linkId)}
				<tr class:bad={r.over90 || (r.lengthM == null && !r.estimated)} class:est={r.estimated}>
					<td class="mono">{r.label}</td><td>{r.kind}</td><td>{r.from}</td><td>{r.to}</td><td>{r.type}</td>
					<td class="n">{r.routeM ?? ''}</td><td class="n">{r.slackM || ''}</td><td class="n">{r.lengthM != null ? `${r.lengthM} m` : '?'}</td>
					<td class="hint">{r.estimated ? 'estimated' : ''}{r.estimated && (r.over90 || r.problem) ? ', ' : ''}{r.over90 ? 'over 90 m' : r.problem ? `no route: ${r.problem}` : r.handSet ? 'set by hand' : ''}</td>
				</tr>
			{:else}
				<tr><td colspan="9" class="hint">{problems ? 'No problems.' : 'No cables yet.'}</td></tr>
			{/each}
		</tbody>
	</table>
</CadDialog>

<style>
	.grow { flex: 1; }
	.btn { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; padding: 2px 10px; background: var(--cad-input, white); }
	.btn.go { background: #2563eb; color: white; border-color: #2563eb; }
	.btn:disabled { opacity: 0.5; }
	.hint { color: var(--cad-muted, #71717a); }
	.bad { color: #b91c1c; }
	tr.est td { font-style: italic; color: var(--cad-muted, #52525b); }
	.est { color: var(--cad-muted, #52525b); }
	table { width: 100%; border-collapse: collapse; }
	th { text-align: left; font-weight: 600; color: var(--cad-muted, #52525b); border-bottom: 1px solid var(--cad-line, #e4e4e7); padding: 4px 6px 2px; position: sticky; top: 0; background: var(--cad-panel, white); }
	td { padding: 1px 6px; border-bottom: 1px solid var(--cad-line-faint, #f4f4f5); vertical-align: top; }
	.n { text-align: right; white-space: nowrap; }
	.mono { font-family: ui-monospace, monospace; white-space: nowrap; }
</style>
