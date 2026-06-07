<script lang="ts">
	import type { ViewportEditor } from "./viewports.svelte";

	let { vps, zoom = 1, panX = 0, panY = 0 }: {
		vps: ViewportEditor
		zoom?: number
		panX?: number
		panY?: number
	} = $props()

	let message = $derived.by(() => {
		if (vps.insertMode) return 'Viewport: drag a rectangle on the sheet to place it · Esc to cancel'
		if (vps.activeId) return 'Viewport active · double-click outside to exit'
		const n = vps.selectedIds.length
		if (n) return `${n} viewport${n > 1 ? 's' : ''} selected · drag the handles to move / resize · Delete to remove`
		return 'Insert ▸ Viewport to add a view · click a frame or drag a box to select · double-click a viewport to edit'
	})
</script>

<div class="dwg-statusbar print:hidden flex items-center gap-2 border-t border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
	<span class="min-w-0 flex-1 truncate">{message}</span>
	<!-- Debug readout (pan/zoom) — temporary, for tuning default view. -->
	<span class="shrink-0 font-mono text-[11px] text-slate-400 tabular-nums">
		pan {Math.round(panX)},{Math.round(panY)} · zoom {Math.round(zoom * 100)}%
	</span>
</div>
