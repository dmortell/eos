<!-- PROJECT SETTINGS: everything project-wide in one dialog with a tab list (it was three: Floors…, Settings… and
     Title block…). Floors & heights · Plans & floorplans (FloorsPanel) · Usages · Cable types · Lengths & labels ·
     Drawing style (the look new shapes start with) · Sheets (categories + the title block template) · Files (SettingsPanel), and a link to Project details… (the
     projects page's dialog, which the route hosts). The menu entries open it on their tab.
     Edits save at once (one undo step each) except the floor range, which waits for Apply floors: closing on an
     unapplied range asks "Apply the floor range?". A question asked from here (ws.ask2) and the status message show in
     the dialog, since the drawing's own question box and status line sit under the backdrop; the question box's keys
     (Enter / Esc) still answer it. The footer's Undo undoes the last step (the shell's Undo is behind the backdrop). While a floorplan is calibrated on the plan the dialog is hidden (`hidden`), and it
     comes back as it was when the Calibrate tool ends. -->
<script module lang="ts">
	export type SettingsTab = 'floors' | 'plans' | 'usages' | 'cables' | 'lengths' | 'drawing' | 'sheets' | 'files'
</script>

<script lang="ts">
	import { tick, untrack } from 'svelte'
	import CadDialog from './CadDialog.svelte'
	import FloorsPanel from './FloorsPanel.svelte'
	import SettingsPanel from './SettingsPanel.svelte'
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Underlay } from '../domain/types'
	import type { CalibMode } from '../editor/calibrateTool'

	let { project, ws, tab = $bindable('floors'), hidden = false, onclose, oncalibrate, onsetupfloors, projectDetails }: {
		project: CadProject; ws: Workspace; tab?: SettingsTab; hidden?: boolean; onclose: () => void
		oncalibrate?: (u: Underlay, mode: CalibMode) => void; onsetupfloors?: (us: Underlay[]) => void; projectDetails?: () => void
	} = $props()

	const TABS: [SettingsTab, string][] = [['floors', 'Floors & heights'], ['plans', 'Plans & floorplans'], ['usages', 'Usages'], ['cables', 'Cable types'], ['lengths', 'Lengths & labels'], ['drawing', 'Drawing style'], ['sheets', 'Sheets'], ['files', 'Files']]
	let dlg: HTMLElement | undefined = $state()
	let floors: ReturnType<typeof FloorsPanel> | undefined = $state()
	let yesBtn: HTMLButtonElement | undefined = $state()

	/** Close, unless the floor range typed in Floors & heights isn't applied: then ask (Apply / Discard; Cancel stays). */
	function requestClose(then?: () => void) {
		const done = () => { onclose(); then?.() }
		if (!floors?.isPending()) { done(); return }
		tab = 'floors'
		ws.ask2('The floor range typed in Floors & heights isn’t applied. Apply the floor range?', 'Apply', () => { floors?.apply(); done() }, { label: 'Discard', apply: done })
	}
	// a question: its first answer takes the focus (after the drawing's question box, which also wants it); answered,
	// or the dialog back from calibrating, the dialog has it again (Esc closes it, the drawing behind doesn't get keys)
	// — not an offer to put something back (ws.offerRevert): a later Enter on its focused button would revert silently
	$effect(() => { if (ws.confirm && !ws.confirm.revert && !hidden) void tick().then(() => yesBtn?.focus()) })
	$effect(() => {
		if ((ws.confirm && !ws.confirm.revert) || hidden) return
		untrack(() => { if (dlg && !dlg.contains(document.activeElement)) dlg.focus({ preventScroll: true }) })
	})
	// take `apply` BEFORE clearing: the {@const} below reads ws.confirm, which is null once cleared
	function answer(apply: () => void) { ws.confirm = null; apply() }
	// the messages here say "Undo brings it back", but the shell's keys and buttons are behind the backdrop: the
	// footer's Undo (its tooltip says which step — it may be one made in the drawing before the dialog opened)
	const lastStep = $derived.by(() => { void project.rev; return project.store.undoLabels.at(-1) })
	function undo() { const step = lastStep; project.undo(); if (step) ws.say(`Undone: ${step}`) }
</script>

