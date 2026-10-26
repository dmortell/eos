<!-- The selected ports of a device (rack rows, Phase 3.3). Each port's label is edited WHERE IT LIVES (ADR 0002): a port
     linked to an outlet edits that outlet port's label; any other port keeps its own text on the device. An edit
     that would change a printed panel's labels asks first. -->
<script lang="ts">
	import { sortedUsages } from '../domain/usages'
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { PortSel } from '../editor/tools'
	import { setPortLabel, portRanges, reservePorts, reservedFor } from '../domain/ports'
	import { newId } from '../domain/ids'
	import { traceCircuit, removeCords, removedText } from '../domain/cords'
	import Trace from './Trace.svelte'
	import { containmentRuns, linkStarts } from '../domain/interconnect'
	import { viaList, viaValue } from '../domain/routing'
	import type { Device, Link } from '../domain/types'
	import { cablesOf } from '../domain/multicore'
	import { shared, MIXED } from './propsKit'

	let { project, ws, sel }: { project: CadProject; ws: Workspace; sel: PortSel } = $props()

	const rows = $derived(sel.ports.map((n) => {
		const ref = { on: sel.on, port: n, face: sel.face }
		const far = project.index.farEnd(ref), fe = far ? project.index.get(far.on) : undefined
		const cord = project.index.cords.find((c) => (c.a.on === sel.on && c.a.port === n) || (c.b.on === sel.on && c.b.port === n))
		return {
			n, label: project.index.portLabel(ref),
			from: fe?.type === 'outlet' ? `outlet ${fe.label} : ${far!.port}` : fe ? `${project.index.portPlace(far!)}` : 'own label',
			cord: cord ? project.index.portPlace(cord.a.on === sel.on && cord.a.port === n ? cord.b : cord.a) : '',
		}
	}))

	// ── allocation on the selected ports ──
	const links = $derived(sel.ports.map((n) => project.index.linkAt({ on: sel.on, port: n })).filter((l): l is Link => l?.kind === 'horizontal'))
	const patchedPorts = $derived(new Set(project.index.cords.filter((c) => c.status !== 'remove').flatMap((c) => [c.a, c.b]).filter((r) => r.on === sel.on).map((r) => r.port)))
	const device = $derived(project.index.get(sel.on) as Device | undefined)
	const usages = $derived(sortedUsages(project.settings))
	const reservedAs = (n: number) => (device ? reservedFor(device, n) : undefined)

	function unallocate() {
		const keep = links.filter((l) => patchedPorts.has(l.a.on === sel.on ? l.a.port : l.b.port))
		const drop = links.filter((l) => !keep.includes(l))
		if (drop.length) project.applyLinks(`Unallocate ${drop.length} port(s)`, [], drop.map((l) => l.id))
		if (keep.length) ws.say(`${keep.length} port(s) kept — they are patched (remove the cords first)`)
	}
	function pin(on: boolean) {
		project.store.transact(on ? 'Pin ports' : 'Unpin ports', (tx) => { for (const l of links) tx.put({ ...l, pinned: on || undefined }) })
	}
	/** Reserve the selected ports for a usage ('' = clear): reserved ports only take outlets of that usage. */
	function reserve(usage: string) {
		const next = device && reservePorts(device, sel.ports, usage, newId())
		if (next) project.store.transact(usage ? `Reserve ports for ${usage}` : 'Clear reservation', (tx) => tx.put(next))
	}

	// ── the permanent cables on these ports (Phase 5): any kind, one per port ──
	const cables = $derived([...new Map(sel.ports.map((n) => project.index.linkAt({ on: sel.on, port: n })).filter((l): l is Link => !!l).map((l) => [l.id, l])).values()])
	/** With every other core of their multi-core cables: a cable's route and length are set on all its cores. */
	const withCores = $derived.by(() => { const ids = new Set(cables.map((l) => l.cable).filter(Boolean)); return ids.size ? [...new Map([...cables, ...project.index.links.filter((l) => l.cable && ids.has(l.cable))].map((l) => [l.id, l])).values()] : cables })
	const lengthText = $derived.by(() => {
		// a multi-core cable once
		const ls = cablesOf(cables).map((g) => project.routes.get(g[0].id)?.lengthM).filter((m): m is number => m != null)
		const none = cablesOf(cables).length - ls.length
		if (!ls.length) return 'no route'
		const lo = Math.min(...ls), hi = Math.max(...ls)
		return `${lo === hi ? `${lo}m` : `${lo}–${hi}m`}${ls.length > 1 ? ` · total ${ls.reduce((a, b) => a + b, 0)}m` : ''}${none ? ` · ${none} no route` : ''}`
	})
	// the runs these cables must pass through, in order (a riser for diversity, or a whole route by hand); null = mixed
	const viasShown = $derived.by(() => { const v = shared(cables, (l) => viaList(l).join(',')); return v.mixed ? null : v.value ? v.value.split(',') : [] })
	const runs = $derived(containmentRuns(project.index))
	const hand = $derived(shared(cables, (l) => l.lengthM))
	function setVias(ids: string[]) {
		const v = viaValue(ids), names = viaList({ via: v }).map((id) => project.index.nameOf(id) || 'a run')
		project.store.transact(names.length ? `Route ${cablesOf(cables).length} cable(s) through ${names.join(' → ')}` : 'Route by the shortest way', (tx) => { for (const l of withCores) tx.put({ ...l, via: v }) })
	}
	function setHand(v: string) {
		const m = v.trim() === '' ? undefined : Math.max(0, Number(v))
		if (m != null && !Number.isFinite(m)) return
		project.store.transact(m == null ? 'Cable length: routed' : `Cable length ${m} m by hand`, (tx) => { for (const l of withCores) tx.put({ ...l, lengthM: m }) })
	}

	// ── take the cables / cords off these ports (any kind of link: outlet, tie, backbone); Undo brings them back ──
	const cordsHere = $derived(project.index.cords.filter((c) => c.status !== 'remove' && ((c.a.on === sel.on && sel.ports.includes(c.a.port)) || (c.b.on === sel.on && sel.ports.includes(c.b.port)))))
	function removeAll(label: string, ids: string[]) {
		project.store.transact(label, (tx) => { for (const id of ids) tx.del(id) })
		ws.say(`${label} — Undo brings them back`)
	}
	/** the install workflow (patch-list-plan.md): an installed cord is only marked — it still has to come out on site */
	function removeCordsHere() {
		const r = removeCords(cordsHere), label = `Remove ${cordsHere.length} cord${cordsHere.length === 1 ? '' : 's'}`
		project.store.transact(label, (tx) => { for (const c of r.marked) tx.put(c); for (const id of r.deleted) tx.del(id) })
		ws.say(`${label}: ${removedText(r)} — Undo brings them back`)
	}

	function edit(n: number, input: HTMLInputElement) {
		const text = input.value
		input.value = project.index.portLabel({ on: sel.on, port: n, face: sel.face })   // shows the new text once written
		const e = setPortLabel(project.index, { on: sel.on, port: n, face: sel.face }, text)
		if (e) project.relabel(`Port ${n} label`, [e], ws.ask2)
	}
