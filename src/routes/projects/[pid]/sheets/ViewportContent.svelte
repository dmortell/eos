<script lang="ts">
	import EmptyViewport from './EmptyViewport.svelte'
	import TextViewport from './TextViewport.svelte'
	import OutletsViewport from './tools/outlets/OutletsViewport.svelte'
	import RacksViewport from './tools/racks/RacksViewport.svelte'
	import RisersViewport from './tools/risers/RisersViewport.svelte'
	import type { SheetViewport } from './types'

	// Dispatches a viewport's declarative `source` to the right renderer. `active` enables editing;
	// `view` is a model-mode viewBox override (real-mm) supplied by the full-area host.
	let { vp, zoom = 1, active = false, view = null, onview }: {
		vp: SheetViewport
		zoom?: number
		active?: boolean
		view?: { x: number; y: number; w: number; h: number } | null
		onview?: (v: { x: number; y: number; w: number; h: number; den: number }) => void
	} = $props()
</script>

{#if vp.source.kind === 'text'}
	<TextViewport source={vp.source} />
{:else if vp.source.kind === 'outlets'}
	<OutletsViewport {vp} {zoom} {active} {view} {onview} />
{:else if vp.source.kind === 'racks'}
	<RacksViewport {vp} {zoom} {active} {view} {onview} />
{:else if vp.source.kind === 'risers'}
	<RisersViewport {vp} {zoom} {active} {view} {onview} />
{:else}
	<EmptyViewport {zoom} />
{/if}
