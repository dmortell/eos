<script lang="ts">
	// Renders a 3D MODEL into a Pages viewport using the ported model3d projection.
	// model3d's project() returns {u, v} with v = height/depth UP (origin bottom-left). Pages draws in
	// model mm with y DOWN, elevations measured DOWN from GROUND and horizontally re-centred (elevU).
	// We reconcile with ONE per-direction affine group transform (computed here) instead of touching
	// the pure engine:
	//   • plan: (u,v) = (x,y) already matches Pages' y-down plan → identity.
	//   • elevation: v-up → GROUND−v (scale(1,-1)+translate y=GROUND); horizontal shifted so it lands on
	//     Pages' elevU centring (front 0, rear 2·cx, right cx−cy, left cx+cy).
	//   • iso: deferred (P1c) — the viewport keeps the mock iso for now.
	// Line thickness is NON-SCALING (constant screen px, `vector-effect`) and LAYER-DEFINED (each layer's
	// `weight`), so lineweight is a paper property independent of the drawing scale/zoom.
	import { project, objBounds } from './projection'
	import { BASIS } from './types'
	import type { Model, Obj, Dir, Clip } from './types'

	let { model, dir = 'plan', cx = 0, cy = 0, ground = 0, defaultWeight = 1, selIds = [], canvasZoom = 1, clip = null }:
		{ model: Model; dir?: Dir; cx?: number; cy?: number; ground?: number; defaultWeight?: number; selIds?: string[]; canvasZoom?: number; clip?: Clip | null } = $props()
	// A section clip culls objects whose bounds fall outside the box (x/y in plan; the elevation then
	// shows only that slice). A simple AABB-overlap cull — true trimToClip is a later refinement.
	const inClip = (o: Obj) => { if (!clip) return true; const b = objBounds(o); return b.x1 >= clip.x0 && b.x0 <= clip.x1 && b.y1 >= clip.y0 && b.y0 <= clip.y1 }

	const SEL = '#f59e0b'   // selection highlight (amber — distinct from the teal trunk layer)
	const layerOf = (o: Obj) => model.layers?.find((l) => l.id === o.layer)
	const isSel = (o: Obj) => !!o.id && selIds.includes(o.id)
	const colorOf = (o: Obj) => (isSel(o) ? SEL : layerOf(o)?.color ?? '#475569')
	// screen px (non-scaling-stroke cancels SVG transforms; ÷ canvasZoom cancels the ancestor CSS canvas
	// zoom too, so the lineweight is a constant screen-px value — matching how entities render).
	const weightOf = (o: Obj) => ((isSel(o) ? (layerOf(o)?.weight ?? defaultWeight) + 1.2 : layerOf(o)?.weight ?? defaultWeight) / (canvasZoom || 1))
	const visible = (o: Obj) => { const l = layerOf(o); return !l || l.visible }

	// Iso projects the model AROUND the ground pivot with a yaw/pitch, so the projected content isn't
	// symmetric about (0,0) — centring the pivot leaves the room off to one side. Instead centre the
	// iso content's OWN bounding box on the viewBox centre (cx,cy).
	const isoBox = $derived.by(() => {
		if (dir !== 'iso') return null
		let minu = Infinity, maxu = -Infinity, minv = Infinity, maxv = -Infinity
		for (const o of model.objects) {
			if (!visible(o)) continue
			for (const s of project(o, 'iso', undefined, undefined, cx, cy)) for (const p of s.pts) {
				if (p.u < minu) minu = p.u; if (p.u > maxu) maxu = p.u
				if (p.v < minv) minv = p.v; if (p.v > maxv) maxv = p.v
			}
		}
		return minu === Infinity ? null : { icx: (minu + maxu) / 2, icy: (minv + maxv) / 2 }
	})
	const xform = $derived.by(() => {
		if (dir === 'plan') return ''
		if (dir === 'iso') return `translate(${cx - (isoBox?.icx ?? 0)} ${cy + (isoBox?.icy ?? 0)}) scale(1 -1)`   // centre the iso content bbox on (cx,cy), v-up
		const b = BASIS[dir as 'front' | 'rear' | 'left' | 'right']
		const ox = cx - b.hs * (b.h === 'x' ? cx : cy)                    // shift onto Pages' elevU centring
		return `translate(${ox} ${ground}) scale(1 -1)`                   // v-up → GROUND − v
	})
</script>

<g class="m3d" transform={xform}>
	{#each model.objects as o (o.id)}
		{#if visible(o) && inClip(o)}
			{@const col = colorOf(o)}
			{@const lw = weightOf(o)}
			{#each project(o, dir, undefined, undefined, cx, cy) as s, i (i)}
				{#if s.closed}
					<polygon points={s.pts.map((p) => `${p.u},${p.v}`).join(' ')} fill="none" stroke={col} stroke-width={lw} vector-effect="non-scaling-stroke" />
				{:else}
					<polyline points={s.pts.map((p) => `${p.u},${p.v}`).join(' ')} fill="none" stroke={col} stroke-width={lw} vector-effect="non-scaling-stroke" />
				{/if}
			{/each}
		{/if}
	{/each}
</g>

<style>
	.m3d :global(polygon), .m3d :global(polyline) { stroke-linejoin: round; }
</style>
