<script lang="ts">
	import { getContext } from 'svelte'
	import type { Firestore } from '$lib/db.svelte'
	import type { SheetViewport } from '../../types'
	import type { RiserDocData } from './types'
	import RisersRender from './RisersRender.svelte'

	let { vp, zoom = 1, active = false, view = null, onview, hidden = [], locked = [] }: {
		vp: SheetViewport
		zoom?: number
		active?: boolean
		view?: { x: number; y: number; w: number; h: number } | null
		onview?: (v: { x: number; y: number; w: number; h: number; den: number }) => void
		hidden?: string[]
		locked?: string[]
	} = $props()
	const db = getContext('db') as Firestore

	let src = $derived(vp.source.kind === 'risers' ? vp.source : null)
	let doc = $state<RiserDocData | null>(null)

	$effect(() => {
		const id = src?.risersDocId
		if (!id) { doc = null; return }
		const unsub = db.subscribeOne('risers', id, (d: any) => { doc = d ?? null })
		return () => unsub?.()
	})

	let fromFloor = $derived(src?.fromFloor ?? doc?.fromFloor ?? 1)
	let toFloor = $derived(src?.toFloor ?? doc?.toFloor ?? 1)
</script>

{#if src && doc}
	<RisersRender
		rooms={doc.rooms ?? []}
		ladders={doc.ladders ?? []}
		cables={doc.cables ?? []}
		labels={doc.labels ?? []}
		floorHeights={doc.floorHeights ?? {}}
		settings={doc.settings ?? null}
		hiddenFloors={doc.hiddenFloors ?? []}
		{fromFloor} {toFloor} {vp} {view} {onview} {hidden} />
{:else}
	<div class="flex h-full w-full items-center justify-center text-zinc-400 print:hidden" style:font-size="{14 / zoom}px">No risers data</div>
{/if}
