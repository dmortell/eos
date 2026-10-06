<!-- The bar between split views (backlog "Resizable split bar", split out of CadShell): drag to share the width —
     the left pane's share, 15–85 %, kept per browser; a double-click makes them equal. -->
<script lang="ts">
	import type { Panels } from '../app/panels.svelte'

	let { panels, container }: { panels: Panels; container: HTMLElement | undefined } = $props()

	function down(e: PointerEvent) {
		if (e.button !== 0 || !container) return
		e.preventDefault()
		const bar = e.currentTarget as HTMLElement, r = container.getBoundingClientRect()
		try { bar.setPointerCapture(e.pointerId) } catch { /* a synthetic pointer */ }
		const move = (m: PointerEvent) => { panels.split = Math.min(0.85, Math.max(0.15, (m.clientX - r.left) / r.width)) }
		const up = () => { bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); panels.save() }
		bar.addEventListener('pointermove', move)
		bar.addEventListener('pointerup', up)
	}
</script>

<div class="split-bar" role="separator" aria-orientation="vertical" title="Drag to resize the two views · double-click: equal" onpointerdown={down} ondblclick={() => { panels.split = 0.5; panels.save() }}></div>

<style>
	.split-bar { flex: 0 0 5px; cursor: col-resize; background: var(--cad-line); touch-action: none; }
	.split-bar:hover { background: #93c5fd; }
</style>
