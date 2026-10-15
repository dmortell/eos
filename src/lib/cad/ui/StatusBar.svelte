<!-- The STATUS BAR under the panes (UX05, the Pages look): on the left the tool-bar prompt (a number, a name, a typed
     point — UX04 / UX19) or else the latest message or the tool's hint; then the active view's readout (length · angle
     while drawing, the cursor), the drafting switches (SNAP + grid step, OSNAP, GRID; F9 / F3 / F7), the scale, the
     zoom and Fit. -->
<script lang="ts">
	import { toggleDrafting } from '../app/shellActions'
	import { KEYS } from './shellKeys'
	import { composing } from './keyGuards'
	import { GRID_STEPS, gridStepOf } from '../editor/snap'
	import type { Workspace } from '../app/workspace.svelte'

	let { ws, hint, onfit, onanswer, selected, onzoomsel }: {
		ws: Workspace; hint: string; onfit: () => void; onanswer: () => void
		/** "12 selected (outlets)" (UX review V3); a click zooms to them. */
		selected: string; onzoomsel: () => void
	} = $props()

	/** A typed grid step: kept when it is a positive number, else the box shows the old one again. */
	function setStep(el: HTMLInputElement) {
		const n = gridStepOf(el.value)
		if (n === null) ws.say('Grid step: type a positive number of mm')
		else { ws.drafting.grid = n; ws.saveDrafting() }
		el.value = String(ws.drafting.grid)
	}
	/** As F9 / F3 / F7 do: the switch, and a word saying it (review R61: a click toggled silently). */
	const flip = (k: 'snap' | 'osnap' | 'showGrid') => toggleDrafting(ws, k)

	let input: HTMLInputElement | undefined = $state()
	// focus the prompt when it opens: a number is selected (type over it); typed text keeps its first character
	$effect(() => {
		if (!ws.prompt || !input) return
		input.focus()
		if (ws.prompt.text) input.setSelectionRange(input.value.length, input.value.length)
		else input.select()
	})
	function key(e: KeyboardEvent) {
		if (composing(e)) return   // Enter / Esc commit or cancel the IME's conversion, not the answer
		// a typed point (UX19): a length, then Tab, then the angle — "1200" Tab "45" = @1200<45 from the last point
		if (e.key === 'Tab' && ws.prompt?.text && ws.prompt.label.startsWith('Point') && input && !input.value.includes('<') && /^@?-?\d+(\.\d+)?$/.test(input.value.trim())) {
			e.preventDefault()
			const v = input.value.trim()
			input.value = `${v.startsWith('@') ? '' : '@'}${v}<`
			input.setSelectionRange(input.value.length, input.value.length)
			return
		}
		if (e.key === 'Enter' && ws.prompt) { const t = (e.currentTarget as HTMLInputElement).value; const p = ws.prompt; ws.prompt = null; p.apply(t); onanswer() }
		else if (e.key === 'Escape') ws.prompt = null
	}
	const v = $derived(ws.viewInfo)
</script>

