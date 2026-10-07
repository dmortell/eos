<!-- Properties of a path shape (ADR 0007): what it IS (convert line ⇄ wall / trunk / conduit / tray — the points never
     move), its section, and its nodes' heights. "Drop" adds a vertical segment at a node (ADR 0006). -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Shape, Section, PathNode } from '../domain/shapes'
	import LineStyle from './LineStyle.svelte'
	import ColorPick from './ColorPick.svelte'
	import PropGroup from './PropGroup.svelte'
	import { withStyle } from '../domain/shapes'
	import { convertRun, RUN_PLACES, placeOf as placeOfOn, mainZ as mainZOf, placeNow, setRunPlace, type RunPlace } from '../domain/runEdit'
	import { isVertical } from '../domain/shapes'
	import { newId } from '../domain/ids'
	import { removeNode, segmentLengths } from '../domain/pathEdit'
	import { deletePicked, disconnectPicked } from '../editor/pathSel'
	import { deleteEntities } from '../editor/commands'

	let { project, ws, s }: { project: CadProject; ws: Workspace; s: Shape } = $props()

	type Kind = 'line' | 'wall' | 'trunk' | 'conduit' | 'tray'
	const kind = $derived<Kind>(s.role?.kind === 'wall' ? 'wall' : s.role?.kind === 'containment' ? (s.role.form === 'ladder' ? 'tray' : s.role.form) : 'line')
	const nodes = $derived(s.geom.kind === 'path' ? s.geom.nodes : [])
	const vertical = $derived.by(() => {
		if (s.geom.kind !== 'path') return 0
		const byId = new Map(s.geom.nodes.map((n) => [n.id, n]))
		return s.geom.segs.filter((g) => { const a = byId.get(g.a), b = byId.get(g.b); return a && b && isVertical(a, b) }).length
	})

	const lengths = $derived(segmentLengths(s))
	const fmtMm = (v: number) => `${Math.round(v).toLocaleString('en').replace(/,/g, ' ')} mm`
	const save = (label: string, next: Shape) => project.store.transact(label, (tx) => tx.put(next))

	/** One segment between two nodes: its length (3D), for the Length field. */
	const twoPoint = $derived.by(() => {
		if (s.geom.kind !== 'path' || s.geom.nodes.length !== 2 || s.geom.segs.length !== 1) return null
		const [a, b] = s.geom.nodes, len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
		return len > 0 ? { a, b, len } : null
	})
	function setLength(L: number) {
		const t = twoPoint
		if (!t || !(L > 0)) return
		const k = L / t.len, r = (v: number) => Math.round(v * 10) / 10
		setNodes('Length', (ns) => ns.map((n) => (n.id === t.b.id ? { ...n, x: r(t.a.x + (t.b.x - t.a.x) * k), y: r(t.a.y + (t.b.y - t.a.y) * k), z: r(t.a.z + (t.b.z - t.a.z) * k) } : n)))
	}

	function convert(to: Kind) { if (to !== kind) save(`Convert to ${to}`, convertRun(s, to)) }
	function setSection(patch: Partial<Section>) {
		if (!s.section) return
		const sec = { ...s.section, ...patch }
		if (sec.round) sec.h = sec.w
		save('Section', { ...s, section: sec })
	}
	function setNodes(label: string, f: (ns: PathNode[]) => PathNode[], segs = s.geom.kind === 'path' ? s.geom.segs : []) {
		if (s.geom.kind !== 'path') return
		save(label, { ...s, geom: { ...s.geom, nodes: f(s.geom.nodes), segs } })
	}
	const setZ = (id: string, z: number) => setNodes('Node height', (ns) => ns.map((n) => (n.id === id ? { ...n, z } : n)))
	const setAllZ = (z: number) => setNodes('Run height', (ns) => ns.map((n) => ({ ...n, z })))
	/** Delete a point; when the path would be left with fewer than two, the whole shape goes (one undo step). */
	// ── a node / segments picked in the view (editor/pathSel.ts) ──
	const picked = $derived(ws.pathSel?.shape === s.id ? ws.pathSel : null)
	function putPieces(label: string, out: Shape[]) {
		project.store.transact(label, (tx) => { if (!out.length) tx.del(s.id); for (const p of out) tx.put(p) })
		ws.selectPath(null)
		ws.select(out.some((p) => p.id === s.id) ? [s.id] : [])
		if (out.length > 1) ws.say(`The run is now ${out.length} separate runs`)
	}
	const disconnect = () => picked && putPieces('Disconnect', disconnectPicked(s, picked.nodes))
	// picked segments' own size (backlog "Per-segment width / height"); null = back to the run's
	const pickedSegs = $derived(picked && s.geom.kind === 'path' ? s.geom.segs.filter((g) => picked.segs.includes(g.id)) : [])
	const segShared = (k: 'w' | 'h') => { const vs = new Set(pickedSegs.map((g) => (g.section ?? s.section)?.[k])); return vs.size === 1 ? [...vs][0] : undefined }
	function setSegSection(patch: Partial<Section> | null) {
		if (s.geom.kind !== 'path' || !s.section || (patch && Object.values(patch).some((v) => !(Number(v) > 0)))) return
		const base = s.section, ids = new Set(pickedSegs.map((g) => g.id))
		const segs = s.geom.segs.map((g) => {
			if (!ids.has(g.id)) return g
			if (!patch) { const { section: _drop, ...rest } = g; return rest }
			const next = { ...(g.section ?? base), ...patch }
			return next.w === base.w && next.h === base.h ? (({ section: _drop, ...rest }) => rest)(g) : { ...g, section: next }
		})
		save(patch ? `Segment size` : 'Segment size as run', { ...s, geom: { ...s.geom, segs } })
	}
	const delPicked = () => picked && putPieces(picked.nodes.length ? 'Delete node' : 'Delete segments', deletePicked(s, picked))

	function removePoint(id: string) {
		const next = removeNode(s, id)
		if (next) save('Delete point', next)
		else { deleteEntities(project.store, [s.id]); ws.select([]) }
	}

	// ── where a run runs (backlog "Run location presets"): a height from the level's heights, and its tier ──
	const heights = $derived((project.index.get(s.levelId ?? '') as { heights?: { raisedFloorMm: number; clearHeightMm: number; plenumMm: number } } | undefined)?.heights)
	const PLACES = RUN_PLACES
	type Place = RunPlace
	const placeOf = (p: Place) => placeOfOn(heights, p, s.section?.h)
	const mainZ = $derived(mainZOf(s))
	const place = $derived(placeNow(s, heights))
	function setPlace(p: Place) { const next = setRunPlace(s, heights, p); if (next) save(`Run ${PLACES[p]}`, next) }

	function drop(n: PathNode) {
		ws.ask(`Drop / rise from ${Math.round(n.z)} to Z (mm above FFL)`, n.z > 0 ? 300 : 2900, (z) => {
			if (z === n.z || s.geom.kind !== 'path') return
			const m: PathNode = { id: newId(), x: n.x, y: n.y, z }
			setNodes('Add drop', (ns) => [...ns, m], [...s.geom.segs, { id: newId(), a: n.id, b: m.id }])
		})
	}
