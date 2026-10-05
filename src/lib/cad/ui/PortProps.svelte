<!-- The selected ports of a device (rack rows, Phase 3.3). Each port's label is edited WHERE IT LIVES (ADR 0002): a port
     linked to an outlet edits that outlet port's label; any other port keeps its own text on the device. An edit
     that would change a printed panel's labels asks first. -->
<script lang="ts">
	import { sortedUsages } from '../domain/usages'
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { PortSel } from '../editor/tools'
	import { setPortLabel, portRanges, reservePorts } from '../domain/ports'
	import { newId } from '../domain/ids'
	import { traceCircuit } from '../domain/cords'
	import Trace from './Trace.svelte'
	import { riserRuns } from '../domain/interconnect'
	import type { Device, Link } from '../domain/types'

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
	const reservedAs = (n: number) => device?.panel?.reservations?.find((r) => r.ports.includes(n))?.usage

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
	const lengthText = $derived.by(() => {
		const ls = cables.map((l) => project.routes.get(l.id)?.lengthM).filter((m): m is number => m != null)
		const none = cables.length - ls.length
		if (!ls.length) return 'no route'
		const lo = Math.min(...ls), hi = Math.max(...ls)
		return `${lo === hi ? `${lo}m` : `${lo}–${hi}m`}${cables.length > 1 ? ` · total ${ls.reduce((a, b) => a + b, 0)}m` : ''}${none ? ` · ${none} no route` : ''}`
	})
	const same = <T,>(xs: T[]) => (xs.every((x) => x === xs[0]) ? xs[0] : '*')
	const viaShown = $derived(same(cables.map((l) => l.via ?? '')))
	const handShown = $derived.by(() => { const h = same(cables.map((l) => l.lengthM ?? '')); return h === '*' ? '' : h })
	function setVia(v: string) {
		project.store.transact(v ? `Route ${cables.length} cable(s) via ${project.index.nameOf(v)}` : 'Route by the shortest way', (tx) => { for (const l of cables) tx.put({ ...l, via: v || undefined }) })
	}
	function setHand(v: string) {
		const m = v.trim() === '' ? undefined : Math.max(0, Number(v))
		if (m != null && !Number.isFinite(m)) return
		project.store.transact(m == null ? 'Cable length: routed' : `Cable length ${m} m by hand`, (tx) => { for (const l of cables) tx.put({ ...l, lengthM: m }) })
	}

	// ── take the cables / cords off these ports (any kind of link: outlet, tie, backbone); Undo brings them back ──
	const cordsHere = $derived(project.index.cords.filter((c) => (c.a.on === sel.on && sel.ports.includes(c.a.port)) || (c.b.on === sel.on && sel.ports.includes(c.b.port))))
	function removeAll(label: string, ids: string[]) {
		project.store.transact(label, (tx) => { for (const id of ids) tx.del(id) })
		ws.say(`${label} — Undo brings them back`)
	}

	function edit(n: number, input: HTMLInputElement) {
		const text = input.value
		input.value = project.index.portLabel({ on: sel.on, port: n, face: sel.face })   // shows the new text once written
		const e = setPortLabel(project.index, { on: sel.on, port: n, face: sel.face }, text)
		if (e) project.relabel(`Port ${n} label`, [e], ws.ask2)
	}
</script>

