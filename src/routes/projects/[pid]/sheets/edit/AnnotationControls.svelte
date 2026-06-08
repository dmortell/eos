<script lang="ts">
	// Shared annotation controls for the merged Edit window: the Text/Arrow/Rect/Symbol tool
	// buttons (optionally a Select button) plus the selected-annotation property editor. The
	// unified `tool` is bound from the host panel so object- and annotation-tools share one mode.
	import PropText from '../parts/PropText.svelte'
	import PropSelect from '../parts/PropSelect.svelte'
	import { SYMBOLS, symbolDef } from '../annotations/symbols/registry'
	import type { AnnotationEditor } from '../annotations/annotations.svelte'

	let { tool = $bindable(), editor, showSelect = false }: {
		tool: string
		editor: AnnotationEditor
		showSelect?: boolean
	} = $props()

	const annTools: [string, string][] = [['text', 'Text'], ['arrow', 'Arrow'], ['rect', 'Rect'], ['symbol', 'Symbol']]
	const val = (e: Event) => (e.currentTarget as HTMLInputElement | HTMLSelectElement).value
	let sel = $derived(editor.selAnn)
	let def = $derived(sel?.kind === 'symbol' ? symbolDef(sel.symbol) : undefined)
	const cls = (active: boolean) => ['rounded border px-1.5 py-0.5 text-xs', active ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-slate-100']
</script>

<div class="flex flex-wrap gap-1">
	{#if showSelect}
		<button class={cls(tool === 'select')} onclick={() => (tool = 'select')}>Select</button>
	{/if}
	{#each annTools as [id, label] (id)}
		<button class={cls(tool === id)} onclick={() => (tool = id)}>{label}</button>
	{/each}
</div>

{#if tool === 'symbol'}
	<PropSelect label="Symbol" value={editor.symbol} onchange={(e: Event) => (editor.symbol = val(e))}>
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
	<button class="w-full rounded bg-red-600 px-1 py-0.5 text-xs text-white hover:bg-red-500" onclick={() => editor.deleteSel()}>Delete annotation</button>
{/if}
