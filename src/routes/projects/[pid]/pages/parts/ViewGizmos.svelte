<script lang="ts">
	// Fixed-size PANE-level view gizmos (Kestrel-style), drawn in screen space so they never
	// scale with the canvas zoom. Two pieces, mirroring Kestrel:
	//  · top-right ViewCube — an isometric cube with TOP / FRONT / RIGHT faces + a 3D button
	//    underneath; each switches the pane's projection.
	//  · bottom-left axis triad (Kestrel's drawUCS) — the x/y/z axes oriented for the current view.
	type Proj = 'plan' | 'elevation' | 'right' | 'model'
	let { projection = 'plan', onset }: { projection?: Proj; onset?: (p: Proj) => void } = $props()

	// Kestrel axis colours (renderer.js drawUCS): X red, Y green, Z blue.
	const AX = { x: '#d17f88', y: '#79b89e', z: '#7eabdf' }
	type Axis = [number, number] | null
	const TRIAD: Record<Proj, { x: Axis; y: Axis; z: Axis }> = {
		plan:      { x: [22, 0],  y: [0, -22],  z: null },      // top-down: Z toward viewer
		elevation: { x: [22, 0],  y: null,      z: [0, -22] },  // front: Y into screen
		right:     { x: null,     y: [22, 0],   z: [0, -22] },  // right: X into screen
		model:     { x: [19, 10], y: [-19, 10], z: [0, -23] },  // iso
	}
	const OX = 17, OY = 38
	const tri = $derived(TRIAD[projection])
</script>

<!-- Top-right ViewCube -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="vc" role="group" aria-label="View cube" onpointerdown={(e) => e.stopPropagation()}>
	<svg viewBox="0 0 64 62" width="82" height="80">
		<polygon class="face top" class:on={projection === 'plan'} points="32,6 58,20 32,34 6,20"
			role="button" tabindex="-1" aria-label="Top view" onclick={() => onset?.('plan')} />
		<polygon class="face front" class:on={projection === 'elevation'} points="6,20 32,34 32,58 6,44"
			role="button" tabindex="-1" aria-label="Front view" onclick={() => onset?.('elevation')} />
		<polygon class="face right" class:on={projection === 'right'} points="32,34 58,20 58,44 32,58"
			role="button" tabindex="-1" aria-label="Right view" onclick={() => onset?.('right')} />
		<text x="32" y="22" class="lbl">TOP</text>
		<text x="18" y="40" class="lbl" transform="rotate(28 18 40)">FRONT</text>
		<text x="46" y="40" class="lbl" transform="rotate(-28 46 40)">RIGHT</text>
	</svg>
	<button class="d3" class:on={projection === 'model'} onclick={() => onset?.('model')}>3D</button>
</div>

<!-- Bottom-left axis triad (WCS) -->
<div class="wcs" title="World coordinate system">
	<svg viewBox="0 0 54 54" width="52" height="52">
		{#each ['z', 'y', 'x'] as const as k (k)}
			{#if tri[k]}
				<line x1={OX} y1={OY} x2={OX + tri[k]![0]} y2={OY + tri[k]![1]} stroke={AX[k]} stroke-width="1.7" />
				<text x={OX + tri[k]![0] + (tri[k]![0] < 0 ? -3 : 4)} y={OY + tri[k]![1] + (tri[k]![1] < 0 ? -1 : 6)} class="ax" fill={AX[k]}>{k}</text>
			{:else}
				<circle cx={OX} cy={OY} r="3.2" fill="none" stroke={AX[k]} stroke-width="1.4" />
				<text x={OX + 6} y={OY + 3} class="ax" fill={AX[k]}>{k}</text>
			{/if}
		{/each}
		<text x={OX - 10} y={OY + 15} class="cap">WCS</text>
	</svg>
</div>

<style>
	/* No panel/background around the gizmos — just the cube + button and the triad. */
	.vc { position:absolute; top:10px; right:10px; z-index:6; display:flex; flex-direction:column; align-items:center; gap:2px; pointer-events:auto; }
	.vc svg { filter:drop-shadow(0 2px 4px #0005); }
	.face { stroke:#3f5570; stroke-width:0.8; cursor:pointer; outline:none; }
	.face.top { fill:#c2d0e4; } .face.front { fill:#9aacc7; } .face.right { fill:#7f93b2; }
	.face.on { fill:var(--accent); }
	/*.face.on:hover { fill:var(--accent); }*/
	.face:hover { fill:#e7b84d; }   /* amber highlight — clearly distinct from the teal selected face */
	.lbl { font-size:6px; fill:#1b2f45; font-weight:700; text-anchor:middle; pointer-events:none; }
	/* Solid chip so the label reads on any backdrop (white paper included), not just when active. */
	.d3 { pointer-events:auto; font-size:9px; font-weight:700; letter-spacing:.04em; color:var(--text);
		background:var(--panel); border:1px solid var(--line); border-radius:4px; padding:2px 10px; box-shadow:0 1px 3px #0004; }
	.d3:hover { border-color:var(--accent-dim); }
	.d3.on { color:var(--accent); border-color:var(--accent); background:var(--active); }
	.wcs { position:absolute; bottom:10px; left:10px; z-index:6; pointer-events:none; }
	.wcs svg { filter:drop-shadow(0 1px 2px #0006); }
	.ax { font-size:8px; font-weight:700; }
	.cap { font-size:7px; fill:var(--faint); font-weight:600; letter-spacing:.06em; }
</style>
