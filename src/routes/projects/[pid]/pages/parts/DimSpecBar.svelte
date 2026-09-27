<script lang="ts">
	// The Dimension tool's bar (like the Section / Opening bars): what the next dimension measures — Aligned (the true
	// distance), Linear (horizontal or vertical by the larger delta, AutoCAD DIMLINEAR), Horizontal or Vertical.
	// ui/dimSpec.svelte.ts remembers it; while drawing, the command line takes A / L / H / V too.
	import { dimSpec, DIM_TOOL_MODES } from '../ui/dimSpec.svelte'
	const TIPS: Record<string, string> = {
		aligned: 'The true distance between the points, the line parallel to them (DIMALIGNED)',
		auto: 'Horizontal or vertical — whichever way the points are further apart (DIMLINEAR)',
		h: 'Only the horizontal distance (Δx)', v: 'Only the vertical distance (Δy)',
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="dsb" onpointerdown={(e) => e.stopPropagation()}>
	<span class="ttl">Dimension</span>
	<span class="seg">
		{#each DIM_TOOL_MODES as [m, l] (m)}<button class:on={dimSpec.mode === m} title={TIPS[m]} onclick={() => dimSpec.setMode(m)}>{l}</button>{/each}
	</span>
	<span class="hint">two points · then drag its line / text grips · Properties › Mode</span>
</div>

<style>
	.dsb { position:absolute; top:8px; left:50%; transform:translateX(-50%); z-index:7; display:flex; align-items:center; gap:6px;
		padding:4px 8px; background:var(--panel); border:1px solid var(--line); border-radius:7px; box-shadow:0 4px 14px #0006; font-size:11px; color:var(--muted); white-space:nowrap; }
	.ttl { font-weight:700; color:var(--text); }
	.seg { display:inline-flex; border:1px solid var(--line-soft); border-radius:4px; overflow:hidden; }
	.seg button { background:none; border:none; color:var(--muted); font-size:11px; padding:1px 7px; cursor:pointer; }
	.seg button.on { background:var(--accent); color:contrast-color(var(--accent)); }
	.hint { color:var(--faint); }
</style>
