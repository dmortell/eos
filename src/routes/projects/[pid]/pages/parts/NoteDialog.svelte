<script lang="ts">
	// K3: a roomy editor for a NOTE's markdown (Properties › NOTE › the pencil) — the text on the left, a live preview
	// on the right (the same ui/noteLayout the drawing uses). Apply (Ctrl+Enter) saves; Esc / Cancel drops the edits.
	import { tick } from 'svelte'
	import { Icon } from '$lib'
	import { layoutNote } from '../ui/noteLayout'
	import { htmlToMarkdown } from '../ui/htmlToMd'
	import { textToShape } from '../ui/clipboard'
	import { PT_MM } from '../constants'

	let { text, width = 90, fontPt = 8, onapply, onclose }: { text: string; width?: number; fontPt?: number; onapply: (t: string) => void; onclose: () => void } = $props()
	// svelte-ignore state_referenced_locally
	let draft = $state(text)
	const lay = $derived(layoutNote(draft, width, fontPt * PT_MM))
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') { e.preventDefault(); onclose() }
		else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onapply(draft) }
	}
	function focusText(node: HTMLElement) { tick().then(() => node.querySelector('textarea')?.focus()) }
	/** Paste from Word / Google Docs / a web page keeps its headings, bold, lists and tables (as markdown); Excel's
	 *  tab-separated cells become a table. Plain text pastes as-is. */
	function onPaste(e: ClipboardEvent) {
		const dt = e.clipboardData, html = dt?.getData('text/html') ?? '', plain = dt?.getData('text/plain') ?? ''
		let md = html ? htmlToMarkdown(new DOMParser().parseFromString(html, 'text/html')) : ''
		if (!md && plain.includes('\t')) md = textToShape(plain)?.text ?? ''
		if (!md) return
		e.preventDefault()
		const ta = e.currentTarget as HTMLTextAreaElement
		ta.setRangeText(md, ta.selectionStart, ta.selectionEnd, 'end')
		draft = ta.value
	}
</script>

<div class="nd-back">
	<button class="nd-dismiss" aria-label="Close" tabindex="-1" onclick={onclose}></button>
	<div class="nd" role="dialog" aria-modal="true" aria-label="Edit note" tabindex="-1" use:focusText onkeydown={onKey}>
		<div class="nd-head"><span>Edit note</span><span class="hint"># heading · - bullet · 1. list · | a | b | table (|---| under the header) · **bold** · Ctrl+Enter applies</span>
			<button class="nd-x" title="Close (Esc)" onclick={onclose}><Icon name="x" size={15} /></button></div>
		<div class="nd-body">
			<textarea bind:value={draft} spellcheck="false" onpaste={onPaste}></textarea>
			<div class="prev" title="Preview (as it prints)">
				<svg viewBox="0 0 {width} {lay.h}" width="100%">
					<rect x="0" y="0" width={width} height={lay.h} fill="#fff" stroke="#cbd5e1" stroke-width="0.3" />
					{#each lay.items as it, i (i)}
						{#if it.kind === 'text'}<text x={it.x} y={it.y} font-size={it.size} font-weight={it.bold ? 700 : 400} fill="#111" font-family="Consolas, monospace">{it.text}</text>
						{:else}<line x1={it.a[0]} y1={it.a[1]} x2={it.b[0]} y2={it.b[1]} stroke="#111" stroke-width="0.2" />{/if}
					{/each}
				</svg>
			</div>
		</div>
		<div class="nd-foot">
			<button onclick={onclose}>Cancel</button>
			<button class="primary" onclick={() => onapply(draft)}>Apply</button>
		</div>
	</div>
</div>

<style>
	.nd-back { position:fixed; inset:0; z-index:200; background:#0007; display:flex; align-items:flex-start; justify-content:center; padding-top:6vh; }
	.nd-dismiss { position:absolute; inset:0; background:none; border:none; cursor:default; }
	.nd { position:relative; width:min(1100px,94vw); height:min(78vh,760px); display:flex; flex-direction:column; background:var(--panel); border:1px solid var(--line); border-radius:10px; box-shadow:0 24px 70px #0009; color:var(--text); }
	.nd-head { display:flex; align-items:center; gap:12px; padding:10px 14px; border-bottom:1px solid var(--line-soft); font-size:12px; font-weight:700; }
	.hint { flex:1; font-weight:400; font-size:11px; color:var(--faint); }
	.nd-x { background:none; border:none; color:var(--muted); cursor:pointer; display:grid; place-items:center; }
	.nd-body { flex:1; min-height:0; display:grid; grid-template-columns:1fr 1fr; gap:10px; padding:10px 14px; }
	textarea { resize:none; min-height:0; background:var(--input); color:var(--text); border:1px solid var(--line); border-radius:6px; padding:10px; font:13px/1.5 Consolas, ui-monospace, monospace; }
	textarea:focus { outline:none; border-color:var(--accent); }
	.prev { overflow:auto; background:#f1f5f9; border-radius:6px; padding:10px; }
	.nd-foot { display:flex; justify-content:flex-end; gap:8px; padding:10px 14px; border-top:1px solid var(--line-soft); }
	.nd-foot button { padding:5px 14px; border-radius:5px; border:1px solid var(--line); background:var(--input); color:var(--text); cursor:pointer; font-size:12px; }
	.nd-foot .primary { background:var(--accent); color:contrast-color(var(--accent)); border-color:var(--accent); }
</style>
