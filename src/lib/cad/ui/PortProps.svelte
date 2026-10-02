<!-- The selected ports of a device (rack rows, Phase 3.3). Each port's label is edited WHERE IT LIVES (ADR 0002): a port
     linked to an outlet edits that outlet port's label; any other port keeps its own text on the device. An edit
     that would change a printed panel's labels asks first. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { PortSel } from '../editor/tools'
	import { setPortLabel, portRanges } from '../domain/ports'
	import { newId } from '../domain/ids'
	import { traceCircuit } from '../domain/cords'
	import Trace from './Trace.svelte'
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
	const usages = $derived(project.settings?.usages ?? [])
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
		const d = device
		if (!d?.panel) return
		const without = (d.panel.reservations ?? []).map((r) => ({ ...r, ports: r.ports.filter((p) => !sel.ports.includes(p)) })).filter((r) => r.ports.length)
		const reservations = usage ? [...without, { id: newId(), usage, ports: [...sel.ports] }] : without
		project.store.transact(usage ? `Reserve ports for ${usage}` : 'Clear reservation', (tx) => tx.put({ ...d, panel: { ...d.panel!, reservations: reservations.length ? reservations : undefined } }))
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
</div>
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
	.n { color: #a1a1aa; text-align: right; }
	.acts { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0; }
	.acts button, .acts select { border: 1px solid #d4d4d8; border-radius: 4px; padding: 0 6px; background: white; font-size: 12px; }
	.acts button:hover { background: #f4f4f5; }
	.from { color: #71717a; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.inp { width: 100%; border: 1px solid #e4e4e7; border-radius: 4px; padding: 1px 4px; background: white; }
</style>
