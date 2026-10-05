<!-- A run's FILL (Phase 5.3): each segment with cables routed through it — its % (the fullest governs), the cables
     by type — and a segment's section with its cables packed in (the legacy Fill rate picture): the fullest, or the one
     picked — a click on its row (Dave 2026-10-05: only the first could be looked at) or on it in the view. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Shape } from '../domain/shapes'
	import type { Workspace } from '../app/workspace.svelte'
	import { fillTone, packCables, cableOd, FILL_LIMIT_PCT, segKey } from '../domain/fill'

	let { project, ws, s }: { project: CadProject; ws: Workspace; s: Shape } = $props()

	const segs = $derived(s.geom.kind === 'path' ? s.geom.segs.map((g, i) => ({ i: i + 1, g, f: project.fills.get(segKey(s.id, g.id)) })).filter((x) => x.f) : [])
	const worst = $derived(segs.reduce<(typeof segs)[number] | null>((m, x) => (!m || x.f!.pct > m.f!.pct ? x : m), null))
	/** The section drawn: the segment picked in the run (a row click here, or a click on it in the view), else the fullest. */
	const shown = $derived.by(() => {
		const ps = ws.pathSel
		return (ps?.shape === s.id && ps.segs.length === 1 ? segs.find((x) => x.g.id === ps.segs[0]) : undefined) ?? worst
	})
	const od = (t: string) => cableOd(project.settings, t)
	const packed = $derived.by(() => {
		const sec = shown ? (shown.g.section ?? s.section) : undefined
		return sec && shown ? { sec, p: packCables(sec, shown.f!.cables, od) } : null
	})
	const pct = (v: number) => (Number.isFinite(v) ? `${v.toFixed(1)}%` : 'no section size')
	const COLOURS = ['#2563eb', '#eab308', '#16a34a', '#db2777', '#7c3aed', '#0891b2']
	const types = $derived([...new Set(segs.flatMap((x) => Object.keys(x.f!.cables)))])
	const colourOf = (t: string) => project.settings?.cableTypes.find((c) => c.id === t)?.color || COLOURS[types.indexOf(t) % COLOURS.length]
</script>

<p class="pt-1 font-semibold">Fill <span class="font-normal text-zinc-500">limit {FILL_LIMIT_PCT}% · cables as d²</span></p>
{#if !segs.length}
	<p class="text-zinc-500">No cables routed through this run.</p>
{:else}
	<table class="w-full">
		<tbody>
			{#each segs as x (x.g.id)}
				<tr class="pick" class:worst={x === worst} class:on={x === shown} title="Show this segment's section (and pick it in the view)" onclick={() => ws.selectPath({ shape: s.id, nodes: [], segs: [x.g.id] })}>
					<td class="text-zinc-400">seg {x.i}</td>
					<td class="font-mono tone-{fillTone(x.f!.pct)}">{pct(x.f!.pct)}</td>
					<td class="text-zinc-600">{Object.entries(x.f!.cables).map(([t, n]) => `${n} × ${t}`).join(', ')}</td>
				</tr>
			{/each}
		</tbody>
	</table>
	{#if packed}
		{@const { sec, p } = packed}
		{@const pad = 4}
		<svg class="section" viewBox="{-p.w / 2 - pad} {-p.h / 2 - pad} {p.w + 2 * pad} {p.h + 2 * pad}" role="img" aria-label="The segment's section with its cables">
			{#if p.round}<circle r={p.w / 2} class="wall" />{:else}<rect x={-p.w / 2} y={-p.h / 2} width={p.w} height={p.h} class="wall" />{/if}
			{#each p.cables as c, i (i)}<circle cx={c.x} cy={c.y} r={c.r} fill={colourOf(c.type)} class="cable" />{/each}
		</svg>
		<p class="text-zinc-500">Seg {shown?.i}{shown === worst ? ' (fullest)' : ''}: {sec.round ? `Ø${sec.w}` : `${sec.inner?.w ?? sec.w}×${sec.inner?.h ?? sec.h}`} inside{p.dropped ? ` · ${p.dropped} cable(s) don't fit` : ''}</p>
	{/if}
{/if}

<style>
	.tone-ok { color: #15803d; }
	.tone-warn { color: #b45309; font-weight: 600; }
	.tone-over { color: #dc2626; font-weight: 700; }
	.worst td:first-child { font-weight: 600; }
	.pick { cursor: pointer; }
	.pick:hover td { background: var(--cad-hover); }
	.on td { background: var(--cad-sel, #dbeafe); }
	td { padding: 0 4px; font-size: 11px; }
	.section { width: 100%; max-height: 140px; margin-top: 4px; }
	.wall { fill: #f8fafc; stroke: #64748b; stroke-width: 1; }
	.cable { stroke: white; stroke-width: 0.4; opacity: 0.9; }
</style>
