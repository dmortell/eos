<script lang="ts">
	// Bottom status bar (Pages mockup): full-size toggle, cursor coords, the drafting
	// toggles (GRID/SNAP/ORTHO/OSNAP/LWT) + the ACAD interaction toggle, and zoom controls.
	// A page can hold viewports of different models, so there's no page-wide "Model" space —
	// instead a Full-size toggle makes the drawing fill the pane (off = the A3 sheet layout),
	// mirroring the Sheets tool's viewport full-size view.
	import type { PaperSize } from '../constants'
	// Tooltips for the terse toggle codes.
	const TOGGLE_TITLES: Record<string, string> = {
		GRID: 'Show the reference grid', SNAP: 'Snap points to the grid (step: the box beside it)', ORTHO: 'Constrain draw/move to horizontal/vertical',
		OSNAP: 'Snap to object points (ends, midpoints, centres)', LWT: 'Show lineweights', CEN: 'Draw rectangles/ellipses centre-out (first click = centre)',
	}
	// SNAP grid steps (model mm). 44.45 = one rack unit (1U), so rack devices step U by U in an elevation.
	const SNAP_STEPS: [number, string][] = [[1, '1'], [5, '5'], [10, '10'], [25, '25'], [44.45, '1U'], [50, '50'], [100, '100'], [250, '250'], [500, '500'], [1000, '1000']]
	let { toggles = $bindable<Record<string, boolean>>({}), snapStep = $bindable(100), acadMode = $bindable(true),
		paperSize = 'A3', paperLandscape = true, onpapersize, onorient,
		coords = null, zoom = 100, onzoom, onfit }:
		{ toggles?: Record<string, boolean>; snapStep?: number; acadMode?: boolean;
			paperSize?: PaperSize; paperLandscape?: boolean; onpapersize?: (s: PaperSize) => void; onorient?: (landscape: boolean) => void;
			coords?: { x: number; y: number } | null; zoom?: number; onzoom?: (f: number) => void; onfit?: () => void } = $props()
</script>

<footer class="statusbar">
	<div class="layout-tabs">
		<!-- paper size + orientation (only meaningful in Sheet layout) -->
		<label class="paper-sel" title="Paper size">
			<select value={paperSize} onchange={(e) => onpapersize?.((e.currentTarget as HTMLSelectElement).value as PaperSize)}>
				<option value="A4">A4</option><option value="A3">A3</option><option value="A2">A2</option>
			</select>
		</label>
		<button class="orient" title="Orientation (portrait / landscape)" onclick={() => onorient?.(!paperLandscape)}>
			<span class="orient-glyph" class:portrait={!paperLandscape}></span>
			{paperLandscape ? 'Landscape' : 'Portrait'}
		</button>
	</div>
	<div class="coords">{coords ? `${coords.x}, ${coords.y} mm` : '—'}</div>
	<div class="toggles">
		{#each Object.keys(toggles) as k (k)}
			<button class:on={toggles[k]} title={TOGGLE_TITLES[k] ?? k} onclick={() => (toggles[k] = !toggles[k])}>{k}</button>
			{#if k === 'SNAP'}
				<select class="snap-step" title="Grid snap step (mm; 1U = 44.45 mm, one rack unit)" value={snapStep}
					onchange={(e) => (snapStep = Number((e.currentTarget as HTMLSelectElement).value))}>
					{#each SNAP_STEPS as [v, label] (v)}<option value={v}>{label}</option>{/each}
				</select>
			{/if}
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
	.paper-sel select { background:var(--panel); color:var(--text); border:1px solid var(--line-soft); border-radius:4px; padding:1px 4px; font-size:11px; }
	.paper-sel select:focus { outline:none; border-color:var(--accent); }
	.orient { display:inline-flex; align-items:center; gap:5px; padding:2px 8px; border-radius:4px; color:var(--muted); background:none; border:none; font-size:11px; }
	.orient:hover { background:var(--hover); color:var(--text); }
	.orient-glyph { width:14px; height:10px; border:1.4px solid currentColor; border-radius:1px; flex:0 0 auto; }
	.orient-glyph.portrait { width:10px; height:14px; }
	.coords { font-family:Consolas,monospace; padding:0 10px; color:var(--text); min-width:96px; }
	.toggles { display:flex; gap:2px; }
	.toggles button { padding:2px 7px; border-radius:4px; font-size:10px; letter-spacing:.04em; color:var(--faint); background:none; border:1px solid transparent; }
	.toggles button:hover { background:var(--hover); }
	.toggles button.on { color:var(--accent); background:var(--active); border-color:var(--accent-dim); }
	.snap-step { font-size:10px; color:var(--muted); background:var(--input); border:1px solid var(--line-soft); border-radius:4px; padding:0 2px; margin-right:4px; }
	.sb-spacer { flex:1; }
	.zoom { display:flex; align-items:center; gap:4px; }
	.zoom button { width:20px; height:18px; border-radius:4px; color:var(--muted); background:none; border:none; }
	.zoom button.fit { width:auto; padding:0 7px; }
	.zoom button:hover { background:var(--hover); color:var(--text); }
	.zoom span { color:var(--text); min-width:38px; text-align:center; }
</style>
