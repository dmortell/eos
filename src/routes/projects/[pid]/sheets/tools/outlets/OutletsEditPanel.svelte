<script lang="ts">
	import { Window } from '$lib'
	import PropText from '../../parts/PropText.svelte'
	import PropSelect from '../../parts/PropSelect.svelte'
	import AnnotationControls from '../../edit/AnnotationControls.svelte'
	import { portal } from '../../edit/portal'
	import type { OutletsEditor } from './outlets-editor.svelte'
	import type { AnnotationEditor } from '../../annotations/annotations.svelte'

	let { editor, tool = $bindable(), annEditor }: { editor: OutletsEditor; tool: string; annEditor: AnnotationEditor } = $props()

	const objTools = [
		{ id: 'select', label: 'Select' },
		{ id: 'outlet', label: '+ Outlet' },
		{ id: 'trunk', label: '+ Trunk' },
	] as const

	function pick(id: typeof objTools[number]['id']) {
		if (id === 'trunk') { tool = 'trunk'; editor.startDraw() }
		else { if (editor.draw) editor.finishDraw(); tool = id }
	}
	const val = (e: Event) => (e.currentTarget as HTMLSelectElement | HTMLInputElement).value
	const cls = (active: boolean) => ['flex-1 rounded border px-1 py-0.5 text-xs', active ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-slate-100']
</script>

<div use:portal>
<Window title="Edit" name="outlets-edit" left={10} top={72} open class="w-60 space-y-2 p-2 text-zinc-700">
	<div class="flex gap-1">
		{#each objTools as t (t.id)}
			<button class={cls(tool === t.id)} onclick={() => pick(t.id)}>{t.label}</button>
		{/each}
	</div>
	<AnnotationControls bind:tool editor={annEditor} />
	{#if editor.draw}
		<button class="w-full rounded border px-1 py-0.5 text-xs hover:bg-slate-100" onclick={() => { editor.finishDraw(); tool = 'select' }}>Finish trunk</button>
	{/if}

	{#if editor.selOutlet}
		{@const o = editor.selOutlet}
		<hr class="border-zinc-200" />
		<PropText label="Label" value={o.label ?? ''} oninput={(e: Event) => editor.setOutlet({ label: val(e) })} />
		<PropSelect label="Level" value={o.level} onchange={(e: Event) => editor.setOutlet({ level: val(e) as any })}>
			<option value="low">Low</option><option value="high">High</option>
		</PropSelect>
		<PropText label="Ports" type="number" min="1" max="24" value={String(o.portCount)} oninput={(e: Event) => editor.setOutlet({ portCount: Number(val(e)) || 1 })} />
		<PropSelect label="Usage" value={o.usage} onchange={(e: Event) => editor.setOutlet({ usage: val(e) as any })}>
			{#each ['network', 'phone', 'av', 'printer', 'security', 'ap', 'rb', 'mep', 'new'] as u (u)}<option value={u}>{u}</option>{/each}
		</PropSelect>
		<PropSelect label="Mount" value={o.mountType} onchange={(e: Event) => editor.setOutlet({ mountType: val(e) as any })}>
			<option value="box">Rosette</option><option value="wall">Wall</option><option value="floor">Floor</option>
		</PropSelect>
		<button class="w-full rounded bg-red-600 px-1 py-0.5 text-xs text-white hover:bg-red-500" onclick={() => editor.deleteSel()}>Delete outlet</button>
	{:else if editor.selTrunk}
		{@const t = editor.selTrunk}
		<hr class="border-zinc-200" />
		<PropSelect label="Shape" value={t.shape} onchange={(e: Event) => editor.setTrunk({ shape: val(e) as any })}>
			<option value="rect">Rect / tray</option><option value="pipe">Pipe</option>
		</PropSelect>
		<PropSelect label="Location" value={t.location} onchange={(e: Event) => editor.setTrunk({ location: val(e) as any })}>
			<option value="floor">Floor</option><option value="ceiling-plenum">Ceiling plenum</option><option value="ceiling-tray">Ceiling tray</option><option value="wall">Wall</option>
		</PropSelect>
		<PropText label="Width (mm)" type="number" min="0" value={String(editor.selTrunkWidth)} oninput={(e: Event) => editor.setTrunkWidth(Number(val(e)) || 0)} />
		<button class="w-full rounded bg-red-600 px-1 py-0.5 text-xs text-white hover:bg-red-500" onclick={() => editor.deleteSel()}>Delete trunk</button>
	{/if}
</Window>
</div>
