<script lang="ts">
	// The Elevation tool's bar (like the Section / Opening bars): the next marker's band — how wide across the look and
	// how far ahead it sees (mm). ui/sectionSpec.svelte.ts remembers them; the marker's grips / Properties change them later.
	import { sectionSpec } from '../ui/sectionSpec.svelte'
	const n = (e: Event) => Math.max(1, Math.round(Number((e.currentTarget as HTMLInputElement).value) || 0))
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="esb" onpointerdown={(e) => e.stopPropagation()}>
	<span class="ttl">Elevation</span>
	<label title="How wide a band it sees, across the look (mm)">Width<input type="number" min="1" step="500" value={sectionSpec.elevWidth} onchange={(e) => sectionSpec.setElevWidth(n(e))} /></label>
	<label title="How far ahead it sees (mm)">Depth<input type="number" min="1" step="500" value={sectionSpec.elevDepth} onchange={(e) => sectionSpec.setElevDepth(n(e))} /></label>
	<span class="hint">click the point, then the way it looks (Shift = 15°, else the 4 axes) · or type X,Y then an angle</span>
</div>

<style>
	.esb { position:absolute; top:8px; left:50%; transform:translateX(-50%); z-index:7; display:flex; align-items:center; gap:6px;
		padding:4px 8px; background:var(--panel); border:1px solid var(--line); border-radius:7px; box-shadow:0 4px 14px #0006; font-size:11px; color:var(--muted); white-space:nowrap; }
	.ttl { font-weight:700; color:var(--text); }
	input { width:62px; margin-left:3px; background:var(--input); color:var(--text); border:1px solid var(--line-soft); border-radius:4px; font-size:11px; padding:1px 4px 1px 5px; }
	label { display:inline-flex; align-items:center; }
	.hint { color:var(--faint); }
</style>
