<!-- BULK PATCH PREVIEW: Patch to… on several ports, then a click on the first port of the other device, shows the cords
     it would make (A port → B port) and what it skips, before anything is written. In step (port for port from the one
     clicked) or "Fill free ports only" (the target's taken ports are passed over). OK = one undo step; Cancel / Esc =
     nothing patched. -->
<script lang="ts">
	import type { Workspace } from '../app/workspace.svelte'
	import { backdropClose, dialogFocus } from './backdrop'

	let { ws }: { ws: Workspace } = $props()
	const p = $derived(ws.patchPreview)
	/** The skip reasons, the same one once with its count. */
	const reasons = $derived.by(() => {
		const m = new Map<string, number>()
		for (const s of p?.skipped ?? []) m.set(s, (m.get(s) ?? 0) + 1)
		return [...m]
	})
	function key(e: KeyboardEvent) {
		if (!p) return
		// the drawing behind gets no keys while this is open
		e.stopPropagation()
		if (e.key === 'Escape') { e.preventDefault(); p.cancel() }
		else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement) && p.rows.length) { e.preventDefault(); p.ok() }
	}
</script>

<svelte:window onkeydowncapture={key} />

{#if p}
	<div class="backdrop" role="presentation" use:backdropClose={() => p.cancel()}>
		<div class="dlg" role="dialog" aria-label="Bulk patch preview" tabindex="-1" use:dialogFocus>
			<div class="head"><b>Patch {p.rows.length} cord{p.rows.length === 1 ? '' : 's'}</b> <span class="muted">{p.from} → {p.to}</span></div>
			<label class="fill" title="Off: port for port from the one clicked — a pair is skipped when either port is taken. On: every free port goes to the next free port on the other device (taken ones are passed over). Ctrl on the click picks the other way for that time.">
				<input type="checkbox" checked={p.fill} onchange={(e) => p.setFill(e.currentTarget.checked)} /> Fill free ports only</label>
			{#if p.rows.length}
				<div class="list">
					{#each p.rows as r, i (i)}
						<span class="n">{r.a}</span><span class="lbl">{r.aLabel}</span><span class="arr">→</span><span class="n">{r.b}</span><span class="lbl">{r.bLabel}</span>
					{/each}
				</div>
			{:else}
				<p class="none">Nothing to patch.</p>
			{/if}
			{#if p.skipped.length}
				<div class="skipped">
					<b>{p.skipped.length} port{p.skipped.length === 1 ? '' : 's'} skipped</b>
					{#each reasons.slice(0, 6) as [why, n] (why)}<div>{why}{n > 1 ? ` (×${n})` : ''}</div>{/each}
					{#if reasons.length > 6}<div>… and {reasons.length - 6} more</div>{/if}
				</div>
			{/if}
			<div class="row">
				<button class="yes" disabled={!p.rows.length} onclick={() => p.ok()}>Patch {p.rows.length}</button>
				<button onclick={() => p.cancel()}>Cancel</button>
				<span class="keys">Enter · Esc</span>
			</div>
		</div>
	</div>
{/if}

<style>
	.backdrop { position: fixed; inset: 0; z-index: 50; background: rgb(0 0 0 / 0.2); display: flex; align-items: flex-start; justify-content: center; padding-top: 8vh; }
	.dlg { width: min(28rem, 94vw); max-height: 80vh; display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; background: var(--cad-panel, white); color: var(--cad-text, #18181b); border: 1px solid var(--cad-line, #e4e4e7); border-radius: 8px; box-shadow: 0 8px 30px rgb(0 0 0 / 0.2); font-size: 12px; outline: none; }
	.muted { color: var(--cad-muted, #71717a); }
	.fill { display: flex; align-items: center; gap: 4px; }
	.list { display: grid; grid-template-columns: 2rem minmax(0, 1fr) auto 2rem minmax(0, 1fr); gap: 1px 6px; overflow: auto; min-height: 0; border: 1px solid var(--cad-line, #e4e4e7); border-radius: 4px; padding: 4px 6px; }
	.n { text-align: right; font-variant-numeric: tabular-nums; }
	.lbl { font-family: ui-monospace, monospace; font-size: 11px; color: var(--cad-muted, #71717a); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.arr { color: var(--cad-faint, #a1a1aa); }
	.none { margin: 0; color: var(--cad-muted, #71717a); }
	.skipped { color: #92400e; font-size: 11px; }
	.row { display: flex; align-items: center; gap: 6px; }
	button { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; padding: 2px 10px; background: var(--cad-input, white); color: inherit; }
	button.yes { background: #2563eb; border-color: #1d4ed8; color: #fff; font-weight: 600; }
	button.yes:disabled { opacity: 0.5; }
	button:focus-visible { outline: 2px solid #2563eb; outline-offset: 1px; }
	.keys { margin-left: auto; font-size: 10px; color: var(--cad-muted, #71717a); }
</style>
