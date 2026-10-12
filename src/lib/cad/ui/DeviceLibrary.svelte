<!-- The DEVICE LIBRARY window (its own window — Dave: the list gets long; backlog "Device library: drag onto a rack", G063): every device template (built-in and the
     global ones, ★), found by name and grouped by kind. DRAG one onto a rack in a rack view — the Device tool's ghost
     shows the snapped U (red where it can't go) and the drop adds it there, one undo step, selected. A CLICK arms the
     Device tool with it instead (the next click in a rack places it). + New / ✎ / ✕ make, edit and delete templates
     (backlog "Device library builder"; a built-in's ⧉ starts a new one from it) — ui/TemplateDialog.svelte. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import { templateFromDevice, type DeviceTemplate } from '../domain/devices'
	import { naturalCompare } from '../domain/labels'
	import TemplateDialog from './TemplateDialog.svelte'

	let { project, ws }: { project: CadProject; ws: Workspace } = $props()

	const KINDS: [DeviceTemplate['kind'], string][] = [['panel', 'Patch panels'], ['switch', 'Switches'], ['manager', 'Cable managers'], ['server', 'Servers'], ['shelf', 'Shelves'], ['pdu', 'PDUs'], ['enclosure', 'Enclosures'], ['other', 'Other']]
	let q = $state('')
	const groups = $derived.by(() => {
		const f = q.trim().toLowerCase()
		const list = project.deviceTemplates.filter((t) => !f || `${t.name} ${t.kind} ${t.maker ?? ''} ${t.model ?? ''}`.toLowerCase().includes(f))
		return KINDS.map(([k, label]) => ({ k, label, items: list.filter((t) => t.kind === k).sort((a, b) => naturalCompare(a.name, b.name)) })).filter((g) => g.items.length)
	})

	function start(e: DragEvent, t: DeviceTemplate) {
		ws.startDrag(() => { ws.deviceTemplate = t; ws.toolId = 'device' })
		e.dataTransfer?.setData('application/x-cad-device', t.id)
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy'
	}
	/** The drag ended (dropped or not): back to the tool you had. */
	const end = () => ws.endDrag()
	function arm(t: DeviceTemplate) {
		ws.deviceTemplate = t
		ws.toolId = 'device'
		ws.say(`${t.name}: click a U in a rack (a rack view) to add it — or drag it from the library`)
	}

	// ── the builder (backlog "Device library builder"): a new template, one edited (a built-in: copied), one deleted ──
	/** null = closed; 'new' = from scratch; a template = edit it (a built-in starts a new one). */
	let editing = $state<DeviceTemplate | 'new' | null>(null)
	/** A new template filled in from the selected device (its size, kind, ports …). */
	let fromDevice = $state<DeviceTemplate | null>(null)
	const picked = $derived.by(() => { const e = ws.selection.length === 1 ? project.index.get(ws.selection[0]) : undefined; return e?.type === 'device' ? e : undefined })
	async function save(t: DeviceTemplate) {
		const isNew = editing === 'new' || fromDevice !== null || (editing !== null && editing.builtin)
		editing = null
		fromDevice = null
		try { await project.putTemplate(t); ws.say(`${t.name}: ${isNew ? 'added to' : 'saved in'} the device library`) }
		catch (e) { project.error = `Couldn't save the template: ${(e as Error).message}` }
	}
	function remove(t: DeviceTemplate) {
		ws.ask2(`Delete the template ${t.name} from the device library (every project)? Devices already placed stay as they are. This can't be undone.`, 'Delete template',
			() => project.deleteTemplate(t.id).then(() => ws.say(`${t.name} deleted from the device library`), (e) => (project.error = `Couldn't delete it: ${(e as Error).message}`)))
	}
</script>

{#if editing}<TemplateDialog from={editing === 'new' ? undefined : editing} onsave={save} onclose={() => (editing = null)} />{/if}
{#if fromDevice}<TemplateDialog from={fromDevice} fresh onsave={save} onclose={() => (fromDevice = null)} />{/if}
<div class="lib">
	<div class="top">
		<input class="find" placeholder="Find a template…" bind:value={q} />
		<button class="new" title="Make a device template from scratch (name, kind, U, ports, maker, model) — for every project" onclick={() => (editing = 'new')}>+ New</button>
		{#if picked}<button class="new" title="A new template from the selected device {picked.name} (its size, kind, ports …) — for every project" onclick={() => (fromDevice = templateFromDevice(picked, picked.name))}>+ From {picked.name}</button>{/if}
	</div>
	{#each groups as g (g.k)}
		<p class="kind">{g.label}</p>
		{#each g.items as t (t.id)}
			<div class="row">
				<button class="tpl" class:on={ws.toolId === 'device' && ws.deviceTemplate?.id === t.id} draggable="true"
					title="Drag onto a rack in a rack view (or click, then click a U)" ondragstart={(e) => start(e, t)} ondragend={end} onclick={() => arm(t)}>
					<span class="n">{t.name}{t.builtin ? '' : ' ★'}</span><span class="u">{t.kind === 'pdu' ? '0U' : `${t.heightU}U`}</span>
				</button>
				<span class="acts">
					<button title={t.builtin ? 'Make a new template from this built-in one' : 'Edit this template (for every project)'} onclick={() => (editing = t)}>{t.builtin ? '⧉' : '✎'}</button>
					{#if !t.builtin}<button title="Delete this template (every project)" onclick={() => remove(t)}>✕</button>{/if}
				</span>
			</div>
		{/each}
	{:else}
		<p class="px-2 text-[11px] text-zinc-400">No template matches</p>
	{/each}
</div>

<style>
	.top { display: flex; gap: 4px; align-items: center; margin: 2px 0 4px; }
	.new { flex: 0 1 auto; max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: #2563eb; padding: 0 6px; border-radius: 3px; }
	.new:hover { background: var(--cad-sel); }
	.row { display: flex; align-items: center; }
	.row .tpl { flex: 1; min-width: 0; }
	.acts { display: none; flex: 0 0 auto; }
	.row:hover .acts { display: inline-flex; }
	.acts button { font-size: 11px; color: var(--cad-muted); padding: 0 4px; border-radius: 3px; }
	.acts button:hover { color: #2563eb; background: var(--cad-sel); }
	.find { flex: 1; min-width: 0; margin: 0; border: 1px solid var(--cad-line); border-radius: 4px; padding: 1px 6px; font-size: 12px; background: var(--cad-input); color: var(--cad-text); }
	.kind { padding: 4px 4px 0; font-size: 11px; color: var(--cad-faint); }
	.tpl { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 6px; border-radius: 4px; padding: 1px 8px; font-size: 12px; text-align: left; cursor: grab; }
	.tpl:hover { background: var(--cad-hover); }
	.tpl.on { background: var(--cad-sel); }
	.n { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.u { flex: 0 0 auto; font-size: 10px; color: var(--cad-faint); }
</style>
