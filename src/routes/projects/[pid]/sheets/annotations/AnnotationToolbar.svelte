<script lang="ts">
	import { Window } from '$lib'
	import PropText from '../parts/PropText.svelte'
	import PropSelect from '../parts/PropSelect.svelte'
	import { portal } from '../edit/portal'
	import { SYMBOLS, symbolDef } from './symbols/registry'
	import type { AnnotationEditor, AnnTool } from './annotations.svelte'

	let { editor }: { editor: AnnotationEditor } = $props()
	const tools: [AnnTool, string][] = [['select', 'Select'], ['text', 'Text'], ['arrow', 'Arrow'], ['rect', 'Rect'], ['symbol', 'Symbol']]
	const val = (e: Event) => (e.currentTarget as HTMLInputElement | HTMLSelectElement).value
	let sel = $derived(editor.selAnn)
	let def = $derived(sel?.kind === 'symbol' ? symbolDef(sel.symbol) : undefined)
</script>

<div use:portal>
<Window title="Annotate" name="annotate" right={10} bottom={10} open class="w-60 space-y-2 p-2 text-zinc-700">
	<div class="flex flex-wrap gap-1">
		{#each tools as [id, label] (id)}
			<button class={["rounded border px-1.5 py-0.5 text-xs", editor.tool === id ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-slate-100']}
				onclick={() => editor.tool = id}>{label}</button>
		{/each}
	</div>
	{#if editor.tool === 'symbol'}
		<PropSelect label="Symbol" value={editor.symbol} onchange={(e: Event) => editor.symbol = val(e)}>
			{#each SYMBOLS as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
		</PropSelect>
	{/if}
	{#if sel}
		<hr class="border-zinc-200" />
		{#if sel.kind === 'text'}
			<PropText label="Text" value={sel.text ?? ''} oninput={(e: Event) => editor.setSel({ text: val(e) })} />
			<PropText label="Font (pt)" type="number" min="2" value={String(sel.fontPt ?? 8)} oninput={(e: Event) => editor.setSel({ fontPt: Number(val(e)) || 8 })} />
		{:else if sel.kind === 'symbol'}
			{#if def?.linkable === 'drawing'}
				<PropText label="Ref" value={sel.link?.ref ?? ''} oninput={(e: Event) => editor.setLink({ kind: 'drawing', ref: val(e) })} />
				<PropText label="Sheet id" value={sel.link?.sheetId ?? ''} oninput={(e: Event) => editor.setLink({ kind: 'drawing', sheetId: val(e) })} />
			{:else if def?.linkable === 'photo'}
				<PropText label="Survey id" value={sel.link?.surveyId ?? ''} oninput={(e: Event) => editor.setLink({ kind: 'photo', surveyId: val(e) })} />
				<PropText label="Photo id" value={sel.link?.photoId ?? ''} oninput={(e: Event) => editor.setLink({ kind: 'photo', photoId: val(e) })} />
			{/if}
		{/if}
		<button class="w-full rounded bg-red-600 px-1 py-0.5 text-xs text-white hover:bg-red-500" onclick={() => editor.deleteSel()}>Delete</button>
	{/if}
</Window>
</div>
