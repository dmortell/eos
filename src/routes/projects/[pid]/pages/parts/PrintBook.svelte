<script lang="ts" module>
	import type { SheetFrame, Proj, View } from '../types'
	import type { Ent } from '../ui/geometry'
	import type { TbShown } from '../titleBlock'
	import type { Conduit } from '../3dview/types'
	import type { PaperSize } from '../constants'
	/** One page of the book (a stored sheet, loaded) — or a link sheet's placeholder (`link` = where it goes). */
	export type BookPage = { id: string; did: string; title: string; number?: string; link?: string; paper: { size: PaperSize; landscape: boolean; margin?: number }; w: number; h: number; modelId?: string }
	/** What the book needs from the page (+page.svelte builds it; sheets are addressed by drawing id `sheet:<id>`). */
	export type BookApi = {
		page: (sheetId: string) => BookPage | null
		frames: (did: string) => SheetFrame[]; scale: (did: string) => string; tb: (did: string) => TbShown
		entsForModel: (mid?: string) => Ent[]; conduitOf: (mid: string | undefined, id: string) => (Conduit & { label?: string }) | null
		view: (frameId: string, proj: Proj) => View; orbit: (frameId: string, proj: Proj) => { yaw: number; pitch: number }
	}
</script>

<script lang="ts">
	// B7: PRINT a set of sheets as ONE job — each on its own page at its own paper size (printing.ts bookCss, named
	// @page per size), in the order you set here; a link sheet prints as a placeholder page. The pages render
	// off-screen (laid out, so every viewport measures itself) and only they print.
	import { Icon } from '$lib'
	import PaperPage from './PaperPage.svelte'
	import { bookCss, bookPageName } from '../printing'
	import { DEFAULT_MARGIN_MM } from '../constants'

	let { ids, api, onclose }: { ids: string[]; api: BookApi; onclose: () => void } = $props()
	// svelte-ignore state_referenced_locally
	let order = $state([...ids])
	const pages = $derived(order.map((id) => api.page(id)).filter((p): p is BookPage => !!p))
	function move(i: number, d: -1 | 1) { const j = i + d; if (j < 0 || j >= order.length) return; const o = [...order]; [o[i], o[j]] = [o[j], o[i]]; order = o }
	const STYLE_ID = 'pages-book-style'
	function print() {
		let s = document.getElementById(STYLE_ID) as HTMLStyleElement | null
		if (!s) { s = document.createElement('style'); s.id = STYLE_ID; document.head.appendChild(s) }
		s.textContent = bookCss(pages.map((p) => p.paper))
		const done = () => { document.getElementById(STYLE_ID)?.remove(); window.removeEventListener('afterprint', done) }
		window.addEventListener('afterprint', done)
		window.print()
	}
	/** Move the render container to <body> so no app container clips the pages when printing. */
	function toBody(node: HTMLElement) { document.body.appendChild(node); return { destroy() { node.remove() } } }
	function onKey(e: KeyboardEvent) { if (e.key === 'Escape') { e.preventDefault(); onclose() } }
</script>

