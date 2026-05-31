<script lang="ts">
	import { getWorkspace } from '../state.svelte'

	const ws = getWorkspace()

	let cursor = $state<{ x: number; y: number } | null>(null)
	let label = $state<string>('')

	let canvasEl = $state<HTMLDivElement | null>(null)

	$effect(() => {
		if (!ws.labelRendering.hoverMagnifier) {
			cursor = null
			label = ''
			return
		}
		// Workspace canvas root is the .workspace-canvas div sibling. Attach
		// listeners there so any view (Rack / Frames / Patching / Outlets /
		// Risers) feeds the magnifier without needing per-view wiring.
		const el = document.querySelector<HTMLDivElement>('.workspace-canvas')
		if (!el) return
		canvasEl = el

		function onMove(e: PointerEvent) {
			cursor = { x: e.clientX, y: e.clientY }
			// Briefly hide our own overlay so elementFromPoint can see through.
			const wasDisplay = overlay?.style.display
			if (overlay) overlay.style.display = 'none'
			const target = document.elementFromPoint(e.clientX, e.clientY)
			if (overlay) overlay.style.display = wasDisplay ?? ''
			const titled = target?.closest('[title]')
			label = titled?.getAttribute('title')?.trim() ?? ''
		}
		function onLeave() {
			cursor = null
			label = ''
		}

		el.addEventListener('pointermove', onMove)
		el.addEventListener('pointerleave', onLeave)
		return () => {
			el.removeEventListener('pointermove', onMove)
			el.removeEventListener('pointerleave', onLeave)
		}
	})

	let overlay = $state<HTMLDivElement | null>(null)
</script>

{#if ws.labelRendering.hoverMagnifier && cursor && label}
	<div
		bind:this={overlay}
		class="fixed z-40 pointer-events-none px-3 py-1.5 rounded-md bg-zinc-900 text-zinc-100 text-sm font-mono shadow-lg border border-zinc-700 max-w-[400px] whitespace-pre-wrap"
		style:left="{cursor.x + 18}px"
		style:top="{cursor.y + 18}px"
	>
		{label}
	</div>
{/if}
