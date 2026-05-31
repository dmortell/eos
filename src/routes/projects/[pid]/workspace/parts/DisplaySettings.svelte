<script lang="ts">
	import { Icon } from '$lib'
	import { getWorkspace } from '../state.svelte'

	const ws = getWorkspace()
	let open = $state(false)

	function toggle(field: 'lod' | 'hoverMagnifier' | 'inspectorAlways') {
		ws.labelRendering = { ...ws.labelRendering, [field]: !ws.labelRendering[field] }
	}
</script>

<div class="relative">
	<button
		class="flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100"
		onclick={() => (open = !open)}
		title="Display settings"
		aria-label="Display settings"
	>
		<Icon name="settings" size={12} />
	</button>

	{#if open}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="fixed inset-0 z-30"
			onclick={() => (open = false)}
		></div>
		<div class="absolute bottom-full right-0 mb-2 w-72 z-40 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded shadow-lg p-3 text-xs">
			<div class="font-semibold text-zinc-700 dark:text-zinc-200 mb-2">Label rendering</div>

			<label class="flex items-start gap-2 py-1 cursor-pointer">
				<input
					type="checkbox"
					class="mt-0.5"
					checked={ws.labelRendering.lod}
					onchange={() => toggle('lod')}
				/>
				<div>
					<div class="text-zinc-700 dark:text-zinc-200">Level-of-detail</div>
					<div class="text-zinc-500 text-[10px]">Shrink port labels at low zoom so rows of racks stay readable. <span class="text-amber-600">Experimental — partial.</span></div>
				</div>
			</label>

			<label class="flex items-start gap-2 py-1 cursor-pointer">
				<input
					type="checkbox"
					class="mt-0.5"
					checked={ws.labelRendering.hoverMagnifier}
					onchange={() => toggle('hoverMagnifier')}
				/>
				<div>
					<div class="text-zinc-700 dark:text-zinc-200">Hover label tip</div>
					<div class="text-zinc-500 text-[10px]">Hovering over a port pops a large readable bubble with its full label, so you don't need to zoom in to read it.</div>
				</div>
			</label>

			<label class="flex items-start gap-2 py-1 cursor-pointer">
				<input
					type="checkbox"
					class="mt-0.5"
					checked={ws.labelRendering.inspectorAlways}
					onchange={() => toggle('inspectorAlways')}
				/>
				<div>
					<div class="text-zinc-700 dark:text-zinc-200">Inspector full label</div>
					<div class="text-zinc-500 text-[10px]">Right panel always shows the full canonical label of the selected port, regardless of canvas LOD.</div>
				</div>
			</label>
		</div>
	{/if}
</div>
