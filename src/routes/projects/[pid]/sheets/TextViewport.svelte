<script lang="ts">
	import type { SheetViewport } from './types'

	// Renders text viewports — and empty ones, which show a placeholder ("Empty — choose source").
	// In model mode the host supplies a `view` (real-mm viewBox) + `onview`; we render the text in
	// an SVG <foreignObject> so the shared SVG viewBox pan/zoom drives it like the other renders.
	let { vp, view = null, onview }: {
		vp: SheetViewport
		view?: { x: number; y: number; w: number; h: number } | null
		onview?: (v: { x: number; y: number; w: number; h: number; den: number }) => void
	} = $props()

	let source = $derived(vp.source)
	// The viewport interior is paper-mm space (1px = 1mm). Point size → mm so it prints true size.
	const PT_TO_MM = 25.4 / 72
	let fontMm = $derived(((source.kind === 'text' ? source.fontSizePt : undefined) ?? 10) * PT_TO_MM)
	let content = $derived(source.kind === 'text' ? (source.content ?? '') : '')
	let empty = $derived(!content.trim())

	// Natural content window (the viewport's own paper rect, mm). In model mode the SVG viewBox is
	// the host's `view`; otherwise the natural rect. Report the natural rect so the host can seed
	// its pan/zoom. Guard W/H > 0 so a zero-size frame doesn't make an invalid viewBox.
	let W = $derived(Math.max(1, vp.w))
	let H = $derived(Math.max(1, vp.h))
	$effect(() => { onview?.({ x: 0, y: 0, w: W, h: H, den: 1 }) })
	let viewBox = $derived(view ? `${view.x} ${view.y} ${view.w} ${view.h}` : `0 0 ${W} ${H}`)

	const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
	const inline = (s: string) => esc(s)
		.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
		.replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>')
		.replace(/_(.+?)_/g, '<em>$1</em>')

	/** Tiny markdown subset → HTML: # headings, -/* bullets, 1. numbers, | tables, **bold** *italic*. */
	function render(text: string): string {
		const lines = (text ?? '').split('\n')
		const out: string[] = []
		let i = 0
		const isTable = (l: string) => l.includes('|')
		while (i < lines.length) {
			const line = lines[i]
			if (!line.trim()) { i++; continue }
			let m: RegExpMatchArray | null
			if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); i++; continue }
			if (isTable(line)) {
				const rows: string[] = []
				while (i < lines.length && isTable(lines[i])) rows.push(lines[i++])
				const cells = (r: string) => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim())
				const hasHead = rows[1] && /^[\s|:-]+$/.test(rows[1])
				let html = '<table>'
				rows.forEach((r, ri) => {
					if (hasHead && ri === 1) return
					const tag = hasHead && ri === 0 ? 'th' : 'td'
					html += '<tr>' + cells(r).map(c => `<${tag}>${inline(c)}</${tag}>`).join('') + '</tr>'
				})
				out.push(html + '</table>'); continue
			}
			if (/^\s*[-*]\s+/.test(line)) {
				const items: string[] = []
				while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(`<li>${inline(lines[i++].replace(/^\s*[-*]\s+/, ''))}</li>`)
				out.push(`<ul>${items.join('')}</ul>`); continue
			}
			if (/^\s*\d+\.\s+/.test(line)) {
				const items: string[] = []
				while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) items.push(`<li>${inline(lines[i++].replace(/^\s*\d+\.\s+/, ''))}</li>`)
				out.push(`<ol>${items.join('')}</ol>`); continue
			}
			// paragraph (gather until blank)
			const para: string[] = []
			while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|[-*]\s|\d+\.\s)/.test(lines[i]) && !isTable(lines[i])) para.push(lines[i++])
			out.push(`<p>${para.map(inline).join('<br>')}</p>`)
		}
		return out.join('')
	}

	let html = $derived(empty ? '' : render(content))
</script>

{#snippet body()}
	{#if empty}
		<div class="ph flex h-full w-full items-center justify-center text-center select-none" style:font-size="{fontMm}px">Empty — choose Viewport type & source</div>
	{:else}
		<div class="tv h-full w-full overflow-hidden break-words text-black" style:font-size="{fontMm}px" style:padding="2px" style:line-height="1.3">
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html html}
		</div>
	{/if}
{/snippet}

{#if view}
	<!-- model mode: SVG viewBox handles pan/zoom; the text HTML lives in a foreignObject (mm units). -->
	<svg class="h-full w-full" {viewBox} preserveAspectRatio="xMidYMid meet">
		<foreignObject x="0" y="0" width={W} height={H}>
			<div xmlns="http://www.w3.org/1999/xhtml" class="h-full w-full">{@render body()}</div>
		</foreignObject>
	</svg>
{:else}
	{@render body()}
{/if}

<style>
	.ph { color: #94a3b8; }
	.tv :global(h1) { font-size: 1.6em; font-weight: 700; margin: 0.2em 0; }
	.tv :global(h2) { font-size: 1.3em; font-weight: 700; margin: 0.2em 0; }
	.tv :global(h3) { font-size: 1.1em; font-weight: 700; margin: 0.2em 0; }
	.tv :global(p) { margin: 0 0 0.4em; }
	.tv :global(ul), .tv :global(ol) { margin: 0 0 0.4em 1.2em; }
	.tv :global(table) { border-collapse: collapse; margin: 0.2em 0; }
	.tv :global(th), .tv :global(td) { border: 0.5px solid #999; padding: 0.1em 0.3em; text-align: left; }
	.tv :global(th) { background: #f1f5f9; font-weight: 700; }
</style>
