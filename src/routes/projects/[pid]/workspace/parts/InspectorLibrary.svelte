<script lang="ts">
	import { Icon } from '$lib'
	import { DEFAULT_PALETTE, DEVICE_TYPE_COLORS } from '../../racks/parts/constants'
	import type { DeviceType } from '../../racks/parts/types'
</script>

<div class="text-xs space-y-3">
	<div>
		<div class="text-zinc-500 mb-1.5 uppercase tracking-wider font-semibold">Devices &amp; panels</div>
		<p class="text-zinc-400 mb-2">
			Drag onto the canvas to place. Drag targets activate when the elevation view
			becomes editable (future step).
		</p>
		<ul class="space-y-1">
			{#each DEFAULT_PALETTE as item}
				<li
					class="flex items-center gap-2 px-2 py-1.5 rounded border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-grab"
					title="Drag onto a rack"
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
