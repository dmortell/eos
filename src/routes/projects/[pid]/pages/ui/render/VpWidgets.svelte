<script lang="ts">
	// The Viewport's HTML widgets, positioned in .vp-local px over the SVG: the selected section's floating
	// toolbar (drop / re-aim / delete), the in-place text editor, and the image-scale "real distance" entry.
	// Each stops pointer/click propagation so a press on it never reaches the Viewport's own handlers.
	import { Icon } from '$lib'
	import type { ElevDir } from '../geometry'
	import { linksSummary } from '../sectionLine'
	import type { VpView } from '../vpView.svelte'
	import type { VpInteraction } from '../vpInteraction.svelte'

	let { v, x }: { v: VpView; x: VpInteraction } = $props()
	const stop = (e: Event) => e.stopPropagation()
	let linksOpen = $state<string | null>(null)   // the section whose linked-viewport list is dropped down
</script>

{#if v.secToolbar}
	{@const tb = v.secToolbar}
	<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
	<div class="section-toolbar" style="left:{tb.x}px; top:{Math.max(2, tb.y - 30)}px" onpointerdown={stop} onclick={stop}>
		{#if tb.line}
			<!-- a LINE section: ONE view (every drop adds another linked viewport of it), flip, delete -->
			<span class="st-name">{tb.title}</span>
			<button class="st-btn" title="Drop as a viewport on the sheet (again = another linked viewport)" onclick={() => v.editor.sections.dropDir(tb.id, tb.dir)}><Icon name="panels" size={13} /></button>
			<button class="st-btn" title="Flip — look the other way (or click an end arrow)" onclick={() => v.flipSection(tb.id)}><Icon name="mirror" size={13} /></button>
		{:else}
			<button class="st-btn" title="Drop this direction as a viewport on the sheet" onclick={() => v.editor.sections.dropDir(tb.id, tb.dir)}><Icon name="panels" size={13} /></button>
			<select class="st-dir" title="Primary sight direction (arrow on the plan)" value={tb.dir} onchange={(e) => v.setSectionDir(tb.id, (e.currentTarget as HTMLSelectElement).value as ElevDir)}>
				<option value="front">Front</option><option value="rear">Rear</option><option value="left">Left</option><option value="right">Right</option>
			</select>
		{/if}
		<!-- the viewports this section drives (any sheet) — each opens its sheet with the frame selected -->
		{#if tb.links.length}
			<span class="st-links">
				<button class="st-count" title={linksSummary(tb.links, 12)} onclick={() => (linksOpen = linksOpen === tb.id ? null : tb.id)}>{tb.links.length} VP</button>
				{#if linksOpen === tb.id}
					<span class="st-pop">
						{#each tb.links as l (l.did + l.frameId)}<button onclick={() => { linksOpen = null; v.editor.sections.openLink(l) }}>{l.sheet} · {l.frame}</button>{/each}
					</span>
				{/if}
			</span>
		{/if}
		<button class="st-btn st-del" title="Delete this section" onclick={() => v.deleteSection(tb.id)}><Icon name="trash" size={13} /></button>
	</div>
{/if}
{#if x.hoverLink && !x.editText}
	{@const hl = x.hoverLink}
	{@const web = /^https?:\/\//i.test(hl.link)}
	<!-- a LINKED symbol under the pointer: a badge at its corner — click it (or double-click the symbol) to open -->
	<button class="link-badge" style="left:{hl.x}px; top:{hl.y}px" title={web ? `Open ${hl.link}` : 'Open the linked sheet'}
		onpointerdown={stop} onclick={(e) => { stop(e); v.on.openLink?.(hl.link) }}><Icon name={web ? 'link' : 'fileText'} size={11} /></button>
{/if}
{#if x.editText}
	{@const t = x.editText}
	{@const lines = (t.value || t.placeholder || ' ').split('\n')}
	{@const cols = Math.max(...lines.map((l) => l.length), 3)}
	{@const w = cols * t.fontPx * 0.62 + 14}
	{@const lh = t.fontPx * 1.2}
	{@const left = t.x - (t.align === 'center' ? w / 2 : t.align === 'right' ? w : 0)}
	{@const top = t.y - t.fontPx * 0.8 - (t.valign === 'middle' ? ((lines.length - 1) * lh) / 2 : t.valign === 'bottom' ? (lines.length - 1) * lh : 0)}
	<!-- Opaque, auto-sizing editor over the (hidden) text. Enter = newline (keydown is stopped so the viewport's
	     own Enter handler can't preempt it); Ctrl/⌘-Enter or blur commits; Esc cancels. -->
	<textarea class="text-edit" bind:this={x.textInput} value={t.value} placeholder={t.placeholder} oninput={(e) => { if (x.editText) x.editText.value = e.currentTarget.value }} spellcheck="false" wrap="off"
		style="left:{left}px; top:{top}px; font-size:{t.fontPx}px; line-height:{lh}px; width:{w}px; height:{lines.length * lh + 6}px; text-align:{t.align}; transform-origin:{t.cx - left}px {t.cy - top}px; transform:rotate({t.rot}deg)"
		onpointerdown={stop} onclick={stop} ondblclick={stop} onblur={x.commitText}
		onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); x.cancelText() } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || t.field !== 'text')) { e.preventDefault(); x.commitText() } }}></textarea>
{/if}
{#if x.scaleGeom}
	<!-- image SCALE: after the 2-point line, an inline entry for the real-world distance → resize -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="scale-entry" style="left:{x.scaleGeom.x}px; top:{x.scaleGeom.y}px" onpointerdown={stop} onclick={stop}>
		<span>Real distance</span>
		<!-- svelte-ignore a11y_autofocus -->
		<input type="number" min="1" step="1" autofocus value={x.scaleReal} oninput={(e) => { x.scaleReal = (e.currentTarget as HTMLInputElement).value }}
			onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); x.applyScale() } else if (e.key === 'Escape') { e.preventDefault(); x.cancelScale() } }} />
		<span class="se-unit">mm</span>
		<button onclick={x.applyScale}>Set</button>
	</div>
{/if}