</script>

{#if picked}
	<!-- a node (click its grip) or segments (click the run again; Ctrl adds) picked in the view -->
	<div class="picked">
		{#if picked.nodes.length}
			<span>{picked.nodes.length === 1 ? 'Node picked' : `${picked.nodes.length} nodes picked`} <span class="text-zinc-400">· Ctrl-click adds</span></span>
			<button class="btn" title="Separate the segments that meet at this node: the run splits into separate runs there" onclick={disconnect}>Disconnect</button>
		{:else}
			<span>{picked.segs.length} segment{picked.segs.length === 1 ? '' : 's'} picked <span class="text-zinc-400">· drag to move</span></span>
			{#if s.section && kind !== 'line'}
				<!-- their own size (a reducer, a taller wall panel): blank = mixed; "as run" drops it -->
				<span class="segsize">
					<label>{s.section.round ? 'Ø' : 'W'} <input type="number" value={segShared('w') ?? ''} placeholder="mixed" onchange={(e) => setSegSection({ w: Number(e.currentTarget.value) })} /></label>
					{#if !s.section.round}<label>H <input type="number" value={segShared('h') ?? ''} placeholder="mixed" onchange={(e) => setSegSection({ h: Number(e.currentTarget.value) })} /></label>{/if}
					{#if pickedSegs.some((g) => g.section)}<button class="btn" title="Back to the run's own size" onclick={() => setSegSection(null)}>as run</button>{/if}
				</span>
			{/if}
		{/if}
		<button class="btn" title="Delete key: {picked.nodes.length ? 'the node goes, its two segments join' : 'just these segments (the run may split)'}" onclick={delPicked}>Delete</button>
	</div>
{/if}
<!-- groups (UX review "Properties groups"): General · Size · Style (a plain line) · Nodes; fold state per kind -->
<PropGroup kind={kind} title="General">
	<label class="row">Kind
		<select class="inp" value={kind} onchange={(e) => convert(e.currentTarget.value as Kind)}>
			<option value="line">Line</option><option value="wall">Wall</option><option value="trunk">Trunk</option>
			<option value="conduit">Conduit</option><option value="tray">Tray</option>
		</select>
	</label>
	<label class="row">Label <input class="inp" value={s.label ?? ''} onchange={(e) => save('Label', { ...s, label: e.currentTarget.value || undefined })} /></label>
	{#if twoPoint}
		<!-- a 2-point line / run: its length; typing one moves the second end along the line (backlog "Edit line and note end points") -->
		<label class="row" title="The second end moves along the line">Length (mm) <input class="inp" type="number" min="1" value={Math.round(twoPoint.len)} onchange={(e) => setLength(Number(e.currentTarget.value))} /></label>
	{/if}
</PropGroup>
{#if s.section || s.role?.kind === 'containment'}
	<PropGroup kind={kind} title="Size and height">
		{#if s.section}
			<label class="row">{s.section.round ? 'Diameter' : kind === 'wall' ? 'Thickness' : 'Width'}
				<input class="inp" type="number" value={s.section.w} onchange={(e) => setSection({ w: Number(e.currentTarget.value) })} /></label>
			{#if !s.section.round}
				<label class="row">Height <input class="inp" type="number" value={s.section.h} onchange={(e) => setSection({ h: Number(e.currentTarget.value) })} /></label>
			{/if}
		{/if}
		{#if s.role?.kind === 'containment'}
			<label class="row" title="Where it runs: sets its height from the level's heights (the nodes at its main height; drops keep their ends) and its tier">Location
				<select class="inp" value={place} disabled={!heights} onchange={(e) => e.currentTarget.value && setPlace(e.currentTarget.value as Place)}>
					<option value="">{heights ? `custom (Z ${mainZ ?? '—'})` : 'no level heights'}</option>
					{#each Object.entries(PLACES) as [k, label] (k)}<option value={k}>{label}{placeOf(k as Place) ? ` (Z ${placeOf(k as Place)!.z})` : ''}</option>{/each}
				</select></label>
		{/if}
	</PropGroup>
{/if}
{#if kind === 'line'}
	<!-- a plain line: its own color, line type and lineweight (backlog "Shape style") -->
	<PropGroup kind={kind} title="Style">
		<div class="row" title="Its own color (By layer = its layer's)">Color <ColorPick value={s.style?.stroke} allowByLayer onchange={(v) => save(v ? 'Color' : 'Color by layer', withStyle(s, { stroke: v }))} /></div>
		<LineStyle {project} shapes={[s]} />
	</PropGroup>
{/if}
<!-- each segment's length and the total (backlog "Segment lengths"; 3D: a drop counts its height) -->
<PropGroup kind={kind} title="Segments">
	{#each lengths.segs as g (g.id)}
		<div class="seg"><span class="text-zinc-400">{g.from}–{g.to}</span><span class="font-mono">{fmtMm(g.len)}</span><span class="text-zinc-400">{g.vertical ? '↕ drop' : ''}</span></div>
	{/each}
	<div class="seg total"><span>Total</span><span class="font-mono">{fmtMm(lengths.total)}</span><span class="text-zinc-400">{(lengths.total / 1000).toFixed(2)} m</span></div>
</PropGroup>
<PropGroup kind={kind} title="Nodes">
	<p class="text-zinc-500">{nodes.length} nodes, {vertical} vertical</p>
	<label class="row">All nodes Z <input class="inp" type="number" placeholder="mixed" onchange={(e) => setAllZ(Number(e.currentTarget.value))} /></label>
	<div class="space-y-0.5">
		{#each nodes as n, i (n.id)}
			<div class="node">
				<span class="text-zinc-400">{i + 1}</span>
				<span class="font-mono text-zinc-500">{Math.round(n.x)}</span>
				<span class="font-mono text-zinc-500">{Math.round(n.y)}</span>
				<input class="inp" type="number" value={n.z} title="Z (mm above FFL)" onchange={(e) => setZ(n.id, Number(e.currentTarget.value))} />
				<button class="rounded border text-zinc-500 hover:bg-zinc-100" title="Add a drop / rise here" onclick={() => drop(n)}>↕</button>
				<button class="rounded border text-zinc-500 hover:bg-red-50 hover:text-red-700" title="Delete this point (a point in the middle of a run is healed)" onclick={() => removePoint(n.id)}>✕</button>
			</div>
			{#if n.attach}<div class="pl-6 text-[10px] text-emerald-700">↳ attached to {project.index.nameOf(n.attach)}</div>{/if}
		{/each}
	</div>
</PropGroup>

<style>
	.row { display: grid; grid-template-columns: 6.5rem 1fr; align-items: center; gap: 0.25rem; }
	.inp { width: 100%; border: 1px solid var(--cad-line); border-radius: 4px; padding: 1px 4px; background: var(--cad-input); color: var(--cad-text); }
	/* one node per row: index, x, y, z, drop */
	.btn { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 6px; background: var(--cad-input); color: var(--cad-text); }
	.btn:hover { background: var(--cad-hover); }
	.segsize { display: inline-flex; gap: 6px; align-items: center; }
	.segsize input { width: 4rem; border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 4px; background: var(--cad-input); color: var(--cad-text); }
	.picked { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; padding: 3px 6px; border-radius: 4px; background: #dbeafe; color: #1e3a8a; }
	.seg { display: grid; grid-template-columns: 3rem 1fr 4rem; align-items: center; gap: 0.25rem; font-size: 11px; }
	.seg.total { border-top: 1px solid var(--cad-line); padding-top: 2px; font-weight: 600; }
	.node { display: grid; grid-template-columns: 1.5rem 1fr 1fr 4.5rem 1.6rem 1.6rem; align-items: center; gap: 0.25rem; font-size: 11px; }
</style>
