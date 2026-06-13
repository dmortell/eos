<script lang="ts">
	import { Window } from '$lib'
	import PropText from '../../parts/PropText.svelte'
	import PropSelect from '../../parts/PropSelect.svelte'
	import AnnotationControls from '../../edit/AnnotationControls.svelte'
	import { portal } from '../../edit/portal'
	import { formNav } from '../../edit/formNav'
	import { RisersEditor, LEVELS, LADDER_LEVELS } from './risers-editor.svelte'
	import type { AnnotationEditor } from '../../annotations/annotations.svelte'

	let { editor, tool = $bindable(), annEditor, fromFloor, toFloor }: { editor: RisersEditor; tool: string; annEditor: AnnotationEditor; fromFloor: number; toFloor: number } = $props()
	const val = (e: Event) => (e.currentTarget as HTMLInputElement | HTMLSelectElement).value
	let floorOpts = $derived.by(() => { const a: number[] = []; for (let f = Math.max(fromFloor, toFloor); f >= Math.min(fromFloor, toFloor); f--) a.push(f); return a })
	const objTools = [['select', 'Select'], ['room', 'Room'], ['riser', 'Riser']] as const
	const cls = (active: boolean) => ['rounded border px-1.5 py-0.5 text-xs', active ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-slate-100']
</script>

<div use:portal>
<Window title="Edit" name="risers-edit" left={10} top={72} open class="w-64 p-2 text-zinc-700">
	<div class="space-y-2" use:formNav>
	<div class="flex flex-wrap gap-1">
		{#each objTools as [id, label] (id)}
			<button class={cls(tool === id)} title={id === 'select' ? 'Select / edit' : `Insert ${label}`} onclick={() => (tool = id)}>{id === 'select' ? label : `+ ${label}`}</button>
		{/each}
		<button class="rounded border px-1.5 py-0.5 text-xs hover:bg-slate-100" onclick={() => { tool = 'select'; editor.addCable() }}>+ Cable</button>
	</div>
	<p class="text-[10px] text-zinc-400">Room: drag a box to place &amp; size. Riser: drag floor-to-floor. Drag a room to any floor; drag its edges to resize.</p>
	{#if editor.cables.length}
		<PropSelect label="Edit cable" value={editor.selCable?.id ?? ''} onchange={(e: Event) => editor.select('cable', val(e))}>
			<option value="" disabled>— pick a cable —</option>
			{#each editor.cables as c, i (c.id)}<option value={c.id}>{c.type} · {c.segments.length} hop{c.segments.length === 1 ? '' : 's'}</option>{/each}
		</PropSelect>
	{/if}
	<AnnotationControls bind:tool editor={annEditor} />
	<hr class="border-zinc-200" />

	{#if editor.selRoom}
		{@const r = editor.selRoom}
		<hr class="border-zinc-200" />
		<PropText label="Label" value={r.label} oninput={(e: Event) => editor.setRoom({ label: val(e) })} />
		<PropSelect label="Type" value={r.kind} onchange={(e: Event) => editor.setRoom({ kind: val(e) as any })}>
			<option value="server">Server</option><option value="eps">EPS</option>
		</PropSelect>
		<PropSelect label="Floor" value={String(r.floor)} onchange={(e: Event) => editor.setRoom({ floor: Number(val(e)) })}>
			{#each floorOpts as f (f)}<option value={String(f)}>{f}F</option>{/each}
		</PropSelect>
		<PropText label="Width (mm)" type="number" min="500" value={String(r.widthMm)} oninput={(e: Event) => editor.setRoom({ widthMm: Number(val(e)) || 3000 })} />
		<button class="w-full rounded bg-red-600 px-1 py-0.5 text-xs text-white hover:bg-red-500" onclick={() => editor.deleteSel()}>Delete room</button>
	{:else if editor.selLadder}
		{@const l = editor.selLadder}
		<hr class="border-zinc-200" />
		<PropText label="Label" value={l.label} oninput={(e: Event) => editor.setLadder({ label: val(e) })} />
		<PropSelect label="From" value={String(l.fromFloor)} onchange={(e: Event) => editor.setLadder({ fromFloor: Number(val(e)) })}>
			{#each floorOpts as f (f)}<option value={String(f)}>{f}F</option>{/each}
		</PropSelect>
		<PropSelect label="To" value={String(l.toFloor)} onchange={(e: Event) => editor.setLadder({ toFloor: Number(val(e)) })}>
			{#each floorOpts as f (f)}<option value={String(f)}>{f}F</option>{/each}
		</PropSelect>
		<PropSelect label="Level" value={l.level} onchange={(e: Event) => editor.setLadder({ level: val(e) as any })}>
			{#each LADDER_LEVELS as lv (lv)}<option value={lv}>{lv}</option>{/each}
		</PropSelect>
		<button class="w-full rounded bg-red-600 px-1 py-0.5 text-xs text-white hover:bg-red-500" onclick={() => editor.deleteSel()}>Delete riser</button>
	{:else if editor.selCable}
		{@const c = editor.selCable}
		<hr class="border-zinc-200" />
		<PropText label="Type" value={c.type} oninput={(e: Event) => editor.setCable({ type: val(e) })} />
		<PropSelect label="Media" value={c.media ?? 'copper'} onchange={(e: Event) => editor.setCable({ media: val(e) as any })}>
			<option value="copper">Copper</option><option value="fiber">Fiber</option>
		</PropSelect>
		<div class="text-xs text-zinc-500">Route (hops):</div>
		{#each c.segments as seg, i (i)}
			<div class="flex items-center gap-1">
				<select class="flex-1 rounded border px-1 py-0.5 text-xs" value={seg.roomId} onchange={(e: Event) => editor.setSegment(i, { roomId: val(e) })}>
					{#each editor.rooms as rm (rm.id)}<option value={rm.id}>{rm.label} {rm.floor}F</option>{/each}
				</select>
				<select class="rounded border px-1 py-0.5 text-xs" value={seg.level ?? 'high'} onchange={(e: Event) => editor.setSegment(i, { level: val(e) as any })}>
					{#each LEVELS as lv (lv)}<option value={lv}>{lv}</option>{/each}
				</select>
				<select class="rounded border px-1 py-0.5 text-xs" value={seg.ladderId ?? ''} onchange={(e: Event) => editor.setSegment(i, { ladderId: val(e) || undefined })}>
					<option value="">— ladder —</option>
					{#each editor.ladders as ld (ld.id)}<option value={ld.id}>{ld.label}</option>{/each}
				</select>
				<button class="text-red-500" onclick={() => editor.removeSegment(i)}>✕</button>
			</div>
		{/each}
		<button class="w-full rounded border px-1 py-0.5 text-xs hover:bg-slate-100" onclick={() => editor.addSegment()}>+ Hop</button>
		<button class="w-full rounded bg-red-600 px-1 py-0.5 text-xs text-white hover:bg-red-500" onclick={() => editor.deleteSel()}>Delete cable</button>
	{:else}
		<p class="text-xs text-zinc-400">Add or drag a room / riser, or pick a cable to route.</p>
	{/if}
	</div>
</Window>
</div>
