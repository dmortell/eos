<script lang="ts">
	// Trunk node/segment context menu (HTML, portaled to <body>). Kept out of OutletsEditLayer so
	// that layer can declare the SVG namespace without this markup becoming SVG-namespaced.
	import { portal } from '../../edit/portal'
	import type { OutletsEditor } from './outlets-editor.svelte'
	let { editor }: { editor: OutletsEditor } = $props()
	const m = $derived(editor.menu)
</script>

{#if m}
	<div use:portal>
		<!-- click-away backdrop -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="fixed inset-0 z-40" onmousedown={() => { editor.menu = null }} oncontextmenu={(e: MouseEvent) => { e.preventDefault(); editor.menu = null }}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="ctx-menu fixed z-50 rounded border border-slate-200 bg-white py-1 text-xs shadow-lg" style:left="{m.x}px" style:top="{m.y}px">
			<button class="block w-full px-3 py-1 text-left hover:bg-slate-100" onclick={() => { editor.selectTrunk(m.trunk.id) }}>Select trunk</button>
			{#if m.kind === 'node'}
				{#if m.canDisconnect}
					<button class="block w-full px-3 py-1 text-left hover:bg-slate-100" onclick={() => { editor.disconnectNode(m.trunk, m.nodeId) }}>Disconnect</button>
				{/if}
				<button class="block w-full px-3 py-1 text-left text-red-600 hover:bg-slate-100" onclick={() => { editor.deleteNode(m.trunk, m.nodeId) }}>Delete node</button>
			{:else}
				<button class="block w-full px-3 py-1 text-left text-red-600 hover:bg-slate-100" onclick={() => { editor.deleteSegment(m.trunk, m.segId) }}>Delete segment</button>
			{/if}
		</div>
	</div>
{/if}
