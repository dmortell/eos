<script lang="ts">
	// Renders a fill-rate cross-section (a trunk section packed with cables) inside a sheet viewport.
	// Static, like TextViewport: the section is laid out in mm by packSection() and drawn as SVG,
	// fit-to-frame in the viewport's paper-mm space so model-mode pan/zoom (the host `view`) works.
	import { getContext } from 'svelte'
	import { page } from '$app/state'
	import type { Firestore } from '$lib/db.svelte'
	import type { SheetViewport } from '../../types'
	import type { Section } from '../../../fillrate/parts/constants'
	import { packSection, fillCableColor } from '../../../fillrate/parts/packing'

	let { vp, view = null, onview }: {
		vp: SheetViewport
		view?: { x: number; y: number; w: number; h: number } | null
		onview?: (v: { x: number; y: number; w: number; h: number; den: number }) => void
	} = $props()

	const db = getContext('db') as Firestore
	let pid = $derived(page.params.pid ?? '')
	let sectionId = $derived(vp.source.kind === 'fillrate' ? vp.source.sectionId : '')

	let sections = $state<Section[]>([])
	$effect(() => {
		if (!pid) return
		const unsub = db.subscribeOne('fillrate', pid, (d: any) => { sections = Array.isArray(d?.sections) ? d.sections : [] })
		return () => unsub?.()
	})
	let section = $derived(sections.find(s => s.id === sectionId) ?? null)
	let packed = $derived(section ? packSection(section) : null)

	// Frame interior (paper mm). The section is fit-scaled into it, with a label band at the bottom.
	let W = $derived(Math.max(1, vp.w))
	let H = $derived(Math.max(1, vp.h))
	$effect(() => { onview?.({ x: 0, y: 0, w: W, h: H, den: 1 }) })
	let viewBox = $derived(view ? `${view.x} ${view.y} ${view.w} ${view.h}` : `0 0 ${W} ${H}`)

	const PAD = 0.08   // frame padding fraction
	let layout = $derived.by(() => {
		if (!packed) return null
		const bw = packed.shape === 'round' ? packed.radius * 2 : packed.width
		const bh = packed.shape === 'round' ? packed.radius * 2 : packed.height
		const padX = W * PAD, padY = H * PAD
		const labelBand = Math.min(H * 0.16, Math.max(6, H * 0.12))   // room for the caption below
		const availW = Math.max(1, W - 2 * padX)
		const availH = Math.max(1, H - 2 * padY - labelBand)
		const k = Math.min(availW / bw, availH / bh)
		const cx = W / 2
		const cy = padY + availH / 2     // centre of the drawing area (above the label band)
		return { k, cx, cy, labelBand, capY: H - labelBand / 2, font: Math.min(labelBand * 0.55, 4) }
	})

	const fmtPct = (n: number) => `${n.toFixed(1)}%`
	let caption = $derived(section ? (
		packed!.shape === 'round' ? `Ø${section.diameter}mm` : `${section.width}×${section.height}mm`
	) : '')
</script>

{#snippet body()}
	{#if !section}
		<div class="flex h-full w-full items-center justify-center text-center text-zinc-400 select-none" style:font-size="{Math.max(2, H * 0.06)}px">
			{sectionId ? 'Fill-rate section not found' : 'Choose a fill-rate section'}
		</div>
	{/if}
{/snippet}

{#if section && packed && layout}
	{@const L = layout}
	<svg class="h-full w-full" {viewBox} preserveAspectRatio="xMidYMid meet">
		<g transform="translate({L.cx} {L.cy}) scale({L.k})">
			{#if packed.shape === 'round'}
				<circle cx="0" cy="0" r={packed.radius} fill="#eff6ff" stroke="#1e40af" stroke-width="0.6" vector-effect="non-scaling-stroke" />
			{:else}
				<rect x={-packed.width / 2} y={-packed.height / 2} width={packed.width} height={packed.height} fill="#eff6ff" stroke="#1e40af" stroke-width="0.6" vector-effect="non-scaling-stroke" />
			{/if}
			{#each packed.cables as c, i (i)}
				<circle cx={c.x} cy={c.y} r={c.r} fill={fillCableColor(packed.fillRate)} stroke="#000" stroke-width="0.3" vector-effect="non-scaling-stroke" />
				{#if c.r * L.k > 4}
					<text x={c.x} y={c.y} font-size={c.r * 0.9} fill="#fff" text-anchor="middle" dominant-baseline="central">{c.diameter}</text>
				{/if}
			{/each}
		</g>
		<!-- caption: containment size + fill % -->
		<text x={W * 0.5} y={L.capY} font-size={L.font} text-anchor="middle" dominant-baseline="central" fill="#374151">
			{section.label} · {caption} · Fill {fmtPct(packed.fillRate)}
		</text>
	</svg>
{:else}
	{@render body()}
{/if}
