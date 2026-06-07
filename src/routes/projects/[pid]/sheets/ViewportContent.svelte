<script lang="ts">
	import EmptyViewport from './EmptyViewport.svelte'
	import TextViewport from './TextViewport.svelte'
	import type { SheetViewport } from './types'

	// Dispatches a viewport's declarative `source` to the right read-only renderer. The tool
	// renderers (outlets / racks / risers) land in Stages F / H / I; until then they show a hint.
	let { vp, zoom = 1 }: { vp: SheetViewport; zoom?: number } = $props()
</script>

{#if vp.source.kind === 'text'}
	<TextViewport source={vp.source} />
{:else if vp.source.kind === 'outlets' || vp.source.kind === 'racks' || vp.source.kind === 'risers'}
	<div class="flex h-full w-full items-center justify-center text-center text-zinc-400 print:hidden"
		style:font-size="{14 / zoom}px">
		{vp.source.kind} — coming soon
	</div>
{:else}
	<EmptyViewport {zoom} />
{/if}
