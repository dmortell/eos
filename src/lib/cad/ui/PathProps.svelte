<!-- Properties of a path shape (ADR 0007): what it IS (convert line ⇄ wall / trunk / conduit / tray — the points never
     move), its section, and its nodes' heights. "Drop" adds a vertical segment at a node (ADR 0006). -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Shape, Section, PathNode } from '../domain/shapes'
	import { toWall, toContainment, toLine } from '../domain/make'
	import { isVertical } from '../domain/shapes'
	import { newId } from '../domain/ids'
	import { removeNode } from '../domain/pathEdit'
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

	const save = (label: string, next: Shape) => project.store.transact(label, (tx) => tx.put(next))

	function convert(to: Kind) {
		if (to === kind) return
		const base = toLine(s)
		const sec: Section = s.section ?? { w: 100, h: 50 }
		const next = to === 'line' ? base
			: to === 'wall' ? toWall(base, sec.w || 100, sec.h > 200 ? sec.h : 2700)
			: toContainment(base, to === 'conduit' ? { w: sec.w, h: sec.w, round: true, anchor: 'centre' } : { w: sec.w, h: sec.h },
				{ tier: nodes.some((n) => n.z > 0) ? 'high' : 'low', form: to })
		save(`Convert to ${to}`, next)
	}
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
	function removePoint(id: string) {
		const next = removeNode(s, id)
		if (next) save('Delete point', next)
		else { deleteEntities(project.store, [s.id]); ws.select([]) }
	}

	function drop(n: PathNode) {
		ws.ask(`Drop / rise from ${Math.round(n.z)} to Z (mm above FFL)`, n.z > 0 ? 300 : 2900, (z) => {
			if (z === n.z || s.geom.kind !== 'path') return
			const m: PathNode = { id: newId(), x: n.x, y: n.y, z }
			setNodes('Add drop', (ns) => [...ns, m], [...s.geom.segs, { id: newId(), a: n.id, b: m.id }])
		})
	}
</script>

<p class="font-semibold">{kind === 'line' ? 'Line' : kind[0].toUpperCase() + kind.slice(1)}</p>
<label class="row">Is a
	<select class="inp" value={kind} onchange={(e) => convert(e.currentTarget.value as Kind)}>
		<option value="line">Line</option><option value="wall">Wall</option><option value="trunk">Trunk</option>
		<option value="conduit">Conduit</option><option value="tray">Tray</option>
	</select>
</label>
{#if s.section}
	<label class="row">{s.section.round ? 'Diameter' : kind === 'wall' ? 'Thickness' : 'Width'}
		<input class="inp" type="number" value={s.section.w} onchange={(e) => setSection({ w: Number(e.currentTarget.value) })} /></label>
	{#if !s.section.round}
		<label class="row">Height <input class="inp" type="number" value={s.section.h} onchange={(e) => setSection({ h: Number(e.currentTarget.value) })} /></label>
	{/if}
{/if}
<label class="row">Label <input class="inp" value={s.label ?? ''} onchange={(e) => save('Label', { ...s, label: e.currentTarget.value || undefined })} /></label>
<label class="row">All nodes Z <input class="inp" type="number" placeholder="mixed" onchange={(e) => setAllZ(Number(e.currentTarget.value))} /></label>

<p class="pt-1 font-semibold">Nodes <span class="font-normal text-zinc-400">({nodes.length}, {vertical} vertical)</span></p>
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

<style>
	.row { display: grid; grid-template-columns: 6.5rem 1fr; align-items: center; gap: 0.25rem; }
	.inp { width: 100%; border: 1px solid #e4e4e7; border-radius: 4px; padding: 1px 4px; background: white; }
	/* one node per row: index, x, y, z, drop */
	.node { display: grid; grid-template-columns: 1.5rem 1fr 1fr 4.5rem 1.6rem 1.6rem; align-items: center; gap: 0.25rem; font-size: 11px; }
</style>
