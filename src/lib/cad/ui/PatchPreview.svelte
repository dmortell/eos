<!-- BULK PATCH / LINK PREVIEW: Patch to… (or Link to…, no fill choice there) on several ports, then a click on the first port of the other device, shows the cords
     it would make (A port → B port) and what it skips, before anything is written. In step (port for port from the one
     clicked) or "Fill free ports only" (the target's taken ports are passed over). OK = one undo step; Cancel / Esc =
     nothing patched. -->
<script lang="ts">
	import type { Workspace } from '../app/workspace.svelte'
	import CadDialog from './CadDialog.svelte'

	let { ws }: { ws: Workspace } = $props()
	const p = $derived(ws.patchPreview)
	/** The skip reasons, the same one once with its count. */
	const reasons = $derived.by(() => {
		const m = new Map<string, number>()
		for (const s of p?.skipped ?? []) m.set(s, (m.get(s) ?? 0) + 1)
		return [...m]
	})
	/** Enter patches (Esc is the dialog's: Cancel). */
	function key(e: KeyboardEvent) {
		if (p && e.key === 'Enter' && !(e.target instanceof HTMLButtonElement) && p.rows.length) { e.preventDefault(); p.ok() }
	}
</script>

{#if p}
	<CadDialog title={p.title ?? `Patch ${p.rows.length} cord${p.rows.length === 1 ? '' : 's'}`} hint="{p.from} → {p.to}" width="28rem" top="8vh" onclose={() => p.cancel()} onkeydown={key}>
		{#if p.setFill}{@const setFill = p.setFill}
		<label class="fill" title="Off: port for port from the one clicked — a pair is skipped when either port is taken. On: every free port goes to the next free port on the other device (taken ones are passed over). Ctrl on the click picks the other way for that time.">
			<input type="checkbox" checked={p.fill} onchange={(e) => setFill(e.currentTarget.checked)} /> Fill free ports only</label>
		{/if}
		{#if p.setStart && p.start}{@const setStart = p.setStart}
		<!-- R7-15: the port clicked was a neighbour of the one meant — set it here -->
		<label class="fill" title="The port on {p.to} the cords start at (the one you clicked) — change it here instead of clicking again">
			Start at port <input class="start" type="number" min="1" max={p.ports} value={p.start} onchange={(e) => setStart(Number(e.currentTarget.value))} />{#if p.ports}<span class="of">of {p.ports}</span>{/if}</label>
		{/if}
		{#if p.rows.length}
			<div class="list">
				{#each p.rows as r, i (i)}
					<span class="n">{r.a}</span><span class="lbl">{r.aLabel}</span><span class="arr">→</span><span class="n">{r.b}</span><span class="lbl">{r.bLabel}</span>
				{/each}
			</div>
		{:else}
			<p class="none">Nothing to {p.setFill ? 'patch' : 'link'}.</p>
		{/if}
		{#if p.skipped.length}
			<div class="skipped">
				<b>{p.skipped.length} port{p.skipped.length === 1 ? '' : 's'} skipped</b>
				{#each reasons.slice(0, 6) as [why, n] (why)}<div>{why}{n > 1 ? ` (×${n})` : ''}</div>{/each}
				{#if reasons.length > 6}<div>… and {reasons.length - 6} more</div>{/if}
			</div>
		{/if}
		{#snippet footer()}
			<span class="keys">Enter · Esc</span>
			<button class="btn" onclick={() => p.cancel()}>Cancel</button>
			<button class="btn go" disabled={!p.rows.length} onclick={() => p.ok()}>{p.okLabel ?? `Patch ${p.rows.length}`}</button>
		{/snippet}
	</CadDialog>
{/if}

<style>
	.fill { display: flex; align-items: center; gap: 4px; margin-bottom: 6px; font-size: 12px; }
	.start { width: 4rem; border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; padding: 1px 4px; background: var(--cad-input, white); color: inherit; }
	.of { color: var(--cad-muted, #71717a); }
	.list { display: grid; grid-template-columns: 2rem minmax(0, 1fr) auto 2rem minmax(0, 1fr); gap: 1px 6px; overflow: auto; min-height: 0; border: 1px solid var(--cad-line, #e4e4e7); border-radius: 4px; padding: 4px 6px; }
	.n { text-align: right; font-variant-numeric: tabular-nums; }
	.lbl { font-family: ui-monospace, monospace; font-size: 11px; color: var(--cad-muted, #71717a); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.arr { color: var(--cad-faint, #a1a1aa); }
	.none { margin: 0; color: var(--cad-muted, #71717a); }
	.skipped { color: #92400e; font-size: 11px; margin-top: 6px; }
</style>
