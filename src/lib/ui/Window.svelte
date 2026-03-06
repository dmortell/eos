<script lang="ts">
	import { slide } from "svelte/transition";
	import { Button, Icon } from '$lib'
	import { draggable } from '$lib/ui/draggable'

	let {class:className, title, name, open=false, top: initTop=null, left:initLeft=null, right:initRight=null, bottom:initBottom=null, children, ondock, onundock}: {
		class?: string, title?: string, name?: string, open?: boolean,
		top?: number | null, left?: number | null, right?: number | null, bottom?: number | null,
		children?: any,
		ondock?: (name: string, position: 'left' | 'right' | 'bottom') => void,
		onundock?: (name: string) => void,
	} = $props()

	let contextOpen = $state(false)
	let contextPos = $state({ x: 0, y: 0 })

	// Load saved state from localStorage
	const storageKey = $derived(title ? `cad-window-${title.toLowerCase().replace(/\s+/g, '-')}` : '')
	const saved = $derived(storageKey ? loadState() : null)

	// svelte-ignore state_referenced_locally
	let right = $state<number | null>(saved?.right ?? (initRight != null ? +initRight : null))
	let left = $state<number | null>(saved?.left ?? (initLeft != null ? +initLeft : null))
	let top = $state<number | null>(saved?.top ?? (initTop != null ? +initTop : null))
	let useLeft = saved ? saved.left != null : initLeft != null
	let moved = 0;

	// Vertical resize state
	let contentHeight = $state<number | null>(saved?.height ?? null)
	let contentEl: HTMLDivElement | undefined = $state()
	const MIN_HEIGHT = 100
	const MAX_HEIGHT = 800

	// Restore open state from saved
	if (saved?.open !== undefined) open = saved.open

	let saveTimer: ReturnType<typeof setTimeout> | null = null
	function saveState() {
		if (!storageKey) return
		if (saveTimer) clearTimeout(saveTimer)
		saveTimer = setTimeout(() => {
			const state: any = { open }
			if (top != null) state.top = top
			if (useLeft && left != null) state.left = left
			else if (right != null) state.right = right
			if (contentHeight != null) state.height = contentHeight
			localStorage.setItem(storageKey, JSON.stringify(state))
		}, 300)
	}

	function loadState(): any {
		try {
			const json = localStorage.getItem(storageKey)
			return json ? JSON.parse(json) : null
		} catch { return null }
	}

	function onMove(dx: number, dy: number) {
		if (useLeft) left = (left ?? 0) + dx
		else right = (right ?? 0) - dx
		top = (top ?? 0) + dy
		moved = 1
		saveState()
	}

	function onResize(_dx: number, dy: number) {
		if (contentHeight == null) {
			contentHeight = contentEl?.offsetHeight ?? 200
		}
		contentHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, contentHeight + dy))
		saveState()
	}

	function onResetHeight() {
		contentHeight = null
		saveState()
	}

	function toggleOpen() {
		open = !open
		saveState()
	}

	const posStyle = $derived.by(() => {
		let s = ''
		if (top != null) s += `top:${top}px;`
		if (useLeft && left != null) s += `left:${left}px;`
		else if (right != null) s += `right:${right}px;`
		return s
	})

	const panelName = $derived(name ?? title?.toLowerCase().replace(/\s+/g, '-') ?? '')

	function handleContextMenu(e: MouseEvent) {
		if (!ondock) return
		e.preventDefault()
		contextPos = { x: e.clientX, y: e.clientY }
		contextOpen = !contextOpen
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="gui print:hidden" class:open style={posStyle} onpointerdown={(e) => e.stopPropagation()}>
	{#if title}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div use:draggable={{onMove, cursor:'move'}} class="flex items-center gap-2 px-2 py-1 select-none border-b"
			oncontextmenu={handleContextMenu}>
			<Icon name=grip />
			<div class='flex flex-1 items-center gap-2'>
				<Button onclick={(_e: MouseEvent)=>open=moved ? open : !open} class="w-full">{title}</Button>
			</div>
			{#if ondock}
				<button class="flex items-center justify-center w-5 h-5 rounded hover:bg-gray-200"
					onclick={() => ondock?.(panelName, 'right')} title="Dock to sidebar">
					<Icon name="sidebar" size={11} />
				</button>
			{/if}
			<Button icon={open ? 'chevronUp':'chevronDown'} onclick={(_e: MouseEvent)=>toggleOpen()}/>
		</div>
	{/if}
	{#if open}
		<div transition:slide={{duration:100}} class={className}
			bind:this={contentEl}
			style:max-height={contentHeight != null ? `${contentHeight}px` : undefined}
			style:overflow-y={contentHeight != null ? 'auto' : undefined}>
			{@render children?.()}
		</div>
		<div use:draggable={{onMove: onResize, cursor: 'ns-resize'}}
			ondblclick={onResetHeight}
			class="resize-handle">
		</div>
	{/if}
</div>

{#if contextOpen && ondock}
	<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="dock-context" onclick={() => contextOpen = false}>
		<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
		<div class="dock-context-menu" style="left:{contextPos.x}px; top:{contextPos.y}px;"
			onclick={(e) => e.stopPropagation()}>
			<button class="dock-ctx-item" onclick={() => { ondock?.(panelName, 'left'); contextOpen = false }}>
				Dock Left
			</button>
			<button class="dock-ctx-item" onclick={() => { ondock?.(panelName, 'right'); contextOpen = false }}>
				Dock Right
			</button>
			<button class="dock-ctx-item" onclick={() => { ondock?.(panelName, 'bottom'); contextOpen = false }}>
				Dock Bottom
			</button>
		</div>
	</div>
{/if}

<style>
	.gui {
		position: absolute;
		border: 1px solid hsl(220 10% 80%); border-radius:4px;
		color:#606060; background-color:white;
		box-shadow: 1px 1px 10px hsl(0 0% 0% / 10%);
		font-size: 0.8rem;
	}
	.open { z-index: 10; }
	.resize-handle {
		height: 5px;
		cursor: ns-resize;
		background: transparent;
		border-top: 1px solid hsl(220 10% 85%);
		transition: background 0.15s;
	}
	.resize-handle:hover {
		background: hsl(220 50% 90%);
	}
	.dock-context {
		position: fixed;
		inset: 0;
		z-index: 100;
	}
	.dock-context-menu {
		position: fixed;
		background: white;
		border: 1px solid hsl(220 10% 80%);
		border-radius: 6px;
		box-shadow: 0 4px 12px hsl(0 0% 0% / 15%);
		padding: 4px 0;
		min-width: 120px;
		z-index: 101;
	}
	.dock-ctx-item {
		display: block;
		width: 100%;
		text-align: left;
		padding: 4px 12px;
		font-size: 12px;
		cursor: pointer;
	}
	.dock-ctx-item:hover {
		background: hsl(220 80% 95%);
	}
</style>
