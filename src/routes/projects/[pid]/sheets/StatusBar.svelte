<script lang="ts">
	import type { ViewportEditor } from "./viewports.svelte";

	let { vps }: { vps: ViewportEditor } = $props()

	let message = $derived.by(() => {
		if (vps.insertMode) return 'Viewport: drag a rectangle on the sheet to place it · Esc to cancel'
		if (vps.activeId) return 'Viewport active · double-click outside to exit'
		const n = vps.selectedIds.length
		if (n) return `${n} viewport${n > 1 ? 's' : ''} selected · drag the handles to move / resize · Delete to remove`
		return 'Insert ▸ Viewport to add a view · click a frame or drag a box to select · double-click a viewport to edit'
	})
</script>

<div class="dwg-statusbar print:hidden flex items-center gap-2 border-t border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
	{message}
</div>
