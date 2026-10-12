<!-- A run's FILL (Phase 5.3): each segment with cables routed through it — its % (the fullest governs), the cables
     by type — and a segment's section with its cables packed in (the legacy Fill rate picture): the fullest, or the one
     picked — a click on its row (Dave 2026-10-05: only the first could be looked at) or on it in the view; "Put on
     sheet…" makes that section a viewport (views/fillSection.ts) on a new or chosen sheet. Below: the
     cables added to the run BY HAND (backlog T080) — count × type, own Ø, the whole run or one segment. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Shape, HandCables } from '../domain/shapes'
	import type { Workspace } from '../app/workspace.svelte'
	import PropGroup from './PropGroup.svelte'
	import { fillTone, packCables, cableOd, cableColor, cableCountText, FILL_LIMIT_PCT, segKey } from '../domain/fill'
	import { activeSheets } from '../app/shellActions'
	import { viewToSheet } from '../app/sheetActions'

	let { project, ws, s }: { project: CadProject; ws: Workspace; s: Shape } = $props()

	const segs = $derived(s.geom.kind === 'path' ? s.geom.segs.map((g, i) => ({ i: i + 1, g, f: project.fills.get(segKey(s.id, g.id)) })).filter((x) => x.f) : [])
	const worst = $derived(segs.reduce<(typeof segs)[number] | null>((m, x) => (!m || x.f!.pct > m.f!.pct ? x : m), null))
	/** The section drawn: the segment picked in the run (a row click here, or a click on it in the view), else the fullest. */
	const shown = $derived.by(() => {
		const ps = ws.pathSel
		return (ps?.shape === s.id && ps.segs.length === 1 ? segs.find((x) => x.g.id === ps.segs[0]) : undefined) ?? worst
	})
	const od = (t: string) => shown?.f?.od?.[t] ?? cableOd(project.settings, t)
	const packed = $derived.by(() => {
		const sec = shown ? (shown.g.section ?? s.section) : undefined
		return sec && shown ? { sec, p: packCables(sec, shown.f!.cables, od) } : null
	})
	const pct = (v: number) => (Number.isFinite(v) ? `${v.toFixed(1)}%` : 'no section size')
	const types = $derived([...new Set(segs.flatMap((x) => Object.keys(x.f!.cables)))])
	const colourOf = (t: string) => cableColor(project.settings, types, t)
	/** "20 × cat6a (2 by hand)", "4 × power (by hand)", "12 × cat6a (4 estimated)". */
	const cablesText = (c: Record<string, number>, hand: Record<string, number> = {}, est: Record<string, number> = {}) =>
		Object.entries(c).map(([t, n]) => {
			const of = (m: number | undefined, what: string) => (m ? (m === n ? what : `${m} ${what}`) : '')
			const notes = [of(hand[t], 'by hand'), of(est[t], 'estimated')].filter(Boolean)
			return `${n} × ${t}${notes.length ? ` (${notes.join(', ')})` : ''}`
		}).join(', ')

	/** The section shown, as a viewport on a sheet (a new one, or that one), which then opens with it picked. */
	const sheets = $derived(activeSheets(project))
	function toSheet(target: string) {
		if (!target || !shown || !s.levelId) return
		const seg = shown.i, name = s.label || 'Run'   // read before the sheet opens: the selection (and this panel) changes
		const r = viewToSheet(project, ws, { levelId: s.levelId, spec: { kind: 'fill', shapeId: s.id, segId: shown.g.id } }, { x0: 0, y0: 0, x1: 0, y1: 0 }, target)
		if (!r) return
		ws.openView({ kind: 'sheet', sheetId: r.sheet.id })
		ws.select([r.sheet.id])
		ws.selectViewport(r.vpId)
		ws.say(`${name} seg ${seg}’s fill is on ${r.sheet.number} — drag it into place`)
	}

	// cables by hand: one undo step per edit
	const extra = $derived(s.role?.kind === 'containment' ? (s.role.extra ?? []) : [])
	const allSegs = $derived(s.geom.kind === 'path' ? s.geom.segs : [])
	function putExtra(label: string, next: HandCables[]) {
		if (s.role?.kind !== 'containment') return
		const { extra: _old, ...role } = s.role
		project.store.transact(label, (tx) => tx.put({ ...s, role: next.length ? { ...role, extra: next } : role }))
	}
	const setRow = (i: number, patch: Partial<HandCables>) => putExtra('Edit cables by hand', extra.map((h, j) => {
		if (j !== i) return h
		const n = { ...h, ...patch }
		for (const k of ['d', 'seg'] as const) if (n[k] === undefined) delete n[k]
		return n
	}))
	/** A new row: on the picked segment if one is picked, else the whole run. */
	function addRow() {
		const ps = ws.pathSel, seg = ps?.shape === s.id && ps.segs.length === 1 ? ps.segs[0] : undefined
		putExtra('Add cables by hand', [...extra, { type: project.settings?.cableTypes[0]?.id ?? 'cable', n: 1, ...(seg ? { seg } : {}) }])
	}
