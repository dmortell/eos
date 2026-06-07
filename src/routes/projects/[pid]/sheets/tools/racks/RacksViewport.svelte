<script lang="ts">
	import { getContext } from 'svelte'
	import type { Firestore } from '$lib/db.svelte'
	import type { SheetViewport } from '../../types'
	import type { RackDocData } from './types'
	import RacksRender from './RacksRender.svelte'

	let { vp, zoom = 1, active = false, view = null, onview }: {
		vp: SheetViewport
		zoom?: number
		active?: boolean
		view?: { x: number; y: number; w: number; h: number } | null
		onview?: (v: { x: number; y: number; w: number; h: number; den: number }) => void
	} = $props()
	const db = getContext('db') as Firestore

	let src = $derived(vp.source.kind === 'racks' ? vp.source : null)
	let doc = $state<RackDocData | null>(null)

	$effect(() => {
		const id = src?.racksDocId
		if (!id) { doc = null; return }
		const unsub = db.subscribeOne('racks', id, (d: any) => { doc = d ?? null })
		return () => unsub?.()
	})
</script>

{#if src}
	<RacksRender
		racks={doc?.racks ?? []}
		devices={doc?.devices ?? []}
		settings={doc?.settings ?? null}
		roomObjects={doc?.roomObjects ?? []}
		rows={doc?.rows ?? []}
		face={src.face}
		rowId={src.rowId}
		showWalls={src.showWalls ?? false}
		colorDevices={src.colorDevices ?? true}
		{vp} {view} {onview} />
{:else}
	<div class="flex h-full w-full items-center justify-center text-zinc-400 print:hidden" style:font-size="{14 / zoom}px">No racks source</div>
{/if}
