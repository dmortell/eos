<script lang="ts">
	let { x, y, width, height }: { x: number; y: number; width: number; height: number } = $props()
</script>

<div
	class="absolute border-2 border-blue-400 bg-blue-400/10 pointer-events-none z-50 rounded-sm"
	style:left="{x}px"
	style:top="{y}px"
	style:width="{width}px"
	style:height="{height}px"
/>