<svelte:window onkeydown={onKey} />
<div class="pb-back">
	<button class="pb-dismiss" aria-label="Close" tabindex="-1" onclick={onclose}></button>
	<div class="pb" role="dialog" aria-modal="true" aria-label="Print sheets">
		<div class="pb-head"><span>Print {pages.length} sheet{pages.length === 1 ? '' : 's'}</span><button class="pb-x" title="Close (Esc)" onclick={onclose}><Icon name="x" size={15} /></button></div>
		<div class="pb-list">
			{#each pages as p, i (p.id)}
				<div class="pb-row">
					<em>{i + 1}</em><b>{p.number ? `${p.number} · ` : ''}{p.title}</b>
					<span>{p.link ? 'link · placeholder' : `${p.paper.size} ${p.paper.landscape ? 'L' : 'P'}`}</span>
					<button title="Earlier" disabled={i === 0} onclick={() => move(i, -1)}><Icon name="chevronUp" size={12} /></button>
					<button title="Later" disabled={i === pages.length - 1} onclick={() => move(i, 1)}><Icon name="chevronDown" size={12} /></button>
				</div>
			{/each}
		</div>
		<div class="pb-foot"><span>Each sheet prints on its own page at its own size — choose “Save as PDF” for one PDF.</span><button class="primary" onclick={print}><Icon name="print" size={13} /> Print</button></div>
	</div>
</div>

<!-- the pages themselves: off-screen but laid out; printing.ts bookCss shows only these -->
<div class="print-book" use:toBody>
	{#each pages as p (p.id)}
		<div class="book-page {bookPageName(p.paper)}" style="width:{p.w}px; height:{p.h}px">
			{#if p.link}
				<div class="book-link"><b>{p.title}</b><span>Opens in another tool:</span><code>{p.link}</code></div>
			{:else}
				<PaperPage title={p.title} tool="Select" scale={api.scale(p.did)} pw={p.w} ph={p.h} sizeLabel="{p.paper.size} {p.paper.landscape ? 'L' : 'P'}"
					marginMm={p.paper.margin ?? DEFAULT_MARGIN_MM} tb={api.tb(p.did)} env={{ canvasZoom: 1 }} focused={false}
					frames={api.frames(p.did)} entsForModel={api.entsForModel} conduitOf={api.conduitOf} tabModelId={p.modelId}
					frameView={(id, pr) => api.view(id, pr as Proj)} frameOrbit={(id, pr) => api.orbit(id, pr as Proj)} />
			{/if}
		</div>
	{/each}
</div>

<style>
	.pb-back { position:fixed; inset:0; z-index:200; background:#0007; display:flex; align-items:flex-start; justify-content:center; padding-top:10vh; }
	.pb-dismiss { position:absolute; inset:0; background:none; border:none; cursor:default; }
	.pb { position:relative; width:min(560px,94vw); max-height:76vh; display:flex; flex-direction:column; background:var(--panel); color:var(--text); border:1px solid var(--line); border-radius:10px; box-shadow:0 24px 70px #0009; overflow:hidden; }
	.pb-head { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; border-bottom:1px solid var(--line-soft); font-size:12px; font-weight:700; }
	.pb-x { background:none; border:none; color:var(--muted); cursor:pointer; display:grid; place-items:center; }
	.pb-list { overflow-y:auto; padding:6px 10px; }
	.pb-row { display:flex; align-items:center; gap:8px; padding:4px 2px; font-size:12px; border-bottom:1px solid var(--line-soft); }
	.pb-row em { font-style:normal; color:var(--faint); width:18px; text-align:right; }
	.pb-row b { flex:1; min-width:0; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
	.pb-row span { font-size:10px; color:var(--muted); }
	.pb-row button { background:none; border:1px solid var(--line); border-radius:4px; color:var(--muted); display:grid; place-items:center; width:22px; height:20px; cursor:pointer; }
	.pb-row button:disabled { opacity:.3; cursor:default; }
	.pb-foot { display:flex; align-items:center; gap:10px; padding:8px 14px; border-top:1px solid var(--line-soft); font-size:10px; color:var(--faint); }
	.pb-foot span { flex:1; }
	.pb-foot button { display:inline-flex; align-items:center; gap:5px; padding:6px 14px; font-size:12px; border-radius:5px; border:1px solid var(--accent); background:var(--accent); color:#fff; cursor:pointer; }
	/* off-screen, but laid out (viewports measure themselves) */
	:global(.print-book) { position:fixed; left:-200000px; top:0; pointer-events:none; }
	:global(.print-book .book-page) { position:relative; background:#fff; overflow:hidden; }
	:global(.print-book .book-link) { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; font-family:system-ui, sans-serif; color:#1f2937; border:1px solid #94a3b8; }
	:global(.print-book .book-link b) { font-size:18px; }
	:global(.print-book .book-link code) { font-size:11px; color:#475569; }
</style>
