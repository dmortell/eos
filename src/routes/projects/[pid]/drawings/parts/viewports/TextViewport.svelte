<script lang="ts">
	import type { Viewport } from '$lib/types/pages'

	let { viewport }: { viewport: Viewport } = $props()

	// Narrow to text source; caller is responsible for dispatching correctly.
	let src = $derived(viewport.source.kind === 'text' ? viewport.source : null)
	let content = $derived(src?.content ?? '')
	let align = $derived(src?.align ?? 'left')
	let fontSizePt = $derived(src?.fontSizePt ?? 10)
</script>

<div class="w-full h-full p-2 overflow-hidden whitespace-pre-wrap leading-tight"
	style:text-align={align}
	style:font-size="{fontSizePt}pt">
	{content}
</div>
