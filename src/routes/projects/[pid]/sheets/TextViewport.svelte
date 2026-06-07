<script lang="ts">
	import type { ViewportSource } from './types'

	let { source }: { source: Extract<ViewportSource, { kind: 'text' }> } = $props()

	// The viewport interior is paper-mm space (1px = 1mm). Convert the point size to mm so the
	// text prints at its true pt size (1pt = 25.4/72 mm).
	const PT_TO_MM = 25.4 / 72
	let fontMm = $derived((source.fontSizePt ?? 6) * PT_TO_MM)
</script>

<div class="h-full w-full overflow-hidden whitespace-pre-wrap break-words text-black"
	style:font-size="{fontMm}px" style:padding="2px" style:line-height="1.25">
	{source.content}
</div>
