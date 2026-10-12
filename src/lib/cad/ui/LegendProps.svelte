<!-- A LEGEND's properties (backlog "Legend on the drawing", Dave 2026-10-05): its title and text size, and which rows it
     shows — each symbol in use and each layer with something on it, with their counts; ticking one adds it (each legend
     keeps its own choice; untouched, it shows every symbol in use). "All symbols" / "None" set them in one go. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Shape } from '../domain/shapes'
	import type { Sheet } from '../domain/drawing'
	import { legendCandidates, legendShown } from '../domain/legend'

	let { project, s }: { project: CadProject; s: Shape } = $props()

	const g = $derived(s.geom.kind === 'legend' ? s.geom : null)
	/** What it lists: its level — or, on a sheet, the levels its viewports show. */
	const levels = $derived.by(() => {
		if (s.levelId) return new Set([s.levelId])
		const sheet = s.sheetId ? project.index.get<Sheet>(s.sheetId) : undefined
		return new Set(sheet?.type === 'sheet' ? sheet.viewports.map((v) => v.view.levelId) : [])
	})
	const all = $derived(legendCandidates(project.index, levels, project.blockOf))
	const shown = $derived(new Set(legendShown(all, g?.rows).map((r) => r.key)))

	const setGeom = (label: string, patch: Record<string, unknown>) => project.store.transact(label, (tx) => tx.put({ ...s, geom: { ...s.geom, ...patch } as Shape['geom'] }))
	function toggle(key: string, on: boolean) {
		const next = all.map((r) => r.key).filter((k) => (k === key ? on : shown.has(k)))
		setGeom(on ? 'Legend row' : 'Legend row off', { rows: next })
	}
</script>

{#if g}
	<p class="font-semibold">Legend</p>
	<label class="row">Title <input class="inp" value={g.title ?? ''} placeholder="LEGEND" onchange={(e) => setGeom('Legend title', { title: e.currentTarget.value.trim() || undefined })} /></label>
	<label class="row" title="Its text size on paper (mm)">Size (mm) <input class="inp" type="number" min="1" step="0.5" value={g.sizeMm ?? 2.5} onchange={(e) => { const v = Number(e.currentTarget.value); if (v >= 1) setGeom('Legend size', { sizeMm: v }) }} /></label>
	<p class="pt-1 font-semibold">Rows <span class="font-normal text-zinc-500">({shown.size} of {all.length})</span>
		<button class="lnk" onclick={() => setGeom('Legend: all symbols', { rows: undefined })}>All symbols</button>
		<button class="lnk" onclick={() => setGeom('Legend: no rows', { rows: [] })}>None</button></p>
	{#each all as r (r.key)}
		<label class="pick" title={r.kind === 'block' ? 'A symbol in use' : 'A layer with items on it'}>
			<input type="checkbox" checked={shown.has(r.key)} onchange={(e) => toggle(r.key, e.currentTarget.checked)} />
			{#if r.kind === 'layer'}<span class="sw" style:background={r.color ?? '#888'}></span>{/if}
			<span class="nm">{r.name}</span><span class="ct">{r.count}</span>
		</label>
	{:else}
		<p class="text-zinc-500">Nothing on {s.sheetId ? 'the levels its viewports show' : 'this level'} yet.</p>
	{/each}
	<p class="text-zinc-500">Drag to move · Delete removes it · it updates itself</p>
{/if}

<style>
	.pick { display: flex; align-items: center; gap: 0.35rem; font-size: 12px; }
	.nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.ct { font-size: 11px; color: var(--cad-faint); }
	.sw { width: 10px; height: 10px; border-radius: 2px; border: 1px solid #0003; }
	.lnk { margin-left: 6px; font-size: 11px; font-weight: 400; color: var(--cad-link, #2563eb); }
	.lnk:hover { text-decoration: underline; }
</style>