<p class="pt-1 font-semibold">Port{sel.ports.length > 1 ? 's' : ''} {portRanges(sel.ports)} <span class="font-normal text-zinc-500">({sel.face})</span></p>
<p class="text-zinc-500">Click a port · Shift-click a range · Ctrl-click to add or drop one</p>
<div class="acts">
	<button title="Patch these ports to another device: click its first port next (busy / unlabelled ports are skipped)" onclick={() => ws.patchFrom(sel)}>Patch {sel.ports.length > 1 ? `${sel.ports.length} ports ` : ''}to…</button>
	{#if device?.kind === 'panel'}<button title="Permanent cables from these ports to another panel — in another room or on another floor (backbone, through a riser) or the same room (tie): open its rack view and click its first port" onclick={() => ws.interconnectFrom(sel)}>Interconnect to…</button>{/if}
	{#if cables.length}<button title="Remove the permanent cables on these ports — outlet links, ties and backbone, patched or not" onclick={() => removeAll(`Remove ${cables.length} link${cables.length === 1 ? '' : 's'}`, cables.map((l) => l.id))}>Remove links ({cables.length})</button>{/if}
	{#if cordsHere.length}<button title="Remove the patch cords on these ports" onclick={() => removeAll(`Remove ${cordsHere.length} cord${cordsHere.length === 1 ? '' : 's'}`, cordsHere.map((c) => c.id))}>Remove cords ({cordsHere.length})</button>{/if}
</div>
{#if cables.length}
	<!-- the permanent cables on the selected ports (Phase 5): routed length, the riser a backbone takes, a hand length -->
	{@const r0 = project.routes.get(cables[0].id)}
	<p class="pt-1 font-semibold">Cable{cables.length > 1 ? `s (${cables.length})` : ''} <span class="font-normal text-zinc-500">{[...new Set(cables.map((l) => l.kind))].join(' / ')} · {cables[0].cableType ?? ''}</span></p>
	<div class="row"><span>Length</span><span class="font-mono" class:text-red-600={cables.some((l) => project.routes.get(l.id)?.problem || project.routes.get(l.id)?.over90)}>{lengthText}</span></div>
	{#if cables.length === 1 && r0?.problem}<p class="text-red-600">No route: {r0.problem}</p>{/if}
	{#if cables.some((l) => l.kind !== 'horizontal')}
		<label class="row" title="The riser (a run between floors) these cables must use — e.g. a second riser for diversity. Shortest = whichever routing finds.">Riser
			<select value={viaShown} onchange={(e) => setVia(e.currentTarget.value)}>
				<option value="">Shortest</option>
				{#if viaShown === '*'}<option value="*">(mixed)</option>{/if}
				{#each riserRuns(project.index) as v (v.id)}<option value={v.id}>{v.label}</option>{/each}
			</select></label>
	{/if}
	<label class="row" title="A length typed by hand (as-built, or where the containment isn't drawn); blank = the routed length">By hand (m)
		<input class="inp w-16" type="number" min="0" step="1" value={handShown} placeholder="routed" onchange={(e) => setHand(e.currentTarget.value)} /></label>
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
		<select title="Reserve these ports: allocation fills them with outlets of this usage first" value="" onchange={(e) => { reserve(e.currentTarget.value === '-' ? '' : e.currentTarget.value); e.currentTarget.value = '' }}>
			<option value="">Reserve for…</option>
			{#each usages as u (u.id)}<option value={u.id}>{u.label}</option>{/each}
			<option value="-">(clear reservation)</option>
		</select>
	</div>
{/if}
<div class="ports">
	{#each rows as r (r.n)}
		<span class="n" title={reservedAs(r.n) ? `Reserved for ${reservedAs(r.n)}` : ''}>{r.n}{reservedAs(r.n) ? 'ʳ' : ''}</span>
		<input class="inp font-mono" value={r.label} placeholder="—" title={r.from === 'own label' ? 'This port’s own label' : `Stored on the ${r.from} (one label, shown at both ends)`} onchange={(e) => edit(r.n, e.currentTarget)} />
		<span class="from" title={r.cord ? `Patched to ${r.cord}` : ''}>{r.from}{links.find((l) => (l.a.on === sel.on ? l.a.port : l.b.port) === r.n)?.pinned ? ' ◆' : ''}{r.cord ? ' ⇄' : ''}</span>
	{/each}
</div>

<style>
	.ports { display: grid; grid-template-columns: 1.75rem 1fr 7.5rem; gap: 2px 4px; align-items: center; max-height: 40vh; overflow: auto; }
	.n { color: var(--cad-faint); text-align: right; }
	.acts { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0; }
	.acts button, .acts select { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 6px; background: var(--cad-input); color: var(--cad-text); font-size: 12px; }
	.acts button:hover { background: var(--cad-hover); }
	.from { color: var(--cad-muted); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.inp { width: 100%; border: 1px solid var(--cad-line); border-radius: 4px; padding: 1px 4px; background: var(--cad-input); color: var(--cad-text); }
	.row { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin: 2px 0; }
	.row select, .row .inp { max-width: 9rem; border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 3px; background: var(--cad-input); color: var(--cad-text); }
</style>
