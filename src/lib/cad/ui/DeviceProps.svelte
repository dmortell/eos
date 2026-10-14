<!-- DEVICE properties, for one device or several (the same groups and fields; with several a field shows what they
     share or "mixed", and an edit sets them all — one undo step): General · Position · Product and size · Ports and
     labels. A change that would make any of them overlap or run off its rack is refused, with the reason. Fields only one
     device can have (its U, sideways offset, split labels, printed labels, usages) show for one. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Device, PortGroup, Rack } from '../domain/types'
	import { sortedUsages } from '../domain/usages'
	import { groupsProblem, splitPanel, rangeLabel } from '../domain/portGroups'
	import { placementProblem, narrowDevice, templateFromDevice, beyondPorts, beyondPortsText, type DeviceTemplate } from '../domain/devices'
	import { markPrinted, changedSincePrinted, portRanges } from '../domain/ports'
	import { repeatableEdit } from '../domain/repeatEdit'
	import { portUse, portUseText, allocatedUnpatched } from '../domain/cords'
	import { shared, put } from './propsKit'
	import PropGroup from './PropGroup.svelte'
	import PortProps from './PortProps.svelte'
	import DeviceCables from './DeviceCables.svelte'
	import TemplateDialog from './TemplateDialog.svelte'
	import Field from './fields/Field.svelte'
	import NumberField from './fields/NumberField.svelte'
	import TextField from './fields/TextField.svelte'
	import SelectField from './fields/SelectField.svelte'
	import CheckField from './fields/CheckField.svelte'

	let { project, ws, devices }: { project: CadProject; ws: Workspace; devices: Device[] } = $props()

	const one = $derived(devices.length === 1 ? devices[0] : undefined)
	const rack = $derived(one ? (project.index.get(one.rackId) as Rack | undefined) : undefined)
	const KINDS: Device['kind'][] = ['panel', 'switch', 'manager', 'server', 'shelf', 'pdu', 'enclosure', 'other']
	const FACES = (['front', 'rear', 'both', 'none'] as const).map((f) => [f, f] as const)
	const dv = <V,>(f: (d: Device) => V) => shared(devices, f)
	const allPanels = $derived(devices.every((d) => d.kind === 'panel'))
	const allPdus = $derived(devices.every((d) => d.kind === 'pdu'))
	const nonePdu = $derived(devices.every((d) => d.kind !== 'pdu'))

	/** Set it on every device; refused (with the reason) when any would overlap or run off its rack. F4 repeats it.
	 *  `drop`: entities that go in the same step (the links / cords on ports a lower port count takes away). */
	function set(label: string, patch: (d: Device) => Partial<Device>, drop: string[] = []) {
		const next = devices.map((d) => ({ ...d, ...patch(d) }))
		const others = project.index.devices.filter((d) => !devices.some((x) => x.id === d.id))
		for (const n of next) {
			const r = project.index.get(n.rackId)
			const problem = r?.type === 'rack' ? placementProblem(n, r, [...others, ...next.filter((x) => x.id !== n.id)]) : null
			if (problem) { ws.say(problem); return }
		}
		project.store.transact(devices.length > 1 ? `${label} (${devices.length} devices)` : label, (tx) => { for (const id of drop) tx.del(id); for (const n of next) tx.put(n) })
		// taken from the first: the change, not this event's closure
		if (devices[0]) ws.lastDeviceEdit = repeatableEdit(devices[0], label, patch(devices[0])) ?? ws.lastDeviceEdit
	}
	const setAll = (label: string, patch: Partial<Device>) => set(label, () => patch)

	/** Fewer ports take the links and cords on the ports that go with them, in the same step — asked first, saying what. */
	function setPorts(n: number) {
		const going = beyondPorts(project.index, devices.map((d) => ({ id: d.id, portCount: n })))
		const drop = [...going.links, ...going.cords].map((e) => e.id)
		if (!drop.length) { setAll('Port count', { portCount: n }); return }
		const name = one ? one.name : `${devices.length} devices`
		ws.ask2(`${name}: ${n} ports — ${beyondPortsText(going)} on the ports that go will be deleted. Undo brings them back.`, 'Remove ports',
			() => set('Port count', () => ({ portCount: n }), drop))
	}

	function setUsage(d: Device, usage: string, on: boolean) {
		const cur = d.panel?.usages ?? [], usages = on ? [...new Set([...cur, usage])] : cur.filter((x) => x !== usage)
		setAll(`${d.name} takes ${usages.join(', ') || 'any usage'}`, { panel: { tier: 'low', ...d.panel, usages: usages.length ? usages : undefined } })
	}
	/** A panel's labelled port ranges (backlog A, Dave 2026-10-10); refused with the reason if they don't fit. */
	function setGroups(d: Device, groups: PortGroup[], label: string) {
		const why = groupsProblem(groups, d.portCount)
		if (why) { ws.say(why); return }
		setAll(label, { panel: { tier: 'low', ...d.panel, groups: groups.length ? groups : undefined } })
	}
	const editGroup = (d: Device, i: number, patch: Partial<PortGroup>) =>
		setGroups(d, (d.panel?.groups ?? []).map((g, j) => {
			if (j !== i) return g
			const next = { ...g, ...patch }
			if (!next.label) delete next.label   // no label: named from its cables
			return next
		}), `${d.name} port range`)

	// Save as template: the Device library's form, filled in from the device — a NEW template (every project)
	let tplFrom = $state<DeviceTemplate | null>(null)
	async function putTemplate(t: DeviceTemplate) {
		tplFrom = null
		try { await project.putTemplate(t); ws.say(`${t.name}: added to the device library (every project)`) }
		catch (e) { project.error = `Save template failed: ${(e as Error).message}` }
	}
