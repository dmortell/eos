<script lang="ts">
	import EmptyViewport from './EmptyViewport.svelte'
	import TextViewport from './TextViewport.svelte'
	import OutletsViewport from './tools/outlets/OutletsViewport.svelte'
	import RacksViewport from './tools/racks/RacksViewport.svelte'
	import RisersViewport from './tools/risers/RisersViewport.svelte'
	import type { SheetViewport } from './types'

	// Dispatches a viewport's declarative `source` to the right read-only renderer.
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
	<RisersViewport {vp} {zoom} {onview} />
{:else}
	<EmptyViewport {zoom} />
{/if}
