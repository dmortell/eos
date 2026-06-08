<script lang="ts">
	import { Window } from '$lib'
	import PropText from '../../parts/PropText.svelte'
	import PropSelect from '../../parts/PropSelect.svelte'
	import AnnotationControls from '../../edit/AnnotationControls.svelte'
	import { portal } from '../../edit/portal'
	import { RacksEditor, DEVICE_TYPES } from './racks-editor.svelte'
	import type { AnnotationEditor } from '../../annotations/annotations.svelte'

	let { editor, tool = $bindable(), annEditor }: { editor: RacksEditor; tool: string; annEditor: AnnotationEditor } = $props()
	const val = (e: Event) => (e.currentTarget as HTMLInputElement | HTMLSelectElement).value
	let firstRow = $derived(editor.rows[0]?.id ?? '')
</script>

<div use:portal>
<Window title="Edit" name="racks-edit" left={10} top={72} open class="w-64 space-y-2 p-2 text-zinc-700">
	<AnnotationControls bind:tool editor={annEditor} showSelect />
	<hr class="border-zinc-200" />
	<!-- racks -->
	<div class="flex items-center gap-2">
		<span class="w-16 shrink-0 text-xs text-zinc-500">Rack</span>
		<select class="w-full rounded border px-1 py-0.5 text-xs" value={editor.selRack?.id ?? ''} onchange={(e: Event) => editor.selectRack(val(e))}>
			<option value="" disabled>— select —</option>
			{#each editor.racks as r (r.id)}<option value={r.id}>{r.label}</option>{/each}
		</select>
		<button class="rounded border px-1.5 py-0.5 text-xs hover:bg-slate-100" disabled={!firstRow} onclick={() => editor.addRack(editor.selRack?.rowId ?? firstRow)}>+</button>
	</div>

	{#if editor.selRack}
		{@const r = editor.selRack}
		<PropText label="Label" value={r.label} oninput={(e: Event) => editor.setRack({ label: val(e) })} />
		<PropText label="Height (U)" type="number" min="1" max="58" value={String(r.heightU)} oninput={(e: Event) => editor.setRack({ heightU: Number(val(e)) || 1 })} />
		<PropText label="Width (mm)" type="number" min="100" value={String(r.widthMm)} oninput={(e: Event) => editor.setRack({ widthMm: Number(val(e)) || 600 })} />
		<PropSelect label="Type" value={r.type} onchange={(e: Event) => editor.setRack({ type: val(e) as any })}>
			{#each ['2-post', '4-post', 'cabinet', 'desk', 'shelf', 'vcm'] as t (t)}<option value={t}>{t}</option>{/each}
		</PropSelect>
		<button class="w-full rounded bg-red-600 px-1 py-0.5 text-xs text-white hover:bg-red-500" onclick={() => editor.deleteRack()}>Delete rack</button>

		<hr class="border-zinc-200" />
		<!-- devices -->
		<div class="flex items-center gap-2">
			<span class="w-16 shrink-0 text-xs text-zinc-500">Device</span>
			<select class="w-full rounded border px-1 py-0.5 text-xs" value={editor.selDevice?.id ?? ''} onchange={(e: Event) => editor.selectDevice(val(e))}>
				<option value="" disabled>— select —</option>
				{#each editor.rackDevices as d (d.id)}<option value={d.id}>U{d.positionU} · {d.label}</option>{/each}
			</select>
			<button class="rounded border px-1.5 py-0.5 text-xs hover:bg-slate-100" onclick={() => editor.addDevice()}>+</button>
		</div>
		{#if editor.selDevice}
			{@const d = editor.selDevice}
			<PropText label="Label" value={d.label} oninput={(e: Event) => editor.setDevice({ label: val(e) })} />
			<PropSelect label="Type" value={d.type} onchange={(e: Event) => editor.setDevice({ type: val(e) as any })}>
				{#each DEVICE_TYPES as t (t)}<option value={t}>{t}</option>{/each}
			</PropSelect>
			<PropText label="Position (U)" type="number" min="1" value={String(d.positionU)} oninput={(e: Event) => editor.setDevice({ positionU: Number(val(e)) || 1 })} />
			<PropText label="Height (U)" type="number" min="1" value={String(d.heightU)} oninput={(e: Event) => editor.setDevice({ heightU: Number(val(e)) || 1 })} />
			<PropSelect label="Mounting" value={d.mounting ?? 'both'} onchange={(e: Event) => editor.setDevice({ mounting: val(e) as any })}>
				<option value="both">Both</option><option value="front">Front</option><option value="rear">Rear</option><option value="none">None</option>
			</PropSelect>
			<button class="w-full rounded bg-red-600 px-1 py-0.5 text-xs text-white hover:bg-red-500" onclick={() => editor.deleteDevice()}>Delete device</button>
		{/if}
	{:else}
		<p class="text-xs text-zinc-400">Select a rack (or drag a row in plan view).</p>
	{/if}
</Window>
</div>
