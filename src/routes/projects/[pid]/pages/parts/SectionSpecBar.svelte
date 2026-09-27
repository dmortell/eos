<script lang="ts">
	// The Section tool's bar (like the Opening / Trunk bars): Box or Line — what the next section is — and a line's
	// depth. ui/sectionSpec.svelte.ts remembers it. SECTIONLINE / the strip's "Section line" arm the Line form directly.
	import { sectionSpec, SECTION_KINDS } from '../ui/sectionSpec.svelte'
	const n = (e: Event) => Math.max(1, Math.round(Number((e.currentTarget as HTMLInputElement).value) || 0))
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="ssb" onpointerdown={(e) => e.stopPropagation()}>
	<span class="ttl">Section</span>
	<span class="seg">
		{#each SECTION_KINDS as [k, l] (k)}<button class:on={sectionSpec.kind === k} onclick={() => sectionSpec.setKind(k)}>{l}</button>{/each}
	</span>
	{#if sectionSpec.kind === 'line'}
		<label title="How far past the cut line the section sees (mm) — change it later on the section's depth grip / Properties">Depth<input type="number" min="1" step="500" value={sectionSpec.depth} onchange={(e) => sectionSpec.setDepth(n(e))} /></label>
		<span class="hint">two points (or drag) in plan · it looks to the line's left · flip later</span>
	{:else}
		<span class="hint">drag a box in plan · its arrows drop the elevations</span>
	{/if}
</div>

<style>
	.ssb { position:absolute; top:8px; left:50%; transform:translateX(-50%); z-index:7; display:flex; align-items:center; gap:6px;
		padding:4px 8px; background:var(--panel); border:1px solid var(--line); border-radius:7px; box-shadow:0 4px 14px #0006; font-size:11px; color:var(--muted); white-space:nowrap; }
	.ttl { font-weight:700; color:var(--text); }
	input { width:62px; margin-left:3px; background:var(--input); color:var(--text); border:1px solid var(--line-soft); border-radius:4px; font-size:11px; padding:1px 4px 1px 5px; }
	label { display:inline-flex; align-items:center; }
	.seg { display:inline-flex; border:1px solid var(--line-soft); border-radius:4px; overflow:hidden; }
	.seg button { background:none; border:none; color:var(--muted); font-size:11px; padding:1px 7px; cursor:pointer; }
	.seg button.on { background:var(--accent); color:contrast-color(var(--accent)); }
	.hint { color:var(--faint); }
</style>