<style>
	.link-badge { position:absolute; z-index:12; transform:translate(-40%, -60%); display:inline-flex; align-items:center; justify-content:center;
		width:20px; height:20px; border-radius:50%; background:var(--accent); color:#fff; border:2px solid var(--panel); box-shadow:0 2px 6px #0006; cursor:pointer; }
	.link-badge:hover { filter:brightness(1.15); }
	/* Selected-section floating toolbar (screen space, tracks the box): open / re-aim / delete. */
	.section-toolbar { position:absolute; z-index:12; display:flex; align-items:center; gap:3px; padding:2px;
		background:#fff; border:1px solid #0e7490; border-radius:6px; box-shadow:0 2px 8px #0003; }
	.section-toolbar .st-btn { display:flex; align-items:center; justify-content:center; width:22px; height:20px;
		color:#0e7490; background:transparent; border:none; border-radius:4px; cursor:pointer; }
	.section-toolbar .st-btn:hover { background:#0e74901a; }
	.section-toolbar .st-del { color:#dc2626; }
	.section-toolbar .st-del:hover { background:#dc26261a; }
	.section-toolbar .st-name { font-size:11px; font-weight:700; color:#0e7490; padding:0 4px; font-family:Consolas,monospace; white-space:nowrap; }
	.section-toolbar .st-links { position:relative; display:inline-flex; }
	.section-toolbar .st-count { font-size:10px; font-weight:700; color:#0e7490; background:#0e74901a; border:none; border-radius:4px; padding:2px 5px; cursor:pointer; white-space:nowrap; }
	.section-toolbar .st-pop { position:absolute; top:100%; left:0; margin-top:4px; display:flex; flex-direction:column; min-width:120px; max-height:220px; overflow:auto;
		background:#fff; border:1px solid #0e7490; border-radius:6px; box-shadow:0 4px 12px #0003; padding:2px; }
	.section-toolbar .st-pop button { text-align:left; font-size:11px; color:#0f172a; background:none; border:none; border-radius:4px; padding:3px 6px; cursor:pointer; white-space:nowrap; }
	.section-toolbar .st-pop button:hover { background:#0e74901a; }
	.section-toolbar .st-dir { font-size:11px; color:#0e7490; background:#fff; border:1px solid #cbd5e1; border-radius:4px; padding:1px 3px; font-family:Consolas,monospace; }
	/* Opaque editor over the (hidden) text: dark on white so it reads on the paper; auto-sized to the content. */
	.text-edit { position:absolute; z-index:10; background:#fff; color:#111827; font-weight:600;
		border:1px solid #0e7490; border-radius:2px; padding:0 2px; resize:none; overflow:hidden; white-space:pre;
		box-shadow:0 1px 6px #0003; user-select:text; -webkit-user-select:text;
		font-family:'Consolas','SF Mono',ui-monospace,'Menlo',monospace; }
	.text-edit:focus { outline:none; box-shadow:0 0 0 2px #0e749044; }
	.scale-entry { position:absolute; z-index:12; transform:translate(-50%, -140%); display:flex; align-items:center; gap:5px; white-space:nowrap;
		background:var(--panel, #fff); color:var(--text, #111827); border:1px solid #0e7490; border-radius:6px; padding:4px 6px; font-size:11px; box-shadow:0 4px 16px #0005; }
	.scale-entry input { width:64px; background:var(--input, #f1f5f9); color:inherit; border:1px solid var(--line, #cbd5e1); border-radius:4px; padding:2px 5px; font-size:12px; }
	.scale-entry input:focus { outline:none; border-color:#0e7490; }
	.scale-entry .se-unit { color:var(--muted, #64748b); }
	.scale-entry button { background:#0e7490; color:#fff; border:none; border-radius:4px; padding:3px 9px; font-size:11px; font-weight:600; cursor:pointer; }
</style>
