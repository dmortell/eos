<script lang="ts">
	// Properties › nothing selected: the PAGE — its name and type; a stored sheet's Drawing № / Drawn / title-block
	// switch; the layer new shapes land on; and on a sheet, the project's title-block template.
	import TitleBlockEditor from '../TitleBlockEditor.svelte'
	import { blurOnEnter, strVal } from './fields'
	import type { TitleBlockTemplate } from '../../titleBlock'

	type SheetField = ((key: 'drawingNumber' | 'drawnBy', value: string) => void) & ((key: 'hideTitleBlock', value: boolean) => void)
	let { title = '', kind = '', activeLayer = '', ontitle, sheetInfo = null, onsheetfield, titleBlock = undefined, ontitleblock }: {
		title?: string; kind?: string; activeLayer?: string; ontitle?: (title: string) => void
		/** A STORED Pages sheet's title-block fields (Drawing №, Drawn — `drawnDefault` = the creator's initials). */
		sheetInfo?: { number: string; drawnBy: string; drawnDefault: string; hideTitleBlock: boolean } | null
		onsheetfield?: SheetField
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
<div class="prop"><span>Layer</span><input value={activeLayer} readonly /></div>
{#if kind === 'sheet' && ontitleblock}
	<TitleBlockEditor template={titleBlock} onchange={ontitleblock} />
{:else}
	<div class="pp-hint">Select an object to edit its properties, or a place in the tree.</div>
{/if}
