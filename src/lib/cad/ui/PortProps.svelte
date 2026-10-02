<!-- The selected ports of a device (rack rows, Phase 3.3). Each port's label is edited WHERE IT LIVES (ADR 0002): a port
     linked to an outlet edits that outlet port's label; any other port keeps its own text on the device. An edit
     that would change a printed panel's labels asks first. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { PortSel } from '../editor/tools'
	import { setPortLabel, portRanges } from '../domain/ports'

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

	function edit(n: number, input: HTMLInputElement) {
		const text = input.value
		input.value = project.index.portLabel({ on: sel.on, port: n, face: sel.face })   // shows the new text once written
		const e = setPortLabel(project.index, { on: sel.on, port: n, face: sel.face }, text)
		if (e) project.relabel(`Port ${n} label`, [e], ws.ask2)
	}
</script>

<p class="pt-1 font-semibold">Port{sel.ports.length > 1 ? 's' : ''} {portRanges(sel.ports)} <span class="font-normal text-zinc-500">({sel.face})</span></p>
<p class="text-zinc-500">Click a port · Shift-click a range · Ctrl-click to add or drop one</p>
<div class="ports">
	{#each rows as r (r.n)}
		<span class="n">{r.n}</span>
		<input class="inp font-mono" value={r.label} placeholder="—" title={r.from === 'own label' ? 'This port’s own label' : `Stored on the ${r.from} (one label, shown at both ends)`} onchange={(e) => edit(r.n, e.currentTarget)} />
		<span class="from" title={r.cord ? `Patched to ${r.cord}` : ''}>{r.from}{r.cord ? ' ⇄' : ''}</span>
	{/each}
</div>

<style>
	.ports { display: grid; grid-template-columns: 1.75rem 1fr 7.5rem; gap: 2px 4px; align-items: center; max-height: 40vh; overflow: auto; }
	.n { color: #a1a1aa; text-align: right; }
	.from { color: #71717a; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.inp { width: 100%; border: 1px solid #e4e4e7; border-radius: 4px; padding: 1px 4px; background: white; }
</style>
