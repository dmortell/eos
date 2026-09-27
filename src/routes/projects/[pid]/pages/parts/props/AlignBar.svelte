<script lang="ts">
	// ALIGN / DISTRIBUTE for ANY multi-selection — shapes, 3D objects, or both — as drawn in the active viewport
	// (cmdBus target → vpInteraction.arrangeSel: rotated boxes by their outline, one undo step). The Properties panel
	// shows it whenever 2+ drawing items are selected; the ALIGN command does the same.
	import { toast } from 'svelte-sonner'
	import { cmdBus } from '../../ui/cmdBus.svelte'
	import type { AlignOp } from '../../ui/arrange'

	const ALIGN_BTNS: [AlignOp, string][] = [['left', 'Align left edges (to the left-most)'], ['hcenter', 'Align centres (vertical line)'], ['right', 'Align right edges'],
		['top', 'Align top edges (to the top-most)'], ['vcenter', 'Align middles (horizontal line)'], ['bottom', 'Align bottom edges'],
		['hspace', 'Distribute horizontally — equal gaps (needs 3+)'], ['vspace', 'Distribute vertically — equal gaps (needs 3+)']]
	function run(op: AlignOp) {
		const t = cmdBus.target
		if (!t?.arrangeSel) { toast('Click into the viewport first'); return }
		const err = t.arrangeSel(op); if (err) toast(err)
	}
</script>

<div class="prop-sec">ALIGN</div>
<div class="prop"><span>Align</span>
	<span class="pp-seg">
		{#each ALIGN_BTNS.slice(0, 6) as [op, t] (op)}<button title={t} onclick={() => run(op)}>{@render alignIcon(op)}</button>{/each}
	</span>
</div>
<div class="prop"><span>Distribute</span>
	<span class="pp-seg">
		{#each ALIGN_BTNS.slice(6) as [op, t] (op)}<button title={t} onclick={() => run(op)}>{@render alignIcon(op)}</button>{/each}
	</span>
</div>

{#snippet alignIcon(op: AlignOp)}
	<!-- a guide line (the edge / centre they line up on) + two bars; distribute = bars between two end lines -->
	<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true" style="display:block; margin:auto">
		{#if op === 'left'}<rect x="0.5" y="0.5" width="1.2" height="11" /><rect x="2.5" y="2" width="8" height="2.6" /><rect x="2.5" y="7" width="5" height="2.6" />
		{:else if op === 'hcenter'}<rect x="5.4" y="0.5" width="1.2" height="11" /><rect x="1.5" y="2" width="9" height="2.6" /><rect x="3" y="7" width="6" height="2.6" />
		{:else if op === 'right'}<rect x="10.3" y="0.5" width="1.2" height="11" /><rect x="1.5" y="2" width="8" height="2.6" /><rect x="4.5" y="7" width="5" height="2.6" />
		{:else if op === 'top'}<rect x="0.5" y="0.5" width="11" height="1.2" /><rect x="2" y="2.5" width="2.6" height="8" /><rect x="7" y="2.5" width="2.6" height="5" />
		{:else if op === 'vcenter'}<rect x="0.5" y="5.4" width="11" height="1.2" /><rect x="2" y="1.5" width="2.6" height="9" /><rect x="7" y="3" width="2.6" height="6" />
		{:else if op === 'bottom'}<rect x="0.5" y="10.3" width="11" height="1.2" /><rect x="2" y="1.5" width="2.6" height="8" /><rect x="7" y="4.5" width="2.6" height="5" />
		{:else if op === 'hspace'}<rect x="0.5" y="0.5" width="1" height="11" /><rect x="10.5" y="0.5" width="1" height="11" /><rect x="4.7" y="2.5" width="2.6" height="7" />
		{:else}<rect x="0.5" y="0.5" width="11" height="1" /><rect x="0.5" y="10.5" width="11" height="1" /><rect x="2.5" y="4.7" width="7" height="2.6" />{/if}
	</svg>
{/snippet}
