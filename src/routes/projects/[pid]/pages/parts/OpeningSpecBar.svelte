<script lang="ts">
	// The Opening tool's bar (like the Trunk / Pipe spec bar): Door / Window / Rect hole, its height and sill — what
	// the next opening box (drag it across a wall in plan) is. ui/openingSpec.svelte.ts remembers it per type.
	import { openingSpec, OPEN_KINDS } from '../ui/openingSpec.svelte'
	const s = $derived(openingSpec.specs[openingSpec.kind])
	const n = (e: Event) => Math.max(0, Math.round(Number((e.currentTarget as HTMLInputElement).value) || 0))
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="osb" onpointerdown={(e) => e.stopPropagation()}>
	<span class="ttl">Opening</span>
	<span class="seg">
		{#each OPEN_KINDS as [k, l] (k)}<button class:on={openingSpec.kind === k} onclick={() => openingSpec.setKind(k)}>{l}</button>{/each}
	</span>
	<label title="Height of the opening (mm)">H<input type="number" min="1" step="50" value={s.h} onchange={(e) => openingSpec.set({ h: n(e) })} /></label>
	<label title="Sill: the opening's underside above the floor (mm; a door is 0)">Sill<input type="number" min="0" step="50" value={s.sill} onchange={(e) => openingSpec.set({ sill: n(e) })} /></label>
	<span class="hint">drag across a wall in plan</span>
</div>

<style>
	.osb { position:absolute; top:8px; left:50%; transform:translateX(-50%); z-index:7; display:flex; align-items:center; gap:6px;
		padding:4px 8px; background:var(--panel); border:1px solid var(--line); border-radius:7px; box-shadow:0 4px 14px #0006; font-size:11px; color:var(--muted); white-space:nowrap; }
	.ttl { font-weight:700; color:var(--text); }
	input { width:56px; margin-left:3px; background:var(--input); color:var(--text); border:1px solid var(--line-soft); border-radius:4px; font-size:11px; padding:1px 4px 1px 5px; }
	label { display:inline-flex; align-items:center; }
	.seg { display:inline-flex; border:1px solid var(--line-soft); border-radius:4px; overflow:hidden; }
	.seg button { background:none; border:none; color:var(--muted); font-size:11px; padding:1px 7px; cursor:pointer; }
	.seg button.on { background:var(--accent); color:contrast-color(var(--accent)); }
	.hint { color:var(--faint); }
</style>
