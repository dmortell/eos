<script lang="ts">
	// A sheet tab's paper page: an A3 sheet (always white — paper is paper in any
	// theme) holding one Viewport + a titleblock, like the Sheets tool. The viewport
	// itself is the reusable ui/Viewport (also used for standalone model views).
	// Clicking the viewport activates it; clicking the paper margin deactivates.
	import Viewport from '../ui/Viewport.svelte'

	let { title = 'Sheet', drawingNo = '001', scale = '1:100', zoom = 100, active = false, onactivate, ondeactivate }:
		{ title?: string; drawingNo?: string; scale?: string; zoom?: number; active?: boolean; onactivate?: () => void; ondeactivate?: () => void } = $props()
</script>

<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
<div class="paper-wrap" onclick={() => ondeactivate?.()}>
	<div class="paper" style:transform="scale({zoom / 100})">
		<div class="paper-vp">
			<Viewport kind="floorplan" label="Outlets · 33F" {scale} {active} {onactivate} />
		</div>
		<!-- titleblock (right vertical strip, like EOS) -->
		<div class="tb">
			<div class="tb-logo">J</div>
			<div class="tb-cell"><span>PROJECT</span><b>Hibiya Midtown</b></div>
			<div class="tb-cell"><span>TITLE</span><b>{title}</b></div>
			<div class="tb-grid">
				<div class="tb-cell"><span>SCALE</span>{scale}</div>
				<div class="tb-cell"><span>SIZE</span>A3</div>
				<div class="tb-cell"><span>DRAWN</span>DM</div>
				<div class="tb-cell"><span>DWG №</span>{drawingNo}</div>
			</div>
		</div>
	</div>
</div>

<style>
	.paper-wrap { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; overflow:hidden; }
	/* Paper is always white/light — it's paper, independent of the app theme. */
	.paper {
		height:86%; aspect-ratio:420/297; max-width:94%;
		background:#fff; color:#1f2937; box-shadow:0 10px 40px #0006;
		display:flex; gap:6px; padding:10px; transform-origin:center;
	}
	.paper-vp { flex:1; min-width:0; }
	/* Titleblock */
	.tb { width:16%; min-width:78px; display:flex; flex-direction:column; border:1px solid #64748b; }
	.tb-logo {
		height:34px; display:flex; align-items:center; justify-content:center;
		font-family:Georgia, serif; font-size:18px; font-weight:700; color:#1f2937; border-bottom:1px solid #94a3b8;
	}
	.tb-cell { border-bottom:1px solid #cbd5e1; padding:3px 5px; font-size:9px; color:#1f2937; min-width:0; overflow:hidden; }
	.tb-cell span { display:block; font-size:6px; letter-spacing:.08em; color:#94a3b8; }
	.tb-cell b { font-weight:600; }
	.tb-grid { margin-top:auto; display:grid; grid-template-columns:1fr 1fr; }
	.tb-grid .tb-cell { border-right:1px solid #cbd5e1; }
	.tb-grid .tb-cell:nth-child(even) { border-right:none; }
</style>
