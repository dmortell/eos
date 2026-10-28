<!-- A DEVICE TEMPLATE made or edited by hand (backlog "Device library builder", G088 / G110): name, kind, U, ports and
     their type / numbering, the face it mounts on, size, maker and model. Saved to the GLOBAL library (every project). A
     built-in opened here is saved as a new template (the built-ins don't change). -->
<script lang="ts">
	import { untrack } from 'svelte'
	import CadDialog from './CadDialog.svelte'
	import type { DeviceTemplate } from '../domain/devices'
	import type { Device } from '../domain/types'
	import { newId } from '../domain/ids'

	/** `from`: the template to edit (a built-in: the start of a new one); absent = a new one from scratch. */
	/** `fresh`: `from` is only the start of a NEW template (Properties › Save as template: the device's own). */
	let { from, fresh = false, onsave, onclose }: { from?: DeviceTemplate; fresh?: boolean; onsave: (t: DeviceTemplate) => void; onclose: () => void } = $props()

	const KINDS: [DeviceTemplate['kind'], string][] = [['panel', 'Patch panel'], ['switch', 'Switch'], ['manager', 'Cable manager'], ['server', 'Server'], ['shelf', 'Shelf'], ['pdu', 'PDU (0U)'], ['enclosure', 'Enclosure'], ['other', 'Other']]
	const PORT_TYPES: NonNullable<Device['portType']>[] = ['RJ45', 'LC', 'SC', 'SFP']
	const isNew = untrack(() => fresh || !from || !!from.builtin)
	let t = $state<DeviceTemplate>(untrack(() => (from
		? { ...from, ...(from.builtin ? { id: newId(), name: `${from.name} (copy)`, builtin: undefined } : fresh ? { id: newId() } : {}) }
		: { id: newId(), name: '', kind: 'panel', heightU: 1, portCount: 24, portType: 'RJ45', face: 'both' })))
	const focus = (el: HTMLInputElement) => { el.focus(); el.select() }
	const num = (v: string) => (v.trim() === '' ? undefined : Math.max(0, Number(v) || 0))
	const ok = $derived(!!t.name.trim() && t.heightU >= 1 && t.portCount >= 0)
	function save() {
		if (!ok) return
		onsave({ ...$state.snapshot(t), name: t.name.trim(), maker: t.maker?.trim() || undefined, model: t.model?.trim() || undefined, productUrl: t.productUrl?.trim() || undefined })
	}
</script>

<CadDialog title={isNew ? 'New device template' : 'Edit device template'} label="Device template" width="24rem" top="8vh" flush {onclose}
	onkeydown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') save() }}>
	{#snippet footer()}
		<button class="btn" onclick={onclose}>Cancel</button>
		<button class="btn go" disabled={!ok} onclick={save}>{isNew ? 'Add to library' : 'Save'}</button>
	{/snippet}
		<div class="body">
			<label>Name <input bind:value={t.name} placeholder="e.g. Patch panel 24 Cat6A 1U" use:focus /></label>
			<label>Kind
				<select bind:value={t.kind}>{#each KINDS as [k, label] (k)}<option value={k}>{label}</option>{/each}</select></label>
			<label>{t.kind === 'pdu' ? 'Length (U)' : 'Height (U)'} <input type="number" min="1" max="60" bind:value={t.heightU} /></label>
			<label>Ports <input type="number" min="0" max="192" bind:value={t.portCount} /></label>
			{#if t.portCount > 0}
				<label>Port type
					<select value={t.portType ?? ''} onchange={(e) => (t.portType = (e.currentTarget.value || undefined) as Device['portType'])}>
						<option value="">—</option>{#each PORT_TYPES as p (p)}<option value={p}>{p}</option>{/each}</select></label>
				<label title="How the ports are numbered on a device with two rows or more: along each row, or down each column (most switches: 1 above 2)">Numbering
					<select value={t.portNumbering ?? 'row'} onchange={(e) => (t.portNumbering = (e.currentTarget.value === 'row' ? undefined : e.currentTarget.value as Device['portNumbering']))}>
						<option value="row">Along the rows (1 2 3 …)</option><option value="column">Down the columns (1 over 2)</option><option value="column-up">Up the columns (2 over 1)</option></select></label>
				<label title="Rows of ports on its face. Blank = the usual: about 24 a row, up to 2 rows a U">Rows <input type="number" min="1" max="8" value={t.portRows ?? ''} placeholder="auto" oninput={(e) => (t.portRows = num(e.currentTarget.value))} /></label>
				<label title="The last this-many ports drawn in their own block on the right, down columns (a switch's uplinks, management and console). Blank = none">Side ports <input type="number" min="0" max={Math.max(0, t.portCount - 1)} value={t.sidePorts ?? ''} placeholder="none" oninput={(e) => (t.sidePorts = num(e.currentTarget.value) || undefined)} /></label>
				<label title="Slots across the front (a fiber enclosure's modules): the ports are drawn in this many blocks. Blank = one">Slots <input type="number" min="1" max="12" value={t.modules ?? ''} placeholder="1" oninput={(e) => (t.modules = num(e.currentTarget.value))} /></label>
			{/if}
			<label title="Which side of the rack it faces — where it is drawn with its ports: front, rear, both (a patch panel: patched at the front, cabled at the rear) or none (not drawn). Not how it is fixed: a “both” device’s Mount (Properties) says that">Face
				<select value={t.face ?? 'front'} onchange={(e) => (t.face = e.currentTarget.value as Device['face'])}>
					<option value="front">Front</option><option value="rear">Rear</option><option value="both">Both</option><option value="none">None</option></select></label>
			<label title="Blank = a 19-inch device (fills the rack's width)">Width (mm) <input type="number" min="0" value={t.widthMm ?? ''} placeholder="19-inch" oninput={(e) => (t.widthMm = num(e.currentTarget.value))} /></label>
			<label>Depth (mm) <input type="number" min="0" value={t.depthMm ?? ''} placeholder="—" oninput={(e) => (t.depthMm = num(e.currentTarget.value))} /></label>
			<label>Maker <input value={t.maker ?? ''} oninput={(e) => (t.maker = e.currentTarget.value)} /></label>
			<label>Model <input value={t.model ?? ''} oninput={(e) => (t.model = e.currentTarget.value)} /></label>
			<label title="A link to the product's data sheet: devices placed from this template carry it">Spec sheet <input value={t.productUrl ?? ''} placeholder="https://…" oninput={(e) => (t.productUrl = e.currentTarget.value)} /></label>
		</div>
		<p class="hint">{isNew ? 'Saved to the device library of every project' : 'Changes the template for every project — devices already placed keep theirs'}</p>
</CadDialog>

<style>
	.body { display: grid; gap: 4px; padding: 8px 12px; }
	label { display: grid; grid-template-columns: 6.5rem 1fr; align-items: center; gap: 6px; }
	input, select { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; padding: 1px 4px; background: var(--cad-input, white); color: inherit; min-width: 0; }
	.hint { margin: 0; padding: 0 12px 8px; color: var(--cad-muted, #71717a); font-size: 11px; }
</style>
