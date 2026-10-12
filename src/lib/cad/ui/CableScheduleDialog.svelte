<!-- The CABLE SCHEDULE on screen (Dave: in a dialog like the BOM, then Excel): one row per cable (a multi-core cable once) — from, to, cable,
     route, slack, installed length, the 90 m flag — with totals; "Problems only" shows the links over 90 m or with no
     route. -->
<script lang="ts">
	import { backdropClose, dialogFocus } from './backdrop'
	import type { CadProject } from '../app/project.svelte'
	import { cableSchedule, scheduleTotals } from '../domain/cableSchedule'
	import { cableSettings } from '../domain/routing'
	import { exportCableSchedule } from '../render/exports'

	let { project, projectName, onclose, ondone }: { project: CadProject; projectName: string; onclose: () => void; ondone: (msg: string) => void } = $props()

	let problems = $state(false), busy = $state(false)
	const all = $derived(cableSchedule(project.index, project.routes, cableSettings(project.index)))
	const rows = $derived(problems ? all.filter((r) => r.over90 || r.lengthM == null) : all)
	const t = $derived(scheduleTotals(all))

	async function exportXlsx() {
		busy = true
		try { await exportCableSchedule(rows, projectName); ondone(`Cable schedule: ${rows.length} cables`); onclose() }
		catch (e) { project.error = `Excel failed: ${(e as Error).message}` }
		finally { busy = false }
	}
</script>

<div class="backdrop" role="presentation" use:backdropClose={onclose}>
	<div class="dlg" role="dialog" use:dialogFocus aria-label="Cable schedule" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === 'Escape' && onclose()}>
		<div class="head"><b>Cable schedule</b><button class="x" title="Close (Esc)" onclick={onclose}>✕</button></div>
		<section class="opts">
			<span>{t.links} cables · <b>{t.metres} m</b> installed{#if t.unrouted}{' · '}<span class="bad">{t.unrouted} without a route</span>{/if}{#if t.over90}{' · '}<span class="bad">{t.over90} over 90 m</span>{/if}</span>
			<label><input type="checkbox" bind:checked={problems} /> Problems only</label>
			<span class="grow"></span>
			<button class="btn go" disabled={busy || !rows.length} onclick={exportXlsx}>{busy ? 'Exporting…' : `Export to Excel${problems ? ' (these)' : ''}`}</button>
		</section>
		<div class="body">
			<table>
				<thead><tr><th>Label</th><th>Kind</th><th>From</th><th>To</th><th>Cable</th><th class="n">Route</th><th class="n">Slack</th><th class="n">Length</th><th>Note</th></tr></thead>
				<tbody>
					{#each rows as r (r.linkId)}
						<tr class:bad={r.over90 || r.lengthM == null}>
							<td class="mono">{r.label}</td><td>{r.kind}</td><td>{r.from}</td><td>{r.to}</td><td>{r.type}</td>
							<td class="n">{r.routeM ?? ''}</td><td class="n">{r.slackM || ''}</td><td class="n">{r.lengthM != null ? `${r.lengthM} m` : '?'}</td>
							<td class="hint">{r.over90 ? 'over 90 m' : r.problem ? `no route: ${r.problem}` : r.handSet ? 'set by hand' : ''}</td>
						</tr>
					{:else}
						<tr><td colspan="9" class="hint">{problems ? 'No problems.' : 'No cables yet.'}</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>

<style>
	.backdrop { position: fixed; inset: 0; z-index: 50; background: rgb(0 0 0 / 0.25); display: flex; align-items: flex-start; justify-content: center; padding-top: 5vh; }
	.dlg { width: min(72rem, 96vw); max-height: 88vh; display: flex; flex-direction: column; background: var(--cad-panel, white); color: var(--cad-text, #18181b); border: 1px solid var(--cad-line, #e4e4e7); border-radius: 8px; box-shadow: 0 8px 30px rgb(0 0 0 / 0.2); font-size: 12px; }
	.head { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--cad-line, #e4e4e7); }
	.x { color: var(--cad-muted, #71717a); }
	.opts { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding: 8px 12px; border-bottom: 1px solid var(--cad-line, #e4e4e7); }
	.grow { flex: 1; }
	.btn { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; padding: 2px 10px; background: var(--cad-input, white); }
	.btn.go { background: #2563eb; color: white; border-color: #2563eb; }
	.btn:disabled { opacity: 0.5; }
	.body { overflow: auto; padding: 0 12px 12px; }
	.hint { color: var(--cad-muted, #71717a); }
	.bad { color: #b91c1c; }
	table { width: 100%; border-collapse: collapse; }
	th { text-align: left; font-weight: 600; color: var(--cad-muted, #52525b); border-bottom: 1px solid var(--cad-line, #e4e4e7); padding: 4px 6px 2px; position: sticky; top: 0; background: var(--cad-panel, white); }
	td { padding: 1px 6px; border-bottom: 1px solid var(--cad-line-faint, #f4f4f5); vertical-align: top; }
	.n { text-align: right; white-space: nowrap; }
	.mono { font-family: ui-monospace, monospace; white-space: nowrap; }
</style>
