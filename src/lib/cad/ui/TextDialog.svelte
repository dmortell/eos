<!-- TEXT DIALOG (User 2026-10-15: "don't use the status bar for inputs like file names, use a dialog"): one line of
     free text asked by `ws.askInDialog` — Enter / OK applies, Esc / Cancel does nothing. -->
<script lang="ts">
	import { tick } from 'svelte'
	import CadDialog from './CadDialog.svelte'

	let { title, label, value, hint, ok, ondone }: { title: string; label: string; value: string; hint?: string; ok: string; ondone: (t: string | null) => void } = $props()

	// svelte-ignore state_referenced_locally
	let text = $state(value)
	let input: HTMLInputElement | undefined = $state()
	$effect(() => { void tick().then(() => { input?.focus(); input?.select() }) })
	const done = () => { if (text.trim()) ondone(text.trim()) }
</script>

<CadDialog {title} width="30rem" top="20vh" onclose={() => ondone(null)}>
	<label class="lbl">{label}
		<input bind:this={input} bind:value={text} onkeydown={(e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); done() } }} />
	</label>
	{#if hint}<p class="hint">{hint}</p>{/if}
	{#snippet footer()}
		<span class="keys">Enter · Esc cancels</span>
		<button class="btn" onclick={() => ondone(null)}>Cancel</button>
		<button class="btn go" disabled={!text.trim()} onclick={done}>{ok}</button>
	{/snippet}
</CadDialog>

<style>
	.lbl { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--cad-muted); }
	input { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 5px; padding: 5px 8px; font-size: 13px; background: var(--cad-input, white); color: var(--cad-text); }
	.hint { margin: 8px 0 0; font-size: 11px; color: var(--cad-muted); }
</style>
