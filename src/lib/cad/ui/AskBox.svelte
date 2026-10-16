<!-- A QUESTION over the drawing (UX04): "Delete rack R301 with 12 devices…?" used to sit in the tool bar's text slot,
     easy to miss. Now a small box at the top middle of the drawing, with its answers: Enter = the first (yes), Esc =
     Cancel (an offer to put something back — ws.offerRevert — takes no Enter and no focus). Its first answer takes the focus, unless a field is being typed in (it keeps the focus, and its Enter stays
     its own) or a dialog is open (Project settings shows its own copy); Enter answers only from the box or the page. -->
<script lang="ts">
	import type { Workspace } from '../app/workspace.svelte'
	import { askKey, typingIn } from './keyGuards'

	let { ws, onanswer }: { ws: Workspace; /** after a prompt is answered here (the drawing redraws its tool) */ onanswer?: () => void } = $props()
	const q = $derived(ws.confirm)
	/** R7-4 (User 2026-10-16): while a floorplan is calibrated (Origin / Scale / Crop, Set up each floor) the step to do
	 *  shows here, where the eye is — not only in the status bar at the bottom left. */
	const step = $derived(ws.toolId === 'calibrate' ? ws.message : null)
	const pq = $derived(ws.prompt)
	let yesBtn: HTMLButtonElement | undefined = $state()
	// an offer to put something back (ws.offerRevert) never takes the focus, and Enter doesn't answer it: only a click
	$effect(() => { if (q && !q.revert && yesBtn && !typingIn(document.activeElement) && !document.querySelector('[role=dialog]')) yesBtn.focus() })
	// take `apply` BEFORE clearing: q is derived from ws.confirm and is null once it's cleared
	function answer(apply: () => void) { ws.confirm = null; apply() }
	function key(e: KeyboardEvent) {
		if (!q) return
		const a = askKey(e)
		if (!a || (a === 'yes' && q.revert)) return
		// R7-10 (User 2026-10-16): while a floorplan is calibrated, Esc keeps the change AND reaches the tool (it stops
		// the pass) — one Esc, not two
		if (a === 'cancel' && q.revert && ws.toolId === 'calibrate') { ws.confirm = null; return }
		e.preventDefault(); e.stopPropagation()
		if (a === 'cancel') ws.confirm = null
		else answer(q.apply)
	}
</script>

<svelte:window onkeydowncapture={key} />

{#if q}
	<div class="ask" role="alertdialog" aria-label="Question">
		<p>{q.msg}</p>
		<div class="row">
			<button bind:this={yesBtn} class:yes={!q.revert} onclick={() => answer(q.apply)}>{q.yes}</button>
			{#if q.alt}{@const alt = q.alt}<button class="yes" onclick={() => answer(alt.apply)}>{alt.label}</button>{/if}
			<!-- Keep is the usual answer to "this was done": the primary button (User 2026-10-16) --><button class:pri={q.revert} onclick={() => (ws.confirm = null)}>{q.revert ? 'Keep' : 'Cancel'}</button>
			<span class="keys">{q.revert ? 'Esc' : 'Enter · Esc'}</span>
		</div>
		{#if step}<p class="step"><b>Next:</b> {step}</p>{/if}
	</div>
{:else if step}
	<div class="ask step-only" role="status">{step}</div>
{:else if pq?.choices}{@const p = pq}{@const cs = pq.choices}
	<!-- R7-17: a typed question with a few answers (V: which floor) — here as buttons as well as in the status bar -->
	<div class="ask step-only" role="group" aria-label={p.label}>
		<p>{p.label} — or type it in the status bar:</p>
		<div class="row choices">{#each cs as ch (ch.value)}<button onclick={() => { ws.prompt = null; p.apply(ch.value); onanswer?.() }}>{ch.label}</button>{/each}<span class="keys">Esc</span></div>
	</div>
{/if}

<style>
	.ask { position: absolute; top: 40px; left: 50%; transform: translateX(-50%); z-index: 30; max-width: min(36rem, 90%); padding: 10px 12px; border-radius: 8px; background: var(--cad-panel, white); color: var(--cad-text, #18181b); border: 1px solid #f59e0b; box-shadow: 0 10px 30px rgb(0 0 0 / 0.2); font-size: 12px; }
	p { margin: 0 0 8px; }
	.row { display: flex; align-items: center; gap: 6px; }
	button { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; padding: 2px 10px; background: var(--cad-input, white); color: inherit; }
	button.yes { border-color: #d97706; color: #92400e; background: #fffbeb; }
	button.pri { border-color: #2563eb; color: white; background: #2563eb; }
	button:focus-visible { outline: 2px solid #2563eb; outline-offset: 1px; }
	.step { margin: 8px 0 0; padding-top: 6px; border-top: 1px solid var(--cad-line, #e4e4e7); }
	.step-only { border-color: #2563eb; }
	.choices { flex-wrap: wrap; }
	.keys { margin-left: auto; font-size: 10px; color: var(--cad-muted, #71717a); }
</style>
