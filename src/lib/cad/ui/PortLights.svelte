<svelte:options namespace="svg" />
<!-- The lit port cells of a rack view (views/portTip.ts portLights): far ends of the hovered port's cords, and free /
     taken ports while patching. Drawn over the ports, under the pointer's tip; clicks go through. -->
<script lang="ts">
	import type { Prim } from '../views/display'

	let { prims, lit }: { prims: Prim[]; lit: Map<string, string> } = $props()
	const cells = $derived(lit.size ? prims.flatMap((p) => (p.k === 'line' && p.closed && p.src && p.sub && p.cls.startsWith('port') && lit.has(`${p.src}:${p.sub}`)
		? [{ kind: lit.get(`${p.src}:${p.sub}`)!, pts: p.pts.map((q) => `${q.x},${q.y}`).join(' ') }] : [])) : [])
</script>

{#each cells as c, i (i)}<polygon class="pl {c.kind}" points={c.pts} vector-effect="non-scaling-stroke" />{/each}

<style>
	.pl { pointer-events: none; stroke-width: 1; }
	.free { fill: rgb(34 197 94 / 0.3); stroke: #16a34a; }
	.taken { fill: rgb(239 68 68 / 0.35); stroke: #dc2626; }
	.from { fill: rgb(250 204 21 / 0.6); stroke: #f59e0b; stroke-width: 2; }
	.far { fill: rgb(56 189 248 / 0.55); stroke: #0284c7; stroke-width: 2; }
</style>