</script>

{#if tplFrom}<TemplateDialog from={tplFrom} fresh onsave={putTemplate} onclose={() => (tplFrom = null)} />{/if}
{#if one}
	<!-- the selected PORTS first, above the device's own groups: what you clicked is what you want to act on (Dave
	     2026-10-07: "Patch to…" was hard to find at the bottom) -->
	{#if ws.portSel?.on === one.id}<div class="ports-first"><PortProps {project} {ws} sel={ws.portSel} /></div>{/if}
{/if}
<PropGroup kind="device" title="General">
	<TextField label="Name" value={dv((d) => d.name).value} mixed={dv((d) => d.name).mixed} onchange={(v) => v && setAll(devices.length > 1 ? 'Rename devices' : 'Rename device', { name: v })} />
	<SelectField label="Kind" value={dv((d) => d.kind).value} mixed={dv((d) => d.kind).mixed} options={KINDS.map((k) => [k, k] as const)} onchange={(v) => setAll('Device kind', { kind: v as Device['kind'] })} />
	{#if rack}<p class="muted">in {rack.name}</p>{/if}
</PropGroup>
<PropGroup kind="device" title="Position">
	{#if one}<NumberField label="U (bottom)" value={one.u} onchange={(v) => v != null && setAll('Move device', { u: v })} />{/if}
	<NumberField label="Height" unit="U" min={1} value={dv((d) => d.heightU).value} mixed={dv((d) => d.heightU).mixed} onchange={(v) => v != null && Number.isInteger(v) && v >= 1 && setAll('Device height', { heightU: v })} />
	<SelectField label="Face" title="Which side of the rack it faces — where it is drawn with its ports: front, rear, both (a patch panel: patched at the front, cabled at the rear) or none (not drawn)"
		value={dv((d) => d.face).value} mixed={dv((d) => d.face).mixed} options={FACES} onchange={(v) => setAll('Device face', { face: v as Device['face'] })} />
	{#if nonePdu && devices.every((d) => d.face === 'both')}
		<SelectField label="Mount" title="Fixed to one side only: it then shares its U with a device on the other side (when their depths fit)" value={dv((d) => d.mount ?? '').value} mixed={dv((d) => d.mount ?? '').mixed}
			options={[['', 'full depth'], ['front', 'front'], ['rear', 'rear']]} onchange={(v) => setAll('Device mount', { mount: (v || undefined) as Device['mount'] })} />
	{/if}
	{#if allPdus}
		<!-- a 0U PDU (backlog "0U PDUs"): its side, its power inlets and its sockets — drawn on the strip; drag it across the rack to change sides -->
		<SelectField label="Side" title="The side of the rack it's on, as seen from the front (or drag it across)" value={dv((d) => d.pduSide ?? 'left').value} mixed={dv((d) => d.pduSide ?? 'left').mixed}
			options={[['left', 'left'], ['right', 'right']]} onchange={(v) => setAll('PDU side', { pduSide: v === 'right' ? 'right' : undefined })} />
		<NumberField label="Inlets" title="Power inlets (feeds in), drawn at its bottom" min={0} max={4} value={dv((d) => d.inlets ?? 0).value} mixed={dv((d) => d.inlets ?? 0).mixed}
			onchange={(v) => setAll('PDU inlets', { inlets: Math.max(0, Math.min(4, v ?? 0)) || undefined })} />
		<NumberField label="Sockets" title="Sockets (outlets) along the strip" min={0} max={48} value={dv((d) => d.outlets ?? 0).value} mixed={dv((d) => d.outlets ?? 0).mixed}
			onchange={(v) => setAll('PDU sockets', { outlets: Math.max(0, Math.min(48, v ?? 0)) || undefined })} />
	{/if}
	{#if nonePdu}
		<CheckField label="Overlap" text="may overlap{devices.every((d) => d.kind === 'shelf') ? ' (a shelf always may)' : ''}" title="Allow it to share Us with another device on the same side (a shelf always may) — the rack view marks the clash: those U numbers bold red with “!”"
			checked={devices.every((d) => d.overlapOk)} mixed={devices.some((d) => d.overlapOk) && !devices.every((d) => d.overlapOk)}
			onchange={(on) => setAll(on ? 'May overlap' : 'No overlap', { overlapOk: on || undefined })} />
	{/if}
</PropGroup>
<PropGroup kind="device" title="Product and size">
	<TextField label="Maker" value={dv((d) => d.maker).value} mixed={dv((d) => d.maker).mixed} onchange={(v) => setAll('Device maker', { maker: v || undefined })} />
	<TextField label="Model" value={dv((d) => d.model).value} mixed={dv((d) => d.model).mixed} onchange={(v) => setAll('Device model', { model: v || undefined })} />
	<NumberField label="Width" unit="mm" min={10} blank placeholder="19-inch" value={dv((d) => d.widthMm).value} mixed={dv((d) => d.widthMm).mixed} onchange={(v) => setAll('Device width', { widthMm: v })} />
	<NumberField label="Depth" unit="mm" min={10} blank value={dv((d) => d.depthMm).value} mixed={dv((d) => d.depthMm).mixed} onchange={(v) => setAll('Device depth', { depthMm: v })} />
	{#if one && rack && narrowDevice(one) && one.widthMm! < rack.widthMm}
		<NumberField label="Offset X" unit="mm" step={25} title="Sideways from the rack's centre, seen from the front (+ = right). Dragging it in the rack view moves it in 25 mm steps."
			value={one.offsetX ?? 0} onchange={(v) => { const room = (rack.widthMm - (one.widthMm ?? 0)) / 2, x = Math.max(-room, Math.min(room, v ?? 0)); setAll('Device offset', { offsetX: x || undefined }) }} />
	{/if}
	{#if one}<div class="acts ind"><button class="lnk" title="Save this device's size, ports and kind as a new template in the Device library (every project)" onclick={() => (tplFrom = templateFromDevice(one, one.name))}>Save as template…</button></div>{/if}
</PropGroup>
<PropGroup kind="device" title="Ports and labels">
	<NumberField label="Ports" min={0} value={dv((d) => d.portCount).value} mixed={dv((d) => d.portCount).mixed} onchange={(v) => v != null && Number.isInteger(v) && v >= 0 && setPorts(v)} />
	{#if one?.portCount}
		{@const d = one}
		<!-- how its ports are used: patched = a cord on it, linked = a permanent cable (outlet, tie, backbone) -->
		<p class="muted" title="Used = a cord or a permanent cable on the port (patched: a patch cord; linked: an outlet cable, tie or backbone). Free = neither.">{portUseText(portUse(project.index, d))}</p>
		{#if d.kind !== 'pdu' && ws.portSel?.on !== d.id}
			<div class="pt-1"><button class="link" title="Patch all this device's ports to another device: click its first port next — the cords are listed to OK before they're made" onclick={() => ws.patchDevice(d)}>⇄ Patch {d.portCount > 1 ? `all ${d.portCount} ports` : 'its port'} to…</button></div>
		{/if}
		<!-- W15: the allocated ports (an outlet cable on them) with no cord yet, picked for you — then Patch to… / P -->
		{@const todo = d.kind === 'panel' ? allocatedUnpatched(project.index, d) : []}
		{#if todo.length}<div class="pt-1"><button class="link" title="Select the ports with an outlet on them but no patch cord yet (ports {todo.length > 6 ? `${todo.slice(0, 6).join(', ')} …` : todo.join(', ')}) — then Patch to… (P) and click the first switch port" onclick={() => ws.selectPorts({ on: d.id, ports: todo, face: 'front', anchor: todo[0] })}>☐ Select the {todo.length} allocated port{todo.length === 1 ? '' : 's'} not patched yet</button></div>{/if}
	{/if}
	{#if devices.some((d) => d.portCount)}
		<SelectField label="Numbering" value={dv((d) => d.portNumbering ?? 'row').value} mixed={dv((d) => d.portNumbering ?? 'row').mixed}
			options={[['row', 'Across (2 beside 1)'], ['column', 'Down (2 under 1)']]} onchange={(v) => setAll('Port numbering', { portNumbering: v === 'column' ? 'column' : undefined })} />
	{/if}
	{#if allPanels}
		<SelectField label="Tier" value={dv((d) => d.panel?.tier ?? 'low').value} mixed={dv((d) => d.panel?.tier ?? 'low').mixed} options={[['low', 'Low'], ['high', 'High']]}
			onchange={(v) => set('Panel tier', (d) => ({ panel: { ...d.panel, tier: v as 'low' | 'high' } }))} />
	{/if}
	{#if one?.kind === 'panel'}
		{@const d = one}
		<Field label="Takes" title="Allocation puts an outlet on a panel of its usage first; a panel with none ticked is general (takes any usage without a panel of its own)">
			{#snippet children()}
				<span class="usages">
					{#each sortedUsages(project.settings) as u (u.id)}
						<label><input type="checkbox" checked={!!d.panel?.usages?.includes(u.id)} onchange={(e) => setUsage(d, u.id, e.currentTarget.checked)} /> {u.label}</label>
					{/each}
					{#if !d.panel?.usages?.length}<span class="text-zinc-400">any usage (general)</span>{/if}
				</span>
			{/snippet}
		</Field>
		{#if d.portCount > 1}
			{@const groups = d.panel?.groups ?? []}
			{@const last = groups.reduce((m, g) => Math.max(m, g.to), 0)}
			<Field label="Split labels" title="Give a range of ports its own label: a port in it shows “label:NN”, counted from the range's first port (the 25th port of a panel whose bottom half is P3A-R302 is P3A-R302:01), at both ends of its cable">
				{#snippet children()}
					<span class="pair">
						{#if !groups.length}
							<button class="btn whitespace-nowrap" title="Two ranges, top and bottom half — each named from the rack its cables go to (P3A-R301), else the panel's name -A / -B" onclick={() => setGroups(d, splitPanel(d, 2), `${d.name} split in two`)}>In two</button>
							<span class="text-zinc-400">one label</span>
						{:else if last < d.portCount}
							<button class="btn whitespace-nowrap" title="Another range, from the port after the last range to the end" onclick={() => setGroups(d, [...groups, { from: last + 1, to: d.portCount }], `${d.name} port range added`)}>+ Range</button>
						{/if}
					</span>
				{/snippet}
			</Field>
			<!-- each range on its own full-width line (Dave: the label box was squeezed out of sight): ports from – to, label, ✕ -->
			{#each groups as g, i (i)}
				<div class="range">
					<input class="inp" type="number" min="1" max={d.portCount} value={g.from} aria-label="First port" title="First port" onchange={(e) => editGroup(d, i, { from: Number(e.currentTarget.value) })} />
					<span>–</span>
					<input class="inp" type="number" min="1" max={d.portCount} value={g.to} aria-label="Last port" title="Last port" onchange={(e) => editGroup(d, i, { to: Number(e.currentTarget.value) })} />
					<!-- empty = from its cables (the grey text); typed = that label -->
					<input class="inp" value={g.label ?? ''} aria-label="Range label" placeholder={rangeLabel(project.index, d, { from: g.from, to: g.to })} title="Empty: named from its cables (this rack - the rack they go to). Type to set your own; clear it to go back."
						onchange={(e) => editGroup(d, i, { label: e.currentTarget.value.trim() || undefined })} />
					<button class="btn" title="Remove this range (its ports go back to their usual labels)" onclick={() => setGroups(d, groups.filter((_, j) => j !== i), `${d.name} port range removed`)}>✕</button>
				</div>
			{/each}
		{/if}
		{#if d.portCount}
			{@const stale = changedSincePrinted(project.index, d)}
			<Field label="Labels">
				{#snippet children()}
					{#if d.panel?.labelsPrintedAt}
						printed {new Date(d.panel.labelsPrintedAt).toLocaleDateString()}{#if stale.length}<span class="text-red-600"> · {stale.length} changed since ({portRanges(stale)})</span>{/if}
					{:else}<span class="text-zinc-400">not printed</span>{/if}
				{/snippet}
			</Field>
			<div class="acts ind">
				<button class="btn" title="Record that this panel's labels are printed and stuck on: later changes to them ask first, and differences are flagged" onclick={() => put(project.store, d, `${d.name} labels printed`, markPrinted(project.index, d, Date.now()))}>{d.panel?.labelsPrintedAt ? 'Printed again' : 'Mark printed'}</button>
				{#if d.panel?.labelsPrintedAt}<button class="btn" title="Forget the printed labels (no more warnings)" onclick={() => put(project.store, d, `${d.name} not printed`, { panel: { ...d.panel!, labelsPrintedAt: undefined, printedLabels: undefined } })}>Clear</button>{/if}
			</div>
		{/if}
	{/if}
	{#if devices.length > 1 && allPanels}
		<!-- all their ports, top panel first, from the port clicked next (four 24-port panels onto a 96-port switch) -->
		<div class="pt-1"><button class="link" title="Permanent cables from all these panels' ports, the top panel first, to another device: click its first port next" onclick={() => ws.interconnectPanels(devices)}>⟷ Link {devices.length} panels to… <kbd>L</kbd></button></div>
	{/if}
	<DeviceCables {project} {ws} {devices} />
</PropGroup>

<style>
	.usages { display: flex; flex-wrap: wrap; gap: 2px 8px; }
	.usages label { white-space: nowrap; }
	/* a split-label range: first port – last port, its label (the rest of the width), ✕ */
	.range { display: grid; grid-template-columns: 3rem auto 3rem minmax(0, 1fr) auto; align-items: center; gap: 0.25rem; }
	.ports-first { border: 1px solid #bfdbfe; background: color-mix(in srgb, #2563eb 5%, var(--cad-panel, #fff)); border-radius: 6px; padding: 0 8px 6px; margin: 4px 0 8px; }
	.lnk { font-size: 11px; color: var(--cad-link, #2563eb); }
	.lnk:hover { text-decoration: underline; }
	/* as Port Properties' Link to… : big, blue, with its key */
	.link { border: 1px solid #1d4ed8; border-radius: 4px; background: #2563eb; color: #fff; font-weight: 600; font-size: 12px; padding: 2px 8px; }
	.link:hover { background: #1d4ed8; }
	.link kbd { font: 10px ui-monospace, monospace; border: 1px solid #ffffff80; border-radius: 3px; padding: 0 3px; margin-left: 2px; }
</style>
