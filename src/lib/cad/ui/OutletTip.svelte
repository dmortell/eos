<!-- The OUTLET TIP over a plan (backlog "Usage colors and outlet tips"): at once (no delay), beside the pointer, for the
     outlet under it — its label, usage · tier · mount, and each port with the panel port it's on (views/portTip.ts).
     Hidden while a button is held (dragging) and off the outlets. Same look as the port tip. -->
<script lang="ts">
	import type { ProjectIndex } from '../domain/project'
	import type { Prim } from '../views/display'
	import type { Pt } from '../domain/types'
	import { toScreen, type Camera } from '../editor/camera'
	import { outletUnder, outletTip } from '../views/portTip'
	import { TOL_PX } from '../editor/tools'

	let { ix, prims, cursor, cam, dragging }: { ix: ProjectIndex; prims: Prim[]; cursor: Pt | null; cam: Camera; dragging: boolean } = $props()

	const o = $derived(cursor && !dragging ? outletUnder(ix, prims, cursor, TOL_PX / cam.k) : null)
	const lines = $derived(o ? outletTip(ix, o) : [])
	const at = $derived(cursor ? toScreen(cam, cursor) : { x: 0, y: 0 })
</script>

{#if lines.length}
	<div class="tip" style:left="{at.x + 14}px" style:top="{at.y + 14}px">
		{#each lines as l, i (i)}<div class:lbl={i === 0} class:head={i === 1}>{l}</div>{/each}
	</div>
{/if}

<style>
	.tip { position: absolute; z-index: 6; pointer-events: none; max-width: 26rem; padding: 3px 7px; border-radius: 4px; font-size: 11px; line-height: 1.35;
		background: rgb(15 23 42 / 0.92); color: #e2e8f0; box-shadow: 0 2px 8px rgb(0 0 0 / 0.25); white-space: nowrap; }
	.head { color: #94a3b8; }
	.lbl { font-family: ui-monospace, monospace; font-weight: 600; color: #fff; }
</style>
