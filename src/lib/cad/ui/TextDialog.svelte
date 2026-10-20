<!-- TEXT DIALOG (User 2026-10-15: "don't use the status bar for inputs like file names, use a dialog"): one line of
     free text asked by `ws.askInDialog` — Enter / OK applies, Esc / Cancel does nothing. -->
<script lang="ts" module>
	/** What the typed text would do, redrawn as it's typed (Re-patch: each cord before → after) — or why it can't. */
	export type TextPreview = (t: string) => { head: string[]; rows: string[][] } | { problem: string }
</script>

<script lang="ts">
	import { tick } from 'svelte'
	import CadDialog from './CadDialog.svelte'

	let { title, label, value, hint, ok, preview, ondone }: { title: string; label: string; value: string; hint?: string; ok: string; preview?: TextPreview; ondone: (t: string | null) => void } = $props()

	// svelte-ignore state_referenced_locally
	let text = $state(value)
	let input: HTMLInputElement | undefined = $state()
	$effect(() => { void tick().then(() => { input?.focus(); input?.select() }) })
	const done = () => { if (text.trim() && !('problem' in (shown ?? {}))) ondone(text.trim()) }
	const shown = $derived(preview?.(text))
</script>

<CadDialog {title} width="30rem" top="20vh" onclose={() => ondone(null)}>
	<label class="lbl">{label}
		<input bind:this={input} bind:value={text} onkeydown={(e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); done() } }} />
	</label>
	{#if hint}<p class="hint">{hint}</p>{/if}
	{#if shown && 'problem' in shown}<p class="problem">{shown.problem}</p>
	{:else if shown?.rows.length}
		<div class="pv"><table>
			<thead><tr>{#each shown.head as h, i (i)}<th>{h}</th>{/each}</tr></thead>
			<tbody>{#each shown.rows as r, i (i)}<tr>{#each r as cell, j (j)}<td>{cell}</td>{/each}</tr>{/each}</tbody>
		</table></div>
	{/if}
	{#snippet footer()}
		<span class="keys">Enter · Esc cancels</span>
		<button class="btn" onclick={() => ondone(null)}>Cancel</button>
		<button class="btn go" disabled={!text.trim() || (!!shown && 'problem' in shown)} onclick={done}>{ok}</button>
	{/snippet}
</CadDialog>

<style>
	.lbl { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--cad-muted); }
	input { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 5px; padding: 5px 8px; font-size: 13px; background: var(--cad-input, white); color: var(--cad-text); }
	.hint { margin: 8px 0 0; font-size: 11px; color: var(--cad-muted); }
	.problem { margin: 8px 0 0; font-size: 12px; color: #b91c1c; }
	/* the preview (Re-patch: Stays · Was · Now), as the Patch N cords dialog's list — scrolls past a dozen rows */
	.pv { margin-top: 8px; max-height: 14rem; overflow: auto; border: 1px solid var(--cad-line); border-radius: 4px; }
	.pv table { width: 100%; border-collapse: collapse; font-size: 11px; }
	.pv th { position: sticky; top: 0; background: var(--cad-subtle, #fafafa); text-align: left; font-weight: 600; color: var(--cad-muted); padding: 2px 6px; }
	.pv td { padding: 1px 6px; white-space: nowrap; color: var(--cad-text); }
	.pv td:last-child { color: #b45309; }   /* the new place, in the CHANGE amber */
</style>
