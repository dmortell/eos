<script lang="ts">
	// Shared annotation controls for the merged Edit window: annotation tool buttons + the
	// selected-annotation property editor. `tool` is bound from the host so object/annotation tools
	// share one mode. Link pickers (sheet/survey/photo) read optional lists from context
	// ('annLinks'); they fall back to free-text when no list is provided.
	import { getContext, tick } from 'svelte'
	import PropText from '../parts/PropText.svelte'
	import PropTextarea from '../parts/PropTextarea.svelte'
	import PropSelect from '../parts/PropSelect.svelte'
	import PropCheck from '../parts/PropCheck.svelte'
	import PropColor from '../parts/PropColor.svelte'
	import { SYMBOLS, symbolDef } from '../annotations/symbols/registry'
	import type { AnnotationEditor } from '../annotations/annotations.svelte'

	type Opt = { id: string; label: string }
	let { tool = $bindable(), editor, showSelect = false }: { tool: string; editor: AnnotationEditor; showSelect?: boolean } = $props()
	const links = getContext<{ sheets?: Opt[]; surveys?: Opt[]; photos?: (surveyId?: string) => Opt[] }>('annLinks')

	const annTools: [string, string][] = [
		['text', 'Text'], ['line', 'Line'], ['arrow', 'Arrow'], ['rect', 'Rect'], ['ellipse', 'Ellipse'], ['cloud', 'Cloud'],
		['callout', 'Callout'], ['dimension', 'Dim'], ['symbol', 'Symbol'],
	]
	const HEADS: [string, string][] = [['none', 'None'], ['arrow', 'Arrow'], ['dot', 'Dot'], ['tick', 'Tick']]
	const DASHES: [string, string][] = [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']]
	const val = (e: Event) => (e.currentTarget as HTMLInputElement | HTMLSelectElement).value
	let sel = $derived(editor.selAnn)
	// Double-clicking a text/callout/leader on the canvas bumps textFocusNonce; jump focus
	// to the text field so the user can type straight away. Guard on the value changing so
	// merely selecting an annotation doesn't steal focus.
	let textEl = $state<HTMLTextAreaElement | undefined>()
	let lastFocusNonce = 0
	$effect(() => {
		const n = editor.textFocusNonce
		if (n === lastFocusNonce) return
		lastFocusNonce = n
		tick().then(() => { textEl?.focus(); textEl?.select() })
	})
	let def = $derived(sel?.kind === 'symbol' ? symbolDef(sel.symbol) : undefined)
	const cls = (active: boolean) => ['rounded border px-1.5 py-0.5 text-xs', active ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-slate-100']
	const hasText = (k?: string) => k === 'text' || k === 'callout' || k === 'leader'
	const hasLine = (k?: string) => k === 'line' || k === 'arrow' || k === 'callout' || k === 'leader'
	const hasFill = (k?: string) => k === 'rect' || k === 'ellipse' || k === 'cloud' || k === 'callout' || k === 'symbol'
</script>

<div class="flex flex-wrap gap-1">
	{#if showSelect}<button class={cls(tool === 'select')} onclick={() => (tool = 'select')}>Select</button>{/if}
	{#each annTools as [id, label] (id)}
		<button class={cls(tool === id)} onclick={() => (tool = id)}>{label}</button>
	{/each}
</div>

{#if tool === 'symbol' && !sel}
	<PropSelect label="Symbol" value={editor.symbol} onchange={(e: Event) => (editor.symbol = val(e))}>
		{#each SYMBOLS as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
	</PropSelect>
{/if}

{#if sel}
	<hr class="border-zinc-200" />
	{#if hasText(sel.kind)}
		<PropTextarea label="Text" rows={2} bind:element={textEl} value={sel.text ?? ''} oninput={(e: Event) => editor.setSel({ text: val(e) })} />
		<div class="flex items-center justify-between gap-2">
			<span class="w-24 shrink-0 text-xs text-zinc-500">Align</span>
			<div class="flex w-full gap-0.5">
				{#each ['left', 'center', 'right'] as al (al)}
					<button class={['flex-1 rounded border px-1 py-0.5 text-xs', (sel.align ?? 'left') === al ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-slate-100']} onclick={() => editor.setSel({ align: al as any })}>{al[0].toUpperCase()}</button>
				{/each}
			</div>
		</div>
		<PropText label="Font (pt)" type="number" min="2" value={String(sel.fontPt ?? 8)} oninput={(e: Event) => editor.setSel({ fontPt: Number(val(e)) || 8 })} />
		{#if sel.kind === 'callout' || sel.kind === 'leader'}
			<PropCheck label="Box border" value={sel.border !== false} onchange={(e: Event) => editor.setSel({ border: (e.currentTarget as HTMLInputElement).checked })} />
		{/if}
	{/if}

	{#if hasLine(sel.kind)}
		<PropSelect label="Start" value={sel.start ?? 'none'} onchange={(e: Event) => editor.setSel({ start: val(e) as any })}>
			{#each HEADS as [v, l] (v)}<option value={v}>{l}</option>{/each}
		</PropSelect>
		<PropSelect label="End" value={sel.end ?? 'none'} onchange={(e: Event) => editor.setSel({ end: val(e) as any })}>
			{#each HEADS as [v, l] (v)}<option value={v}>{l}</option>{/each}
		</PropSelect>
	{/if}
	{#if hasLine(sel.kind) || sel.kind === 'rect' || sel.kind === 'ellipse'}
		<PropSelect label="Dash" value={sel.dash ?? 'solid'} onchange={(e: Event) => editor.setSel({ dash: val(e) as any })}>
			{#each DASHES as [v, l] (v)}<option value={v}>{l}</option>{/each}
		</PropSelect>
	{/if}

	{#if sel.kind === 'symbol'}
		<PropSelect label="Symbol" value={sel.symbol ?? 'section'} onchange={(e: Event) => editor.setSel({ symbol: val(e) })}>
			{#each SYMBOLS as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
		</PropSelect>
		{#if sel.symbol === 'door'}
			<PropCheck label="Flip" value={!!sel.flip} onchange={(e: Event) => editor.setSel({ flip: (e.currentTarget as HTMLInputElement).checked })} />
		{/if}
		{#if def?.linkable === 'drawing'}
			<PropText label="Ref" value={sel.link?.ref ?? ''} oninput={(e: Event) => editor.setLink({ kind: 'drawing', ref: val(e) })} />
			{#if links?.sheets?.length}
				<PropSelect label="Sheet" value={sel.link?.sheetId ?? ''} onchange={(e: Event) => editor.setLink({ kind: 'drawing', sheetId: val(e) })}>
					<option value="">— sheet —</option>
					{#each links.sheets as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
				</PropSelect>
			{:else}
				<PropText label="Sheet id" value={sel.link?.sheetId ?? ''} oninput={(e: Event) => editor.setLink({ kind: 'drawing', sheetId: val(e) })} />
			{/if}
		{:else if def?.linkable === 'photo'}
			{#if links?.surveys?.length}
				<PropSelect label="Survey" value={sel.link?.surveyId ?? ''} onchange={(e: Event) => editor.setLink({ kind: 'photo', surveyId: val(e), photoId: '' })}>
					<option value="">— survey —</option>
					{#each links.surveys as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
				</PropSelect>
				{#if links.photos && sel.link?.surveyId}
					<PropSelect label="Photo" value={sel.link?.photoId ?? ''} onchange={(e: Event) => editor.setLink({ kind: 'photo', photoId: val(e) })}>
						<option value="">— photo —</option>
						{#each links.photos(sel.link.surveyId) as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
					</PropSelect>
				{/if}
			{:else}
				<PropText label="Survey id" value={sel.link?.surveyId ?? ''} oninput={(e: Event) => editor.setLink({ kind: 'photo', surveyId: val(e) })} />
				<PropText label="Photo id" value={sel.link?.photoId ?? ''} oninput={(e: Event) => editor.setLink({ kind: 'photo', photoId: val(e) })} />
			{/if}
		{/if}
	{/if}

	<PropColor label={hasFill(sel.kind) ? 'Border' : 'Colour'} value={sel.color ?? '#dc2626'} allowNone={false} onchange={(c) => editor.setSel({ color: c })} />
	{#if hasFill(sel.kind)}
		<PropColor label="Fill" value={sel.fill ?? 'none'} onchange={(c) => editor.setSel({ fill: c })} />
	{/if}
	<button class="w-full rounded bg-red-600 px-1 py-0.5 text-xs text-white hover:bg-red-500" onclick={() => editor.deleteSel()}>Delete annotation</button>
{/if}