<footer class="status" class:asking={!!ws.prompt}>
	<div class="left">
		{#if ws.prompt}
			<label class="prompt"><span class="q">{ws.prompt.label}</span> <input bind:this={input} class:wide={ws.prompt.text} type={ws.prompt.text ? 'text' : 'number'} value={ws.prompt.value} onkeydown={key} />
				<span class="keys">Enter · Esc</span></label>
		{:else if ws.message}
			<span class="msg" title={ws.message}>{ws.message}</span>
		{:else}
			<span class="hint" title={hint}>{hint}</span>
		{/if}
	</div>
	{#if selected}<button class="selc" title="Zoom to the selection ({KEYS.zoomSel})" onclick={onzoomsel}>{selected}</button>{/if}
	{#if v?.loading}<span class="load" title="The floorplan is still rendering"><span class="spin"></span> floorplan…</span>{/if}
	{#if v?.readout}<b class="ro">{v.readout}</b>{/if}
	<span class="xy">{v?.xy ?? '—'}</span>
	<div class="toggles">
		<button class:on={ws.drafting.snap} title="SNAP ({KEYS.snap}): moves and points step on the grid · Alt skips it for one action" onclick={() => flip('snap')}>SNAP</button>
		<!-- the grid step: typed (any positive mm), the usual ones offered -->
		<input class="step" type="number" min="0.01" step="any" list="cad-grid-steps" title="Grid step (mm): pick one or type any — 600 for floor tiles, 44.45 for 1U"
			aria-label="Grid step (mm)" value={ws.drafting.grid} onchange={(e) => setStep(e.currentTarget)} />
		<datalist id="cad-grid-steps">{#each GRID_STEPS as s (s)}<option value={s}></option>{/each}</datalist>
		<button class:on={ws.drafting.osnap} title="OSNAP ({KEYS.osnap}): snap to nodes, midpoints, centres, outlets and racks" onclick={() => flip('osnap')}>OSNAP</button>
		<button class:on={ws.drafting.showGrid} title="GRID ({KEYS.grid}): draw the grid (plans, elevations, sections)" onclick={() => flip('showGrid')}>GRID</button>
	</div>
	<div class="toggles">
		<button class:on={ws.inputMode === 'eos'} title={ws.inputMode === 'eos' ? 'EOS input: the wheel pans (Shift: sideways, Ctrl / Alt + wheel zooms); press-drag draws a line, run segment or dimension, a click works too. Click for ACAD input (wheel zooms, click the points).' : 'ACAD input: the wheel zooms, click the points. Click for EOS input (wheel pans, press-drag draws).'}
			aria-pressed={ws.inputMode === 'eos'} onclick={ws.toggleInputMode}>{ws.inputMode === 'eos' ? 'EOS' : 'ACAD'}</button>
	</div>
	{#if v}
		<span class="scale" title="{v.mmPerPx} mm a pixel">{v.scale} · {v.zoom}%{v.extra ? ` · ${v.extra}` : ''}</span>
	{/if}
	<button class="fit" title="Zoom to fit ({KEYS.fit})" onclick={onfit}>Fit</button>
</footer>

<style>
	.status { grid-area: status; display: flex; align-items: center; gap: 8px; height: 100%; padding: 0 8px; font-size: 11px; color: var(--cad-muted); background: var(--cad-subtle); border-top: 1px solid var(--cad-line); white-space: nowrap; min-width: 0; }
	.left { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
	.hint, .msg { overflow: hidden; text-overflow: ellipsis; display: block; }
	.msg { color: #b45309; }
	/* a question being asked (a drawing command's typed value): it stands out — the bar's top edge, an amber block
	   that pulses as it opens, a bold question and a ringed input (User 2026-10-12) */
	.status.asking { border-top: 2px solid #f59e0b; }
	.prompt { display: inline-flex; align-items: center; gap: 6px; background: #fde68a; padding: 1px 8px 1px 6px; border-left: 3px solid #d97706; border-radius: 4px; color: #78350f; font-size: 12px; animation: ask 0.9s ease-out 2; }
	.prompt .q { font-weight: 700; }
	@keyframes ask { 0%, 100% { background: #fde68a; } 50% { background: #fbbf24; } }
	.prompt input { width: 5rem; border: 1px solid #d97706; border-radius: 4px; padding: 0 4px; background: var(--cad-input); color: var(--cad-text); font-size: 12px; outline: 2px solid rgb(245 158 11 / 0.35); }
	.prompt input.wide { width: 12rem; font-family: ui-monospace, monospace; }
	.keys { font-size: 10px; opacity: 0.7; }
	.ro { color: var(--cad-link, #1d4ed8); font-weight: 600; font-size: 12px; }
	.xy { font-family: ui-monospace, Consolas, monospace; color: var(--cad-text); min-width: 9rem; }
	.toggles { display: flex; align-items: center; gap: 2px; }
	.toggles button { padding: 1px 6px; border-radius: 4px; font-size: 10px; letter-spacing: 0.04em; color: var(--cad-faint); border: 1px solid transparent; }
	.toggles button:hover { background: var(--cad-hover); }
	.toggles button.on { color: var(--cad-link, #1d4ed8); background: var(--cad-sel, #dbeafe); border-color: var(--cad-sel-line, #93c5fd); }
	.toggles .step { width: 4.5rem; font-size: 10px; padding: 0 2px; border: 1px solid var(--cad-line); border-radius: 4px; background: var(--cad-input); color: var(--cad-muted); margin-right: 4px; }
	.scale { color: var(--cad-muted); }
	.selc { padding: 0 6px; border-radius: 4px; color: var(--cad-link, #1d4ed8); background: var(--cad-sel, #dbeafe); font-weight: 600; }
	.selc:hover { background: #bfdbfe; }
	.load { display: inline-flex; align-items: center; gap: 4px; color: var(--cad-muted); }
	.spin { width: 10px; height: 10px; border: 2px solid var(--cad-sel-line, #93c5fd); border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }
	.fit { padding: 0 7px; border-radius: 4px; }
	.fit:hover { background: var(--cad-hover); color: var(--cad-text); }
</style>
