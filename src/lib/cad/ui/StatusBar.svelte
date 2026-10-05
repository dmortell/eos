<!-- The STATUS BAR under the panes (UX05, the Pages look): on the left the tool-bar prompt (a number, a name, a typed
     point — UX04 / UX19) or else the latest message or the tool's hint; then the active view's readout (length · angle
     while drawing, the cursor), the drafting switches (SNAP + grid step, OSNAP, GRID; F9 / F3 / F7), the scale, the
     zoom and Fit. -->
<script lang="ts">
	import type { Workspace } from '../app/workspace.svelte'

	let { ws, hint, onfit, onanswer }: { ws: Workspace; hint: string; onfit: () => void; onanswer: () => void } = $props()

	/** Grid steps (mm); 44.45 = one rack unit. */
	const STEPS = [1, 5, 10, 25, 50, 100, 250, 500, 1000]
	const flip = (k: 'snap' | 'osnap' | 'showGrid') => { ws.drafting[k] = !ws.drafting[k]; ws.saveDrafting() }

	let input: HTMLInputElement | undefined = $state()
	// focus the prompt when it opens: a number is selected (type over it); typed text keeps its first character
	$effect(() => {
		if (!ws.prompt || !input) return
		input.focus()
		if (ws.prompt.text) input.setSelectionRange(input.value.length, input.value.length)
		else input.select()
	})
	function key(e: KeyboardEvent) {
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

<footer class="status">
	<div class="left">
		{#if ws.prompt}
			<label class="prompt">{ws.prompt.label} <input bind:this={input} class:wide={ws.prompt.text} type={ws.prompt.text ? 'text' : 'number'} value={ws.prompt.value} onkeydown={key} />
				<span class="keys">Enter · Esc</span></label>
		{:else if ws.message}
			<span class="msg" title={ws.message}>{ws.message}</span>
		{:else}
			<span class="hint" title={hint}>{hint}</span>
		{/if}
	</div>
	{#if v?.readout}<b class="ro">{v.readout}</b>{/if}
	<span class="xy">{v?.xy ?? '—'}</span>
	<div class="toggles">
		<button class:on={ws.drafting.snap} title="SNAP (F9): moves and points step on the grid · Alt skips it for one action" onclick={() => flip('snap')}>SNAP</button>
		<select title="Grid step (mm)" value={ws.drafting.grid} onchange={(e) => { ws.drafting.grid = Number(e.currentTarget.value); ws.saveDrafting() }}>
			{#each STEPS as s (s)}<option value={s}>{s}</option>{/each}
		</select>
		<button class:on={ws.drafting.osnap} title="OSNAP (F3): snap to nodes, midpoints, centres, outlets and racks" onclick={() => flip('osnap')}>OSNAP</button>
		<button class:on={ws.drafting.showGrid} title="GRID (F7): draw the grid (plans, elevations, sections)" onclick={() => flip('showGrid')}>GRID</button>
	</div>
	{#if v}
		<span class="scale" title="{v.mmPerPx} mm a pixel">{v.scale} · {v.zoom}%{v.extra ? ` · ${v.extra}` : ''}</span>
	{/if}
	<button class="fit" title="Zoom to fit (Home)" onclick={onfit}>Fit</button>
</footer>

<style>
	.status { grid-area: status; display: flex; align-items: center; gap: 8px; height: 100%; padding: 0 8px; font-size: 11px; color: var(--cad-muted); background: var(--cad-subtle); border-top: 1px solid var(--cad-line); white-space: nowrap; min-width: 0; }
	.left { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
	.hint, .msg { overflow: hidden; text-overflow: ellipsis; display: block; }
	.msg { color: #b45309; }
	.prompt { display: inline-flex; align-items: center; gap: 6px; background: #fef3c7; padding: 1px 6px; border-radius: 4px; color: #78350f; }
	.prompt input { width: 5rem; border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 4px; background: var(--cad-input); color: var(--cad-text); }
	.prompt input.wide { width: 12rem; font-family: ui-monospace, monospace; }
	.keys { font-size: 10px; opacity: 0.7; }
	.ro { color: #1d4ed8; font-weight: 600; font-size: 12px; }
	.xy { font-family: ui-monospace, Consolas, monospace; color: var(--cad-text); min-width: 9rem; }
	.toggles { display: flex; align-items: center; gap: 2px; }
	.toggles button { padding: 1px 6px; border-radius: 4px; font-size: 10px; letter-spacing: 0.04em; color: var(--cad-faint); border: 1px solid transparent; }
	.toggles button:hover { background: var(--cad-hover); }
	.toggles button.on { color: #1d4ed8; background: #dbeafe; border-color: #93c5fd; }
	.toggles select { font-size: 10px; border: 1px solid var(--cad-line); border-radius: 4px; background: var(--cad-input); color: var(--cad-muted); margin-right: 4px; }
	.scale { color: var(--cad-muted); }
	.fit { padding: 0 7px; border-radius: 4px; }
	.fit:hover { background: var(--cad-hover); color: var(--cad-text); }
</style>