<!-- hidden while calibrating: no dialog role then, so the drawing gets its keys (Esc stops the Calibrate tool) -->
<CadDialog title="Project settings" width="64rem" height="min(46rem, 86vh)" flush {hidden} bind:el={dlg} onclose={() => requestClose()}>
		{#snippet footer()}<div class="msg" role="status">{ws.message ?? ''}</div>
			<button class="btn" disabled={!project.canUndo} title={lastStep ? `Undo: ${lastStep}` : 'Nothing to undo'} onclick={undo}>Undo</button>{/snippet}
		<div class="cols">
			<div class="tabs" role="tablist" aria-orientation="vertical">
				{#each TABS as [id, label] (id)}
					<button role="tab" aria-selected={tab === id} class:on={tab === id} onclick={() => (tab = id)}>{label}{#if id === 'floors' && floors?.isPending()}<span class="dot" title="The floor range isn’t applied">●</span>{/if}</button>
				{/each}
				{#if projectDetails}
					<button class="details" title="The projects page’s dialog: name, codes, client, address, author, company, logos — the title block takes the name, client, address (Site), author (a blank Drawn) and company (when its template has none); its logos are set in Title block…" onclick={() => requestClose(projectDetails)}>Project details…</button>
				{/if}
			</div>
			<div class="body">
				<!-- always there, so a range typed in Floors & heights survives a look at another tab -->
				<FloorsPanel bind:this={floors} {project} {ws} part={tab === 'floors' || tab === 'plans' ? tab : null} {oncalibrate} {onsetupfloors} onplans={() => (tab = 'plans')} />
				{#if tab !== 'floors' && tab !== 'plans'}<SettingsPanel {project} {ws} {tab} />{/if}
				{#if ws.confirm && !hidden}
					{@const q = ws.confirm}
					<!-- over the list at its foot, not in it (User 2026-10-16: at the top it pushed every row down and the next
					     click missed) -->
					<div class="askhold"><div class="ask" role="alertdialog" aria-label="Question">
						<p>{q.msg}</p>
						<div class="row">
							<button bind:this={yesBtn} class:yes={!q.revert} onclick={() => answer(q.apply)}>{q.yes}</button>
							{#if q.alt}{@const alt = q.alt}<button class="yes" onclick={() => answer(alt.apply)}>{alt.label}</button>{/if}
							<button class:pri={q.revert} onclick={() => (ws.confirm = null)}>{q.revert ? 'Keep' : 'Cancel'}</button>
							<span class="keys">{q.revert ? 'Esc' : 'Enter · Esc'}</span>
						</div>
					</div></div>
				{/if}
			</div>
		</div>
</CadDialog>

<style>
	.cols { height: 100%; display: flex; }
	.tabs { width: 10.5rem; flex: none; display: flex; flex-direction: column; gap: 1px; padding: 6px; border-right: 1px solid var(--cad-line, #e4e4e7); overflow-y: auto; }
	.tabs button { text-align: left; padding: 3px 8px; border-radius: 4px; color: var(--cad-muted, #71717a); }
	.tabs button:hover { color: inherit; }
	.tabs button.on { background: var(--cad-sel, #dbeafe); color: #1d4ed8; font-weight: 500; }
	.tabs .dot { margin-left: 4px; color: #f59e0b; font-size: 9px; vertical-align: middle; }
	.tabs .details { margin-top: auto; color: #2563eb; border-top: 1px solid var(--cad-line, #e4e4e7); border-radius: 0; padding-top: 6px; }
	.body { flex: 1; min-width: 0; overflow: auto; }
	/* takes no room: the bar floats over the foot of the list (.body is a column filling the dialog, so the holder sits
	   at its bottom even when the list is short) */
	.body { display: flex; flex-direction: column; }
	.body > :global(*) { flex-shrink: 0; }   /* the panels keep their height and scroll */
	.askhold { position: sticky; bottom: 0; height: 0; margin-top: auto; z-index: 2; }
	.ask { position: absolute; bottom: 0; left: 0; right: 0; margin: 8px 12px; padding: 10px 12px; border-radius: 8px; background: var(--cad-panel, white); border: 1px solid #f59e0b; box-shadow: 0 6px 20px rgb(0 0 0 / 0.15); }
	.ask p { margin: 0 0 8px; }
	.ask .row { display: flex; align-items: center; gap: 6px; }
	.ask button { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; padding: 2px 10px; background: var(--cad-input, white); color: inherit; }
	.ask button.yes { border-color: #d97706; color: #92400e; background: #fffbeb; }
	.ask button.pri { border-color: #2563eb; color: white; background: #2563eb; }   /* Keep (User 2026-10-16: primary) */
	.ask button:focus-visible { outline: 2px solid #2563eb; outline-offset: 1px; }
	.ask .keys { margin-left: auto; font-size: 10px; color: var(--cad-muted, #71717a); }
	.msg { flex: 1; min-width: 0; min-height: 16px; color: var(--cad-muted, #52525b); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	@media (max-width: 640px) {
		.cols { flex-direction: column; }
		.tabs { width: auto; flex-direction: row; flex-wrap: wrap; border-right: none; border-bottom: 1px solid var(--cad-line, #e4e4e7); }
		.tabs .details { margin-top: 0; border-top: none; }
	}
</style>
