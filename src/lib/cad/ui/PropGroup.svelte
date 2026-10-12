<!-- A GROUP of Properties rows (UX11): a title that folds it; open / folded is remembered per kind of thing and group in
     this browser (e.g. a rack's "Position" stays folded for every rack). -->
<script lang="ts">
	import type { Snippet } from 'svelte'

	/** `id`: what its open / folded state is remembered by, when the title changes ("3 racks"); default the title. */
	let { kind, title, id, children }: { kind: string; title: string; id?: string; children: Snippet } = $props()
	const key = () => `cad:pg:${kind}:${id ?? title}`
	let open = $state(read())
	$effect(() => { open = read() })   // another kind / group: its own remembered state (Q40)
	function read(): boolean { try { return localStorage.getItem(key()) !== '0' } catch { return true } }
	function toggle() { open = !open; try { localStorage.setItem(key(), open ? '1' : '0') } catch { /* storage blocked */ } }
</script>

<div class="pg">
	<button class="h" aria-expanded={open} onclick={toggle}><span class="c">{open ? '▾' : '▸'}</span>{title}</button>
	{#if open}<div class="b">{@render children()}</div>{/if}
</div>

<style>
	.pg { border-top: 1px solid var(--cad-line); padding-top: 3px; }
	.h { display: flex; align-items: center; gap: 4px; width: 100%; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--cad-muted); padding: 1px 0; }
	.h:hover { color: var(--cad-text); }
	.c { width: 10px; font-size: 9px; }
	.b { display: flex; flex-direction: column; gap: 0.25rem; padding: 2px 0 4px; }
</style>
