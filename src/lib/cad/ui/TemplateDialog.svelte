<!-- A DEVICE TEMPLATE made or edited by hand (backlog "Device library builder", G088 / G110): name, kind, U, ports and
     their type / numbering, the face it mounts on, size, maker and model. Saved to the GLOBAL library (every project). A
     built-in opened here is saved as a new template (the built-ins don't change). -->
<script lang="ts">
	import { untrack } from 'svelte'
	import { backdropClose } from './backdrop'
	import type { DeviceTemplate } from '../domain/devices'
	import type { Device } from '../domain/types'
	import { newId } from '../domain/ids'

	/** `from`: the template to edit (a built-in: the start of a new one); absent = a new one from scratch. */
	let { from, onsave, onclose }: { from?: DeviceTemplate; onsave: (t: DeviceTemplate) => void; onclose: () => void } = $props()

	const KINDS: [DeviceTemplate['kind'], string][] = [['panel', 'Patch panel'], ['switch', 'Switch'], ['manager', 'Cable manager'], ['server', 'Server'], ['shelf', 'Shelf'], ['pdu', 'PDU (0U)'], ['enclosure', 'Enclosure'], ['other', 'Other']]
	const PORT_TYPES: NonNullable<Device['portType']>[] = ['RJ45', 'LC', 'SC', 'SFP']
	const isNew = untrack(() => !from || !!from.builtin)
	let t = $state<DeviceTemplate>(untrack(() => (from
		? { ...from, ...(from.builtin ? { id: newId(), name: `${from.name} (copy)`, builtin: undefined } : {}) }
		: { id: newId(), name: '', kind: 'panel', heightU: 1, portCount: 24, portType: 'RJ45', face: 'both' })))
	const focus = (el: HTMLInputElement) => { el.focus(); el.select() }
	const num = (v: string) => (v.trim() === '' ? undefined : Math.max(0, Number(v) || 0))
	const ok = $derived(!!t.name.trim() && t.heightU >= 1 && t.portCount >= 0)
	function save() {
		if (!ok) return
		onsave({ ...$state.snapshot(t), name: t.name.trim(), maker: t.maker?.trim() || undefined, model: t.model?.trim() || undefined })
	}
</script>

<div class="backdrop" role="presentation" use:backdropClose={onclose}>
	<div class="dlg" role="dialog" aria-label="Device template" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => { if (e.key === 'Escape') onclose(); if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') save() }}>
		<div class="head"><b>{isNew ? 'New device template' : 'Edit device template'}</b><button class="x" title="Close (Esc)" onclick={onclose}>✕</button></div>
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
					<select value={t.portNumbering ?? 'row'} onchange={(e) => (t.portNumbering = e.currentTarget.value === 'column' ? 'column' : undefined)}>
						<option value="row">Along the rows (1 2 3 …)</option><option value="column">Down the columns (1 over 2)</option></select></label>
			{/if}
			<label title="The face it mounts on by default (a patch panel: both — patched at the front, cabled at the rear)">Face
				<select value={t.face ?? 'front'} onchange={(e) => (t.face = e.currentTarget.value as Device['face'])}>
					<option value="front">Front</option><option value="rear">Rear</option><option value="both">Both</option><option value="none">None</option></select></label>
			<label title="Blank = a 19-inch device (fills the rack's width)">Width (mm) <input type="number" min="0" value={t.widthMm ?? ''} placeholder="19-inch" oninput={(e) => (t.widthMm = num(e.currentTarget.value))} /></label>
			<label>Depth (mm) <input type="number" min="0" value={t.depthMm ?? ''} placeholder="—" oninput={(e) => (t.depthMm = num(e.currentTarget.value))} /></label>
			<label>Maker <input value={t.maker ?? ''} oninput={(e) => (t.maker = e.currentTarget.value)} /></label>
			<label>Model <input value={t.model ?? ''} oninput={(e) => (t.model = e.currentTarget.value)} /></label>
		</div>
		<p class="hint">{isNew ? 'Saved to the device library of every project' : 'Changes the template for every project — devices already placed keep theirs'}</p>
		<div class="foot">
			<button class="btn" onclick={onclose}>Cancel</button>
			<button class="btn go" disabled={!ok} onclick={save}>{isNew ? 'Add to library' : 'Save'}</button>
		</div>
	</div>
</div>

<style>
	.backdrop { position: fixed; inset: 0; z-index: 50; background: rgb(0 0 0 / 0.25); display: flex; align-items: flex-start; justify-content: center; padding-top: 8vh; }
	.dlg { width: min(24rem, 96vw); display: flex; flex-direction: column; background: var(--cad-panel, white); color: var(--cad-text, #18181b); border: 1px solid var(--cad-line, #e4e4e7); border-radius: 8px; box-shadow: 0 8px 30px rgb(0 0 0 / 0.2); font-size: 12px; }
	.head { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--cad-line, #e4e4e7); }
	.x { color: var(--cad-muted, #71717a); }
	.body { display: grid; gap: 4px; padding: 8px 12px; }
	label { display: grid; grid-template-columns: 6.5rem 1fr; align-items: center; gap: 6px; }
	input, select { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; padding: 1px 4px; background: var(--cad-input, white); color: inherit; min-width: 0; }
	.foot { display: flex; align-items: center; justify-content: flex-end; gap: 6px; padding: 8px 12px; border-top: 1px solid var(--cad-line, #e4e4e7); }
	.hint { margin: 0; padding: 0 12px 8px; color: var(--cad-muted, #71717a); font-size: 11px; }
	.btn { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; padding: 2px 10px; background: var(--cad-input, white); }
	.btn.go { background: #2563eb; color: white; border-color: #2563eb; }
	.btn:disabled { opacity: 0.5; }
</style>
