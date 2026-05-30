<script lang="ts">
	import { Icon } from '$lib'
	import { getWorkspace } from '../state.svelte'

	const ws = getWorkspace()

	// ── Drag-to-reorder ──
	let dragId = $state<string | null>(null)
	let overId = $state<string | null>(null)

	function onDragStart(e: DragEvent, id: string) {
		dragId = id
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move'
			// Some browsers require setData for the drag to actually fire.
			e.dataTransfer.setData('text/plain', id)
		}
	}
	function onDragOver(e: DragEvent, id: string) {
		if (!dragId || dragId === id) return
		e.preventDefault()
		overId = id
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
	}
	function onDrop(e: DragEvent, id: string) {
		e.preventDefault()
		if (!dragId || dragId === id) {
			dragId = null
			overId = null
			return
		}
		const toIdx = ws.tabs.findIndex((t) => t.id === id)
		ws.reorderTab(dragId, toIdx)
		dragId = null
		overId = null
	}
	function onDragEnd() {
		dragId = null
		overId = null
	}

	// ── Context menu ──
	let menuOpen = $state<string | null>(null)
	let menuPos = $state({ x: 0, y: 0 })

	function onContextMenu(e: MouseEvent, id: string) {
		e.preventDefault()
		menuOpen = id
		menuPos = { x: e.clientX, y: e.clientY }
	}
	function doMenu(action: 'close' | 'closeOthers' | 'closeRight' | 'duplicate', id: string) {
		switch (action) {
			case 'close': ws.closeTab(id); break
			case 'closeOthers': ws.closeOtherTabs(id); break
			case 'closeRight': ws.closeTabsToRight(id); break
			case 'duplicate': ws.duplicateTab(id); break
		}
		menuOpen = null
	}
</script>

<div class="flex items-stretch border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-900/50 text-xs overflow-x-auto">
	{#each ws.tabs as tab (tab.id)}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		{@const stale = !!tab.selectedNodeId && ws.knownNodeIds.size > 0 && !ws.knownNodeIds.has(tab.selectedNodeId)}
		<div
			class="group flex items-center gap-1.5 pl-3 pr-1 py-1 border-r border-zinc-200 dark:border-zinc-800 cursor-pointer min-w-0 max-w-[200px]
				{ws.activeTabId === tab.id
					? 'bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 border-b-2 border-b-blue-500 -mb-px'
					: 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/50 dark:hover:bg-zinc-950/50'}
				{stale ? 'italic text-amber-600 dark:text-amber-400' : ''}
				{dragId === tab.id ? 'opacity-50' : ''}
				{overId === tab.id ? 'ring-2 ring-blue-400 ring-inset' : ''}"
			draggable="true"
			ondragstart={(e) => onDragStart(e, tab.id)}
			ondragover={(e) => onDragOver(e, tab.id)}
			ondrop={(e) => onDrop(e, tab.id)}
			ondragend={onDragEnd}
			onclick={() => ws.switchTab(tab.id)}
			onauxclick={(e) => {
				if (e.button === 1) {
					e.preventDefault()
					ws.closeTab(tab.id)
				}
			}}
			oncontextmenu={(e) => onContextMenu(e, tab.id)}
			title={stale ? `${tab.selectedNodeId} — node no longer exists in this project` : (tab.selectedNodeId ?? 'Untitled')}
		>
			{#if stale}
				<Icon name="warning" size={10} />
			{/if}
			<span class="truncate flex-1 select-none">{tab.title || 'Untitled'}</span>
			<button
				class="rounded p-0.5 opacity-40 hover:opacity-100 hover:bg-zinc-200 dark:hover:bg-zinc-800"
				onclick={(e) => {
					e.stopPropagation()
					ws.closeTab(tab.id)
				}}
				aria-label="Close tab"
				title="Close tab"
			>
				<Icon name="close" size={10} />
			</button>
		</div>
	{/each}

	<button
		class="flex items-center gap-1 px-2 py-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
		onclick={() => ws.openTab()}
		title="New tab (duplicates current selection)"
	>
		<Icon name="plus" size={12} />
	</button>
</div>

{#if menuOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-40" onclick={() => (menuOpen = null)}></div>
	<div
		class="fixed z-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded shadow-lg py-1 text-xs min-w-[160px]"
		style:left="{menuPos.x}px"
		style:top="{menuPos.y}px"
	>
		<button class="w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800" onclick={() => doMenu('close', menuOpen!)}>Close</button>
		<button class="w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800" onclick={() => doMenu('closeOthers', menuOpen!)}>Close others</button>
		<button class="w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800" onclick={() => doMenu('closeRight', menuOpen!)}>Close tabs to the right</button>
		<div class="border-t border-zinc-200 dark:border-zinc-800 my-1"></div>
		<button class="w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800" onclick={() => doMenu('duplicate', menuOpen!)}>Duplicate tab</button>
	</div>
{/if}
