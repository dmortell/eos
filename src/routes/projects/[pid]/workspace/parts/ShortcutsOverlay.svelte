<script lang="ts">
	import { Icon } from '$lib'

	let { open = $bindable(false) }: { open: boolean } = $props()

	const sections: { title: string; rows: [string, string][] }[] = [
		{
			title: 'Navigation',
			rows: [
				['Ctrl/⌘ + K', 'Open quick switcher'],
				['? (or Shift + /)', 'Open this cheatsheet'],
				['Esc', 'Close the open overlay'],
			],
		},
		{
			title: 'Tree',
			rows: [
				['↑ / ↓', 'Move focus up / down'],
				['→', 'Expand node (or move into children)'],
				['←', 'Collapse node (or move to parent)'],
				['Home / End', 'Jump to first / last visible node'],
				['Enter / Space', 'Select focused node'],
			],
		},
		{
			title: 'Canvas (rack elevation)',
			rows: [
				['Right-drag / middle-drag', 'Pan'],
				['Ctrl/⌥/⌘ + wheel', 'Zoom around cursor'],
				['Wheel', 'Pan vertically (Shift = horizontal)'],
				['Click device', 'Select device'],
				['Drag device', 'Move device (snaps to RU)'],
				['Drag library item → canvas', 'Add new device'],
				['Delete / Backspace', 'Delete selected device(s)'],
			],
		},
		{
			title: 'Tabs',
			rows: [
				['Click tab', 'Switch to tab'],
				['Drag tab', 'Reorder'],
				['Middle-click tab', 'Close tab'],
				['Right-click tab', 'Tab context menu'],
				['+', 'New tab (duplicates current)'],
			],
		},
	]

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			e.preventDefault()
			open = false
		}
	}
</script>

<svelte:window onkeydown={onKey} />

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-20"
		onclick={() => (open = false)}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="w-[640px] max-w-[92vw] max-h-[80vh] overflow-y-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl"
			onclick={(e) => e.stopPropagation()}
		>
			<div class="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
				<div class="text-sm font-semibold">Keyboard shortcuts</div>
				<button
					class="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 p-1"
					onclick={() => (open = false)}
					aria-label="Close"
					title="Close (Esc)"
				>
					<Icon name="close" size={14} />
				</button>
			</div>
			<div class="p-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-xs">
				{#each sections as section}
					<div>
						<div class="text-zinc-500 uppercase tracking-wider text-[10px] font-semibold mb-1.5">{section.title}</div>
						<dl class="space-y-1">
							{#each section.rows as [key, desc]}
								<div class="grid grid-cols-[auto_1fr] gap-x-3">
									<dt class="font-mono text-zinc-700 dark:text-zinc-200 whitespace-nowrap">{key}</dt>
									<dd class="text-zinc-500">{desc}</dd>
								</div>
							{/each}
						</dl>
					</div>
				{/each}
			</div>
		</div>
	</div>
{/if}
