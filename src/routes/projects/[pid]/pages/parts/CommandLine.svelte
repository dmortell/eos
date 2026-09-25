<script lang="ts">
	// The COMMAND LINE (Kestrel's, above the status bar): the last few output lines, the prompt and an input with
	// command suggestions. Typing anywhere over the canvas lands here (+page onGlobalKey → `type`); Tab completes,
	// ↑/↓ walk the suggestions (or the input history when there are none), Enter runs, Esc clears / cancels.
	import { matchCommands, primaryName, readToken } from '../ui/commands'
	import type { CommandRunner } from '../ui/commandRunner.svelte'

	// spaceIsEnter (the status bar's ACAD mode): Space submits like Enter, as in AutoCAD — except while a command asks
	// for free text (a layer name). Several points on one line still work separated by ';'.
	let { runner, spaceIsEnter = false }: { runner: CommandRunner; spaceIsEnter?: boolean } = $props()
	let text = $state(''), pick = $state(0), histIdx = $state(-1), open = $state(false)
	let input: HTMLInputElement | undefined = $state()
	let logEl: HTMLDivElement | undefined = $state()
	// suggestions only for the command word being typed (the first token, before any space)
	let sugg = $derived(open && text && !/\s/.test(text.trim()) ? matchCommands(text) : [])
	let recent = $derived(open ? runner.log.slice(-6) : runner.log.slice(-2))

	/** Keys typed over the canvas start / continue a command here. */
	export function type(ch: string) { text += ch; pick = 0; histIdx = -1; input?.focus() }

	$effect(() => { void runner.log.length; if (logEl) logEl.scrollTop = logEl.scrollHeight })

	function submit(line: string) { runner.run(line); text = ''; pick = 0; histIdx = -1; input?.blur() }
	function complete() { const s = sugg[pick]; if (s) { text = primaryName(s) + ' '; pick = 0 } }
	function onkeydown(e: KeyboardEvent) {
		e.stopPropagation()   // the viewport / page keys stay out of the typing
		if (e.key === 'Enter' || (e.key === ' ' && spaceIsEnter && !runner.want?.text)) {   // an unknown word with a suggestion showing → run the highlighted suggestion
			e.preventDefault(); const s = sugg[pick]
			submit(s && readToken(text.trim(), false).kind === 'error' ? primaryName(s) : text)
		}
		else if (e.key === 'Escape') { e.preventDefault(); if (text) text = ''; else submit('ESC') }
		else if (e.key === 'Tab') { e.preventDefault(); complete() }
		else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault(); const up = e.key === 'ArrowUp'
			if (sugg.length) pick = (pick + (up ? -1 : 1) + sugg.length) % sugg.length
			else {
				const h = runner.history; if (!h.length) return
				histIdx = up ? (histIdx < 0 ? h.length - 1 : Math.max(0, histIdx - 1)) : histIdx < 0 ? -1 : histIdx + 1
				if (histIdx >= h.length) histIdx = -1
				text = histIdx < 0 ? '' : h[histIdx]
			}
		}
	}
</script>

<div class="cmdline" class:open>
	<div class="log" bind:this={logEl}>
		{#each recent as l, i (runner.log.length - recent.length + i)}<div class="ln {l.kind}">{l.text}</div>{/each}
	</div>
	<label class="row">
		<span class="prompt">{runner.prompt}</span>
		<input bind:this={input} bind:value={text} spellcheck="false" autocomplete="off" placeholder={runner.want ? 'A point X,Y / @DX,DY, a number, an option — or click in the view' : 'Type a command (L, REC, M, CO, Z …) — HELP lists them'}
			onfocus={() => (open = true)} onblur={() => (open = false)} oninput={() => { pick = 0; histIdx = -1 }} {onkeydown} />
	</label>
	{#if sugg.length}
		<ul class="sugg">
			{#each sugg as s, i (s.id)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<li class:on={i === pick} onmousedown={(e) => { e.preventDefault(); submit(primaryName(s)) }}>
					<b>{primaryName(s)}</b><span class="al">{s.names.split('·').slice(1).join(' ·')}</span><span class="d">{s.description}</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.cmdline { position: relative; background: var(--panel); border-top: 1px solid var(--line); font: 12px ui-monospace, Consolas, monospace; color: var(--text); flex: none; }
	.log { max-height: 34px; overflow: hidden; padding: 2px 8px 0; }
	.open .log { max-height: 96px; overflow-y: auto; }
	.ln { white-space: pre-wrap; line-height: 16px; color: var(--muted); }
	.ln.in { color: var(--faint); }
	.ln.err { color: var(--danger); }
	.row { display: flex; align-items: center; gap: 6px; padding: 2px 8px 3px; }
	.prompt { color: var(--accent); white-space: nowrap; }
	input { flex: 1; min-width: 0; background: var(--input); color: var(--text); border: 1px solid var(--line-soft); border-radius: 3px; padding: 2px 6px; font: inherit; outline: none; }
	input:focus { border-color: var(--accent-dim); }
	input::placeholder { color: var(--faint); }
	.sugg { position: absolute; left: 8px; bottom: 100%; margin: 0 0 2px; padding: 3px 0; list-style: none; min-width: 360px; max-width: calc(100% - 16px);
		background: var(--panel2); border: 1px solid var(--line); border-radius: 4px; box-shadow: 0 4px 14px #0006; z-index: 30; }
	.sugg li { display: flex; gap: 8px; padding: 2px 8px; cursor: pointer; white-space: nowrap; }
	.sugg li.on, .sugg li:hover { background: var(--active); }
	.sugg b { color: var(--accent); min-width: 72px; }
	.al { color: var(--faint); min-width: 90px; }
	.d { color: var(--muted); overflow: hidden; text-overflow: ellipsis; }
</style>
