<script lang="ts">
	import { Icon } from '$lib'

	export type PlanMode = 'select' | 'wall' | 'door' | 'rect'

	let { mode, onchange }: {
		mode: PlanMode
		onchange: (m: PlanMode) => void
	} = $props()

	const modes: { value: PlanMode; label: string; icon: string; hint: string }[] = [
		{ value: 'select', label: 'Select', icon: 'crosshair', hint: 'Select and move objects' },
		{ value: 'wall', label: 'Wall', icon: 'line', hint: 'Click to set start, click again to set end' },
		{ value: 'door', label: 'Door', icon: 'rect', hint: 'Click to place a door' },
		{ value: 'rect', label: 'Rect', icon: 'box', hint: 'Click and drag to draw a labeled rectangle' },
	]
</script>

<div class="absolute left-2 top-2 z-10 flex items-center gap-0.5 p-0.5 rounded border border-gray-300 bg-white shadow-sm print:hidden">
	{#each modes as m}
		<button
			class="h-7 px-2 rounded text-[11px] font-medium transition-colors flex items-center gap-1
				{mode === m.value ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}"
			title={m.hint}
			onclick={() => onchange(m.value)}>
			<Icon name={m.icon} size={12} />
			{m.label}
		</button>
	{/each}
</div>
