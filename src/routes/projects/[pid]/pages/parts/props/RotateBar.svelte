<script lang="ts">
	// ROTATE for ANY drawing selection — shapes, boxes, racks, blocks, images, walls, conduits (like OpenCad's properties
	// panel): ⟲ / ⟳ 90° and a free "by" angle (CCW +, CAD sense), about the selection's middle as drawn — one item turns
	// in place (cmdBus target → vpInteraction.rotateSel, one undo step). 3D objects turn in plan only.
	import { toast } from 'svelte-sonner'
	import { Icon } from '$lib'
	import { cmdBus } from '../../ui/cmdBus.svelte'

	let by = $state<number | null>(15)
	function run(ccw: number) {
		const t = cmdBus.target
		if (!t?.rotateSel) { toast('Click into the viewport first'); return }
		const err = t.rotateSel(ccw); if (err) toast(err)
	}
	function runBy(sign: 1 | -1) { const n = Number(by); if (Number.isFinite(n) && n) run(sign * n) }
</script>

<div class="prop-sec">ROTATE</div>
<div class="prop"><span>Rotate</span>
	<span class="pp-seg rot">
		<button title="Rotate 90° counter-clockwise" onclick={() => run(90)}><Icon name="rotateLeft" size={13} /></button>
		<button title="Rotate 90° clockwise" onclick={() => run(-90)}><Icon name="rotateRight" size={13} /></button>
		<button title="Rotate 180°" onclick={() => run(180)}>180°</button>
	</span>
</div>
<div class="prop"><span>By (°)</span>
	<span class="pp-seg rot">
		<input type="number" step="any" bind:value={by} title="Angle to rotate by — Enter turns counter-clockwise, Shift+Enter clockwise"
			onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runBy(e.shiftKey ? -1 : 1) } }} />
		<button title="Rotate counter-clockwise by this angle" onclick={() => runBy(1)}><Icon name="rotateLeft" size={13} /></button>
		<button title="Rotate clockwise by this angle" onclick={() => runBy(-1)}><Icon name="rotateRight" size={13} /></button>
	</span>
</div>

<style>
	.rot button { display:flex; align-items:center; justify-content:center; }
	.rot input { flex:1.4; width:0; }
</style>
