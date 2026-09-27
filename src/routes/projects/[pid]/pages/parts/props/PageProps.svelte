<script lang="ts">
	// Properties › nothing selected: the PAGE — its name and type; a stored sheet's Drawing № / Drawn / title-block
	// switch; the layer new shapes land on; and on a sheet, the project's title-block template.
	import TitleBlockEditor from '../TitleBlockEditor.svelte'
	import TagPicker from '../TagPicker.svelte'
	import { Icon } from '$lib'
	import { blurOnEnter, strVal } from './fields'
	import type { TitleBlockTemplate } from '../../titleBlock'
	import { SHEET_KINDS, type PagesSheetDoc, type SheetKind } from '../../store/schema'
	import { KIND_LABELS } from '../../store/treeViews'
	import { mergeTags, type SheetMetaHint } from '../../store/tags'

	type SheetField = ((key: 'drawingNumber' | 'drawnBy', value: string) => void) & ((key: 'hideTitleBlock', value: boolean) => void)
	type SheetMeta = { kind: string; discipline: string; category: string; tags: string[]; hint: SheetMetaHint
		tagPools: string[][]; disciplines: string[]; categories: string[] }
	type MetaPatch = Partial<Pick<PagesSheetDoc, 'kind' | 'discipline' | 'category' | 'tags'>>
	let { title = '', kind = '', activeLayer = '', ontitle, sheetInfo = null, onsheetfield, sheetMeta = null, onsheetmeta, titleBlock = undefined, ontitleblock }: {
		title?: string; kind?: string; activeLayer?: string; ontitle?: (title: string) => void
		/** A STORED Pages sheet's title-block fields (Drawing №, Drawn — `drawnDefault` = the creator's initials). */
		sheetInfo?: { number: string; drawnBy: string; drawnDefault: string; hideTitleBlock: boolean } | null
		onsheetfield?: SheetField
		/** tree-views-plan §3.3: the stored sheet's drawing type / discipline / category / tags (what the tree's grouped
		 *  views group by), an auto-suggestion for them and the suggestion lists. */
		sheetMeta?: SheetMeta | null; onsheetmeta?: (patch: MetaPatch) => void
		/** The PROJECT's title-block template (undefined = the default). The editor shows only with `ontitleblock`. */
		titleBlock?: TitleBlockTemplate; ontitleblock?: (t: TitleBlockTemplate) => void
	} = $props()
</script>

<div class="prop-sec">PAGE</div>
<div class="prop"><span>Name</span><input value={title} onchange={(e) => ontitle?.(strVal(e))} onkeydown={blurOnEnter} /></div>
<div class="prop"><span>Type</span><input value={kind} readonly /></div>
{#if sheetInfo}
	<div class="prop"><span>Dwg №</span><input value={sheetInfo.number} placeholder="(none)" onchange={(e) => onsheetfield?.('drawingNumber', strVal(e).trim())} onkeydown={blurOnEnter} /></div>
	<div class="prop"><span>Drawn</span><input value={sheetInfo.drawnBy} placeholder={sheetInfo.drawnDefault || '(none)'} onchange={(e) => onsheetfield?.('drawnBy', strVal(e).trim())} onkeydown={blurOnEnter} /></div>
	<label class="prop" title="Hide the title block on this sheet only (the drawing area takes the full paper)"><span>Title block</span>
		<span class="chk"><input type="checkbox" checked={!sheetInfo.hideTitleBlock} onchange={(e) => onsheetfield?.('hideTitleBlock', !(e.currentTarget as HTMLInputElement).checked)} /> shown on this sheet</span></label>
{/if}
{#if sheetMeta && onsheetmeta}
	{@const h = sheetMeta.hint}
	<!-- what the sheet is ABOUT — the tree's grouped views (By drawing type, by level, by category …) group by these -->
	<div class="prop-sec">DRAWING</div>
	<div class="prop"><span>Type</span>
		<select value={sheetMeta.kind} onchange={(e) => onsheetmeta?.({ kind: (strVal(e) || '') as SheetKind })}>
			<option value="">—</option>{#each SHEET_KINDS as k (k)}<option value={k}>{KIND_LABELS[k] ?? k}</option>{/each}
		</select></div>
	<div class="prop"><span>Discipline</span><input value={sheetMeta.discipline} placeholder="(none)" list="pp-discs" onchange={(e) => onsheetmeta?.({ discipline: strVal(e).trim() })} onkeydown={blurOnEnter} /></div>
	<div class="prop" title="What it shows within its type — e.g. an elevation of racks / risers / AV rooms (Elevations by category)"><span>Category</span>
		<input value={sheetMeta.category} placeholder="(none)" list="pp-cats" onchange={(e) => onsheetmeta?.({ category: strVal(e).trim() })} onkeydown={blurOnEnter} /></div>
	<datalist id="pp-discs">{#each sheetMeta.disciplines as d (d)}<option value={d}></option>{/each}</datalist>
	<datalist id="pp-cats">{#each sheetMeta.categories as c (c)}<option value={c}></option>{/each}</datalist>
	<div class="ptags"><span>Tags</span>
		<TagPicker tags={sheetMeta.tags} pools={sheetMeta.tagPools} onchange={(t) => onsheetmeta?.({ tags: t })} placeholder="high-level, AV…" />
	</div>
	{#if h.kind || h.category || h.tags.length}
		<!-- auto-suggest: proposed from the title / viewports, applied only on a click -->
		<div class="phint" title="Suggested from the sheet's title and viewports — click to apply">
			<Icon name="sparkles" size={11} />
			{#if h.kind}<button onclick={() => onsheetmeta?.({ kind: h.kind })}>Type: {KIND_LABELS[h.kind] ?? h.kind}</button>{/if}
			{#if h.category}<button onclick={() => onsheetmeta?.({ category: h.category })}>Category: {h.category}</button>{/if}
			{#each h.tags as t (t)}<button onclick={() => onsheetmeta?.({ tags: mergeTags(sheetMeta.tags, [t]) })}>+ {t}</button>{/each}
			{#if [h.kind, h.category, ...h.tags].filter(Boolean).length > 1}
				<button class="all" onclick={() => onsheetmeta?.({ ...(h.kind ? { kind: h.kind } : {}), ...(h.category ? { category: h.category } : {}), ...(h.tags.length ? { tags: mergeTags(sheetMeta.tags, h.tags) } : {}) })}>Apply all</button>
			{/if}
		</div>
	{/if}
{/if}
<div class="prop"><span>Layer</span><input value={activeLayer} readonly /></div>
{#if kind === 'sheet' && ontitleblock}
	<TitleBlockEditor template={titleBlock} onchange={ontitleblock} />
{:else}
	<div class="pp-hint">Select an object to edit its properties, or a place in the tree.</div>
{/if}

<style>
	/* the Tags row: like a .prop row, but the chip picker keeps its own look (the panel styles .prop inputs) */
	.ptags { display:grid; grid-template-columns:64px 1fr; align-items:start; gap:6px; padding:2px 4px; }
	.ptags > span { color:var(--muted); font-size:11px; padding-top:5px; }
	.phint { display:flex; flex-wrap:wrap; align-items:center; gap:4px; margin:3px 4px 2px 74px; font-size:10.5px; color:var(--faint); }
	.phint :global(svg) { color:var(--accent); }
	.phint button { font-size:10.5px; padding:0 6px; line-height:16px; border-radius:8px; border:1px dashed var(--accent-dim); background:none; color:var(--muted); cursor:pointer; }
	.phint button:hover { border-style:solid; border-color:var(--accent); color:var(--text); }
	.phint button.all { border-style:solid; color:var(--accent); }
</style>
