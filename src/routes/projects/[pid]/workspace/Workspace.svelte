<script lang="ts">
	import { Titlebar, Icon } from '$lib'
	import type { FloorConfig } from '$lib/types/project'
	import TreeNavigator from './parts/TreeNavigator.svelte'
	import TabStrip from './parts/TabStrip.svelte'
	import ViewStrip from './parts/ViewStrip.svelte'
	import DisplaySettings from './parts/DisplaySettings.svelte'
	import QuickSwitcher from './parts/QuickSwitcher.svelte'
	import LabelMagnifier from './parts/LabelMagnifier.svelte'
	import ShortcutsOverlay from './parts/ShortcutsOverlay.svelte'
	import CanvasArea from './parts/CanvasArea.svelte'
	import RightPanel from './parts/RightPanel.svelte'
	import BottomPanel from './parts/BottomPanel.svelte'
	import ResizeHandle from './parts/ResizeHandle.svelte'
	import { getWorkspace } from './state.svelte'

	let { projectName, floors }: { projectName: string; floors: FloorConfig[] } = $props()
	const ws = getWorkspace()

	let quickOpen = $state(false)
	let shortcutsOpen = $state(false)

	function onGlobalKey(e: KeyboardEvent) {
		// Cmd/Ctrl+K opens the quick switcher; ignore when focus is in an input.
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault()
			quickOpen = !quickOpen
			return
		}
		// '?' opens the keyboard cheatsheet, but only when not typing into an
		// input/textarea/contenteditable (otherwise the user is typing a '?').
		if (e.key === '?') {
			const t = e.target as HTMLElement | null
			const tag = t?.tagName
			if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return
			e.preventDefault()
			shortcutsOpen = !shortcutsOpen
		}
	}

	/** Effective zoom on the workspace transform layer (above embedded tool
	 *  zoom). When tiny, swap the canvas root to a "dim labels" mode that
	 *  fades small text so the rack/row shape is still readable. */
	const lodMode = $derived.by(() => {
		if (!ws.labelRendering.lod) return null
		if (ws.viewport.zoom < 0.45) return 'tiny'
		if (ws.viewport.zoom < 0.75) return 'dim'
		return null
	})
</script>

<svelte:window onkeydown={onGlobalKey} />

<div class="h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
	<Titlebar title={projectName || 'Workspace'} />

	<div class="flex-1 grid grid-cols-[auto_1fr_auto] min-h-0">
		<aside
			class="relative border-r border-zinc-200 dark:border-zinc-800 overflow-x-hidden overflow-y-auto bg-white dark:bg-zinc-900"
			style="width: {ws.leftPanelWidth}px"
		>
			<TreeNavigator {floors} />
			<ResizeHandle orientation="vertical" side="right" min={180} max={500} bind:value={ws.leftPanelWidth} />
		</aside>

		<main class="flex flex-col min-w-0 min-h-0">
			<TabStrip />
			<ViewStrip />
			<div class="flex-1 min-h-0 relative workspace-canvas" data-lod={lodMode}>
				<CanvasArea />
			</div>
			{#if ws.bottomPanelOpen}
				<div
					class="relative border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
					style="height: {ws.bottomPanelHeight}px"
				>
					<ResizeHandle orientation="horizontal" side="top" min={100} max={600} bind:value={ws.bottomPanelHeight} />
					<BottomPanel />
				</div>
			{/if}
			<div class="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 py-1 flex items-center gap-2 text-xs text-zinc-500">
				<button
					class="flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100"
					onclick={() => (ws.bottomPanelOpen = !ws.bottomPanelOpen)}
					title="Toggle bottom panel"
				>
					<Icon name={ws.bottomPanelOpen ? 'chevronDown' : 'chevronUp'} size={12} />
					Patch list
				</button>
				{#if !ws.rightPanelOpen}
					<button
						class="flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100"
						onclick={() => (ws.rightPanelOpen = true)}
						title="Show right panel"
					>
						<Icon name="sidebar" size={12} />
						Inspector
					</button>
				{/if}
				{#if ws.canvasCursor}
					<span class="ml-auto font-mono">
						X {ws.canvasCursor.x} Y {ws.canvasCursor.y} {ws.canvasCursor.units}
						<span class="text-zinc-400 mx-1">·</span>
						{ws.viewport.zoom.toFixed(2)}x
					</span>
				{:else if ws.activeView === 'elevation' || ws.activeView === 'row-elevation' || ws.activeView === 'room-elevation'}
					<!-- ws.viewport only drives the rack-elevation views; other views
					     (Frames/Patching/Outlets/Risers) have their own internal pan/zoom,
					     so showing ws.viewport for them would be misleading. -->
					<span class="ml-auto font-mono">
						pan {ws.viewport.x.toFixed(0)},{ws.viewport.y.toFixed(0)} · {ws.viewport.zoom.toFixed(2)}x
					</span>
				{:else}
					<span class="ml-auto"></span>
				{/if}
				<DisplaySettings />
			</div>
		</main>

		{#if ws.rightPanelOpen}
			<aside
				class="relative border-l border-zinc-200 dark:border-zinc-800 overflow-x-hidden overflow-y-auto bg-white dark:bg-zinc-900"
				style="width: {ws.rightPanelWidth}px"
			>
				<ResizeHandle orientation="vertical" side="left" min={220} max={600} bind:value={ws.rightPanelWidth} />
				<RightPanel />
			</aside>
		{/if}
	</div>
</div>

<QuickSwitcher bind:open={quickOpen} {floors} />
<ShortcutsOverlay bind:open={shortcutsOpen} />
<LabelMagnifier />

<style>
	/* Level-of-detail: when the user zooms out far on the workspace transform
	 * layer, small text becomes unreadable noise. Fade it so the rack/row
	 * shape stays legible. Triggered by the data-lod attribute set by
	 * Workspace.svelte; affects everything inside .workspace-canvas. */
	:global(.workspace-canvas[data-lod='dim'] .text-\[7px\]),
	:global(.workspace-canvas[data-lod='dim'] .text-\[10px\]),
	:global(.workspace-canvas[data-lod='dim'] [class*='text-xs']) {
		opacity: 0.35;
	}
	:global(.workspace-canvas[data-lod='tiny'] .text-\[7px\]),
	:global(.workspace-canvas[data-lod='tiny'] .text-\[10px\]),
	:global(.workspace-canvas[data-lod='tiny'] [class*='text-xs']) {
		opacity: 0;
	}
</style>
