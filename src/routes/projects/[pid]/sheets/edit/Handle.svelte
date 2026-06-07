<script lang="ts">
	// A draggable edit handle, counter-scaled to a steady on-screen size via `s` (screenScale).
	let { x, y, s = 1, size = 9, shape = 'square', color = '#2563eb', cursor = 'move', onpointerdown }: {
		x: number; y: number; s?: number; size?: number
		shape?: 'square' | 'circle'; color?: string; cursor?: string
		onpointerdown?: (e: MouseEvent) => void
	} = $props()
	let r = $derived(size / s / 2) // half-size in world units
	let sw = $derived(1.5 / s)
</script>

{#if shape === 'circle'}
	<circle cx={x} cy={y} {r} fill="white" stroke={color} stroke-width={sw} style:cursor class="print:hidden" onmousedown={onpointerdown} role="button" tabindex="-1" aria-label="handle" />
{:else}
	<rect x={x - r} y={y - r} width={r * 2} height={r * 2} fill="white" stroke={color} stroke-width={sw} style:cursor class="print:hidden" onmousedown={onpointerdown} role="button" tabindex="-1" aria-label="handle" />
{/if}
