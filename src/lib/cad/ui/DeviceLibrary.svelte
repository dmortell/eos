<!-- The DEVICE LIBRARY (backlog "Device library: drag onto a rack", G063): every device template (built-in and the
     global ones, ★), found by name and grouped by kind. DRAG one onto a rack in a rack view — the Device tool's ghost
     shows the snapped U (red where it can't go) and the drop adds it there, one undo step, selected. A CLICK arms the
     Device tool with it instead (the next click in a rack places it). -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { DeviceTemplate } from '../domain/devices'
	import { naturalCompare } from '../domain/labels'
	import SideSection from './SideSection.svelte'

	let { project, ws }: { project: CadProject; ws: Workspace } = $props()

	const KINDS: [DeviceTemplate['kind'], string][] = [['panel', 'Patch panels'], ['switch', 'Switches'], ['manager', 'Cable managers'], ['server', 'Servers'], ['shelf', 'Shelves'], ['pdu', 'PDUs'], ['enclosure', 'Enclosures'], ['other', 'Other']]
	let q = $state('')
	const groups = $derived.by(() => {
		const f = q.trim().toLowerCase()
		const list = project.deviceTemplates.filter((t) => !f || `${t.name} ${t.kind}`.toLowerCase().includes(f))
		return KINDS.map(([k, label]) => ({ k, label, items: list.filter((t) => t.kind === k).sort((a, b) => naturalCompare(a.name, b.name)) })).filter((g) => g.items.length)
	})

	function start(e: DragEvent, t: DeviceTemplate) {
		ws.deviceTemplate = t
		ws.libraryDrag = { prevTool: ws.toolId === 'device' ? 'select' : ws.toolId }
		e.dataTransfer?.setData('application/x-cad-device', t.id)
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy'
	}
	/** The drag ended (dropped or not): back to the tool you had. */
	function end() {
		const d = ws.libraryDrag
		ws.libraryDrag = null
		if (d && ws.toolId === 'device') ws.toolId = d.prevTool
	}
	function arm(t: DeviceTemplate) {
		ws.deviceTemplate = t
		ws.toolId = 'device'
		ws.say(`${t.name}: click a U in a rack (a rack view) to add it — or drag it from the library`)
	}
</script>

<SideSection key="device-library" title="Device library">
	<input class="find" placeholder="Find a template…" bind:value={q} />
	{#each groups as g (g.k)}
		<p class="kind">{g.label}</p>
		{#each g.items as t (t.id)}
			<button class="tpl" class:on={ws.toolId === 'device' && ws.deviceTemplate?.id === t.id} draggable="true"
				title="Drag onto a rack in a rack view (or click, then click a U)" ondragstart={(e) => start(e, t)} ondragend={end} onclick={() => arm(t)}>
				<span class="n">{t.name}{t.builtin ? '' : ' ★'}</span><span class="u">{t.kind === 'pdu' ? '0U' : `${t.heightU}U`}</span>
			</button>
		{/each}
	{:else}
		<p class="px-2 text-[11px] text-zinc-400">No template matches</p>
	{/each}
</SideSection>

<style>
	.find { width: 100%; margin: 2px 0 4px; border: 1px solid var(--cad-line); border-radius: 4px; padding: 1px 6px; font-size: 12px; background: var(--cad-input); color: var(--cad-text); }
	.kind { padding: 4px 4px 0; font-size: 11px; color: var(--cad-faint); }
	.tpl { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 6px; border-radius: 4px; padding: 1px 8px; font-size: 12px; text-align: left; cursor: grab; }
	.tpl:hover { background: var(--cad-hover); }
	.tpl.on { background: var(--cad-sel); }
	.n { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.u { flex: 0 0 auto; font-size: 10px; color: var(--cad-faint); }
</style>
