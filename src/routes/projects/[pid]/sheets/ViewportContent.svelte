<script lang="ts">
	import TextViewport from './TextViewport.svelte'
	import OutletsViewport from './tools/outlets/OutletsViewport.svelte'
	import RacksViewport from './tools/racks/RacksViewport.svelte'
	import RisersViewport from './tools/risers/RisersViewport.svelte'
	import { effectiveLayers } from './layers/layers'
	import type { SheetViewport } from './types'
	import type { ViewportEditor } from './viewports.svelte'

	// Dispatches a viewport's declarative `source` to the right renderer. `active` enables editing;
	// `view` is a model-mode viewBox override (real-mm) supplied by the full-area host. `vps` is
	// needed so tool viewports can persist their model-space annotations onto the sheet doc.
	let { vp, vps, zoom = 1, active = false, view = null, onview }: {
		vp: SheetViewport
		vps: ViewportEditor
		zoom?: number
		active?: boolean
		view?: { x: number; y: number; w: number; h: number } | null
		onview?: (v: { x: number; y: number; w: number; h: number; den: number }) => void
	} = $props()

	let layers = $derived(effectiveLayers(vp, vps.allLayers))
</script>

{#if vp.source.kind === 'text' || vp.source.kind === 'empty'}
	<TextViewport {vp} view={view ?? null} {onview} />
{:else if vp.source.kind === 'outlets'}
	<OutletsViewport {vp} {vps} {zoom} {active} {view} {onview} hidden={layers.hidden} locked={layers.locked} />
{:else if vp.source.kind === 'racks'}
	<RacksViewport {vp} {vps} {zoom} {active} {view} {onview} hidden={layers.hidden} locked={layers.locked} />
{:else if vp.source.kind === 'risers'}
	<RisersViewport {vp} {vps} {zoom} {active} {view} {onview} hidden={layers.hidden} locked={layers.locked} />
{/if}
