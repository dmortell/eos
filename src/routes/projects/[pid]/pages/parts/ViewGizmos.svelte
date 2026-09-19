<script lang="ts">
	// Fixed-size PANE-level view gizmos (Kestrel-style), drawn in screen space so they never
	// scale with the canvas zoom (the old in-viewport cube did, because it lived inside the
	// zoomed canvas). Two pieces, mirroring Kestrel:
	//  · top-right ViewCube — an isometric cube with TOP / FRONT / RIGHT faces; clicking a face
	//    switches the pane's projection.
	//  · bottom-left axis triad (Kestrel's drawUCS) — the x/y/z axes oriented for the current
	//    view. (Kestrel spins this as you orbit; our mock has fixed projections, so it shows the
	//    orientation of each.)
	type Proj = 'plan' | 'elevation' | 'model'
	let { projection = 'plan', onset }: { projection?: Proj; onset?: (p: Proj) => void } = $props()

	// Kestrel axis colours (renderer.js drawUCS): X red, Y green, Z blue.
	const AX = { x: '#d17f88', y: '#79b89e', z: '#7eabdf' }
	// Axis directions per view, from the triad origin (screen px). A null axis points into/out of
	// the screen and is drawn as a small ring instead of a line.
	type Axis = [number, number] | null
	const TRIAD: Record<Proj, { x: Axis; y: Axis; z: Axis }> = {
		plan:      { x: [22, 0],  y: [0, -22], z: null },       // top-down: Z toward viewer
		elevation: { x: [22, 0],  y: null,     z: [0, -22] },   // front: Y into screen
		model:     { x: [19, 10], y: [-19, 10], z: [0, -23] },  // iso
	}
	const OX = 17, OY = 38   // triad origin within its 54×54 box
	const tri = $derived(TRIAD[projection])
</script>

<!-- Top-right ViewCube: clickable TOP / FRONT / RIGHT faces -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="vc" role="group" aria-label="View cube" onpointerdown={(e) => e.stopPropagation()}>
	<svg viewBox="0 0 64 62" width="58" height="56">
		<!-- TOP face → plan -->
		<polygon class="face" class:on={projection === 'plan'} points="32,6 58,20 32,34 6,20"
			role="button" tabindex="0" aria-label="Top view" onclick={() => onset?.('plan')}
			onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onset?.('plan') } }} />
		<!-- FRONT face → elevation -->
		<polygon class="face" class:on={projection === 'elevation'} points="6,20 32,34 32,58 6,44"
			role="button" tabindex="0" aria-label="Front view" onclick={() => onset?.('elevation')}
			onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onset?.('elevation') } }} />
		<!-- RIGHT face → 3D model (mock: no distinct side view yet) -->
		<polygon class="face" class:on={projection === 'model'} points="32,34 58,20 58,44 32,58"
			role="button" tabindex="0" aria-label="3D / right view" onclick={() => onset?.('model')}
			onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onset?.('model') } }} />
		<text x="32" y="22" class="lbl">TOP</text>
		<text x="17" y="47" class="lbl">FR</text>
		<text x="47" y="47" class="lbl">3D</text>
	</svg>
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
	.vc { position:absolute; top:10px; right:10px; z-index:6; pointer-events:auto;
		background:color-mix(in srgb, var(--panel) 80%, transparent); border:1px solid var(--line-soft);
		border-radius:8px; padding:2px; backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); box-shadow:0 6px 22px #0004; }
	.face { fill:#c8d5e8; stroke:#5c7396; stroke-width:0.8; cursor:pointer; }
	.face:hover { fill:#9fb6d6; }
	.face.on { fill:var(--accent); }
	.lbl { font-size:6.5px; fill:#26405a; font-weight:700; text-anchor:middle; pointer-events:none; }
	.wcs { position:absolute; bottom:10px; left:10px; z-index:6; pointer-events:none;
		background:color-mix(in srgb, var(--panel) 72%, transparent); border:1px solid var(--line-soft);
		border-radius:8px; padding:1px; }
	.ax { font-size:8px; font-weight:700; }
	.cap { font-size:7px; fill:var(--faint); font-weight:600; letter-spacing:.06em; }
</style>
