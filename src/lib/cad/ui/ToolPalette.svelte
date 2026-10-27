<!-- The TOOLBOX (tool strip option E, User 2026-10-27; was the two-column flyout palette of 2026-10-15): every tool its
     own button, 3 to a row, groups split by a thin line (ToolStrip `vertical`), floating over the drawing area. Drag it
     by its grip; where it sits and whether names show are kept in this browser (and it's kept inside the area). Aa
     shows the tools' names; ⤒ puts the tools back in the top bar (Window › Tools as a floating palette toggles it). -->
<script lang="ts">
	import ToolStrip from './ToolStrip.svelte'
	import type { ToolId } from '../app/workspace.svelte'
	import type { ViewSpec } from '../views/space'

	let { tool, kind, onSheet = false, variantOf, onTool, ondock }: { tool: ToolId; kind: ViewSpec['kind']; onSheet?: boolean; variantOf?: (t: ToolId) => string | undefined; onTool: (id: ToolId, variant?: string) => void; ondock: () => void } = $props()

	const KEY = 'cad-tool-palette', NAMES = 'cad-tool-names'
	let pos = $state<{ x: number; y: number }>((() => { try { const p = JSON.parse(localStorage.getItem(KEY) ?? 'null'); return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : { x: 8, y: 8 } } catch { return { x: 8, y: 8 } } })())
	let names = $state((() => { try { return localStorage.getItem(NAMES) === '1' } catch { return false } })())
	let el: HTMLElement | undefined = $state()
	let drag: { dx: number; dy: number } | null = null

	/** Kept inside the drawing area (its parent), however the window was resized. */
	function clamp(p: { x: number; y: number }) {
		const box = el?.parentElement?.getBoundingClientRect(), me = el?.getBoundingClientRect()
		if (!box || !me) return p
		return { x: Math.round(Math.max(0, Math.min(p.x, box.width - me.width))), y: Math.round(Math.max(0, Math.min(p.y, box.height - me.height))) }
	}
	function down(e: PointerEvent) {
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
		drag = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
		e.preventDefault(); e.stopPropagation()
	}
	function move(e: PointerEvent) { if (drag) pos = clamp({ x: e.clientX - drag.dx, y: e.clientY - drag.dy }) }
	function up() { if (!drag) return; drag = null; try { localStorage.setItem(KEY, JSON.stringify(pos)) } catch { /* storage blocked */ } }
	function toggleNames() { names = !names; try { localStorage.setItem(NAMES, names ? '1' : '0') } catch { /* storage blocked */ } }
</script>

<div class="pal" bind:this={el} style:left="{pos.x}px" style:top="{pos.y}px" role="region" aria-label="Tools">
	<div class="grip" role="presentation" title="Drag to move the tools" onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}>
		<span class="dots">⠿</span>
		<span class="btns">
			<button class="dock" class:on={names} aria-pressed={names} title={names ? 'Hide the tools’ names' : 'Show the tools’ names'} onpointerdown={(e) => e.stopPropagation()} onclick={toggleNames}>Aa</button>
			<button class="dock" title="Put the tools back in the top bar (Window › Tools as a floating palette)" onpointerdown={(e) => e.stopPropagation()} onclick={ondock}>⤒</button>
		</span>
	</div>
	<ToolStrip {tool} {kind} {onSheet} vertical {names} {variantOf} {onTool} />
</div>

<style>
	.pal { position: absolute; z-index: 20; padding: 2px 4px 5px; border: 1px solid var(--cad-line); border-radius: 8px; background: var(--cad-panel, white); box-shadow: 0 2px 10px rgb(0 0 0 / 0.12); }
	.grip { display: flex; align-items: center; justify-content: space-between; height: 16px; margin-bottom: 3px; cursor: grab; color: var(--cad-faint, #a1a1aa); touch-action: none; }
	.grip:active { cursor: grabbing; }
	.dots { font-size: 12px; letter-spacing: 1px; }
	.btns { display: flex; gap: 1px; }
	.dock { font-size: 11px; padding: 0 3px; border-radius: 3px; color: var(--cad-muted); }
	.dock:hover { background: var(--cad-hover); color: var(--cad-text); }
	.dock.on { color: var(--cad-link, #1d4ed8); }
</style>
