<script lang="ts">
	// A conduit's CROSS-SECTION with its cables packed in (3dview/fill.ts → the Fill Rate tool's packing), scaled
	// to fit the box, with a caption: label · size · fill %. Used in Properties (a preview) and as a sheet frame's
	// content (F12 — a fill-rate view on paper).
	import { packConduit, conduitFill, fillTone, fillLabel } from '../3dview/fill'
	import type { Conduit } from '../3dview/types'

	let { conduit, name = '', caption = true }: { conduit: Conduit; name?: string; caption?: boolean } = $props()
	const pk = $derived(packConduit(conduit))
	const pct = $derived(conduitFill(conduit))
	const tone = $derived(fillTone(pct))
	// the view box: the containment plus a margin, in mm (the packing is centred on the origin, y down)
	const W = $derived(pk.shape === 'round' ? pk.radius * 2 : pk.width), H = $derived(pk.shape === 'round' ? pk.radius * 2 : pk.height)
	const m = $derived(Math.max(W, H) * 0.08)
	const size = $derived(conduit.edges > 4 ? `Ø${conduit.w}` : `${conduit.w}×${conduit.h}`)
</script>

<div class="fs">
	<svg viewBox="{-W / 2 - m} {-H / 2 - m} {W + 2 * m} {H + 2 * m}" preserveAspectRatio="xMidYMid meet">
		{#if pk.shape === 'round'}
			<circle cx="0" cy="0" r={pk.radius} fill="#f8fafc" stroke="#334155" stroke-width={W * 0.012} />
		{:else}
			<rect x={-W / 2} y={-H / 2} width={W} height={H} fill="#f8fafc" stroke="#334155" stroke-width={W * 0.012} />
		{/if}
		{#each pk.cables as c, i (i)}
			<circle cx={c.x} cy={c.y} r={c.r} fill={tone} fill-opacity="0.25" stroke={tone} stroke-width={c.r * 0.12} />
		{/each}
	</svg>
	{#if caption}<div class="fs-cap"><b>{name || 'Conduit'}</b> · {size} · <span style:color={tone}>{Math.round(pct)}% fill</span>{#if fillLabel(conduit)}<em>{fillLabel(conduit).replace(/ · \d+%$/, '')}</em>{/if}</div>{/if}
</div>

<style>
	.fs { display:flex; flex-direction:column; width:100%; height:100%; min-height:0; background:#fff; }
	.fs svg { flex:1; min-height:0; width:100%; }
	.fs-cap { font-size:9px; color:#334155; padding:2px 4px; text-align:center; font-family:Consolas,monospace; }
	.fs-cap em { display:block; font-style:normal; color:#64748b; }
</style>
