<!-- A QUESTION over the drawing (UX04): "Delete rack R301 with 12 devices…?" used to sit in the tool bar's text slot,
     easy to miss. Now a small box at the top middle of the drawing, with its answers: Enter = the first (yes), Esc =
     Cancel. Nothing else changes until it's answered (the keys go to it). -->
<script lang="ts">
	import type { Workspace } from '../app/workspace.svelte'

	let { ws }: { ws: Workspace } = $props()
	const q = $derived(ws.confirm)
	let yesBtn: HTMLButtonElement | undefined = $state()
	$effect(() => { if (q && yesBtn) yesBtn.focus() })
	// take `apply` BEFORE clearing: q is derived from ws.confirm and is null once it's cleared
	function answer(apply: () => void) { ws.confirm = null; apply() }
	function key(e: KeyboardEvent) {
		if (!q) return
		if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); ws.confirm = null }
		else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); e.stopPropagation(); answer(q.apply) }
	}
</script>

<svelte:window onkeydowncapture={key} />

{#if q}
	<div class="ask" role="alertdialog" aria-label="Question">
		<p>{q.msg}</p>
		<div class="row">
			<button bind:this={yesBtn} class="yes" onclick={() => answer(q.apply)}>{q.yes}</button>
			{#if q.alt}{@const alt = q.alt}<button class="yes" onclick={() => answer(alt.apply)}>{alt.label}</button>{/if}
			<button onclick={() => (ws.confirm = null)}>Cancel</button>
			<span class="keys">Enter · Esc</span>
		</div>
	</div>
{/if}

<style>
	.ask { position: absolute; top: 40px; left: 50%; transform: translateX(-50%); z-index: 30; max-width: min(36rem, 90%); padding: 10px 12px; border-radius: 8px; background: var(--cad-panel, white); color: var(--cad-text, #18181b); border: 1px solid #f59e0b; box-shadow: 0 10px 30px rgb(0 0 0 / 0.2); font-size: 12px; }
	p { margin: 0 0 8px; }
	.row { display: flex; align-items: center; gap: 6px; }
	button { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; padding: 2px 10px; background: var(--cad-input, white); color: inherit; }
	button.yes { border-color: #d97706; color: #92400e; background: #fffbeb; }
	button:focus-visible { outline: 2px solid #2563eb; outline-offset: 1px; }
	.keys { margin-left: auto; font-size: 10px; color: var(--cad-muted, #71717a); }
</style>
