<!-- The project's sheets (Phase 4.1): open one in the active pane; New makes an A3 landscape sheet. The full register
     (filters, renumber, Excel) is the Sheets tab, slice 4.4. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Sheet } from '../domain/drawing'
	import type { ViewSpec } from '../views/space'
	import { naturalCompare, nextLabel } from '../domain/labels'
	import { newId } from '../domain/ids'
	import { downloadSheetsPdf, unsupportedNote } from '../app/sheetsPdf'

	let { project, ws, open, onview }: { project: CadProject; ws: Workspace; open?: string; onview: (s: ViewSpec) => void } = $props()

	const sheets = $derived([...project.index.byId.values()].filter((e): e is Sheet => e.type === 'sheet').sort((a, b) => a.order - b.order || naturalCompare(a.number, b.number)))

	let busy = $state(false)
	async function pdfAll() {
		busy = true
		try { const r = await downloadSheetsPdf(project, sheets); ws.say(`PDF: ${r.pages} pages${unsupportedNote(r.unsupported, r.rasterised)}`) }
		catch (e) { project.error = `PDF failed: ${(e as Error).message}` }
		finally { busy = false }
	}
	function add() {
		ws.askText('New sheet title', 'Plan', (title) => {
			if (!title.trim()) return
			const last = sheets.at(-1)
			const s: Sheet = {
				type: 'sheet', id: newId(), number: last ? nextLabel(last.number) : 'S001', title: title.trim(), order: (last?.order ?? 0) + 1,
				paper: { size: 'A3', orientation: 'landscape', marginMm: 5 }, viewports: [], status: 'active',
			}
			project.store.transact(`New sheet ${s.number}`, (tx) => tx.put(s))
			onview({ kind: 'sheet', sheetId: s.id })
			ws.select([s.id])
		})
	}
</script>

<div class="head">
	<p class="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Sheets</p>
	<span>
		{#if sheets.length}<button class="place" disabled={busy} title="Every sheet in one PDF (download)" onclick={pdfAll}>{busy ? 'PDF…' : 'PDF all'}</button>{/if}
		<button class="place" title="A new A3 landscape sheet, opened in the active pane" onclick={add}>+ New</button>
	</span>
</div>
{#each sheets as s (s.id)}
	<button class="sheet" class:on={open === s.id} title="Open in the active pane" onclick={() => { onview({ kind: 'sheet', sheetId: s.id }); ws.select([s.id]) }}>
		<span class="font-mono">{s.number}</span> {s.title}
	</button>
{/each}

<style>
	.head { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding: 0 4px 4px; }
	.place { font-size: 11px; color: #2563eb; }
	.sheet { display: block; width: 100%; text-align: left; padding: 1px 8px; border-radius: 4px; font-size: 12px; }
	.sheet:hover { background: #f4f4f5; }
	.sheet.on { background: #dbeafe; color: #1e3a8a; }
</style>
