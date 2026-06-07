<script lang="ts">
	import EmptyViewport from './EmptyViewport.svelte'
	import TextViewport from './TextViewport.svelte'
	import OutletsViewport from './tools/outlets/OutletsViewport.svelte'
	import RacksViewport from './tools/racks/RacksViewport.svelte'
	import type { SheetViewport } from './types'

	// Dispatches a viewport's declarative `source` to the right read-only renderer. The risers
	// renderer lands in Stage I; until then it shows a hint.
	let { vp, zoom = 1, onview }: {
		vp: SheetViewport
		zoom?: number
		onview?: (v: { x: number; y: number; w: number; h: number; den: number }) => void
	} = $props()
</script>

{#if vp.source.kind === 'text'}
	<TextViewport source={vp.source} />
{:else if vp.source.kind === 'outlets'}
	<OutletsViewport {vp} {zoom} {onview} />
{:else if vp.source.kind === 'racks'}
	<RacksViewport {vp} {zoom} {onview} />
{:else if vp.source.kind === 'risers'}
	<div class="flex h-full w-full items-center justify-center text-center text-zinc-400 print:hidden"
		style:font-size="{14 / zoom}px">
		{vp.source.kind} — coming soon
	</div>
{:else}
	<EmptyViewport {zoom} />
{/if}
