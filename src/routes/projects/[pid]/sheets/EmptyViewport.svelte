<script lang="ts">
	// Placeholder for a viewport with no source chosen. The hint text is counter-scaled by the
	// Canvas zoom so it reads ~14px on screen at any zoom, and is hidden on print.
	let { zoom = 1 }: { zoom?: number } = $props()
</script>

<div class="flex h-full w-full items-center justify-center text-center text-zinc-400 print:hidden"
	style:font-size="{14 / zoom}px">
	Empty — choose a source
</div>
