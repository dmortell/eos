<script lang="ts">
	import { Icon } from '$lib'
	import { DEFAULT_PALETTE, DEVICE_TYPE_COLORS } from '../../racks/parts/constants'
	import type { DeviceType, DeviceTemplate } from '../../racks/parts/types'
	import { getWorkspace } from '../state.svelte'

	const ws = getWorkspace()

	let dragMoved = false

	function onPaletteMouseDown(e: MouseEvent, template: DeviceTemplate) {
		if (e.button !== 0) return
		e.preventDefault()
		dragMoved = false
		ws.draggingTemplate = template
		ws.dragClientPos = { x: e.clientX, y: e.clientY }
		document.addEventListener('mousemove', onDragMove)
		document.addEventListener('mouseup', onDragEnd)
	}

	function onDragMove(e: MouseEvent) {
		dragMoved = true
		ws.dragClientPos = { x: e.clientX, y: e.clientY }
	}

	function onDragEnd(e: MouseEvent) {
		document.removeEventListener('mousemove', onDragMove)
		document.removeEventListener('mouseup', onDragEnd)
		const template = ws.draggingTemplate
		if (dragMoved && template) {
			ws.pendingDrop = { x: e.clientX, y: e.clientY, template }
		}
		ws.draggingTemplate = null
		ws.dragClientPos = null
	}
</script>

<div class="text-xs space-y-3">
	<div>
		<div class="text-zinc-500 mb-1.5 uppercase tracking-wider font-semibold">Devices &amp; panels</div>
		<p class="text-zinc-400 mb-2">
			Drag onto a rack in the canvas. Drop snaps to the nearest RU position.
		</p>
		<ul class="space-y-1">
			{#each DEFAULT_PALETTE as item}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<li
					class="flex items-center gap-2 px-2 py-1.5 rounded border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-grab select-none"
					title="Drag onto a rack"
					onmousedown={(e) => onPaletteMouseDown(e, item)}
				>
					<span
						class="inline-block w-3 h-3 rounded-sm shrink-0"
						style:background={DEVICE_TYPE_COLORS[item.type as DeviceType] ?? '#888'}
					></span>
					<Icon name={item.icon} size={12} />
					<div class="flex-1 min-w-0">
						<div class="truncate">{item.label}</div>
						<div class="text-[10px] text-zinc-500 truncate">{item.description}</div>
					</div>
					<span class="text-[10px] font-mono text-zinc-500 shrink-0">{item.heightU}U</span>
				</li>
			{/each}
		</ul>
	</div>
</div>

<!-- Floating drag ghost (cursor-tracking pill) — shows what's being dragged. The
     canvas renders the snapped drop-target rect via dropGhost separately. -->
{#if ws.draggingTemplate && ws.dragClientPos}
	{@const t = ws.draggingTemplate as DeviceTemplate}
	<div
		class="fixed z-50 pointer-events-none px-2 py-1 rounded-md bg-blue-600 text-white text-[10px] shadow-lg"
		style:left="{ws.dragClientPos.x + 12}px"
		style:top="{ws.dragClientPos.y + 12}px"
	>
		{t.label} ({t.heightU}U)
	</div>
{/if}