</script>

<PropGroup kind="run" title="Fill">
<p class="muted" title="The fullest segment governs; each cable counts as its outer Ø squared">Limit {FILL_LIMIT_PCT}% · cables as d²</p>
{#if !segs.length}
	<p class="text-zinc-500">No cables routed through this run or added by hand.</p>
{:else}
	<table class="w-full">
		<tbody>
			{#each segs as x (x.g.id)}
				<tr class="pick" class:worst={x === worst} class:on={x === shown} title="Show this segment's section (and pick it in the view)" onclick={() => ws.selectPath({ shape: s.id, nodes: [], segs: [x.g.id] })}>
					<td class="text-zinc-400">seg {x.i}</td>
					<td class="font-mono tone-{fillTone(x.f!.pct)}">{pct(x.f!.pct)}</td>
					<td class="text-zinc-600" title={cableCountText(x.f!)}>{cablesText(x.f!.cables, x.f!.hand, x.f!.est)}</td>
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
		<p class="text-zinc-500">Seg {shown?.i}{shown === worst ? ' (fullest)' : ''}: {sec.round ? `Ø${sec.w}` : `${sec.inner?.w ?? sec.w}×${sec.inner?.h ?? sec.h}`} inside · {cableCountText(shown!.f!)}{p.dropped ? ` · ${p.dropped} cable(s) don't fit` : ''}{p.capped ? ` · first ${p.cables.length + p.dropped} drawn` : ''}</p>
		<select class="inp tosheet" value="" title="This segment’s section, its fill % and its cables as a viewport on a sheet (at 1:1, the section at a true scale)" onchange={(e) => { toSheet(e.currentTarget.value); e.currentTarget.value = '' }}>
			<option value="">Put on sheet…</option>
			<option value="new">New sheet</option>
			{#each sheets as x (x.id)}<option value={x.id}>On {x.number} {x.title}</option>{/each}
		</select>
	{/if}
{/if}
</PropGroup>
<PropGroup kind="run" title="Cables by hand">
<datalist id="cad-hand-types">{#each project.settings?.cableTypes ?? [] as c (c.id)}<option value={c.id}>{c.label}</option>{/each}</datalist>
{#each extra as h, i (i)}
	<div class="hand">
		<input class="inp" type="number" min="0" value={h.n} title="How many" aria-label="Row {i + 1}: how many cables" onchange={(e) => setRow(i, { n: Math.max(0, Math.round(Number(e.currentTarget.value) || 0)) })} />
		<span class="text-zinc-400">×</span>
		<input class="inp" list="cad-hand-types" value={h.type} title="A cable type (Settings › Cable types) or any name, e.g. power" aria-label="Row {i + 1}: cable type" onchange={(e) => setRow(i, { type: e.currentTarget.value.trim() || 'cable' })} />
		<input class="inp" type="number" min="0" step="0.1" value={h.d ?? ''} placeholder="Ø {cableOd(project.settings, h.type)}" title="Outer Ø (mm); blank = the type's" aria-label="Row {i + 1}: outer diameter (mm)" onchange={(e) => setRow(i, { d: Number(e.currentTarget.value) > 0 ? Number(e.currentTarget.value) : undefined })} />
		<select class="inp" value={h.seg ?? ''} title="Where: every segment of the run, or one" aria-label="Row {i + 1}: where" onchange={(e) => setRow(i, { seg: e.currentTarget.value || undefined })}>
			<option value="">whole run</option>
			{#each allSegs as g, k (g.id)}<option value={g.id}>seg {k + 1}</option>{/each}
		</select>
		<button class="btn del" title="Remove this row" aria-label="Remove row {i + 1}" onclick={() => putExtra('Remove cables by hand', extra.filter((_, j) => j !== i))}>×</button>
	</div>
{/each}
<div class="pt-0.5"><button class="btn" title="Cables that aren't routed links — before routes exist, or power / coax: count × type on the whole run (or the picked segment)" onclick={addRow}>Add cables</button></div>
</PropGroup>

<style>
	.hand { display: grid; grid-template-columns: 3rem auto 1fr 3.6rem 4.6rem auto; align-items: center; gap: 3px; margin-bottom: 2px; }
	.inp { width: 100%; min-width: 0; border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 3px; background: var(--cad-input); color: var(--cad-text); font-size: 11px; }
	.tone-ok { color: #15803d; }
	.tone-warn { color: #b45309; font-weight: 600; }
	.tone-over { color: #dc2626; font-weight: 700; }
	.worst td:first-child { font-weight: 600; }
	.pick { cursor: pointer; }
	.pick:hover td { background: var(--cad-hover); }
	.on td { background: var(--cad-sel, #dbeafe); }
	td { padding: 0 4px; font-size: 11px; }
	.section { width: 100%; max-height: 140px; margin-top: 4px; }
	.tosheet { width: auto; margin-top: 2px; }
	.wall { fill: #f8fafc; stroke: #64748b; stroke-width: 1; }
	.cable { stroke: white; stroke-width: 0.4; opacity: 0.9; }
</style>
