<script module lang="ts">
	// Quick-access annotation tools shared across panels (module-level). The first three stay fixed;
	// the LAST (fourth) slot holds whatever was most recently picked from the "▾" dropdown.
	let mru = $state<string[]>(['text', 'line', 'rect', 'dim'])
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
	import { OUTLET_USAGE, OUTLET_CABLE, OUTLET_MOUNT } from '../annotations/outlet'
	import { portal } from './portal'
	import { HOTKEY_OF } from './hotkeys'
	import type { AnnotationEditor } from '../annotations/annotations.svelte'

	type Opt = { id: string; label: string }
	// `tools`: when given, these annotation kinds render as direct buttons (and the
	// "▾" picker is hidden) — used by model3d to surface its full live set. Default
	// keeps the shared MRU + picker used by outlets/racks/risers.
	let { tool = $bindable(), editor, showSelect = false, tools: toolsOverride }: { tool: string; editor: AnnotationEditor; showSelect?: boolean; tools?: string[] } = $props()
	const quick = $derived(toolsOverride ?? mru)
	const links = getContext<{ sheets?: Opt[]; surveys?: Opt[]; photos?: (surveyId?: string) => Opt[] }>('annLinks')

	const annTools: [string, string][] = [
		['text', 'Text'], ['line', 'Line'],
		['rect', 'Rect'],
		['arrow', 'Arrow'],
		['ellipse', 'Ellipse'], ['cloud', 'Cloud'],
		['callout', 'Callout'], ['dimension', 'Dim'],
		['image', 'Image'],
		['grid', 'Grid'],
		['outlet', 'Outlet'],
		['symbol', 'Symbol'],
	]
	const labelOf = (id: string) => annTools.find(t => t[0] === id)?.[1] ?? id
	// 'outlet' is a quick alias for the outlet symbol (kind:symbol, symbol:outlet).
	const applyTool = (id: string) => { if (id === 'outlet') { editor.symbol = 'outlet'; return 'symbol' } return id }
	const isActive = (id: string) => id === 'outlet' ? (tool === 'symbol' && editor.symbol === 'outlet') : tool === id
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
	function selectTool(id: string) { tool = applyTool(id); menuOpen = false }
	function pickFromMenu(id: string) {
		tool = applyTool(id)
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
	// F2 toggles focus on the selected text annote's textarea (focus ⇄ blur back to the canvas).
	// textEl only exists while a text/callout annote is selected, so F2 is a no-op otherwise.
	$effect(() => {
		function onKey(e: KeyboardEvent) {
			if (e.key !== 'F2') return
			e.preventDefault()
			if (document.activeElement === textEl) textEl?.blur()
			else if (textEl) { textEl.focus(); textEl.select() }
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	})
	let def = $derived(sel?.kind === 'symbol' ? symbolDef(sel.symbol) : undefined)
	// Annotation-category layers the selection can be moved to (default Annotations + customs under it).
	let annLayers = $derived(editor.layers.filter(l => l.id === 'annotations' || l.base === 'annotations'))
	const cls = (active: boolean) => ['rounded border px-1.5 py-0.5 text-xs', active ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-slate-100']
	const hasText = (k?: string) => k === 'text' || k === 'callout'
	const hasLine = (k?: string) => k === 'line' || k === 'arrow' || k === 'callout' || k === 'dimension'
	const CALLOUT_BORDERS: [string, string][] = [['none', 'None'], ['underline', 'Underline'], ['box', 'Border']]
	const hasFill = (k?: string) => k === 'rect' || k === 'ellipse' || k === 'cloud' || k === 'callout' || k === 'symbol'
</script>

<!-- Consolidated annote toolbar: Select + a few recently-used annotes + a "▾" picker for the rest. -->
<div class="flex flex-wrap items-center gap-1">
	{#if showSelect}<button class={cls(tool === 'select')} onclick={() => (tool = 'select')}>Select</button>{/if}
	{#each quick as id (id)}
		<button class={cls(isActive(id))} title="Insert {labelOf(id)}{HOTKEY_OF[id] ? ` (${HOTKEY_OF[id]})` : ''}" onclick={() => selectTool(id)}>+{labelOf(id)}</button>
	{/each}
	{#if !toolsOverride}
		<button bind:this={chevronEl} class={cls(!!tool && tool !== 'select' && !mru.includes(tool))} title="More annotations" aria-label="More annotations" onclick={toggleMenu}>▾</button>
	{/if}
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

{#if editor.selAnns.length > 1 && editor.selectedAnnList().length}
	{@const anns = editor.selectedAnnList()}
	{@const outs = anns.filter((a) => a.symbol === 'outlet')}
	<hr class="border-zinc-200" />
	<div class="text-xs font-medium text-zinc-600">{editor.selAnns.length} selected{outs.length ? ` · ${outs.length} outlet${outs.length > 1 ? 's' : ''}` : ''}</div>
	{#if annLayers.length > 1}
		{@const lyr = anns.every((a) => a.layerId === anns[0].layerId) ? (anns[0].layerId ?? 'annotations') : ''}
		<PropSelect label="Layer" value={lyr} onchange={(e: Event) => editor.setSelLayer(val(e))}>
			{#if !lyr}<option value="" disabled>mixed</option>{/if}
			{#each annLayers as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
		</PropSelect>
	{/if}
	{@const cc = (k: keyof typeof anns[0]) => { const v = anns.map((a) => a[k]); return v.every((x) => x === v[0]) ? v[0] : undefined }}
	{@const textKinds = anns.filter((a) => a.kind === 'text' || a.kind === 'callout')}
	<div class="grid grid-cols-2 gap-1">
		<label class="block text-xs"><span class="text-zinc-400">Colour</span>
			<input type="color" class="h-6 w-full rounded border" value={(cc('color') as string) ?? '#dc2626'} oninput={(e: Event) => editor.setSelAll({ color: val(e) })} /></label>
		{#if textKinds.length}
			<label class="block text-xs"><span class="text-zinc-400">Font pt</span>
				<input type="number" min="4" max="48" class="w-full rounded border px-1 py-0.5" placeholder="mixed" value={(cc('fontPt') as number) ?? ''} oninput={(e) => editor.setSelAll({ fontPt: Number((e.currentTarget as HTMLInputElement).value) || 8 })} /></label>
		{/if}
	</div>
	{#if textKinds.length}
		<label class="block text-xs"><span class="text-zinc-400">Text (sets all)</span>
			<input class="w-full rounded border px-1 py-0.5" placeholder="mixed" value={(cc('text') as string) ?? ''} oninput={(e: Event) => editor.setSelAll({ text: val(e) })} /></label>
	{/if}
	{#if outs.length}
		{@const co = (k) => { const v = outs.map((a) => (a.outlet ?? {})[k]); return v.every((x) => x === v[0]) ? v[0] : undefined }}
		<div class="grid grid-cols-2 gap-1">
			<label class="block text-xs"><span class="text-zinc-400">Ports</span>
				<input type="number" min="1" max="24" class="w-full rounded border px-1 py-0.5" placeholder="mixed" value={co('ports') ?? ''} oninput={(e) => editor.setOutletAll({ ports: Number((e.currentTarget as HTMLInputElement).value) || 1 })} /></label>
			<label class="block text-xs"><span class="text-zinc-400">Level</span>
				<select class="w-full rounded border px-1 py-0.5" value={co('level') ?? ''} onchange={(e) => editor.setOutletAll({ level: val(e) })}>
					<option value="" disabled>mixed</option><option value="low">Low (floor)</option><option value="high">High (ceiling)</option>
				</select></label>
			<label class="block text-xs"><span class="text-zinc-400">Mount</span>
				<select class="w-full rounded border px-1 py-0.5" value={co('mount') ?? ''} onchange={(e) => editor.setOutletAll({ mount: val(e) })}>
					<option value="" disabled>mixed</option>{#each OUTLET_MOUNT as m (m.value)}<option value={m.value}>{m.label}</option>{/each}
				</select></label>
			<label class="block text-xs"><span class="text-zinc-400">Cable</span>
				<select class="w-full rounded border px-1 py-0.5" value={co('cable') ?? ''} onchange={(e: Event) => editor.setOutletAll({ cable: val(e) })}>
					<option value="" disabled>mixed</option>{#each OUTLET_CABLE as c (c.value)}<option value={c.value}>{c.label}</option>{/each}
				</select></label>
		</div>
		<label class="block text-xs"><span class="text-zinc-400">Usage</span>
			<select class="w-full rounded border px-1 py-0.5" value={co('usage') ?? ''} onchange={(e: Event) => editor.setOutletAll({ usage: val(e) })}>
				<option value="" disabled>mixed</option>{#each OUTLET_USAGE as u (u.value)}<option value={u.value}>{u.label}</option>{/each}
			</select></label>
	{/if}
{:else if sel}
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
		<PropTextarea label="Text (F2)" rows={2} bind:element={textEl} value={sel.text ?? ''} oninput={(e: Event) => editor.setSel({ text: val(e) })} />
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

	{#if sel.kind === 'dimension'}
		<PropText label="Length (mm)" type="number" min="0" value={String(Math.round(Math.hypot((sel.x2 ?? sel.x) - sel.x, (sel.y2 ?? sel.y) - sel.y)))} oninput={(e: Event) => editor.setSelLength(Number(val(e)) || 0)} />
		<PropText label="Font (pt)" type="number" min="2" value={String(sel.fontPt ?? 8)} oninput={(e: Event) => editor.setSel({ fontPt: Number(val(e)) || 8 })} />
	{/if}
	{#if sel.kind === 'grid'}
		<PropText label="Tile size (mm)" type="number" min="1" value={String(sel.grid?.size ?? 500)} oninput={(e: Event) => editor.setGrid({ size: Number(val(e)) || 500 })} />
		<PropText label="Offset X (mm)" type="number" value={String(sel.grid?.ox ?? 0)} oninput={(e: Event) => editor.setGrid({ ox: Number(val(e)) || 0 })} />
		<PropText label="Offset Y (mm)" type="number" value={String(sel.grid?.oy ?? 0)} oninput={(e: Event) => editor.setGrid({ oy: Number(val(e)) || 0 })} />
	{/if}
	{#if hasLine(sel.kind)}
		{@const headDflt = sel.kind === 'dimension' ? 'arrow' : 'none'}
		<PropSelect label="Start" value={sel.start ?? headDflt} onchange={(e: Event) => editor.setSel({ start: val(e) as any })}>
			{#each HEADS as [v, l] (v)}<option value={v}>{l}</option>{/each}
		</PropSelect>
		<PropSelect label="End" value={sel.end ?? headDflt} onchange={(e: Event) => editor.setSel({ end: val(e) as any })}>
			{#each HEADS as [v, l] (v)}<option value={v}>{l}</option>{/each}
		</PropSelect>
	{/if}
	{#if hasLine(sel.kind) || sel.kind === 'rect' || sel.kind === 'ellipse'}
		<PropSelect label="Dash" value={sel.dash ?? 'solid'} onchange={(e: Event) => editor.setSel({ dash: val(e) as any })}>
			{#each DASHES as [v, l] (v)}<option value={v}>{l}</option>{/each}
		</PropSelect>
	{/if}
	{#if sel.kind === 'line' || sel.kind === 'arrow'}
		<PropText label="Label" value={sel.text ?? ''} oninput={(e: Event) => editor.setSel({ text: val(e) })} />
		{#if sel.text}<PropText label="Font (pt)" type="number" min="2" value={String(sel.fontPt ?? 8)} oninput={(e: Event) => editor.setSel({ fontPt: Number(val(e)) || 8 })} />{/if}
	{/if}
	{#if (sel.kind === 'line' || sel.kind === 'arrow') && sel.text || sel.kind === 'dimension'}
		<PropSelect label="Label at" value={sel.labelPos ?? 'mid'} onchange={(e: Event) => editor.setSel({ labelPos: val(e) as any })}>
			<option value="start">Start</option><option value="mid">Middle</option><option value="end">End</option>
		</PropSelect>
	{/if}

	{#if sel.kind === 'symbol'}
		<PropSelect label="Symbol" value={sel.symbol ?? 'section'} onchange={(e: Event) => editor.setSel({ symbol: val(e) })}>
			{#each SYMBOLS as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
		</PropSelect>
		{#if sel.symbol === 'door'}
			<PropCheck label="Flip" value={!!sel.flip} onchange={(e: Event) => editor.setSel({ flip: (e.currentTarget as HTMLInputElement).checked })} />
		{/if}
		{#if sel.symbol === 'outlet'}
			{@const o = sel.outlet ?? {}}
			{@const setO = (p: Record<string, unknown>) => editor.setSel({ outlet: { ...o, ...p } })}
			<PropText label="Label" value={sel.text ?? ''} oninput={(e: Event) => editor.setSel({ text: val(e) })} />
			<div class="grid grid-cols-2 gap-1">
				<label class="block text-xs"><span class="text-zinc-400">Ports</span>
					<input type="number" min="1" max="24" class="w-full rounded border px-1 py-0.5" value={o.ports ?? 2} oninput={(e) => setO({ ports: Number((e.currentTarget as HTMLInputElement).value) || 1 })} /></label>
				<label class="block text-xs"><span class="text-zinc-400">Level</span>
					<select class="w-full rounded border px-1 py-0.5" value={o.level ?? 'low'} onchange={(e) => setO({ level: val(e) })}>
						<option value="low">Low (floor)</option><option value="high">High (ceiling)</option>
					</select></label>
				<label class="block text-xs"><span class="text-zinc-400">Mount</span>
					<select class="w-full rounded border px-1 py-0.5" value={o.mount ?? 'box'} onchange={(e) => setO({ mount: val(e) })}>
						{#each OUTLET_MOUNT as m (m.value)}<option value={m.value}>{m.label}</option>{/each}
					</select></label>
				<label class="block text-xs"><span class="text-zinc-400">Cable</span>
					<select class="w-full rounded border px-1 py-0.5" value={o.cable ?? 'cat6a'} onchange={(e: Event) => setO({ cable: val(e) })}>
						{#each OUTLET_CABLE as c (c.value)}<option value={c.value}>{c.label}</option>{/each}
					</select></label>
			</div>
			<label class="block text-xs"><span class="text-zinc-400">Usage</span>
				<select class="w-full rounded border px-1 py-0.5" value={o.usage ?? 'network'} onchange={(e: Event) => setO({ usage: val(e) })}>
					{#each OUTLET_USAGE as u (u.value)}<option value={u.value}>{u.label}</option>{/each}
				</select></label>
			<PropText label="Room" value={o.room ?? ''} oninput={(e: Event) => setO({ room: val(e) })} />
		{/if}
		{#if sel.symbol === 'elevation'}
			<!-- up to 4 directional arrows (one per wall); tick to add, type its viewport ref -->
			{@const arms = sel.arms ?? (sel.text ? { s: sel.text } : { s: '' })}
			<div class="text-xs text-zinc-500">Arrows (viewport ref per direction)</div>
			{#each [['n', 'Up'], ['e', 'Right'], ['s', 'Down'], ['w', 'Left']] as const as [d, lbl] (d)}
				{@const on = (arms as any)[d] != null}
				<label class="flex items-center gap-1 text-xs">
					<input type="checkbox" checked={on} onchange={(e) => editor.setSel({ arms: { ...arms, [d]: (e.currentTarget as HTMLInputElement).checked ? ((arms as any)[d] ?? '') : null }, text: undefined })} />
					<span class="w-12 text-zinc-500">{lbl}</span>
					{#if on}<input class="min-w-0 flex-1 rounded border px-1 py-0.5" value={(arms as any)[d] ?? ''} oninput={(e) => editor.setSel({ arms: { ...arms, [d]: val(e) }, text: undefined })} />{/if}
				</label>
			{/each}
		{/if}
		{#if def?.linkable === 'drawing'}
			<PropText label={sel.symbol === 'elevation' ? 'Drawing no.' : 'Ref'} value={sel.link?.ref ?? ''} oninput={(e: Event) => editor.setLink({ kind: 'drawing', ref: val(e) })} />
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
