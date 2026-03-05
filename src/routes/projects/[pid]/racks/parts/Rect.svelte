<script lang="ts">
	import type { ViewState } from './types'

	let { item, label = '', view, cls = '' }: {
		item: { x: number; z: number; width: number; height: number }
		label?: string
		view: ViewState
		cls?: string
	} = $props()

	let scale = $derived(view.scale)
	let left = $derived(item.x * scale)
	let top = $derived((view.bottom - item.z - item.height) * scale)
	let width = $derived(item.width * scale)
	let height = $derived(item.height * scale)
</script>

<div class="absolute border border-gray-300 bg-gray-100/30 pointer-events-none {cls}"
	style:left={left + 'px'} style:top={top + 'px'} style:width={width + 'px'} style:height={height + 'px'}>
	{#if label}
		<span class="absolute -top-4 left-8 text-[11px] text-gray-400 whitespace-nowrap select-none">{label}</span>
	{/if}
</div>
