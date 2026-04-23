<script lang="ts">
	import type { Viewport } from '$lib/types/pages'
	import type { Section } from '../../../fillrate/parts/constants'
	import { calcFillRate } from '../../../fillrate/parts/constants'
	import { Firestore } from '$lib'
	import SectionCanvas from '../../../fillrate/parts/SectionCanvas.svelte'

	let { viewport, db }: { viewport: Viewport; db: Firestore } = $props()

	let src = $derived(viewport.source.kind === 'fillrate' ? viewport.source : null)

	let fillrateDoc = $state<any>(null)
	$effect(() => {
		const id = src?.projectId
		if (!id) { fillrateDoc = null; return }
		const unsub = db.subscribeOne('fillrate', id, (data: any) => { fillrateDoc = data ?? null })
		return () => unsub?.()
	})

	let sections = $derived<Section[]>(fillrateDoc?.sections ?? [])

	/**
	 * Fit sections into a grid inside the viewport. Aim for square-ish tiles;
	 * the tile canvas is rendered at 120px for legibility regardless of viewport
	 * scale — the outer page-canvas transform scales us down to the chosen print
	 * scale, so tile content stays crisp at zoom.
	 */
	let cols = $derived(Math.max(1, Math.min(sections.length, Math.ceil(Math.sqrt(sections.length)))))
	const TILE_PX = 120
</script>

<div class="absolute inset-0 overflow-auto pointer-events-none bg-white p-1">
	{#if !src?.projectId}
		<div class="w-full h-full flex items-center justify-center text-[10px] text-zinc-400 italic">
			Source project unset
		</div>
	{:else if !fillrateDoc}
		<div class="w-full h-full flex items-center justify-center text-[10px] text-zinc-400 italic">
			Loading…
		</div>
	{:else if sections.length === 0}
		<div class="w-full h-full flex items-center justify-center text-[10px] text-zinc-400 italic">
			No fill-rate sections yet
		</div>
	{:else}
		<div class="grid gap-1" style:grid-template-columns="repeat({cols}, minmax(0, 1fr))">
			{#each sections as section, i (section.id)}
				{@const rate = calcFillRate(section)}
				<div class="border border-zinc-200 bg-zinc-50 p-1 flex flex-col items-center">
					<div class="font-mono text-[6pt] text-zinc-500 truncate w-full text-center">{section.label || `#${i + 1}`}</div>
					<SectionCanvas {section} size={TILE_PX} />
					<div class="text-[6pt] font-mono" class:text-red-500={rate > 50} class:text-zinc-600={rate <= 50}>
						{rate.toFixed(0)}%
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
