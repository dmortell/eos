<!-- The PORT TIP over a rack view (backlog "Port hover tips"): at once (no delay), beside the pointer, for the port
     under it — its place and full label, the cable plugged in, its cords (views/portTip.ts). Hidden while a button is
     held (dragging) and off the ports. -->
<script lang="ts">
	import type { ProjectIndex } from '../domain/project'
	import type { Prim } from '../views/display'
	import type { Pt } from '../domain/types'
	import { toScreen, type Camera } from '../editor/camera'
	import { portUnder, portTip } from '../views/portTip'

	let { ix, prims, cursor, cam, face, dragging }: { ix: ProjectIndex; prims: Prim[]; cursor: Pt | null; cam: Camera; face: 'front' | 'rear'; dragging: boolean } = $props()

	const port = $derived(cursor && !dragging ? portUnder(prims, cursor, face) : null)
	const lines = $derived(port ? portTip(ix, port) : [])
	const at = $derived(cursor ? toScreen(cam, cursor) : { x: 0, y: 0 })
</script>

{#if lines.length}
	<div class="tip" style:left="{at.x + 14}px" style:top="{at.y + 14}px">
		{#each lines as l, i (i)}<div class:head={i === 0} class:lbl={i === 1 && !l.includes('→')}>{l}</div>{/each}
	</div>
{/if}

<style>
	.tip { position: absolute; z-index: 6; pointer-events: none; max-width: 26rem; padding: 3px 7px; border-radius: 4px; font-size: 11px; line-height: 1.35;
		background: rgb(15 23 42 / 0.92); color: #e2e8f0; box-shadow: 0 2px 8px rgb(0 0 0 / 0.25); white-space: nowrap; }
	.head { color: #94a3b8; }
	.lbl { font-family: ui-monospace, monospace; font-weight: 600; color: #fff; }
</style>
