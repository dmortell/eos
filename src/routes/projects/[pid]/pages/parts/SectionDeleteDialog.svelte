<script lang="ts">
	// Deleting a SECTION that still drives sheet viewports (phase 3 — User: a section usually feeds several elevation
	// viewports): ask first. KEEP them as plain elevations (unlinked, each still showing its last view with its own notes),
	// or DELETE them too; Cancel leaves everything. One undo step either way (+page finishSectionDelete).
	import type { SectionLink } from '../ui/sectionLine'
	let { title, links, onkeep, ondelete, onclose }: { title: string; links: SectionLink[]; onkeep: () => void; ondelete: () => void; onclose: () => void } = $props()
	const n = $derived(links.length)
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onclose() } }} />
<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div class="sdd-back" onclick={onclose}>
	<div class="sdd" role="dialog" tabindex="-1" aria-modal="true" aria-label="Delete section" onclick={(e) => e.stopPropagation()}>
		<div class="sdd-title">Delete {title}?</div>
		<p>It drives {n} viewport{n === 1 ? '' : 's'}:</p>
		<ul>{#each links.slice(0, 8) as l (l.did + l.frameId)}<li>{l.sheet} · {l.frame}</li>{/each}{#if n > 8}<li>… and {n - 8} more</li>{/if}</ul>
		<p class="sdd-hint">Keep them as plain elevations — they stay, unlinked, showing their last view (with their own notes) — or delete them too.</p>
		<div class="sdd-btns">
			<button class="sdd-main" onclick={onkeep}>Keep them as plain elevations</button>
			<button class="sdd-del" onclick={ondelete}>Delete them too</button>
			<button onclick={onclose}>Cancel</button>
		</div>
	</div>
</div>

<style>
	.sdd-back { position:fixed; inset:0; z-index:200; background:#0006; display:flex; align-items:center; justify-content:center; }
	.sdd { width:min(420px, calc(100vw - 32px)); background:var(--panel, #fff); color:var(--text, #111827); border:1px solid var(--line, #cbd5e1); border-radius:8px; box-shadow:0 10px 30px #0006; padding:14px 16px; font-size:12px; }
	.sdd-title { font-weight:700; font-size:13px; margin-bottom:6px; }
	p { margin:4px 0; }
	ul { margin:2px 0 6px 18px; padding:0; max-height:160px; overflow:auto; }
	.sdd-hint { color:var(--muted, #64748b); }
	.sdd-btns { display:flex; flex-wrap:wrap; gap:6px; justify-content:flex-end; margin-top:10px; }
	.sdd-btns button { font-size:12px; border-radius:5px; padding:4px 10px; cursor:pointer; border:1px solid var(--line, #cbd5e1); background:var(--input, #f1f5f9); color:inherit; }
	.sdd-btns .sdd-main { background:var(--accent, #0e7490); border-color:var(--accent, #0e7490); color:#fff; }
	.sdd-btns .sdd-del { color:#dc2626; border-color:#dc262688; }
</style>
