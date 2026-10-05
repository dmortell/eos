<!-- One cad WINDOW (UX review S2; the look of the Sheets tool's frosted windows): a title bar — drag it to move the
     window, drop it on the left / right edge of the drawing to dock it there; drag a docked one's title out to float
     it — with fold, dock / float and close (Esc never closes a window: Esc belongs to the tools). A floating window
     resizes by its corner and comes to the front on a press. Docked, it fills its share of the column. -->
<script lang="ts">
	import type { Snippet } from 'svelte'
	import { Icon } from '$lib'
	import { WIN_TITLES, type WindowLayout, type WinId } from '../app/windows.svelte'

	let { layout, id, area, children, actions }: {
		layout: WindowLayout; id: WinId
		/** The drawing area (floating windows are placed in it; its edges dock). */
		area: HTMLElement | undefined
		children: Snippet
		/** Extra buttons in the title bar. */
		actions?: Snippet
	} = $props()

	const s = $derived(layout.wins[id])
	const docked = $derived(!!s.dock)
	const EDGE = 28

	function titleDown(e: PointerEvent) {
		if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return
		e.preventDefault()
		layout.front(id)
		// the drag listens on the browser window, not this title bar: a docked window that comes out mid-drag is drawn
		// in another place (a new title bar), and the same drag carries on moving it (Dave: it took two drags)
		const start = { x: e.clientX, y: e.clientY, wx: s.x, wy: s.y }
		let floated = !docked
		const move = (m: PointerEvent) => {
			const r = area?.getBoundingClientRect()
			if (!r) return
			if (!floated) {
				// a docked window comes out once its title is dragged a little way
				if (Math.hypot(m.clientX - start.x, m.clientY - start.y) < 24) return
				layout.float(id, m.clientX - r.left - 60, m.clientY - r.top - 12)
				start.x = m.clientX; start.y = m.clientY; start.wx = layout.wins[id].x; start.wy = layout.wins[id].y
				floated = true
				return
			}
			layout.moveTo(id, start.wx + m.clientX - start.x, start.wy + m.clientY - start.y)
			layout.dropSide = m.clientX < r.left + EDGE ? 'left' : m.clientX > r.right - EDGE ? 'right' : null
		}
		const up = () => {
			window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up)
			const side = layout.dropSide
			layout.dropSide = null
			if (side) layout.dock(id, side)
			else if (area) layout.clampAll(area.clientWidth, area.clientHeight)
			layout.save()
		}
		window.addEventListener('pointermove', move)
		window.addEventListener('pointerup', up)
		window.addEventListener('pointercancel', up)
	}
	function cornerDown(e: PointerEvent) {
		if (e.button !== 0) return
		e.preventDefault(); e.stopPropagation()
		const el = e.currentTarget as HTMLElement
		try { el.setPointerCapture(e.pointerId) } catch { /* synthetic */ }
		const start = { x: e.clientX, y: e.clientY, w: s.w, h: s.h }
		const move = (m: PointerEvent) => layout.resize(id, start.w + m.clientX - start.x, start.h + m.clientY - start.y)
		const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); layout.save() }
		el.addEventListener('pointermove', move)
		el.addEventListener('pointerup', up)
	}
	function floatOut() {
		const r = area?.getBoundingClientRect()
		layout.float(id, s.dock === 'right' ? (r?.width ?? 800) - s.w - 24 : 24, 48)
	}
</script>

<section class="win" class:docked class:floating={!docked} class:folded={s.folded} aria-label={WIN_TITLES[id]}
	style:left={docked ? undefined : `${s.x}px`} style:top={docked ? undefined : `${s.y}px`}
	style:width={docked ? undefined : `${s.w}px`} style:height={docked || s.folded ? undefined : `${s.h}px`} style:z-index={docked ? undefined : 20 + s.z}
	onpointerdown={() => layout.front(id)}>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<header onpointerdown={titleDown} ondblclick={() => layout.fold(id)} title={docked ? 'Drag out to float this window · double-click to fold it' : 'Drag to move · drop on the left / right edge to dock · double-click to fold'}>
		<span class="ttl">{WIN_TITLES[id]}</span>
		{#if actions}<span class="acts">{@render actions()}</span>{/if}
		<button title={s.folded ? 'Unfold' : 'Fold to the title'} onclick={() => layout.fold(id)}><Icon name={s.folded ? 'chevronDown' : 'chevronUp'} size={12} /></button>
		{#if docked}
			<button title="Float it over the drawing" onclick={floatOut}><Icon name="expand" size={12} /></button>
		{:else}
			<button title="Dock on the left" onclick={() => layout.dock(id, 'left')}><Icon name="panelLeft" size={12} /></button>
			<button title="Dock on the right" onclick={() => layout.dock(id, 'right')}><Icon name="sidebar" size={12} /></button>
		{/if}
		<button title="Close (Window menu brings it back)" onclick={() => layout.close(id)}><Icon name="x" size={12} /></button>
	</header>
	{#if !s.folded}
		<div class="body">{@render children()}</div>
		{#if !docked}<div class="corner" role="presentation" title="Drag to resize" onpointerdown={cornerDown}></div>{/if}
	{/if}
</section>

<style>
	.win { display: flex; flex-direction: column; min-height: 0; background: var(--cad-panel, white); color: var(--cad-text); font-size: 12px; }
	.win.docked { flex: 1 1 0; border-bottom: 1px solid var(--cad-line); }
	.win.docked.folded { flex: 0 0 auto; }
	.win.floating { position: absolute; border: 1px solid var(--cad-line); border-radius: 6px; box-shadow: 0 8px 28px rgb(0 0 0 / 0.18);
		background: color-mix(in srgb, var(--cad-panel, #fff) 94%, transparent); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
	header { display: flex; align-items: center; gap: 2px; height: 26px; flex: 0 0 auto; padding: 0 4px 0 8px; border-bottom: 1px solid var(--cad-line); background: var(--cad-subtle); cursor: grab; user-select: none; touch-action: none; }
	.floating header { border-radius: 6px 6px 0 0; }
	.ttl { flex: 1; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; color: var(--cad-muted); }
	.acts { display: flex; gap: 6px; font-size: 11px; margin-right: 4px; }
	.acts :global(button) { color: var(--cad-link, #2563eb); }
	header button { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 4px; color: var(--cad-muted); }
	header button:hover { background: var(--cad-hover); color: var(--cad-text); }
	.body { flex: 1 1 auto; min-height: 0; overflow: auto; user-select: none; }
	.body :global(table), .body :global(input), .body :global(textarea) { user-select: text; }
	.corner { position: absolute; right: 0; bottom: 0; width: 14px; height: 14px; cursor: nwse-resize; touch-action: none;
		background: linear-gradient(135deg, transparent 50%, var(--cad-faint, #a1a1aa) 50%, transparent 60%, transparent 70%, var(--cad-faint, #a1a1aa) 70%, transparent 80%); border-radius: 0 0 6px 0; }
</style>
