<script lang="ts">
	import type { Sheet } from './sheet.svelte'
	import { PAPER } from './types'

	let { sheet }: { sheet: Sheet } = $props()

	const message = $derived.by(() => {
		if (sheet.insertMode === 'section') return 'Section: drag a rectangle on a plan to create an elevation of that region'
		if (sheet.insertMode) return `Insert “${sheet.insertMode}” — not yet implemented`
		const o = sheet.selectedObject
		if (o) return `${o.obj.type} selected · drag to move, handles to resize · sidebar for exact values`
		const v = sheet.selected
		if (v) return `View “${v.name}” (${v.direction}) · double-click to edit its contents`
		return 'Click a view to select · double-click to edit · Insert ▸ to add a viewport or section'
	})
</script>

<div class="a-chrome print:hidden flex items-center gap-2 border-t border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
	<span class="min-w-0 flex-1 truncate">{message}</span>
	<span class="shrink-0 font-mono text-[11px] text-slate-400 tabular-nums">
		A3 {PAPER.w}×{PAPER.h}mm · {sheet.views.length} views · zoom {Math.round(sheet.zoom * 100 / 1.6)}%
	</span>
</div>
