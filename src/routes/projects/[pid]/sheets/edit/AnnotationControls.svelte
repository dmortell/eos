<script module lang="ts">
	// Quick-access annotation tools shared across panels (module-level). The first three stay fixed;
	// the LAST (fourth) slot holds whatever was most recently picked from the "▾" dropdown.
	let mru = $state<string[]>(['text', 'line', 'arrow', 'cloud'])
</script>

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
	import { portal } from './portal'
	import { HOTKEY_OF } from './hotkeys'
	import type { AnnotationEditor } from '../annotations/annotations.svelte'

	type Opt = { id: string; label: string }
	let { tool = $bindable(), editor, showSelect = false }: { tool: string; editor: AnnotationEditor; showSelect?: boolean } = $props()
	const links = getContext<{ sheets?: Opt[]; surveys?: Opt[]; photos?: (surveyId?: string) => Opt[] }>('annLinks')

	const annTools: [string, string][] = [
		['text', 'Text'], ['line', 'Line'], ['arrow', 'Arrow'], ['rect', 'Rect'], ['ellipse', 'Ellipse'], ['cloud', 'Cloud'],
		['callout', 'Callout'], ['dimension', 'Dim'], ['symbol', 'Symbol'], ['image', 'Image'],
	]
	const labelOf = (id: string) => annTools.find(t => t[0] === id)?.[1] ?? id
	// The picker menu is portalled to a fixed overlay (the Edit window clips/scrolls its content),
	// positioned under the chevron from its on-screen rect.
	let menuOpen = $state(false)
	let chevronEl = $state<HTMLButtonElement>()
	let menuPos = $state({ x: 0, y: 0 })
	function toggleMenu() {
		if (!menuOpen && chevronEl) { const r = chevronEl.getBoundingClientRect(); menuPos = { x: r.left, y: r.bottom + 2 } }
		menuOpen = !menuOpen
	}
	// Quick buttons stay put when clicked. Picking from the dropdown drops it into the LAST quick
	// slot (so the first two stay stable), unless it's already one of the others.
	function selectTool(id: string) { tool = id; menuOpen = false }
	function pickFromMenu(id: string) {
		tool = id
		menuOpen = false
		if (!mru.slice(0, mru.length - 1).includes(id)) mru = [...mru.slice(0, mru.length - 1), id]
	}
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
	// Annotation-category layers the selection can be moved to (default Annotations + customs under it).
	let annLayers = $derived(editor.layers.filter(l => l.id === 'annotations' || l.base === 'annotations'))
	const cls = (active: boolean) => ['rounded border px-1.5 py-0.5 text-xs', active ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-slate-100']
	const hasText = (k?: string) => k === 'text' || k === 'callout'
	const hasLine = (k?: string) => k === 'line' || k === 'arrow' || k === 'callout'
	const CALLOUT_BORDERS: [string, string][] = [['none', 'None'], ['underline', 'Underline'], ['box', 'Border']]
	const hasFill = (k?: string) => k === 'rect' || k === 'ellipse' || k === 'cloud' || k === 'callout' || k === 'symbol'
</script>

<!-- Consolidated annote toolbar: Select + a few recently-used annotes + a "▾" picker for the rest. -->
<div class="flex flex-wrap items-center gap-1">
	{#if showSelect}<button class={cls(tool === 'select')} onclick={() => (tool = 'select')}>Select</button>{/if}
	{#each mru as id (id)}
		<button class={cls(tool === id)} title="Insert {labelOf(id)}{HOTKEY_OF[id] ? ` (${HOTKEY_OF[id]})` : ''}" onclick={() => selectTool(id)}>+ {labelOf(id)}</button>
	{/each}
	<button bind:this={chevronEl} class={cls(!!tool && tool !== 'select' && !mru.includes(tool))} title="More annotations" aria-label="More annotations" onclick={toggleMenu}>▾</button>
</div>

{#if menuOpen}
	<!-- Portalled so the Edit window's overflow doesn't clip it; fixed at the chevron's rect. -->
	<div use:portal>
		<!-- svelte-ignore a11y_consider_explicit_label -->
		<button class="fixed inset-0 cursor-default" style:z-index="60" aria-label="Close menu" onclick={() => (menuOpen = false)}></button>
		<div class="fixed w-32 overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg" style:z-index="61" style:left="{menuPos.x}px" style:top="{menuPos.y}px">
			{#each annTools as [id, label] (id)}
				<button class="flex w-full items-center justify-between px-2 py-1 text-left text-xs hover:bg-slate-100 {tool === id ? 'text-blue-600' : 'text-zinc-700'}" onclick={() => pickFromMenu(id)}>
					<span>+ {label}</span>
					{#if HOTKEY_OF[id]}<span class="ml-2 text-[10px] text-zinc-400">{HOTKEY_OF[id]}</span>{/if}
				</button>
			{/each}
		</div>
	</div>
{/if}

{#if tool === 'symbol' && !sel}
	<PropSelect label="Symbol" value={editor.symbol} onchange={(e: Event) => (editor.symbol = val(e))}>
		{#each SYMBOLS as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
	</PropSelect>
{/if}

{#if sel}
	<hr class="border-zinc-200" />
	{#if annLayers.length > 1}
		<PropSelect label="Layer" value={sel.layerId ?? 'annotations'} onchange={(e: Event) => editor.setSelLayer(val(e))}>
			{#each annLayers as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
		</PropSelect>
	{/if}
	{#if sel.kind === 'image'}
		<PropText label="Image URL" value={sel.src ?? ''} placeholder="https://… or data:image/…" oninput={(e: Event) => editor.setSel({ src: val(e) })} />
		<p class="text-[10px] text-zinc-400">Paste an image URL or a data: URL. Drag the box to size; the image fits inside.</p>
	{/if}
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
		{#if sel.kind === 'callout'}
			<div class="flex items-center justify-between gap-2">
				<span class="w-24 shrink-0 text-xs text-zinc-500">Border</span>
				<div class="flex w-full gap-0.5">
					{#each CALLOUT_BORDERS as [v, l] (v)}
						<button class={cls((sel.border ?? 'none') === v)} onclick={() => editor.setSel({ border: v as any })}>{l}</button>
					{/each}
				</div>
			</div>
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

	<PropColor label={hasFill(sel.kind) ? 'Border' : 'Color'} value={sel.color ?? '#dc2626'} allowNone={false} onchange={(c) => editor.setSel({ color: c })} />
	{#if hasFill(sel.kind)}
		<PropColor label="Fill" value={sel.fill ?? 'none'} onchange={(c) => editor.setSel({ fill: c })} />
	{/if}
	<button class="w-full rounded bg-red-600 px-1 py-0.5 text-xs text-white hover:bg-red-500" onclick={() => editor.deleteSel()}>Delete annotation</button>
{/if}
