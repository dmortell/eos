<script lang="ts">
	/**
	 * Frames-tab rack board (§14 F-1): the REAR termination view of one rack —
	 * patch panels only, top-down, constant-size chips whose border encodes the
	 * link state: solid = terminated (outlet-run tint from the location type,
	 * violet ring for ties), dashed = unterminated.
	 */
	import { Icon } from '$lib'
	import { LOC_TYPE_COLORS, LOC_TYPE_LABELS } from '$lib/elevation/loc-colors'
	import { fallbackPortLabel } from '$lib/elevation/portmap'
	import { isLocationEnd } from '$lib/elevation/links'
	import type { FramesEditor } from './frames-editor.svelte'

	let { editor, rackId }: { editor: FramesEditor; rackId: string } = $props()

	let rack = $derived(editor.rackById.get(rackId))
	/** Patch panels of this rack, top of rack first. */
	let panels = $derived(editor.devices
		.filter(d => d.rackId === rackId && d.type === 'panel' && (d.portCount ?? 0) > 0)
		.sort((a, b) => b.positionU - a.positionU))

	let collapsed = $state<Set<string>>(new Set())
	function toggle(deviceId: string) {
		const next = new Set(collapsed)
		next.has(deviceId) ? next.delete(deviceId) : next.add(deviceId)
		collapsed = next
	}

	function rowsFor(d: any): number[][] {
		const count = d.portCount ?? 0
		const rows: number[][] = []
		for (let start = 1; start <= count; start += 24) {
			rows.push(Array.from({ length: Math.min(24, count - start + 1) }, (_, i) => start + i))
		}
		return rows
	}

	function shortLabel(label: string): string {
		return label.replace(/^[LB]?\d{1,2}F?[.\-]/, '')
	}

	function highlightWhenTargeted(el: HTMLElement, deviceId: string) {
		$effect(() => {
			if (editor.highlightDeviceId === deviceId) {
				el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
			}
		})
	}
</script>

{#if rack}
	<div class="border border-gray-200 rounded-lg bg-white shadow-sm min-w-0">
		<div class="h-7 px-2 flex items-center gap-1.5 bg-gray-50 border-b border-gray-200 rounded-t-lg text-[11px]">
			<Icon name="server" size={12} />
			<span class="font-semibold text-gray-700 truncate">{rack.label}</span>
			<span class="text-gray-400 shrink-0">Room {rack._room ?? rack.serverRoom} · rear</span>
			<div class="flex-1"></div>
			<button class="w-4.5 h-4.5 flex items-center justify-center rounded text-gray-400 hover:bg-gray-200" title="Move board left" onclick={() => editor.moveBench(rackId, -1)}><Icon name="chevronLeft" size={11} /></button>
			<button class="w-4.5 h-4.5 flex items-center justify-center rounded text-gray-400 hover:bg-gray-200" title="Move board right" onclick={() => editor.moveBench(rackId, 1)}><Icon name="chevronRight" size={11} /></button>
			<button class="w-4.5 h-4.5 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50" title="Remove from bench" onclick={() => editor.removeFromBench(rackId)}><Icon name="x" size={11} /></button>
		</div>

		{#if panels.length === 0}
			<div class="p-3 text-[11px] text-gray-400">No patch panels in this rack.</div>
		{/if}

		{#each panels as d (d.id)}
			{@const isCollapsed = collapsed.has(d.id)}
			{@const highlighted = editor.highlightDeviceId === d.id}
			<div class="border-b border-gray-100 last:border-b-0 last:rounded-b-lg {highlighted ? 'ring-2 ring-blue-400 ring-inset' : ''}"
				use:highlightWhenTargeted={d.id}>
				<button class="w-full h-6 px-2 flex items-center gap-1.5 text-[11px] hover:bg-gray-50 text-left"
					onclick={() => toggle(d.id)}>
					<Icon name={isCollapsed ? 'chevronRight' : 'chevronDown'} size={10} class="text-gray-400 shrink-0" />
					<span class="font-medium text-gray-700 truncate">{d.label}</span>
					<span class="text-gray-400 shrink-0">U{d.positionU} · {d.portCount}p{d.patchLevel === 'high' ? ' · HL' : ''}</span>
				</button>
				{#if !isCollapsed}
					<div class="px-2 pb-1.5 space-y-px overflow-x-auto">
						{#each rowsFor(d) as ports (ports[0])}
							<div class="flex gap-px min-w-max">
								{#each ports as p (p)}
									{@const key = `${d.id}:${p}`}
									{@const info = editor.portInfo.get(key)}
									{@const link = editor.linkByPortKey.get(key)}
									{@const isSel = !!link && editor.selectedLinkId === link.id}
									{@const isTie = !!link && !isLocationEnd(link.b)}
									{@const isArmed = editor.termArm?.deviceId === d.id && editor.termArm?.portIndex === p}
									{@const selIdx = editor.termSel.indexOf(key)}
									<button
										class="relative w-16 h-6.5 rounded-sm border flex items-center justify-center shrink-0
											{info ? (LOC_TYPE_COLORS[info.locationType] ?? 'bg-blue-500/15 border-blue-500/40 text-blue-600') : 'bg-gray-100 text-gray-400'}
											{link ? '' : 'border-dashed border-gray-300'}
											{isArmed ? 'ring-2 ring-amber-500' : selIdx >= 0 ? 'ring-2 ring-purple-400' : isSel ? 'ring-2 ring-blue-400' : isTie ? 'ring-1 ring-violet-400' : ''}"
										title={`${info?.label ?? fallbackPortLabel(rack.label, d.positionU, p)}${info ? `\n${LOC_TYPE_LABELS[info.locationType] ?? info.locationType}` : ''}${link ? `\n${isTie ? 'tie' : 'outlet run'} → ${editor.endLabel(link)} · ${link.status}` : '\nunterminated — click to pick a destination · Ctrl+click for block ops'}`}
										onclick={e => editor.portClickRear(d.id, p, e.ctrlKey || e.metaKey)}>
										<span class="font-mono text-[9px] leading-none select-none whitespace-nowrap overflow-hidden">
											{info ? shortLabel(info.label) : (link && !isLocationEnd(link.b) ? editor.tieLabels.get(link.id) ?? p : p)}
										</span>
										{#if selIdx >= 0}
											<span class="absolute -top-1 -left-1 min-w-3.5 h-3.5 px-0.5 rounded-full text-[8px] leading-3.5 text-center text-white bg-purple-500">{selIdx + 1}</span>
										{/if}
										{#if link}
											<span class="absolute bottom-0.5 right-0.5 w-1.5 h-1.5 rounded-full {link.status === 'installed' ? 'bg-emerald-500' : isTie ? 'bg-violet-500' : 'bg-sky-500'}"></span>
										{/if}
									</button>
								{/each}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}
