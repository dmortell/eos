<script lang="ts">
	import type { Viewport } from '$lib/types/pages'

	let { viewport }: { viewport: Viewport } = $props()

	let src = $derived(viewport.source.kind === 'image' ? viewport.source : null)
	let url = $derived(src?.url ?? '')
	let fitClass = $derived(src?.fit === 'cover' ? 'object-cover' : 'object-contain')
</script>

{#if url}
	<img src={url} alt={viewport.label ?? 'image'} class="w-full h-full {fitClass}" draggable="false" />
{:else}
	<div class="w-full h-full flex items-center justify-center text-[10px] text-zinc-400 italic">
		No image URL
	</div>
{/if}
