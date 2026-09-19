<script lang="ts">
	// Bottom status bar (Pages mockup): full-size toggle, cursor coords, the drafting
	// toggles (GRID/SNAP/ORTHO/OSNAP/LWT) + the ACAD interaction toggle, and zoom controls.
	// A page can hold viewports of different models, so there's no page-wide "Model" space —
	// instead a Full-size toggle makes the drawing fill the pane (off = the A3 sheet layout),
	// mirroring the Sheets tool's viewport full-size view.
	import { Icon } from '$lib'
	let { layout = $bindable('sheet'), toggles = $bindable<Record<string, boolean>>({}), acadMode = $bindable(true),
		cx = 0, cy = 0, zoom = 100, onzoom, onfit }:
		{ layout?: 'model' | 'sheet'; toggles?: Record<string, boolean>; acadMode?: boolean;
			cx?: number; cy?: number; zoom?: number; onzoom?: (f: number) => void; onfit?: () => void } = $props()
</script>

<footer class="statusbar">
	<div class="layout-tabs">
		<button class="fullsize" class:on={layout === 'model'}
			title="Full-size: fill the pane with the drawing (off = show the A3 sheet layout)"
			onclick={() => (layout = layout === 'model' ? 'sheet' : 'model')}>
			<Icon name={layout === 'model' ? 'panels' : 'expand'} size={13} />
			{layout === 'model' ? 'Full-size' : 'Sheet A3'}
		</button>
	</div>
	<div class="coords">{cx}, {cy} mm</div>
	<div class="toggles">
		{#each Object.keys(toggles) as k (k)}
			<button class:on={toggles[k]} onclick={() => (toggles[k] = !toggles[k])}>{k}</button>
		{/each}
		<button class:on={acadMode} title="AutoCAD interactions: wheel zooms, draw with two clicks (off = EOS: wheel pans, press-drag to draw)" onclick={() => (acadMode = !acadMode)}>ACAD</button>
	</div>
	<div class="sb-spacer"></div>
	<div class="zoom">
		<button onclick={() => onzoom?.(0.8)}>−</button>
		<span>{zoom}%</span>
		<button onclick={() => onzoom?.(1.25)}>+</button>
		<button class="fit" onclick={() => onfit?.()}>Fit</button>
	</div>
</footer>

<style>
	.statusbar { height:26px; flex:0 0 auto; display:flex; align-items:center; gap:2px;
		background:var(--title); border-top:1px solid var(--line); padding:0 6px; font-size:11px; color:var(--muted); }
	.layout-tabs { display:flex; gap:2px; }
	.layout-tabs button { display:inline-flex; align-items:center; gap:5px; padding:2px 9px; border-radius:4px; color:var(--muted); background:none; border:none; font-size:11px; }
	.layout-tabs button :global(svg) { flex:0 0 auto; }
	.layout-tabs button.on { background:var(--active); color:var(--text); box-shadow:inset 0 -2px 0 var(--accent); }
	.coords { font-family:Consolas,monospace; padding:0 10px; color:var(--text); min-width:96px; }
	.toggles { display:flex; gap:2px; }
	.toggles button { padding:2px 7px; border-radius:4px; font-size:10px; letter-spacing:.04em; color:var(--faint); background:none; border:1px solid transparent; }
	.toggles button:hover { background:var(--hover); }
	.toggles button.on { color:var(--accent); background:var(--active); border-color:var(--accent-dim); }
	.sb-spacer { flex:1; }
	.zoom { display:flex; align-items:center; gap:4px; }
	.zoom button { width:20px; height:18px; border-radius:4px; color:var(--muted); background:none; border:none; }
	.zoom button.fit { width:auto; padding:0 7px; }
	.zoom button:hover { background:var(--hover); color:var(--text); }
	.zoom span { color:var(--text); min-width:38px; text-align:center; }
</style>