</script>

<p class="pt-1 font-semibold" title="Click a port · Shift-click a range · Ctrl-click to add or drop one">Port{sel.ports.length > 1 ? 's' : ''} {portRanges(sel.ports)} <span class="font-normal text-zinc-500">({sel.face})</span></p>
<div class="acts main">
	<!-- Link to… first, Patch to… after: a panel port is cabled (tied / linked) before it is patched (User 2026-10-26) · click (or P / I, or right-click a port), then click the first port; or DRAG the button onto that port in a rack view (backlog "Bulk patching by drag") -->
	{#if device && linkStarts(device)}<button title="Permanent cables from these ports to another panel — in another room or on another floor (backbone, through a riser) or the same room (tie): open its rack view and click its first port — or drag this onto that port" onclick={() => ws.interconnectFrom(sel)}
		draggable="true" ondragstart={(e) => { const s = { ...sel, ports: [...sel.ports] }; ws.startDrag(() => ws.interconnectFrom(s), () => { ws.bulkFrom = null }); e.dataTransfer?.setData('application/x-cad-ports', 'link') }} ondragend={() => ws.endDrag()} class="primary">⟷ Link to… <kbd>L</kbd></button>{/if}
	<button title="Patch these ports to another device: click its first port next — or drag this onto that port. Several ports: the cords are listed to OK first, with the busy / unlabelled ports skipped" onclick={() => ws.patchFrom(sel)}
		draggable="true" ondragstart={(e) => { const s = { ...sel, ports: [...sel.ports] }; ws.startDrag(() => ws.patchFrom(s), () => { ws.bulkFrom = null }); e.dataTransfer?.setData('application/x-cad-ports', 'patch') }} ondragend={() => ws.endDrag()} class="primary">⇄ Patch {sel.ports.length > 1 ? `${sel.ports.length} ports ` : ''}to… <kbd>P</kbd></button>
	{#if cables.length}<button title="Remove the permanent cables on these ports — outlet links, ties and backbone, patched or not" onclick={() => removeAll(`Remove ${cables.length} link${cables.length === 1 ? '' : 's'}`, cables.map((l) => l.id))}>Remove links ({cables.length})</button>{/if}
	{#if cordsHere.length}<button title="Remove the patch cords on these ports — installed ones are marked for removal (they come out on site), planned ones deleted" onclick={removeCordsHere}>Remove cords ({cordsHere.length})</button>{/if}
</div>
{#if cables.length}
	<!-- the permanent cables on the selected ports (Phase 5): routed length, the riser a backbone takes, a hand length -->
	{@const r0 = project.routes.get(cables[0].id)}
	{@const nCables = cablesOf(cables).length}
	<p class="pt-1 font-semibold">Cable{nCables > 1 ? `s (${nCables})` : ''} <span class="font-normal text-zinc-500">{[...new Set(cables.map((l) => l.kind))].join(' / ')} · {cables[0].cableType ?? ''}{nCables !== cables.length || cables[0].cable ? ` · ${cables.length} core${cables.length === 1 ? '' : 's'} here` : ''}</span></p>
	<div class="prow"><span>Length</span><span class="font-mono" class:text-red-600={cables.some((l) => project.routes.get(l.id)?.problem || project.routes.get(l.id)?.over90)}>{lengthText}</span></div>
	{#if cables.length === 1 && r0?.problem}<p class="text-red-600">No route: {r0.problem}</p>{/if}
	<!-- route set by hand (backlog G148 / T078): the runs / risers to pass through, in order from the panel end;
	     routing takes the shortest way between them -->
	<div class="prow" title="Runs and risers these cables must pass through, in order from the panel: e.g. a second riser for diversity, or a whole route. Routing takes the shortest way to, between and from them. None = the shortest route.">
		<span>Route through</span>
		<span class="vias">
			{#if viasShown === null}<span class="text-zinc-500">{MIXED} <button class="x" title="Clear: route every one the shortest way" onclick={() => setVias([])}>clear</button></span>
			{:else}
				{#each viasShown as id, i (i)}
					<span class="via"><span class="text-zinc-400">{i + 1}</span>
						<select value={id} aria-label="Route through, run {i + 1}" onchange={(e) => setVias(viasShown.map((x, j) => (j === i ? e.currentTarget.value : x)))}>
							{#each runs as v (v.id)}<option value={v.id}>{v.label}</option>{/each}
						</select>
						<button class="x" title="Take this run out" aria-label="Take run {i + 1} out of the route" onclick={() => setVias(viasShown.filter((_, j) => j !== i))}>×</button></span>
				{/each}
			{/if}
			<select value="" title="Add a run or riser to pass through (after the ones listed)" aria-label="Route through: add a run or riser" onchange={(e) => { const v = e.currentTarget.value; e.currentTarget.value = ''; if (v) setVias([...(viasShown ?? []), v]) }}>
				<option value="">{viasShown?.length ? '+ then…' : 'Shortest — + through…'}</option>
				{#each runs as v (v.id)}<option value={v.id}>{v.label}</option>{/each}
			</select>
		</span>
	</div>
	<label class="prow" title="A length typed by hand (as-built, or where the containment isn't drawn); blank = the routed length">By hand (m)
		<input class="inp w-16" type="number" min="0" step="1" value={hand.value ?? ''} placeholder={hand.mixed ? MIXED : 'routed'} onchange={(e) => setHand(e.currentTarget.value)} /></label>
{/if}
{#if sel.ports.length === 1}
	<Trace {project} steps={traceCircuit(project.index, { on: sel.on, port: sel.ports[0] })} />
{/if}
{#if device?.kind === 'panel'}
	<div class="acts">
		{#if links.length}
			<button title="Remove these ports' outlet links (patched ports are kept)" onclick={unallocate}>Unallocate {links.length}</button>
			{#if links.some((l) => !l.pinned)}<button title="Re-allocation never moves pinned links" onclick={() => pin(true)}>Pin</button>{/if}
			{#if links.some((l) => l.pinned)}<button onclick={() => pin(false)}>Unpin</button>{/if}
		{/if}
		<select title="Reserve these ports: allocation fills them with outlets of this usage first" aria-label="Reserve these ports for a usage" value="" onchange={(e) => { reserve(e.currentTarget.value === '-' ? '' : e.currentTarget.value); e.currentTarget.value = '' }}>
			<option value="">Reserve for…</option>
			{#each usages as u (u.id)}<option value={u.id}>{u.label}</option>{/each}
			<option value="-">(clear reservation)</option>
		</select>
	</div>
{:else if device?.kind === 'switch'}
	<!-- W16: a switch's ports held for a usage — Patch to… puts that usage's outlets on them, and nothing else -->
	<div class="acts">
		<select title="Reserve these switch ports for a usage: Patch to… puts outlets of that usage on them (and keeps other usages off them)" aria-label="Reserve these switch ports for a usage" value="" onchange={(e) => { reserve(e.currentTarget.value === '-' ? '' : e.currentTarget.value); e.currentTarget.value = '' }}>
			<option value="">Reserve for…</option>
			{#each usages as u (u.id)}<option value={u.id}>{u.label}</option>{/each}
			<option value="-">(clear reservation)</option>
		</select>
	</div>
{/if}
<div class="ports">
	{#each rows as r (r.n)}
		<span class="n" title={reservedAs(r.n) ? `Reserved for ${reservedAs(r.n)}` : ''}>{r.n}{reservedAs(r.n) ? 'ʳ' : ''}</span>
		<input class="inp font-mono" value={r.label} placeholder="—" aria-label="Port {r.n} label" title={r.from === 'own label' ? 'This port’s own label' : `Stored on the ${r.from} (one label, shown at both ends)`} onchange={(e) => edit(r.n, e.currentTarget)} />
		<span class="from" title={r.cord ? `Patched to ${r.cord}` : ''}>{r.from}{links.find((l) => (l.a.on === sel.on ? l.a.port : l.b.port) === r.n)?.pinned ? ' ◆' : ''}{r.cord ? ' ⇄' : ''}</span>
	{/each}
</div>

<style>
	.vias { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
	.via { display: grid; grid-template-columns: 0.9rem 1fr auto; align-items: center; gap: 3px; }
	.vias select { min-width: 0; width: 100%; }
	.x { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 4px; background: var(--cad-input); color: var(--cad-text); }
	.x:hover { color: #dc2626; }
	.ports { display: grid; grid-template-columns: 1.75rem 1fr 7.5rem; gap: 2px 4px; align-items: center; max-height: 40vh; overflow: auto; }
	.n { color: var(--cad-faint); text-align: right; }
	.acts { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0; }
	.acts button, .acts select { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 6px; background: var(--cad-input); color: var(--cad-text); font-size: 12px; }
	.acts button:hover { background: var(--cad-hover); }
	/* the port's main actions: big, blue, with their key */
	.acts.main { margin: 6px 0; }
	.acts button.primary { background: #2563eb; border-color: #1d4ed8; color: #fff; font-weight: 600; padding: 2px 8px; }
	.acts button.primary:hover { background: #1d4ed8; }
	.acts kbd { font: 10px ui-monospace, monospace; border: 1px solid #ffffff80; border-radius: 3px; padding: 0 3px; margin-left: 2px; }
	.from { color: var(--cad-muted); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.inp { width: 100%; border: 1px solid var(--cad-line); border-radius: 4px; padding: 1px 4px; background: var(--cad-input); color: var(--cad-text); }
	/* a cable field: its name left, the value right (narrower than a Properties row) */
	.prow { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin: 2px 0; }
	.prow select, .prow .inp { max-width: 9rem; border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 3px; background: var(--cad-input); color: var(--cad-text); }
</style>
